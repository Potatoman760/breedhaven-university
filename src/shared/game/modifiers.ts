import { ADDED_KINDS, type Boon, type ContentPack, type GameState, type Modifier, type ModifierKind, type Skill } from '../model'

/**
 * What changes the game's numbers for him: the courses he has got far enough in and the relics he has brought up
 * from below, which change them for good, and boons, which change them for a while. Whatever works a number out asks here what it is multiplied by or what is
 * added to it, and need not know where that came from. This reads the content and the save and nothing else of the
 * game, so that anything may ask it.
 */

type Learner = Pick<GameState, 'courses' | 'enrolment' | 'coursePoints'>
type Holder = Learner & Pick<GameState, 'boons' | 'time'> & Partial<Pick<GameState, 'expedition'>>

/** What a modifier is being asked about: the stat being trained, the woman it concerns. */
export interface About {
  stat?: string
  loveInterestId?: string
}

/** The skills he has: those whose course he is taking and has the marks in. Marks do not fall, so what he has learnt he keeps. */
export function skillsLearnt(content: Pick<ContentPack, 'skills'>, state: Learner): Skill[] {
  return content.skills.filter((skill) =>
    state.courses.some(
      (course) =>
        course.code === skill.code &&
        (skill.level === undefined || skill.level === course.level) &&
        state.enrolment?.includes(course.id) &&
        (state.coursePoints[course.id] ?? 0) >= skill.at
    )
  )
}

/** The boons still in force. */
export function liveBoons(state: Pick<GameState, 'boons' | 'time'>): Boon[] {
  return state.boons.filter((boon) => boon.until > state.time)
}

/** Puts a boon in force, clearing away any that have run out. One of the same kind from the same source on the same person is renewed, not doubled. */
export function addBoon(state: GameState, boon: Boon): GameState {
  const same = (other: Boon) => other.kind === boon.kind && other.source === boon.source && other.targetId === boon.targetId
  return { ...state, boons: [...liveBoons(state).filter((other) => !same(other)), boon] }
}

function applies(content: Pick<ContentPack, 'relationships' | 'loveInterests'>, modifier: Modifier & { targetId?: string }, about: About): boolean {
  if (modifier.targetId !== undefined && modifier.targetId !== about.loveInterestId) return false
  if (modifier.stats && (about.stat === undefined || !(modifier.stats as string[]).includes(about.stat))) return false
  if (modifier.only === 'reluctant') {
    const li = content.loveInterests.find((one) => one.id === about.loveInterestId)
    if (!li || !li.traitIds.some((id) => content.relationships.intimacy.reluctantTraitIds.includes(id))) return false
  }
  return true
}

/** Every modifier of a kind in force for what is asked about: from what he has learnt, from the relics he holds, and from boons. */
export function modifiersOf(content: ContentPack, state: Holder, kind: ModifierKind, about: About = {}): Modifier[] {
  const learnt = skillsLearnt(content, state).flatMap((skill) => [skill.passive, skill.below].flatMap((one) => (one?.kind === kind ? [one] : [])))
  const held = state.expedition?.relics ?? []
  const relics = (content.expedition?.depths ?? []).flatMap((depth) => (held.includes(depth.relic.id) && depth.relic.modifier.kind === kind ? [depth.relic.modifier] : []))
  return [...learnt, ...relics, ...liveBoons(state).filter((boon) => boon.kind === kind)].filter((modifier) => applies(content, modifier, about))
}

/** What a number of the game is multiplied by: 1 when nothing bears on it. */
export function factor(content: ContentPack, state: Holder, kind: ModifierKind, about: About = {}): number {
  return modifiersOf(content, state, kind, about).reduce((product, modifier) => product * modifier.amount, 1)
}

/** What is added to a number of the game, or taken from it: 0 when nothing bears on it. */
export function bonus(content: ContentPack, state: Holder, kind: ModifierKind, about: About = {}): number {
  return modifiersOf(content, state, kind, about).reduce((sum, modifier) => sum + modifier.amount, 0)
}

/** Whether something of a kind is in force at all. */
export function inForce(content: ContentPack, state: Holder, kind: ModifierKind, about: About = {}): boolean {
  return modifiersOf(content, state, kind, about).length > 0
}

/**
 * What a change in how she feels comes to once everything that bears on it has: a gain in a feeling is multiplied by
 * what he has for that feeling, and in affection again by what a first scene is worth when this is one; a loss of
 * affection or trust by what softens losses. Rounded to a whole point, and never turned from a gain into a loss.
 */
export function feltChange(content: ContentPack, state: GameState, loveInterestId: string, meter: 'affection' | 'trust' | 'desire', amount: number): number {
  if (amount === 0) return 0
  const about = { loveInterestId }
  if (amount > 0) {
    const first = meter === 'affection' && (state.memories[loveInterestId] ?? []).length === 0 ? factor(content, state, 'firstScene', about) : 1
    return Math.max(1, Math.round(amount * factor(content, state, meter, about) * first))
  }
  return meter === 'desire' ? amount : Math.min(0, Math.round(amount * factor(content, state, 'losses', about)))
}

/** Whether an amount is one of the kinds that add: the rest multiply. */
export const isAdded = (kind: ModifierKind): boolean => ADDED_KINDS.includes(kind)

/** In a few words, what a modifier does: "x2 affection", "+2 comfort". For the bag and the stat sheet. */
export function describeChange(modifier: Modifier): string {
  const what = modifier.stats ? `${modifier.stats.join(' and ')} training` : modifier.kind === 'desireGate' ? 'desire she needs' : modifier.kind
  if (modifier.kind === 'unguarded') return 'birth control does not count'
  if (modifier.kind === 'desireGate') return `-${modifier.amount} ${what}`
  if (isAdded(modifier.kind)) return `+${modifier.amount} ${what}`
  return `x${modifier.amount} ${what}`
}
