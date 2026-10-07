import { describe, expect, it } from 'vitest'
import type { ContentPack, GameState } from '../model'
import { WeatherTypeSchema } from '../model'
import { buildCharacterPrompt } from './prompt'
import { dialogueLines } from './scene'
import { createInitialState } from './state'
import { fixture } from './testFixture'
import { weatherOn } from './weather'

// Fixture months: a (3 days) then b (2 days); the game starts on 2 a, with 20-hour days.
const base = fixture()
const content: ContentPack = {
  ...base,
  calendar: {
    ...base.calendar,
    weather: [
      WeatherTypeSchema.parse({ id: 'clear', name: 'Clear skies', description: 'Bright and dry.', weight: 3 }),
      WeatherTypeSchema.parse({ id: 'rain', name: 'Light rain', weight: 1 }),
      WeatherTypeSchema.parse({ id: 'snow', name: 'Snow', weight: 100, months: ['b'] })
    ]
  }
}
const game = (seed: number, day = 0): GameState => ({
  ...createInitialState(content, undefined, seed),
  time: day * 20
})

describe('weatherOn', () => {
  it('holds all day and is the same every time it is asked', () => {
    const morning = weatherOn(content, game(7))
    expect(morning).toBeDefined()
    expect(weatherOn(content, { ...game(7), time: 13 })).toBe(morning)
    expect(weatherOn(content, game(7))).toBe(morning)
  })

  it('varies from day to day and from game to game', () => {
    const run = (seed: number) => Array.from({ length: 40 }, (_, day) => weatherOn(content, game(seed), day * 100)!.id)
    expect(new Set(run(1)).size).toBeGreaterThan(1)
    expect(run(1)).not.toEqual(run(2))
  })

  it('only uses kinds the month allows, in proportion to their weight', () => {
    // Day 0 and 1 are in month a, where snow can't fall; days 2 and 3 are in month b.
    const inA = Array.from({ length: 200 }, (_, seed) => weatherOn(content, game(seed, 0))!.id)
    expect(inA).not.toContain('snow')
    expect(inA.filter((id) => id === 'clear').length).toBeGreaterThan(inA.filter((id) => id === 'rain').length)
    const inB = Array.from({ length: 200 }, (_, seed) => weatherOn(content, game(seed, 2))!.id)
    expect(inB.filter((id) => id === 'snow').length).toBeGreaterThan(180)
  })

  it('is undefined when the content has no weather', () => {
    expect(weatherOn(base, createInitialState(base))).toBeUndefined()
  })
})

describe('the scene prompt', () => {
  const prompt = buildCharacterPrompt({ content, state: game(7), loveInterestId: 'ana' })

  it('tells the character the day and the weather', () => {
    const weather = weatherOn(content, game(7))!
    expect(prompt).toContain('It is 06:00 (Day) on Two, 2 A, Year 1.')
    expect(prompt).toContain(`The weather today: ${weather.name}.`)
  })

  it('asks for a few short visual-novel beats, at the start and again at the end', () => {
    expect(prompt).toContain('## How to write your reply')
    expect(prompt).toContain('- Write 2 to 4 short lines, each on its own line.')
    expect(prompt).toContain('never write what Pat says, does or feels')
    expect(prompt.trimEnd().endsWith('under 60 words in all.')).toBe(true)
  })
})

describe('dialogueLines', () => {
  it('splits a reply into beats, telling actions from speech', () => {
    expect(dialogueLines('Well, well. *The* Kael.\n\n*She tilts her head.*\n  So tell me.  \n')).toEqual([
      { action: false, text: 'Well, well. *The* Kael.' },
      { action: true, text: 'She tilts her head.' },
      { action: false, text: 'So tell me.' }
    ])
    expect(dialogueLines('  ')).toEqual([])
  })
})
