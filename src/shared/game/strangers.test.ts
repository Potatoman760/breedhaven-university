import { describe, expect, it } from 'vitest'
import type { Scene } from '../model'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { newStrangers, saysName, unnamedIn, UNNAMED, withStrangers } from './strangers'
import { fixture } from './testFixture'

const content = fixture()
const state = createInitialState(content)
const ana = content.loveInterests.find((li) => li.id === 'ana')!
const scene = (extra: Partial<Scene> = {}): Scene =>
  ({ loveInterestId: 'ana', companionIds: [], npc: false, nsfw: false, beats: [], messages: [], gifts: [], conceived: [], departed: [], ...extra }) as Scene

describe('a woman he is meeting for the first time', () => {
  it('is a stranger in the scene she meets him in, and not once they have met, nor at a masked ball', () => {
    expect(newStrangers(content, state, scene())).toEqual(['ana'])
    expect(newStrangers(content, { ...state, met: ['ana'] }, scene())).toEqual([])
    expect(newStrangers(content, state, scene({ strangers: ['ana'] }))).toEqual([])
    expect(newStrangers(content, state, scene({ mask: { maskId: 'm', revealed: false } }))).toEqual([])
  })

  it('has her name said by a word of a line, and not by the hidden tags or the speaker before it', () => {
    const first = ana.name.split(' ')[0]
    expect(saysName(`*She smiles.* I'm ${first}.`, ana)).toBe(true)
    expect(saysName(`I'm ${first.toLowerCase()}, hi`, ana)).toBe(true)
    expect(saysName(`[EXPRESSION: ${first}=happy]\n${first}: Hello there.`, ana)).toBe(false)
    expect(saysName(`${first}s and more`, ana)).toBe(false)
  })

  it('is "???" on screen until her name is said, and the LLM is told to say it while it has not been', () => {
    const met = scene({ strangers: ['ana'] })
    expect(withStrangers(content, met).loveInterests.find((li) => li.id === 'ana')?.name).toBe(UNNAMED)
    expect(buildCharacterPrompt({ content, state, loveInterestId: 'ana', strangers: unnamedIn(content, met) })).toContain('Tell him your name early in the scene')

    const named = { ...met, messages: [{ role: 'assistant' as const, content: `Call me ${ana.name}.` }] }
    expect(unnamedIn(content, named)).toEqual([])
    expect(withStrangers(content, named)).toBe(content)
    expect(buildCharacterPrompt({ content, state, loveInterestId: 'ana', strangers: unnamedIn(content, named) })).not.toContain('First meeting')
  })
})
