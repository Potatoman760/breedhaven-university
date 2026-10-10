import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createInitialState } from '../../shared/game'
import { fixture } from '../../shared/game/testFixture'
import type { Scene } from '../../shared/model'
import { latestSave } from '../../shared/saves'
import { SaveStore } from './store'

const tempDir = () => join(mkdtempSync(join(tmpdir(), 'bh-saves-')), 'saves')
const state = { ...createInitialState(fixture()), time: 14 }
const scene: Scene = {
  baseline: { stats: {}, energy: 0, money: 0, time: 0, relationship: { affection: 0, trust: 0, desire: 0 }, companions: {} },
  loveInterestId: 'ana',
  companionIds: [],
  nsfw: false,
  beats: [{ activityName: 'Date' }],
  messages: [{ role: 'user', content: 'Hi' }],
  gifts: [], conceived: [], departed: [], npc: false
}

describe('SaveStore', () => {
  it('lists nothing when there are no saves', () => {
    expect(new SaveStore(tempDir()).list()).toEqual([])
  })

  it('round-trips the state and an open scene', () => {
    const store = new SaveStore(tempDir())
    store.save('slot2', { state, scene })
    expect(store.load('slot2')).toEqual({ state, scene })
  })

  it('summarises saves for the slot list', () => {
    const dir = tempDir()
    const store = new SaveStore(dir)
    store.save('slot1', { state, scene: null }, new Date('2026-01-01T10:00:00Z'))
    store.save('auto', { state, scene }, new Date('2026-01-02T10:00:00Z'))

    expect(store.list()).toEqual([
      { slotId: 'auto', savedAt: '2026-01-02T10:00:00.000Z', unreadable: false, time: 14, playerName: 'Pat', inScene: true },
      { slotId: 'slot1', savedAt: '2026-01-01T10:00:00.000Z', unreadable: false, time: 14, playerName: 'Pat', inScene: false }
    ])
    expect(latestSave(store.list())?.slotId).toBe('auto')
    expect(readdirSync(dir).sort()).toEqual(['auto.json', 'slot1.json'])
  })

  it('overwrites and deletes slots', () => {
    const store = new SaveStore(tempDir())
    store.save('slot1', { state, scene })
    store.save('slot1', { state: { ...state, time: 20 }, scene: null })
    expect(store.load('slot1')).toEqual({ state: { ...state, time: 20 }, scene: null })

    store.delete('slot1')
    expect(store.list()).toEqual([])
    expect(() => store.load('slot1')).toThrow('Slot 1 is empty')
  })

  it('flags saves it cannot read instead of hiding them', () => {
    const dir = tempDir()
    const store = new SaveStore(dir)
    store.save('slot1', { state, scene: null })
    writeFileSync(join(dir, 'slot1.json'), '{"version":999}')
    writeFileSync(join(dir, 'slot3.json'), 'not json')

    expect(store.list().map((s) => [s.slotId, s.unreadable])).toEqual([
      ['slot1', true],
      ['slot3', true]
    ])
    expect(latestSave(store.list())).toBeUndefined()
    expect(() => store.load('slot1')).toThrow(/Slot 1 could not be read/)
  })
})

describe('a save with a name', () => {
  it('is called what it is given, keeps its name when written over, and can be called something else or nothing', async () => {
    const { saveLabel, RenameSaveRequestSchema } = await import('../../shared/saves')
    const store = new SaveStore(tempDir())
    const first = new Date('2026-01-01T10:00:00Z')
    expect(store.save('slot1', { state, scene: null }, first, 'Before the fair')).toMatchObject({ name: 'Before the fair' })
    expect(saveLabel('slot1', store.list()[0])).toBe('Before the fair')

    // Written over with no name given, it keeps the one it had.
    const again = store.save('slot1', { state: { ...state, time: 20 }, scene: null }, new Date('2026-01-02T10:00:00Z'))
    expect(again).toMatchObject({ name: 'Before the fair', time: 20 })

    // Renamed, it is the same save: only what it is called changes.
    const renamed = store.rename('slot1', 'After the fair')
    expect(renamed).toMatchObject({ name: 'After the fair', time: 20, savedAt: again.savedAt })
    expect(store.load('slot1').state.time).toBe(20)

    // With its name taken away it goes by its slot again.
    expect(store.rename('slot1', '').unreadable === false && store.list()[0]).toMatchObject({ slotId: 'slot1' })
    expect(saveLabel('slot1', store.list()[0])).toBe('Slot 1')
    expect(() => store.rename('slot2', 'Nothing here')).toThrow(/Slot 2 is empty/)

    // A name is trimmed, and no longer than fits.
    expect(RenameSaveRequestSchema.parse({ slotId: 'slot1', name: `  ${'x'.repeat(60)}  ` }).name).toHaveLength(40)
  })
})
