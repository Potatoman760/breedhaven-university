import type { ContentPack, GameState, Relic, RelicUse, Scene } from '../model'
import { relicsHeld } from './expedition'
import { addBoon } from './modifiers'
import { sceneCast } from './scene'
import { t } from '../i18n'

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
  const reasons = !relic?.use
    ? [t('scene.relics.alwaysOn')]
    : scene.npc
      ? [t('scene.relics.notWithNpc')]
      : scene.relicsUsed?.includes(relicId)
        ? [t('scene.relics.usedHere')]
        : []
  return { ok: reasons.length === 0, reasons }
}

// What she is told the moment it is used, beside the line that uses it: what has just happened, so the reply is her
// reaction. He uses it in secret: nobody knows it was him. The Mind's Eye changes nothing she could notice, so it is
// not a turn at all: her thoughts are simply heard from her next reply on.
const MOMENT: Record<Exclude<RelicUse, 'minds-eye'>, (player: string) => string> = {
  unravel: (player) => t('scene.relics.moment.unravel', { player }),
  stillness: (player) => t('scene.relics.moment.stillness', { player }),
  sapphic: () => t('scene.relics.moment.sapphic'),
  'first-seed': () => t('scene.relics.moment.firstSeed')
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
  return { state: after, scene: next, line: t('scene.relics.uses', { relic: relic.name }), cue: MOMENT[relic.use](state.player.name) }
}

/** Told to her for the rest of a scene a relic has been used in: what it has set going, as a rule of the scene. */
export function describeRelicUses(uses: RelicUse[], player: string, group: boolean): string[] {
  return uses.flatMap((use) => {
    if (use === 'stillness') return [t('scene.relics.rule.stillness', { player, group })]
    if (use === 'sapphic') return [group ? t('scene.relics.rule.sapphicGroup') : t('scene.relics.rule.sapphic')]
    if (use === 'minds-eye') return [t('scene.relics.rule.mindsEye', { player, group })]
    return []
  })
}
