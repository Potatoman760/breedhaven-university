import { describe, expect, it } from 'vitest'
import type { GameState } from '../model'
import { codexExcerpt, selectCodexEntries } from './codex'
import { createInitialState } from './state'
import { fixture } from './testFixture'

const content = fixture()
const start = (): GameState => createInitialState(content)
const ids = (query: Partial<Parameters<typeof selectCodexEntries>[0]>) =>
  selectCodexEntries({ content, state: start(), ...query }).map((e) => e.id)

describe('selectCodexEntries', () => {
  it('includes only always-on entries when nothing else is relevant', () => {
    expect(ids({})).toEqual(['town'])
  })

  it('pulls in entries whose keywords are mentioned, ignoring case', () => {
    expect(ids({ recentText: 'Tell me about the Dragon!' })).toEqual(['town', 'dragons'])
  })

  it('matches whole words only', () => {
    expect(ids({ recentText: 'I saw a dragonfly' })).toEqual(['town'])
  })

  it('includes entries tied to the current location', () => {
    expect(ids({ state: { ...start(), locationId: 'shop' } })).toEqual(['town', 'shop-lore'])
  })

  it('keeps locked entries out until their conditions pass', () => {
    const friends = { ...start(), relationships: { ana: { affection: 30, trust: 0, desire: 0 } } }
    expect(ids({ recentText: 'dragon', loveInterestId: 'ana' })).toEqual(['town', 'dragons'])
    expect(ids({ state: friends, recentText: 'dragon' })).toEqual(['town', 'secret', 'dragons'])
  })

  it('includes entries unlocked by an effect', () => {
    const unlocked = { ...start(), unlockedCodexIds: ['secret'] }
    expect(ids({ state: unlocked, recentText: 'dragon' })).toContain('secret')
  })

  it('cuts long entries at a sentence end', () => {
    const entry = { ...content.codex[0], content: 'First sentence. Second sentence. Third one runs long.' }
    expect(codexExcerpt(entry, 40)).toBe('First sentence. Second sentence. [...]')
    expect(codexExcerpt(entry, 500)).toBe(entry.content)
  })

  it('stays within the budget', () => {
    expect(ids({ recentText: 'dragon', budgetChars: 20 })).toEqual(['town'])
  })
})
