import {
  type Comfort,
  picturedOutfit,
  METERS,
  type DepartureFeeling,
  type ContentPack,
  type GameState,
  type LoveInterest,
  type Scene,
  type SceneBaseline
} from '../model'
import { standardExpression } from './looks'
import { stageFor } from './relationships'
import { t } from '../i18n'

/** The LLM puts this at the end of a reply to say the scene has reached its close. */
export const SCENE_END_TAG = '[END SCENE]'

/** Separates a reply from the scene-end tag, wherever and however the LLM wrote it. */
export function splitSceneEnd(reply: string): { text: string; ended: boolean } {
  const tag = /\[\s*END[\s_-]*SCENE\s*\]/gi
  const ended = tag.test(reply)
  return { text: reply.replace(tag, '').trim(), ended }
}

/**
 * A change to how the love interest appears, asked for by the LLM in a reply.
 * `animationId: null` means stop the animation and show the sprite again.
 */
export interface SceneLook {
  outfitId?: string
  expression?: string
  animationId?: string | null
  /** Whose pose it is, where the scene has more than one love interest: her name as the LLM wrote it, and once checked, her id. Left out, the scene's lead. */
  animationOf?: string
}

export interface Directives extends SceneLook {
  /** The reply with every tag removed. */
  text: string
  ended: boolean
  /**
   * Who the reply says could have conceived, by the name written in the tag. An empty
   * name means the scene's love interest.
   */
  seeded: string[]
  /** Who the reply says has stopped taking what she takes against the Bloom, likewise. */
  stopsControl: string[]
  /** Looks asked for by name: in a group, each love interest's own. */
  named: NamedLook[]
  /** How comfortable each love interest says she is, by the name written in the tag. An empty name means the scene's love interest. */
  comfort: NamedComfort[]
  /** Who the reply says leaves the scene, by the name written, with how she feels and why. */
  leaving: { name: string; feeling: DepartureFeeling; reason: string }[]
  /** Who the reply says will be at an event, by the name written (empty for the scene's love interest), and the event's id as written. */
  attending: { name: string; eventId: string }[]
  /** The reply says the plan suggested earlier has been agreed to. */
  agreed: boolean
  /** The reply says they go to sleep for the night where they are. */
  slept: boolean
}

/**
 * A name as it is compared: without its accents, in lower case. The LLM writes "Zelie" for "Zélie" as often as not,
 * above all in the hidden lines, and a name that is not known is a line that is not acted on.
 */
export function plainName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()
}

/** Whether what was written names this character: her id, her name, or her first name, whatever became of the accents. */
export function namesHer(written: string, character: { id: string; name: string }): boolean {
  const asked = plainName(written)
  return [character.id, character.name, character.name.split(' ')[0]].some((known) => plainName(known) === asked)
}

/** A love interest's own reading of how much she wants to be here, as written in a reply. */
export interface NamedComfort extends Comfort {
  name: string
}

/** The LLM writes this when the player has agreed in words to a plan it suggested earlier: the plan is booked. */
export const AGREED_TAG = '[AGREED]'
/** The LLM writes this when those in the scene go to sleep for the night where they are: the clock goes on to morning. */
export const SLEEP_TAG = '[SLEEP]'
// A hidden line is one line: one the model forgot to close with a bracket is closed by the end of its line, and still hidden.
// [LEAVES: Bea=hurt saw she was not wanted]: who goes, how she feels, and a few words why.
const LEAVES_TAG = /\[\s*LEAVES?\s*:\s*([^\]\n]*?)\s*(?:\]|$)/gim
// [ATTENDING: societies-fair] or, in a group, [ATTENDING: Bea=societies-fair].
const ATTENDING_TAG = /\[\s*ATTENDING\s*:\s*([^\]\n]*?)\s*(?:\]|$)/gim

/** The LLM writes this when sex in the scene ends in a way that could leave her with child. */
export const SEEDED_TAG = '[SEEDED]'
const SEEDED = /\[\s*SEEDED\s*(?::\s*([^\]]*?)\s*)?\]/gi
// [STOPS BIRTH CONTROL], or in a group [STOPS BIRTH CONTROL: Bea].
const STOPS_CONTROL = /\[\s*STOPS?[\s_-]*BIRTH[\s_-]*CONTROL\s*(?::\s*([^\]]*?)\s*)?\]/gi

// [SEX-ACT: id] is the tag for an NSFW sex-act; [POSE: id] and [ANIMATION: id] are its older names, still read.
const LOOK_TAG = /\[\s*(OUTFIT|EXPRESSION|ANIMATION|POSE|SEX[\s_-]?ACT)\s*:\s*([^\]\n]*?)\s*(?:\]|$)/gim

// [COMFORT: 3 he keeps asking] or, in a group, [COMFORT: Anwen=2 they are kissing in front of her]. A model sometimes
// garbles the word and drops the colon ([COMFassessing the table]); in capitals it is still the tag, and still hidden.
const COMFORT_TAG = /\[\s*(?:[Cc][Oo][Mm][Ff][Oo][Rr][Tt]\s*:|COMF[A-Z]*\s*:?)\s*([^\]\n]*?)\s*(?:\]|$)/gm

/** Reads the tags the LLM may put in a reply: scene end, outfit, expression and animation. */
/** A look asked for by name, in a scene with more than one love interest in it. */
export interface NamedLook {
  name: string
  outfitId?: string
  expression?: string
}

/**
 * The hidden lines a reply carried about her face and her comfort, as written, one to a
 * line: what every reply restates. Empty when it had none. A pose is left out on purpose:
 * shown back to the LLM in its own earlier replies, it is copied into every one after.
 */
export function lookLines(reply: string): string {
  const found: { at: number; tag: string }[] = []
  for (const match of reply.matchAll(LOOK_TAG)) if (match[1].toUpperCase() === 'EXPRESSION') found.push({ at: match.index, tag: match[0] })
  // A garbled one is not shown back to be copied.
  for (const match of reply.matchAll(COMFORT_TAG)) if (/^\[\s*COMFORT\s*:/i.test(match[0])) found.push({ at: match.index, tag: match[0] })
  // One left open is shown back closed, so that the slip is not copied.
  return found
    .sort((a, b) => a.at - b.at)
    .map(({ tag }) => (tag.endsWith(']') ? tag : `${tag.trimEnd()}]`))
    .join('\n')
}

export function parseDirectives(written: string): Directives {
  // What a reasoning model thought before answering is no part of the answer.
  const reply = written.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/^[\s\S]*<\/think(?:ing)?>/i, '')
  const look: SceneLook = {}
  const named: NamedLook[] = []
  const withoutLook = reply.replace(LOOK_TAG, (_tag, kind: string, written: string) => {
    // In a group a tag says whose it is: [EXPRESSION: Faye=happy].
    // Whose it is comes before an equals sign, or a colon when that is what was written: [EXPRESSION: Faye:happy].
    const [, who, value] = /^([^=:]*?)\s*[=:]\s*(.*)$/.exec(written) ?? [undefined, undefined, written]
    const field = kind.toUpperCase() === 'OUTFIT' ? 'outfitId' : kind.toUpperCase() === 'EXPRESSION' ? 'expression' : undefined
    if (field && who) {
      const theirs = named.find((n) => plainName(n.name) === plainName(who)) ?? (named[named.push({ name: who }) - 1])
      theirs[field] = value
    } else if (field) look[field] = value
    else {
      // A sex-act is one character's, and in a group the tag says whose: [SEX-ACT: Faye=missionary].
      look.animationId = ['none', 'off', 'stop', ''].includes(value.toLowerCase()) ? null : value
      look.animationOf = who && look.animationId !== null ? who : undefined
    }
    return ''
  })
  const seeded: string[] = []
  const withoutSeeded = withoutLook.replace(SEEDED, (_tag, name: string | undefined) => {
    seeded.push((name ?? '').trim())
    return ''
  })
  const stopsControl: string[] = []
  const withoutControl = withoutSeeded.replace(STOPS_CONTROL, (_tag, name: string | undefined) => {
    stopsControl.push((name ?? '').trim())
    return ''
  })
  // Moving and the passing of time are done with tools, so that the game is the one keeping
  // count. A tag written for either is dropped.
  const withoutMoves = withoutControl.replace(/\[\s*(?:MOVE|HOURS)\s*:[^\]]*\]/gi, '')
  // Her reading of herself is never shown: the tag comes out whether or not it can be made sense of.
  const comfort: NamedComfort[] = []
  const withoutComfort = withoutMoves.replace(COMFORT_TAG, (_tag, written: string) => {
    const [, who, level, reason] = /^(?:([^=:\d][^=:]*?)\s*[=:]\s*)?([1-5])(?!\d)[\s:,.\-–—]*(.*)$/s.exec(written) ?? []
    if (level !== undefined) comfort.push({ name: (who ?? '').trim(), level: Number(level), reason: (reason ?? '').trim().slice(0, 160) })
    return ''
  })
  // What a character declares in passing: that she leaves, that she will be at something, that a plan is agreed, that the night is slept through.
  // Each is a line the game acts on and nobody reads.
  const leaving: Directives['leaving'] = []
  const withoutLeaving = withoutComfort.replace(LEAVES_TAG, (_tag, written: string) => {
    const [, who, feeling, reason] = /^([^=:]+?)\s*(?:[=:]\s*(content|hurt|angry)\b[\s:,.\-–—]*(.*))?$/is.exec(written) ?? []
    if (who) leaving.push({ name: who.trim(), feeling: (feeling?.toLowerCase() as DepartureFeeling | undefined) ?? 'content', reason: (reason ?? '').trim().slice(0, 160) })
    return ''
  })
  const attending: Directives['attending'] = []
  const withoutAttending = withoutLeaving.replace(ATTENDING_TAG, (_tag, written: string) => {
    const [, who, eventId] = /^(?:([^=:]*?)\s*[=:]\s*)?(\S.*)$/.exec(written) ?? []
    if (eventId) attending.push({ name: (who ?? '').trim(), eventId: eventId.trim().toLowerCase() })
    return ''
  })
  const agreedTag = /\[\s*AGREED\s*\]/gi
  const sleepTag = /\[\s*SLEEP\s*\]/gi
  const agreed = agreedTag.test(withoutAttending)
  const slept = sleepTag.test(withoutAttending)
  const plain = withoutAttending.replace(/\[\s*(?:AGREED|SLEEP)\s*\]/gi, '')
  return { ...splitSceneEnd(plain), ...look, seeded, stopsControl, named, comfort, leaving, attending, agreed, slept }
}

/**
 * Keeps only the parts of a requested look that this character can show: an outfit they
 * have, an expression drawn for the outfit they will be in, and an animation they have.
 */
export function validLook(
  look: SceneLook,
  li: LoveInterest,
  scene: Pick<Scene, 'outfitId'>
): SceneLook {
  // The LLM's spelling of an id may differ in case from the content's.
  const same = (id: string, asked: string | null | undefined) => id.toLowerCase() === asked?.toLowerCase()
  const valid: SceneLook = {}
  const outfit = li.outfits.find((o) => same(o.id, look.outfitId))
  if (outfit) valid.outfitId = outfit.id

  const wearing =
    outfit ?? li.outfits.find((o) => o.id === (scene.outfitId ?? li.defaultOutfitId))
  // Any of the standard faces may be asked for, drawn or not; anything else has to be a picture the outfit has.
  const expression = Object.keys((wearing && picturedOutfit(li.outfits, wearing).sprites) ?? {}).find((key) => same(key, look.expression)) ?? standardExpression(look.expression)
  if (expression !== undefined) valid.expression = expression

  const animation = li.animations.find((a) => same(a.id, look.animationId))
  if (look.animationId === null) valid.animationId = null
  else if (animation) valid.animationId = animation.id
  return valid
}

/**
 * Applies the look a reply chose to the scene. Her outfit and face stay as they are until
 * a reply changes them. An NSFW pose, the layer over her picture, does not: it is up for
 * the reply that asked for it and no longer, and stays up only if the next reply asks for
 * it again.
 */
export function applyLook(scene: Scene, look: SceneLook): Scene {
  const animationId = look.animationId ?? undefined
  return {
    ...scene,
    outfitId: look.outfitId ?? scene.outfitId,
    // An expression belongs to the outfit it was chosen for.
    expression: look.expression ?? (look.outfitId !== undefined ? undefined : scene.expression),
    animationId,
    // Whose it is: the one named with it, or the lead when nobody was.
    animationOf: animationId === undefined ? undefined : (look.animationOf ?? scene.loveInterestId)
  }
}

/** Keeps what each love interest last said of how comfortable she is, for the next prompt. */
export function applyComfort(scene: Scene, comfort: Record<string, Comfort>, floor = 1): Scene {
  if (Object.keys(comfort).length === 0) return scene
  // Below what he can keep her at, she is at it.
  const held = Object.fromEntries(Object.entries(comfort).map(([id, said]) => [id, { ...said, level: Math.max(floor, said.level) }]))
  return { ...scene, comfort: { ...(scene.comfort ?? {}), ...held } }
}

/** Applies the looks chosen for the others in a scene, each kept beside the lead's. */
export function applyLooks(scene: Scene, looks: Record<string, Pick<SceneLook, 'outfitId' | 'expression'>>): Scene {
  const next = { ...(scene.looks ?? {}) }
  for (const [id, look] of Object.entries(looks)) {
    if (id === scene.loveInterestId) continue
    const before = next[id] ?? {}
    next[id] = {
      outfitId: look.outfitId ?? before.outfitId,
      expression: look.expression ?? (look.outfitId !== undefined ? undefined : before.expression)
    }
  }
  return { ...scene, looks: next }
}

/** Everyone in a scene, the lead first. */
/** Whether the player has met her: they have been in a scene together. */
export function hasMet(state: GameState, loveInterestId: string): boolean {
  return state.met.includes(loveInterestId)
}

/** Records that the player has met these love interests. Anyone else in a scene's cast, such as an NPC, is passed over. */
export function meet(content: ContentPack, state: GameState, ids: string[]): GameState {
  const fresh = ids.filter((id, i) => ids.indexOf(id) === i && !state.met.includes(id) && content.loveInterests.some((li) => li.id === id))
  return fresh.length === 0 ? state : { ...state, met: [...state.met, ...fresh] }
}

export function sceneCast(scene: Pick<Scene, 'loveInterestId' | 'companionIds'>): string[] {
  return [scene.loveInterestId, ...scene.companionIds]
}

/** "Ana", "Ana and Bea", "Ana, Bea and Cy": first names, for headings and prompts. */
export function firstNames(content: ContentPack, ids: string[]): string {
  const names = ids.map((id) => content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id)
  return names.length < 2 ? names.join('') : t('scene.list.last', { rest: names.slice(0, -1).join(', '), last: names.at(-1) })
}

/** One beat of a reply as the text box shows it. */
export interface DialogueLine {
  /** An action or expression written between asterisks, shown as narration, not speech. */
  action: boolean
  text: string
  /** In a group scene, the id of whoever says the line, when the line names them. */
  speakerId?: string
  /** The name of whoever says the line, when it is someone with a voice in the scene but no place in its cast: the professor of a class. */
  speakerName?: string
}

/**
 * Splits a reply into the beats the player clicks through, one per line of text. In a
 * group scene each spoken line starts with its speaker's first name ("Ana: ..."); pass
 * the cast to have that read off the line. `voices` are the names of anyone else who
 * speaks without being one of the cast, such as the professor of a class.
 */
export function dialogueLines(reply: string, cast: Pick<LoveInterest, 'id' | 'name'>[] = [], voices: string[] = []): DialogueLine[] {
  const last = (name: string) => name.trim().split(/\s+/).at(-1)?.toLowerCase()
  return reply
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const action = /^\*[^*]+\*$/.exec(line)
      if (action) return { action: true, text: line.slice(1, -1).trim() }
      const named = /^\**([^:*]{1,40}?)\**\s*:\s*(.+)$/.exec(line)
      const speaker =
        named &&
        cast.find((li) => namesHer(named[1], li))
      if (speaker && named) return { action: false, text: named[2], speakerId: speaker.id }
      // Someone with a voice and no place in the cast: named in full, or by the last word of the name ("Reed" for "Doctor Reed").
      const voice = named && voices.find((name) => name.toLowerCase() === named[1].trim().toLowerCase() || last(name) === last(named[1]))
      return voice && named ? { action: false, text: named[2], speakerName: voice } : { action: false, text: line }
    })
}

/** Who of the cast has a line of her own in a reply, by id: in a group, only she can say she will do something. */
export function whoSpoke(reply: string, cast: Pick<LoveInterest, 'id' | 'name'>[]): string[] {
  return [...new Set(dialogueLines(reply, cast).flatMap((line) => line.speakerId ?? []))]
}

// One line in so many of his is left with nobody named to answer first, for the LLM to give to whoever would.
const UNLED_EVERY = 4

/**
 * Who of a group answers his line first, so that they do not fall into one order and keep to it: one he names in it,
 * and otherwise whoever has gone longest without leading a reply. Now and then, unless he named someone, nobody: the
 * LLM chooses. Nobody either outside a group, or once only one is left in it.
 */
export function firstToSpeak(content: Pick<ContentPack, 'loveInterests'>, scene: Pick<Scene, 'loveInterestId' | 'companionIds' | 'departed' | 'messages'>): string | undefined {
  const gone = new Set(scene.departed.map((d) => d.id))
  const cast = sceneCast(scene)
    .filter((id) => !gone.has(id))
    .flatMap((id) => content.loveInterests.filter((li) => li.id === id))
  if (cast.length < 2) return undefined
  const said = scene.messages.at(-1)?.role === 'user' ? plainName(scene.messages.at(-1)!.content) : ''
  // Named anywhere in his line, as a word of its own: the one named first.
  const at = (li: LoveInterest) => {
    const name = plainName(li.name.split(' ')[0]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^\\p{L}])${name}($|[^\\p{L}])`, 'u').exec(said)?.index ?? -1
  }
  const named = cast.filter((li) => at(li) >= 0).sort((a, b) => at(a) - at(b))[0]
  if (named) return named.id
  if (scene.messages.filter((m) => m.role === 'user').length % UNLED_EVERY === 0) return undefined
  // Whoever led each of her replies so far; one who never has comes first, and the cast's own order breaks a tie.
  const led = scene.messages.filter((m) => m.role === 'assistant').map((m) => whoSpoke(m.content, cast)[0])
  return [...cast].sort((a, b) => led.lastIndexOf(a.id) - led.lastIndexOf(b.id))[0].id
}

const NO_RELATIONSHIP = { affection: 0, trust: 0, desire: 0 }

/** Recorded when a scene starts, before the activity that opens it takes effect. */
export function sceneBaseline(state: GameState, loveInterestId: string, companionIds: string[] = []): SceneBaseline {
  return {
    stats: state.player.stats,
    energy: state.player.energy,
    money: state.player.money,
    training: state.training,
    coursePoints: state.coursePoints,
    time: state.time,
    relationship: state.relationships[loveInterestId] ?? NO_RELATIONSHIP,
    companions: Object.fromEntries(companionIds.map((id) => [id, state.relationships[id] ?? NO_RELATIONSHIP]))
  }
}

export interface Growth {
  label: string
  from: number
  to: number
}

export interface SceneOutcome {
  /** Player stats, money and energy that changed over the scene. */
  player: Growth[]
  /** All relationship meters, changed or not. */
  meters: Growth[]
  stageBefore: string
  stageAfter: string
}

/**
 * What has changed for the player himself since a moment that was recorded: his stats,
 * his money and energy, and the work he has put in that has yet to show as a point: what
 * he has banked toward the next point of a stat, and his marks in a course.
 */
export function playerGains(before: Pick<SceneBaseline, 'stats' | 'energy' | 'money' | 'training' | 'coursePoints'>, state: GameState): Growth[] {
  const { player } = state
  const stats = [...new Set([...Object.keys(before.stats), ...Object.keys(player.stats)])]
  const raised = (stat: string) => (before.stats[stat] ?? 0) !== (player.stats[stat] ?? 0)
  return [
    ...stats.map((stat) => ({ label: stat, from: before.stats[stat] ?? 0, to: player.stats[stat] ?? 0 })),
    // Training that became a point is told by the point; the rest by what is banked toward the next.
    ...(before.training ? Object.keys(state.training) : [])
      .filter((stat) => !raised(stat))
      .map((stat) => ({ label: t('scene.gains.training', { stat }), from: before.training?.[stat] ?? 0, to: state.training[stat] ?? 0 })),
    ...(before.coursePoints ? Object.keys(state.coursePoints) : []).map((id) => ({
      label: t('scene.gains.marks', { course: state.courses.find((course) => course.id === id)?.number ?? id }),
      from: before.coursePoints?.[id] ?? 0,
      to: state.coursePoints[id] ?? 0
    })),
    { label: 'money', from: before.money, to: player.money },
    { label: 'energy', from: before.energy, to: player.energy }
  ]
    // Only whole points are told of. Training and marks are earned in parts of a point, and a part that has yet
    // to make a whole one is kept and not shown: it shows when the next part completes it.
    .map((g) => ({ ...g, from: Math.floor(g.from + 1e-9), to: Math.floor(g.to + 1e-9) }))
    .filter((g) => g.from !== g.to)
}

/**
 * What changed for the player and the relationship between the baseline and now. For
 * someone other than the scene's lead, pass `companion` to measure from their own start.
 */
export function sceneOutcome(
  content: ContentPack,
  recorded: SceneBaseline,
  state: GameState,
  loveInterestId: string,
  companion = false
): SceneOutcome {
  const baseline = companion
    ? { ...recorded, relationship: recorded.companions[loveInterestId] ?? NO_RELATIONSHIP }
    : recorded
  const now = state.relationships[loveInterestId] ?? baseline.relationship

  return {
    player: playerGains(baseline, state),
    meters: METERS.map((meter) => ({
      label: meter,
      from: baseline.relationship[meter],
      to: now[meter]
    })),
    stageBefore: stageFor(content.relationships, baseline.relationship.affection).name,
    stageAfter: stageFor(content.relationships, now.affection).name
  }
}

// What walking out costs the player with the one who walked out.

/** Who of those asked can leave a scene: people who are in it, never all of them. Someone has to stay. */
export function leavers(scene: Pick<Scene, 'loveInterestId' | 'companionIds'>, askedIds: string[]): string[] {
  const cast = sceneCast(scene)
  const going = [...new Set(askedIds)].filter((id) => cast.includes(id))
  return going.length >= cast.length ? [] : going
}

/**
 * The scene after some of the love interests in it have left: it goes on with whoever
 * remains. If the one it was led by has gone, the next takes her place. Those who left
 * are remembered as having been there, up to the last message they heard.
 */
export function leaveScene<S extends Scene>(scene: S, askedIds: string[], feeling: DepartureFeeling = 'content', reason = ''): S {
  const going = leavers(scene, askedIds)
  if (going.length === 0) return scene
  const [leadId, ...companionIds] = sceneCast(scene).filter((id) => !going.includes(id))
  // Everyone's standing at the start of the scene is kept, whoever now leads it.
  const baseline = {
    ...scene.baseline,
    relationship: leadId === scene.loveInterestId ? scene.baseline.relationship : (scene.baseline.companions[leadId] ?? NO_RELATIONSHIP),
    companions: { ...scene.baseline.companions, [scene.loveInterestId]: scene.baseline.relationship }
  }
  const leadChanged = leadId !== scene.loveInterestId
  return {
    ...scene,
    loveInterestId: leadId,
    companionIds,
    baseline,
    departed: [...scene.departed, ...going.map((id) => ({ id, at: scene.messages.length, feeling, reason: reason.trim() }))],
    // The look on the scene itself was the old lead's; the new lead brings her own.
    ...(leadChanged && { outfitId: scene.looks?.[leadId]?.outfitId, expression: scene.looks?.[leadId]?.expression }),
    // A pose goes with whoever's it was.
    ...(scene.animationId !== undefined && going.includes(scene.animationOf ?? scene.loveInterestId) && { animationId: undefined, animationOf: undefined }),
    looks: Object.fromEntries(Object.entries(scene.looks ?? {}).filter(([id]) => id !== leadId && !going.includes(id))),
    comfort: scene.comfort && Object.fromEntries(Object.entries(scene.comfort).filter(([id]) => !going.includes(id))),
    // If it was her room, the others are not left sitting in it without her.
    roomOf: scene.roomOf !== undefined && going.includes(scene.roomOf) ? undefined : scene.roomOf
  }
}

/** Everyone who has a memory of a scene to keep: those in it at the end, and those who left on the way. */
export function sceneWitnesses(scene: Pick<Scene, 'loveInterestId' | 'companionIds' | 'departed'>): string[] {
  return [...new Set([...sceneCast(scene), ...scene.departed.map((d) => d.id)])]
}
