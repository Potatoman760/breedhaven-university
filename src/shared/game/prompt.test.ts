import { describe, expect, it } from 'vitest'
import type { GameState } from '../model'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { fixture } from './testFixture'

const content = fixture()
const start = (): GameState => createInitialState(content)
const prompt = (state: GameState, recentText?: string) =>
  buildCharacterPrompt({ content, state, loveInterestId: 'ana', recentText })

describe('buildCharacterPrompt', () => {
  it('describes the character, their traits and how they speak', () => {
    const text = prompt(start())
    expect(text).toContain('You are Ana')
    expect(text).toContain('Speaks in riddles.')
    expect(text).toContain('- Shy: Slow to open up.')
    expect(text).toContain('Wearing: a red dress')
  })

  it('sets the scene from the game state', () => {
    const text = prompt(start())
    expect(text).toContain('It is 06:00 (Day) on Two, 2 A, Year 1.')
    expect(text).toContain('You and Pat are at Home.')
    expect(prompt({ ...start(), time: 34 })).toContain('Today is the Feast.')
  })

  it('guards secrets until the relationship allows sharing them', () => {
    const early = prompt(start())
    expect(early).toContain('Stage: Stranger.')
    expect(early).toContain('## Secrets you keep')
    expect(early).not.toContain('## Things you may share')

    const friends = { ...start(), relationships: { ana: { affection: 30, trust: 0, desire: 0 } } }
    const later = prompt(friends)
    expect(later).toContain('Stage: Friend.')
    expect(later).toContain('Jokes freely.')
    expect(later).toContain('## Things you may share\n- Is secretly a dragon.')
    expect(later).not.toContain('## Secrets you keep')
  })

  it('includes relevant world knowledge', () => {
    expect(prompt(start())).toContain('- Town: A small town.')
    expect(prompt(start())).not.toContain('Dragons are extinct.')
    expect(prompt(start(), 'any dragon stories?')).toContain('- Dragons: Dragons are extinct.')
  })

  it('rejects unknown characters', () => {
    expect(() =>
      buildCharacterPrompt({ content, state: start(), loveInterestId: 'nobody' })
    ).toThrow(/Unknown love interest/)
  })
})
