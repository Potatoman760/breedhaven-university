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
import { factor } from './modifiers'
import { seedOf } from './seed'
import { sceneRelicUses } from './relics'
import { t, type MessageKey } from '../i18n'

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
export function inPrivate(content: ContentPack, state: GameState, scene: Pick<Scene, 'roomOf' | 'relicsUsed'>): boolean {
  // Time stopped for everyone else is as good as a locked door.
  if (sceneRelicUses(content, scene).includes('stillness')) return true
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
  if (status?.exclusive) return { value: config.claim.exclusive, why: t('game.drama.claimExclusive', { player, status: status.name.toLowerCase() }) }
  if (status) return { value: config.claim.open, why: t('game.drama.claimOpen', { player, status: status.name.toLowerCase() }) }
  if (dating) return { value: config.claim.dating, why: t('game.drama.claimDating', { player }) }
  if (rel.desire >= config.claim.wantingDesire) return { value: config.claim.wanting, why: t('game.drama.claimWanting', { player }) }
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
    const nearbyReason = nearby ? [t('game.drama.nearby')] : []

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
          t('game.drama.didNotKnow', { player, lead: leadName, date: isDate }),
          ...jealous.map((trait) => t('game.drama.jealousTrait', { trait: trait.name.toLowerCase(), definition: trait.definition })),
          relation === 'enemies' ? t('game.drama.enemiesAlready', { lead: leadName }) : relation === 'friends' ? t('game.drama.friendsWorse', { lead: leadName }) : '',
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
          t('game.drama.enemies', { lead: leadName }),
          rel.affection + rel.desire > 0 ? t('game.drama.likesHim', { player }) : t('game.drama.needles', { player, lead: leadName }),
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
          t('game.drama.friendOf', { lead: leadName }),
          unmet ? t('game.drama.introduces', { player, lead: leadName }) : t('game.drama.knowsHer', { player }),
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
  const lead = seedOf(scene.loveInterestId)
  if (roll(state.weatherSeed, state.time, lead, 0) >= dramaChance(content, hooks) * factor(content, state, 'drama')) return scene

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
      t('game.drama.alongOpening', { lead, actor }),
      ...drama.reasons.map((reason) => (/[.!?]$/.test(reason) ? reason : `${reason}.`)),
      t('game.drama.alongPlaying', { actor, player })
    ].join(' ')
  }
  const opening = t(`game.drama.opening.${drama.kind}`, { actor, player, here })
  // How she carries on once she is here. Her entrance itself is asked for beside his line as she walks in (`arrivalCue`).
  const playing = t(`game.drama.playing.${drama.kind}`, { actor, player, leaves: '[LEAVES: Name=feeling why]' })
  return [opening, ...drama.reasons.map((reason) => (/[.!?]$/.test(reason) ? reason : `${reason}.`)), playing].join(' ')
}

/** What is said beside his line as she walks in, where it cannot be missed: who it is, and that the reply opens with her. */
export function arrivalCue(content: ContentPack, drama: SceneDrama): string {
  const actor = firstNames(content, [drama.actorId])
  return t(`game.drama.arrival.${drama.kind}`, { actor })
}

const HEADLINES: Record<DramaKind, MessageKey> = {
  confrontation: 'game.drama.headline.confrontation',
  rival: 'game.drama.headline.rival',
  friend: 'game.drama.headline.friend'
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
  const headline = along ? t('game.drama.headline.along', { lead: firstNames(content, [scene.loveInterestId]), actor }) : t(HEADLINES[drama.kind], { actor })
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
    notice: t('game.drama.notice', { headline })
  }
}
