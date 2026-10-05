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
  loveInterestId: 'ana',
  companionIds: [],
  nsfw: false,
  beats: [{ activityName: 'Date' }],
  messages: [{ role: 'user', content: 'Hi' }],
  gifts: []
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
