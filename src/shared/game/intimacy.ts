import type { ContentPack, GameState, LoveInterest } from '../model'
import { addMemory } from './memory'
import { stageFor, stageRank } from './relationships'
import { bonus, liveBoons } from './modifiers'
import { t } from '../i18n'

/**
 * Whether she will go to bed with him, and what comes of it. Most women have to want him first: it is not on the day
 * they meet, and not before her desire for him has grown to what the rules ask. A woman whose nature makes it easy is
 * held to neither. And most women take something against the Bloom, so that a child is likely only once she has
 * chosen to stop: which she does in a scene, in her own words, when he has brought her to want it.
 */

const hasAny = (li: Pick<LoveInterest, 'traitIds'>, ids: string[]) => li.traitIds.some((id) => ids.includes(id))

/** A woman for whom sex needs no courting: the rules name the traits that make her one. */
export function isEasy(content: ContentPack, li: Pick<LoveInterest, 'traitIds'>): boolean {
  return hasAny(li, content.relationships.intimacy.easyTraitIds)
}

/** How much she has to want him before she will: more for a woman whose nature holds back, nothing for one who is easy. */
export function desireNeeded(content: ContentPack, state: GameState, li: Pick<LoveInterest, 'id' | 'traitIds'>): number {
  const rules = content.relationships.intimacy
  if (isEasy(content, li)) return 0
  const asked = hasAny(li, rules.reluctantTraitIds) ? rules.reluctantMinDesire : rules.minDesire
  // Less for a man who has learnt how to be wanted, and less again while a charm of his is on her.
  return Math.max(0, asked - bonus(content, state, 'desireGate', { loveInterestId: li.id }))
}

export interface SexGate {
  open: boolean
  /** Why not, when it is shut: 'first' for the day they meet, 'desire' for not wanting him enough yet. */
  why?: 'first' | 'desire'
}

/**
 * Whether sex with her can happen in a scene now. What she feels changes only when a scene ends, so a scene that
 * begins shut stays shut however well it goes: unless he sets a charm on her in it, which is the one thing that moves it.
 */
export function sexGate(content: ContentPack, state: GameState, li: Pick<LoveInterest, 'id' | 'traitIds'>, uninhibited = false): SexGate {
  // A scene in which nothing holds anyone back, as a society's adult event, is open to everyone in it.
  if (uninhibited || isEasy(content, li)) return { open: true }
  // She has nothing to remember him by and he is a stranger to her: this is the day they meet. A woman who begins the
  // game knowing him, an old friend, has met him long since, and is held only to what she feels.
  const rel = state.relationships[li.id]
  const stranger = stageRank(content.relationships, stageFor(content.relationships, rel?.affection ?? 0).id) === 0
  if (stranger && (state.memories[li.id] ?? []).length === 0) return { open: false, why: 'first' }
  if ((state.relationships[li.id]?.desire ?? 0) < desireNeeded(content, state, li)) return { open: false, why: 'desire' }
  return { open: true }
}

/** The LLM writes this when she decides, in a scene, to stop taking what she takes against the Bloom. */
export const OFF_CONTROL_TAG = '[STOPS BIRTH CONTROL]'

/** Whether she is taking something against the Bloom: she began the game doing so, and has not stopped since. */
export function onBirthControl(content: ContentPack, state: Pick<GameState, 'offBirthControl'>, loveInterestId: string): boolean {
  return content.loveInterests.find((li) => li.id === loveInterestId)?.birthControl === true && !state.offBirthControl.includes(loveInterestId)
}

/** She stops, and remembers that she chose to. Nothing changes for a woman who was not taking it. */
export function stopBirthControl(content: ContentPack, state: GameState, loveInterestId: string): GameState {
  if (!onBirthControl(content, state, loveInterestId)) return state
  return addMemory({ ...state, offBirthControl: [...state.offBirthControl, loveInterestId] }, loveInterestId, t('scene.intimacy.stoppedControl', { player: state.player.name }), 'core')
}

/** Told to her: whether she will, and what she takes. Nothing about sex for a woman it is open to as it always was. */
export function describeSexGate(content: ContentPack, state: GameState, li: Pick<LoveInterest, 'id' | 'traitIds'>, group = false, uninhibited = false): string[] {
  const player = state.player.name
  const gate = sexGate(content, state, li, uninhibited)
  const control = onBirthControl(content, state, li.id)
    ? t('scene.intimacy.onControl', { player, tag: OFF_CONTROL_TAG, group, groupTag: OFF_CONTROL_TAG.replace(']', ': Name]') })
    : t('scene.intimacy.offControl', { player })
  // Whatever of his is working on her is told to her as something she feels, not as something done to her.
  const charmed = liveBoons(state).filter((boon) => boon.targetId === li.id && boon.telling).map((boon) => boon.telling!)
  if (gate.open) return [...charmed, control]
  const why = gate.why === 'first' ? t('scene.intimacy.justMet', { player }) : t('scene.intimacy.notYet', { player })
  return [
    t('scene.intimacy.shut', { why }),
    ...charmed,
    control
  ]
}
