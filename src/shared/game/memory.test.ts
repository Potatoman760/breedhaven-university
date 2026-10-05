import { describe, expect, it } from 'vitest'
import type { GameState, Scene } from '../model'
import {
  addMemory,
  buildSummaryPrompt,
  describeAge,
  fallbackSummary,
  selectMemories
} from './memory'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { fixture } from './testFixture'

const content = fixture()
const start = (): GameState => createInitialState(content)
const scene: Scene = {
  loveInterestId: 'ana',
  companionIds: [],
  nsfw: false,
  beats: [{ activityName: 'Work', locationName: 'the Shop' }, { activityName: 'Date' }],
  messages: [
    { role: 'user', content: 'Do you like it here?' },
    { role: 'assistant', content: 'More than I expected.' }
  ],
  gifts: []
}

describe('buildSummaryPrompt', () => {
  it('lists what happened in order and attributes each line of the conversation', () => {
    const { system, user } = buildSummaryPrompt({ content, state: start(), scene })
    expect(system).toContain('what Ana remembered most')
    expect(user).toContain('1. Work at the Shop\n2. Date')
    expect(user).toContain('Pat: Do you like it here?\nAna: More than I expected.')
  })

  it('mentions gifts and how they were received', () => {
    const gifted: Scene = { ...scene, gifts: [{ name: 'Posy', description: '', reaction: 'loved' }] }
    const { user } = buildSummaryPrompt({ content, state: start(), scene: gifted })
    expect(user).toContain('Gifts Pat gave Ana:\n- Posy (Ana loved it)')
    expect(buildSummaryPrompt({ content, state: start(), scene }).user).not.toContain('Gifts')
  })

  it('keeps only the end of a very long conversation', () => {
    const long: Scene = {
      ...scene,
      messages: [
        { role: 'user', content: 'FIRST' + 'x'.repeat(13000) },
        { role: 'assistant', content: 'LAST' }
      ]
    }
    const { user } = buildSummaryPrompt({ content, state: start(), scene: long })
    expect(user).toContain('[earlier conversation omitted]')
    expect(user).not.toContain('FIRST')
    expect(user).toContain('Ana: LAST')
  })
})

describe('fallbackSummary', () => {
  it('describes the scene from its activities alone', () => {
    expect(fallbackSummary({ content, state: start(), scene })).toBe(
      'Pat and Ana spent time together: Work at the Shop, then Date.'
    )
  })
})

describe('memories', () => {
  it('are stored per love interest, stamped with the current time', () => {
    const before = { ...start(), time: 12 }
    const after = addMemory(addMemory(before, 'ana', 'First.'), 'ana', 'Second.')
    expect(after.memories.ana).toEqual([
      { time: 12, summary: 'First.' },
      { time: 12, summary: 'Second.' }
    ])
    expect(before.memories).toEqual({})
  })

  it('keeps the most recent ones that fit the budget, oldest first', () => {
    const all = ['aaaa', 'bbbb', 'cccc'].map((summary, time) => ({ time, summary }))
    expect(selectMemories(all, 8).map((m) => m.summary)).toEqual(['bbbb', 'cccc'])
    expect(selectMemories(all, 1).map((m) => m.summary)).toEqual(['cccc'])
    expect(selectMemories(all)).toEqual(all)
  })

  it('are described by how many days ago they happened', () => {
    const memory = { time: 0, summary: '' }
    expect(describeAge(content, memory, 5)).toBe('earlier today')
    expect(describeAge(content, memory, 14)).toBe('yesterday')
    expect(describeAge(content, memory, 94)).toBe('5 days ago')
  })

  it('appear in the character prompt along with the current scene', () => {
    const state = { ...addMemory(start(), 'ana', 'Pat walked Ana home.'), time: 14 }
    const text = buildCharacterPrompt({
      content,
      state,
      loveInterestId: 'ana',
      sceneBeats: scene.beats
    })
    expect(text).toContain(
      '## What you remember of your time with Pat\n- yesterday (2 A): Pat walked Ana home.'
    )
    expect(text).toContain('So far on this outing together: Work at the Shop, then Date.')
  })
})

describe('memories of a group scene', () => {
  const bea = { ...content.loveInterests[0], id: 'bea', name: 'Bea Stone' }
  const crowd = { ...content, loveInterests: [...content.loveInterests, bea] }
  const group: Scene = {
    ...scene,
    companionIds: ['bea'],
    messages: [
      { role: 'user', content: 'Hello, both.' },
      { role: 'assistant', content: 'Ana: Hello.\nBea: You again.' }
    ],
    gifts: [
      { name: 'Rose', description: '', reaction: 'loved', recipientId: 'bea' },
      { name: 'Ale', description: '', reaction: 'liked', recipientId: 'ana' }
    ]
  }

  it('writes each person their own, with only the gifts they were given', () => {
    const forBea = buildSummaryPrompt({ content: crowd, state: start(), scene: group, forId: 'bea' })
    expect(forBea.system).toContain('write the single memory Bea Stone keeps')
    expect(forBea.system).toContain("Ana was there too. Say so, but this is Bea Stone's own memory")
    expect(forBea.user).toContain('- Rose (Bea Stone loved it)')
    expect(forBea.user).not.toContain('Ale')
    // The reply already names its speakers, so no name is put in front of it.
    expect(forBea.user).toContain('Pat: Hello, both.\nAna: Hello.\nBea: You again.')

    const forAna = buildSummaryPrompt({ content: crowd, state: start(), scene: group })
    expect(forAna.system).toContain('write the single memory Ana keeps')
    expect(forAna.system).toContain('Bea was there too')
    expect(forAna.user).toContain('- Ale (Ana liked it)')
    expect(forAna.user).not.toContain('Rose')
  })

  it('names everyone in the plain fallback note', () => {
    expect(fallbackSummary({ content: crowd, state: start(), scene: group, forId: 'bea' })).toMatch(
      /^Pat, Ana and Bea Stone /
    )
  })
})
