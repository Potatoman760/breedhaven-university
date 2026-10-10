import { MAX_SCENE_CAST, type ContentPack, type DramaKind, type GameState, type LoveInterest, type Scene, type SceneDrama } from '../model'
import { appointmentsNow, attendees } from './appointments'
import { bondOf, statusOf } from './bonds'
import { toDate } from './calendar'
import { courseMembers, coursesInSession } from './courses'
import { locationOf } from './map'
import { relationBetween } from './rapport'
import { stageFor, stageRank } from './relationships'
import { firstNames, hasMet, sceneCast } from './scene'
import { appealLevel } from './stats'

/**
 * The drama engine. When the player starts a scene it weighs what is simmering around
 * him (promises made, who is jealous, who is a friend or an enemy of the one he is with,
 * who is nearby) and may have someone who was not invited turn up part-way through.
 *
 * It decides only who, as what and when. What she says and what comes of it is the
 * LLM's to write: once she has arrived the scene is an ordinary one with several people in it.
 */

/** What the engine is told about the scene that is starting, beyond who is in it. */
export interface DramaContext {
  /** Tags of the activity that opens it. Any scene can be interrupted; a date provokes a claim the most. */
  tags?: string[]
}

/**
 * Whether the scene is somewhere nobody walks in: a private location (a residence hall),
 * or a room of someone's own. There is no drama there, planned or arriving.
 */
export function inPrivate(content: ContentPack, state: GameState, scene: Pick<Scene, 'roomOf'>): boolean {
  return scene.roomOf !== undefined || content.locations.find((l) => l.id === state.locationId)?.private === true
}

/** One way a scene could be interrupted: someone, as something, and how strongly it pulls. */
export interface DramaHook {
  actorId: string
  kind: DramaKind
  score: number
  reasons: string[]
}

const NO_RELATIONSHIP = { affection: 0, trust: 0, desire: 0 }

/** A repeatable number in [0, 1) for one moment of one game. */
function roll(seed: number, time: number, index: number, salt: number): number {
  let x = (seed ^ Math.imul(time + 1, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35)) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000
}

/**
 * How much right she has to mind the player being with someone else, and why: what they
 * have promised each other, or failing a promise how far things have gone. Zero for
 * someone with no claim at all.
 */
function claimOf(content: ContentPack, state: GameState, li: LoveInterest): { value: number; why: string } {
  const config = content.drama!
  const player = state.player.name
  const rel = state.relationships[li.id] ?? NO_RELATIONSHIP
  const status = statusOf(content, bondOf(state, li.id))
  const stages = content.relationships
  const dating = stageRank(stages, stageFor(stages, rel.affection).id) >= stageRank(stages, 'dating')
  if (status?.exclusive) return { value: config.claim.exclusive, why: `She and ${player} are ${status.name.toLowerCase()}: they have promised to see only each other` }
  if (status) return { value: config.claim.open, why: `She and ${player} have an arrangement (${status.name.toLowerCase()}) that lets him see others, so this is no betrayal, but she did not expect to walk in on it` }
  if (dating) return { value: config.claim.dating, why: `She and ${player} are dating, with nothing said about anyone else` }
  if (rel.desire >= config.claim.wantingDesire) return { value: config.claim.wanting, why: `She and ${player} are only friends so far, but she wants him` }
  return { value: 0, why: '' }
}

/** Whether she is somewhere she can't walk away from: in a class that is meeting, or keeping a plan. */
function tiedUp(content: ContentPack, state: GameState, id: string): boolean {
  return (
    coursesInSession(content, state).some((course) => courseMembers(course).includes(id)) ||
    appointmentsNow(state).some((appointment) => attendees(appointment).includes(id))
  )
}

/**
 * Every way the scene could be interrupted, strongest first: each love interest who is
 * not in it, as each kind of visitor she could be, scored. The reasons are the terms that
 * scored, in words, so that what the LLM is later told matches why she was chosen.
 */
export function dramaHooks(content: ContentPack, state: GameState, scene: Pick<Scene, 'loveInterestId' | 'companionIds'>, ctx: DramaContext = {}): DramaHook[] {
  const config = content.drama
  if (!config) return []
  const cast = sceneCast(scene)
  const lead = content.loveInterests.find((li) => li.id === scene.loveInterestId)
  if (!lead) return []
  const player = state.player.name
  const leadName = lead.name.split(' ')[0]
  const stages = content.relationships
  const leadRel = state.relationships[lead.id] ?? NO_RELATIONSHIP
  const leadDating = stageRank(stages, stageFor(stages, leadRel.affection).id) >= stageRank(stages, 'dating')
  const isDate = (ctx.tags ?? []).some((tag) => tag === 'date' || tag === 'nsfw')
  const romance = isDate ? config.romance.date : leadDating ? config.romance.dating : config.romance.other

  const others = content.loveInterests.filter((li) => !cast.includes(li.id))
  // Everyone with a claim on him, in the scene or out of it: the more there are, the likelier one finds out.
  const claimants = content.loveInterests.filter((li) => claimOf(content, state, li).value > 0).length
  const secrets = Math.min(config.maxSecrets, Math.max(0, claimants - 1) * config.perSecret)

  const hooks: DramaHook[] = []
  for (const actor of others) {
    if (tiedUp(content, state, actor.id)) continue
    const rel = state.relationships[actor.id] ?? NO_RELATIONSHIP
    const traits = content.traits.filter((trait) => actor.traitIds.includes(trait.id))
    const relation = relationBetween(state, actor.id, lead.id)
    const where = locationOf(content, state, actor)
    const nearby = where === state.locationId
    /** What where she is, and where the scene is, do to any score of hers. */
    const placed = (score: number): number => {
      const near = score + (nearby ? config.nearby : 0)
      return near * (where === undefined ? config.unplaced : 1)
    }
    const nearbyReason = nearby ? ['She was already here'] : []

    const claim = claimOf(content, state, actor)
    if (claim.value > 0) {
      const jealous = traits.filter((trait) => trait.drama.jealousy !== 0)
      const score =
        claim.value * romance +
        jealous.reduce((sum, trait) => sum + trait.drama.jealousy, 0) +
        (relation === 'enemies' ? config.enemyOfLead : relation === 'friends' ? config.friendOfLead : 0) +
        rel.desire / 10 +
        5 * appealLevel(state, actor) +
        secrets
      hooks.push({
        actorId: actor.id,
        kind: 'confrontation',
        score: placed(score),
        reasons: [
          claim.why,
          `She did not know ${player} would be here with ${leadName}${isDate ? ', on what is plainly a date' : ''}`,
          ...jealous.map((trait) => `She is ${trait.name.toLowerCase()}: ${trait.definition}`),
          relation === 'enemies' ? `She and ${leadName} are enemies already` : relation === 'friends' ? `She and ${leadName} are friends, which makes it worse and harder at once` : '',
          ...nearbyReason
        ].filter(Boolean)
      })
    }

    if (relation === 'enemies') {
      const competitive = traits.some((trait) => trait.id === 'competitive')
      hooks.push({
        actorId: actor.id,
        kind: 'rival',
        score: placed(config.rival + (rel.affection + rel.desire) / 10 + (competitive ? 10 : 0)),
        reasons: [
          `She and ${leadName} are enemies`,
          rel.affection + rel.desire > 0 ? `She likes ${player} herself` : `She has no feelings for ${player} to speak of; it is ${leadName} she has come to needle`,
          ...nearbyReason
        ]
      })
    }

    if (relation === 'friends') {
      const unmet = !hasMet(state, actor.id)
      hooks.push({
        actorId: actor.id,
        kind: 'friend',
        score: placed(config.friend + (unmet ? config.unmet : 0) + traits.reduce((sum, trait) => sum + trait.drama.sociable, 0)),
        reasons: [
          `She is a friend of ${leadName}'s`,
          unmet ? `${player} has never spent time with her: ${leadName} introduces them` : `${player} knows her already`,
          ...nearbyReason
        ]
      })
    }
  }
  return hooks.filter((hook) => hook.score > 0).sort((a, b) => b.score - a.score)
}

/**
 * The chance a scene is interrupted, from everything that could interrupt it: the
 * strongest hook in full, and a share of each of the rest, so that many things simmering
 * count for more than one, up to a ceiling.
 */
export function dramaChance(content: ContentPack, hooks: DramaHook[]): number {
  const config = content.drama
  if (!config || hooks.length === 0) return 0
  const [top, ...rest] = [...hooks].sort((a, b) => b.score - a.score)
  const pressure = top.score + config.othersShare * rest.reduce((sum, hook) => sum + hook.score, 0)
  return Math.min(config.maxChance, Math.max(0, pressure / config.divisor))
}

/**
 * Decides, as a scene the player has started begins, whether it will be interrupted and
 * by whom. Returns the scene with the plan on it, or the scene as it was. The same moment
 * of the same game always decides the same way.
 */
export function planDrama<S extends Scene>(content: ContentPack, state: GameState, scene: S, ctx: DramaContext = {}): S {
  const config = content.drama
  if (!config || scene.npc || scene.drama || sceneCast(scene).length >= MAX_SCENE_CAST || inPrivate(content, state, scene)) return scene
  const { dayIndex } = toDate(content.calendar, state.time)
  // Nothing so soon after the last time.
  if (state.dramaDay >= 0 && dayIndex - state.dramaDay <= config.cooldownDays) return scene

  const hooks = dramaHooks(content, state, scene, ctx)
  const lead = content.loveInterests.findIndex((li) => li.id === scene.loveInterestId)
  if (roll(state.weatherSeed, state.time, lead, 0) >= dramaChance(content, hooks)) return scene

  // Which of them: likelier the stronger the pull.
  const total = hooks.reduce((sum, hook) => sum + hook.score, 0)
  let pick = roll(state.weatherSeed, state.time, lead, 1) * total
  const chosen = hooks.find((hook) => (pick -= hook.score) < 0) ?? hooks[0]
  // A friend is as likely to have been brought along as to turn up later; anyone else arrives part-way through.
  const along = chosen.kind === 'friend' && roll(state.weatherSeed, state.time, lead, 3) < config.broughtAlong
  const afterLines = along ? 0 : 1 + Math.floor(roll(state.weatherSeed, state.time, lead, 2) * config.maxLinesBefore)
  const drama: SceneDrama = { kind: chosen.kind, actorId: chosen.actorId, afterLines, fired: false, reasons: chosen.reasons }
  return { ...scene, drama }
}

/**
 * Whether it is time for the one who is coming to arrive: the player has said his lines,
 * she has not come yet, and the scene has not gone somewhere private since it was planned.
 */
export function dramaDue(content: ContentPack, state: GameState, scene: Pick<Scene, 'drama' | 'messages' | 'loveInterestId' | 'companionIds' | 'roomOf'>): boolean {
  const { drama } = scene
  if (!drama || drama.fired || sceneCast(scene).includes(drama.actorId) || sceneCast(scene).length >= MAX_SCENE_CAST) return false
  if (inPrivate(content, state, scene)) return false
  return scene.messages.filter((message) => message.role === 'user').length >= drama.afterLines
}

/** What whoever writes the scene is told as she walks in: who, why, how she feels, and to write her entrance first. */
export function describeDrama(content: ContentPack, state: GameState, scene: Pick<Scene, 'loveInterestId' | 'companionIds'>, drama: SceneDrama): string {
  const player = state.player.name
  const actor = firstNames(content, [drama.actorId])
  const here = firstNames(content, sceneCast(scene))
  const lead = firstNames(content, [scene.loveInterestId])
  if (drama.kind === 'friend' && drama.afterLines === 0) {
    return [
      `${lead} has brought ${actor} along: the three of you are here together from the start.`,
      ...drama.reasons.map((reason) => `${reason}.`),
      `${actor} is easy, friendly and curious about ${player}, and takes part as herself throughout. Nobody is wronged by her being here.`
    ].join(' ')
  }
  const opening = {
    confrontation: `${actor} has just walked in and found ${player} here with ${here}.`,
    rival: `${actor} has just turned up, uninvited, where ${player} is with ${here}.`,
    friend: `${actor} has just come over to where ${player} is with ${here}.`
  }[drama.kind]
  const playing = {
    confrontation:
      `Write ${actor}'s arrival first, in her own voice, as she takes in what she is seeing. Do not resolve it in this reply: let it land, ` +
      `and let the others answer for themselves, each as she would. How it goes from here depends on what ${player} says. ` +
      `Anyone hurt or angry enough may walk out: write her going, and a [LEAVES: Name=feeling why] line at the end of the reply.`,
    rival:
      `Write ${actor}'s arrival first, in her own voice. She is not here to make peace: she needles, competes for ${player}'s attention or ` +
      `simply refuses to leave, in her own manner, and the others answer in theirs. Do not resolve it in this reply.`,
    friend:
      `Write ${actor}'s arrival first, in her own voice: easy, friendly, and curious about ${player}. She stays a while; ` +
      `nobody is wronged by it, though whoever he came here with may or may not be glad of the company.`
  }[drama.kind]
  return [opening, ...drama.reasons.map((reason) => `${reason}.`), playing].join(' ')
}

const HEADLINES: Record<DramaKind, string> = {
  confrontation: 'walks in on you',
  rival: 'turns up uninvited',
  friend: 'comes over to join you'
}

/**
 * Has the one who was coming arrive: she joins the scene, with a beat that tells the LLM
 * who has walked in and why, and the day is noted so that nothing else happens too soon.
 * Called as the scene begins, it brings in at once a friend who was to be there from the start.
 */
export function fireDrama<S extends Scene>(content: ContentPack, state: GameState, scene: S): { state: GameState; scene: S; notice: string } {
  const { drama } = scene
  if (!drama || !dramaDue(content, state, scene)) return { state, scene, notice: '' }
  const actor = firstNames(content, [drama.actorId])
  const place = content.locations.find((l) => l.id === state.locationId)
  const along = drama.kind === 'friend' && drama.afterLines === 0
  const headline = along ? `${firstNames(content, [scene.loveInterestId])} has brought ${actor} along` : `${actor} ${HEADLINES[drama.kind]}`
  return {
    state: { ...state, dramaDay: toDate(content.calendar, state.time).dayIndex },
    scene: {
      ...scene,
      companionIds: [...scene.companionIds, drama.actorId],
      // She starts from how she stood as she walked in, so the scene's end can show what it cost.
      baseline: { ...scene.baseline, companions: { ...scene.baseline.companions, [drama.actorId]: state.relationships[drama.actorId] ?? NO_RELATIONSHIP } },
      beats: [
        ...scene.beats,
        { activityName: headline, locationName: place?.name, direction: describeDrama(content, state, scene, drama) }
      ],
      drama: { ...drama, fired: true }
    },
    notice: `${headline}.`
  }
}
