import { describe, expect, it } from 'vitest'
import { ExpeditionConfigSchema, type ContentPack, type GameState, type Scene } from '../model'
import { inPrivate } from './drama'
import { factor, inForce } from './modifiers'
import { sceneExtras } from './npcs'
import { buildCharacterPrompt } from './prompt'
import { canUseRelic, relicOn, relicTraitIds, sceneRelicUses, toggleRelic, useRelic } from './relics'
import { sceneBaseline } from './scene'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Four relics: one that makes everyone a flirt while it is on, one that doubles the drama, and two to use in a scene.
const base = fixture()
const [ana] = base.loveInterests
const relic = (id: string, more: object) => ({ id, name: id, description: '', ...more })
const depth = (id: string, more: object) => ({ name: id, nodes: [{ kind: 'fight', enemyIds: ['blob'] }], relic: relic(id, more) })
const content: ContentPack = {
  ...base,
  loveInterests: [ana, { ...ana, id: 'bea', name: 'Bea Stone' }],
  traits: [...base.traits, { id: 'flirt', name: 'Flirt', definition: 'Flirts with anyone.', drama: { jealousy: 0, sociable: 0 } }],
  expedition: ExpeditionConfigSchema.parse({
    entryLocationId: 'shop',
    roles: [{ id: 'guard', name: 'Guard', footing: 30, actions: [{ id: 'bash', name: 'Bash', kind: 'attack', power: 4 }] }],
    enemies: [{ id: 'blob', name: 'Blob', footing: 10, attack: 1 }],
    depths: [depth('tongue', { traitIds: ['flirt'] }), depth('apple', { modifier: { kind: 'drama', amount: 2 } }), depth('thread', { use: 'unravel' }), depth('glass', { use: 'stillness' }), depth('seed', { use: 'first-seed' }), depth('eye', { use: 'minds-eye' })]
  })
}
const start: GameState = createInitialState(content)
const holding = (...ids: string[]): GameState => ({ ...start, expedition: { ...start.expedition, relics: ids } })
const scene: Scene = { loveInterestId: 'ana', companionIds: ['bea'], npc: false, nsfw: false, beats: [], messages: [], gifts: [], conceived: [], departed: [], baseline: sceneBaseline(start, 'ana', ['bea']) }

describe('a relic always at work', () => {
  it('starts off, is at work once turned on, and can be turned off again', () => {
    expect(relicTraitIds(content, holding('tongue', 'apple'))).toEqual([])
    expect(factor(content, holding('tongue', 'apple'), 'drama')).toBe(1)
    const held = toggleRelic(toggleRelic(holding('tongue', 'apple'), 'tongue'), 'apple')
    expect(relicTraitIds(content, held)).toEqual(['flirt'])
    expect(factor(content, held, 'drama')).toBe(2)
    const off = toggleRelic(toggleRelic(held, 'tongue'), 'apple')
    expect(relicOn(off, 'tongue')).toBe(false)
    expect(relicTraitIds(content, off)).toEqual([])
    expect(factor(content, off, 'drama')).toBe(1)
    expect(relicOn(toggleRelic(off, 'tongue'), 'tongue')).toBe(true)
    // One he does not hold cannot be turned on.
    expect(toggleRelic(start, 'tongue')).toBe(start)
  })

  it('gives every woman its traits, told as her own', () => {
    expect(buildCharacterPrompt({ content, state: toggleRelic(holding('tongue'), 'tongue'), loveInterestId: 'ana' })).toContain('- Flirt: Flirts with anyone.')
    expect(buildCharacterPrompt({ content, state: start, loveInterestId: 'ana' })).not.toContain('Flirt:')
  })
})

describe('a relic used in a scene', () => {
  it('is used once a scene, undresses everyone, and is his turn: what he does, and what she is told has happened', () => {
    const held = holding('thread')
    const used = useRelic(content, held, scene, 'thread')
    expect(used.scene).toMatchObject({ relicsUsed: ['thread'], outfitId: 'nude', looks: { bea: { outfitId: 'nude' } } })
    expect(used.line).toContain('secretly uses')
    expect(used.cue).toContain('vanished')
    expect(canUseRelic(content, held, used.scene, 'thread')).toEqual({ ok: false, reasons: ['Used in this scene'] })
    // One always at work is not used, nor one in a scene with an NPC.
    expect(canUseRelic(content, holding('apple'), scene, 'apple').ok).toBe(false)
    expect(canUseRelic(content, held, { ...scene, npc: true }, 'thread').ok).toBe(false)
  })

  it('opens her mind without a turn: nothing she could notice happens, and her thoughts are heard from then on', () => {
    const used = useRelic(content, holding('eye'), scene, 'eye')
    expect(used).toMatchObject({ line: '', cue: '' })
    expect(sceneRelicUses(content, used.scene)).toEqual(['minds-eye'])
  })

  it('stops time for everyone else: nobody else is there, and the place is as private as a room', () => {
    const still = useRelic(content, holding('glass'), scene, 'glass').scene
    expect(sceneRelicUses(content, still)).toEqual(['stillness'])
    expect(sceneExtras(content, start, still)).toEqual([])
    expect(inPrivate(content, start, still)).toBe(true)
    expect(buildCharacterPrompt({ content, state: start, loveInterestId: 'ana', companionIds: ['bea'], relics: ['stillness'] })).toContain('Time has stopped for everyone here')
  })

  it('opens every woman in the scene to the Bloom, whatever she takes against it', () => {
    const seeded = useRelic(content, holding('seed'), scene, 'seed').state
    expect(inForce(content, seeded, 'unguarded', { loveInterestId: 'ana' })).toBe(true)
    expect(inForce(content, seeded, 'unguarded', { loveInterestId: 'bea' })).toBe(true)
  })
})
