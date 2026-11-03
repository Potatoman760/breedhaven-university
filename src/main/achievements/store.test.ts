import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AchievementStore } from './store'

const file = () => join(mkdtempSync(join(tmpdir(), 'bh-achievements-')), 'achievements.json')

describe('the achievements earned on this install', () => {
  it('are earned once each, kept on disk with when, and said to whatever is listening', () => {
    const path = file()
    const told: string[] = []
    const store = new AchievementStore(path, (id) => told.push(id))
    const when = new Date('2026-11-02T10:00:00Z')
    expect(store.unlock(['aced', 'aced', 'not-one'], when)).toEqual(['aced'])
    expect(store.unlock(['aced', 'perfection'], when)).toEqual(['perfection'])
    expect(told).toEqual(['aced', 'perfection'])
    expect(new AchievementStore(path).list()).toEqual({ aced: when.toISOString(), perfection: when.toISOString() })
    expect(JSON.parse(readFileSync(path, 'utf8')).unlocked.aced).toBe(when.toISOString())
  })

  it('start empty without a file, or with one that cannot be read', () => {
    expect(new AchievementStore(file()).list()).toEqual({})
  })
})
