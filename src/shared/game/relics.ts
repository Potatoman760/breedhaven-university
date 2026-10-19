import type { ContentPack, GameState, Relic, RelicUse, Scene } from '../model'
import { relicsHeld } from './expedition'
import { addBoon } from './modifiers'
import { sceneCast } from './scene'

/**
 * What the relics he has brought up do beyond a number: traits every woman has while one is on, and what one does when
 * he uses it in a scene, once a scene. One always at work starts off, and is turned on and off again in the bag.
 */

/** Whether a relic he holds is at work: he has turned it on. */
export function relicOn(state: Pick<GameState, 'expedition'>, relicId: string): boolean {
  return state.expedition.relics.includes(relicId) && state.expedition.relicsOn.includes(relicId)
}

/** Turns a relic he holds on, or off again. */
export function toggleRelic(state: GameState, relicId: string): GameState {
  if (!state.expedition.relics.includes(relicId)) return state
  const on = state.expedition.relicsOn
  return { ...state, expedition: { ...state.expedition, relicsOn: on.includes(relicId) ? on.filter((id) => id !== relicId) : [...on, relicId] } }
}

/** The traits every love interest has from the relics he has on. */
export function relicTraitIds(content: ContentPack, state: Pick<GameState, 'expedition'>): string[] {
  return [...new Set(relicsHeld(content, state).filter((relic) => relicOn(state, relic.id)).flatMap((relic) => relic.traitIds))]
}

/** What the relics used in a scene do in it. */
export function sceneRelicUses(content: ContentPack, scene: Pick<Scene, 'relicsUsed'>): RelicUse[] {
  return (content.expedition?.depths ?? []).flatMap((depth) => (depth.relic.use && scene.relicsUsed?.includes(depth.relic.id) ? [depth.relic.use] : []))
}

/** Whether he can use a relic in this scene: he holds it, it is one to use, and he has not used it in this one. */
export function canUseRelic(content: ContentPack, state: GameState, scene: Pick<Scene, 'relicsUsed' | 'npc'>, relicId: string): { ok: boolean; reasons: string[] } {
  const relic = relicsHeld(content, state).find((one) => one.id === relicId)
  const reasons = !relic?.use ? ['It is always at work'] : scene.npc ? ['Not with an NPC'] : scene.relicsUsed?.includes(relicId) ? ['Used in this scene'] : []
  return { ok: reasons.length === 0, reasons }
}

// What she is told the moment it is used, beside the line that uses it: what has just happened, so the reply is her
// reaction. He uses it in secret: nobody knows it was him. The Mind's Eye changes nothing she could notice, so it is
// not a turn at all: her thoughts are simply heard from her next reply on.
const MOMENT: Record<Exclude<RelicUse, 'minds-eye'>, (player: string) => string> = {
  unravel: (player) => `Every stitch of clothing on everyone here, ${player} included, has just vanished into thin air. Nobody knows why; react in surprise.`,
  stillness: (player) => `Time has just stopped for everyone here but ${player} and you: everyone else is frozen where they stand, and will see and hear nothing. You do not know why.`,
  sapphic: () => `A charm has just settled over the women here: you feel drawn to each other, and want to kiss. You do not know why.`,
  'first-seed': () => `A warmth spreads low in every woman here: the Bloom is wide open in her tonight. You do not know why.`
}

// How long what a relic sets going in a scene lasts, in hours: long enough for any scene.
const SCENE_HOURS = 8

/**
 * Uses a relic in a scene: what it does is done, and, but for the Mind's Eye, it is his turn. `line` is what he is seen
 * doing, and `cue` what she is told beside it of what has happened; both are empty when there is no turn to take.
 */
export function useRelic(content: ContentPack, state: GameState, scene: Scene, relicId: string): { state: GameState; scene: Scene; line: string; cue: string } {
  if (!canUseRelic(content, state, scene, relicId).ok) return { state, scene, line: '', cue: '' }
  const relic = relicsHeld(content, state).find((one) => one.id === relicId) as Relic & { use: RelicUse }
  let next = { ...scene, relicsUsed: [...(scene.relicsUsed ?? []), relicId] }
  let after = state
  if (relic.use === 'unravel') {
    // Everyone in it, in nothing.
    next = { ...next, outfitId: 'nude', looks: Object.fromEntries(scene.companionIds.map((id) => [id, { ...scene.looks?.[id], outfitId: 'nude' }])) }
  }
  if (relic.use === 'first-seed') {
    // Whatever she takes against the Bloom does nothing tonight: the same boon as an undoing charm, on everyone in it.
    for (const id of sceneCast(scene)) after = addBoon(after, { kind: 'unguarded', amount: 1, until: state.time + SCENE_HOURS, source: relic.name, targetId: id })
  }
  if (relic.use === 'minds-eye') return { state: after, scene: next, line: '', cue: '' }
  return { state: after, scene: next, line: `*secretly uses the ${relic.name}*`, cue: MOMENT[relic.use](state.player.name) }
}

/** Told to her for the rest of a scene a relic has been used in: what it has set going, as a rule of the scene. */
export function describeRelicUses(uses: RelicUse[], player: string, group: boolean): string[] {
  return uses.flatMap((use) => {
    if (use === 'stillness') return [`Time has stopped for everyone here but ${player} and ${group ? 'the two or three of you' : 'you'}. Nobody else moves, sees or hears anything; you are as alone as in a locked room.`]
    if (use === 'sapphic') return [group ? 'A charm is on the women here: you are drawn to each other as well as to him, and feel the urge to kiss and touch each other.' : 'A charm is on you: you find yourself thinking of other women, and want to kiss someone.']
    if (use === 'minds-eye') return [`${player} can hear your thoughts. After what you say, add what you are really thinking as a line in asterisks that begins with your first name and "thinks:", as *Name thinks: …*${group ? ', for each of you who speaks' : ''}.`]
    return []
  })
}
