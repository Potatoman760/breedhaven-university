import { describe, expect, it } from 'vitest'
import type { Scene } from '../model'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { firstLineFlag, firstLinesIn, newStrangers, saysName, unnamedIn, UNNAMED, withStrangers } from './strangers'
import { fixture } from './testFixture'

const content = fixture()
const state = createInitialState(content)
const ana = content.loveInterests.find((li) => li.id === 'ana')!
const scene = (extra: Partial<Scene> = {}): Scene =>
  ({ loveInterestId: 'ana', companionIds: [], npc: false, nsfw: false, beats: [], messages: [], gifts: [], conceived: [], departed: [], ...extra }) as Scene

describe('a woman he is meeting for the first time', () => {
  it('opens her first scene with him with her first line, once, and in a group with her name before it', () => {
    const first = ana.name.split(' ')[0]
    const said = { ...content, loveInterests: content.loveInterests.map((li) => (li.id === 'ana' ? { ...li, firstLine: `I'm ${first}.` } : li)) }
    expect(firstLinesIn(said, state, scene())).toEqual({ ids: ['ana'], text: `I'm ${first}.` })
    expect(firstLinesIn(said, state, scene({ companionIds: ['bea'] }))?.text).toBe(`${first}: I'm ${first}.`)
    // Said once; and not where she has been met, in a class, or once anything has been said.
    expect(firstLinesIn(said, { ...state, flags: { [firstLineFlag('ana')]: true } }, scene())).toBeUndefined()
    expect(firstLinesIn(said, { ...state, met: ['ana'] }, scene())).toBeUndefined()
    expect(firstLinesIn(said, state, scene({ lesson: {} as never }))).toBeUndefined()
    expect(firstLinesIn(said, state, scene({ messages: [{ role: 'user', content: 'Hi.' }] }))).toBeUndefined()
    expect(firstLinesIn(content, state, scene())).toBeUndefined()
    // Her name is said in it, so she is no longer a stranger to the screen.
    expect(unnamedIn(said, scene({ strangers: ['ana'], messages: [{ role: 'assistant', content: `I'm ${first}.` }] }))).toEqual([])
  })

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
