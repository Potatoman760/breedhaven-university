import { describe, expect, it } from 'vitest'
import type { Scene } from '../model'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { fixture } from './testFixture'
import { SCENE_LENGTHS, usualLength, windingDown } from './windDown'

const said = (times: number): Scene['messages'] =>
  Array.from({ length: times }, (_, i) => [
    { role: 'user' as const, content: `Line ${i}` },
    { role: 'assistant' as const, content: 'Mm.' }
  ]).flat()
const scene = (more: Partial<Scene> = {}) => ({ loveInterestId: 'ana', messages: said(SCENE_LENGTHS.other), ...more }) as Scene

describe('winding a scene down', () => {
  it('runs each kind of scene to its usual length', () => {
    expect(usualLength(scene({ lesson: { speaker: 'Ana', course: 'Riddles', about: '' } }))).toBe(SCENE_LENGTHS.class)
    expect(usualLength(scene({ planned: true }))).toBe(SCENE_LENGTHS.date)
    expect(usualLength(scene({ societyId: 'chess' }))).toBe(SCENE_LENGTHS.society)
    expect(usualLength(scene())).toBe(SCENE_LENGTHS.other)
  })

  it('asks her to wind down past it, unless a sex-act is under way or she is as glad as can be to be there', () => {
    expect(windingDown(scene({ messages: said(SCENE_LENGTHS.other - 1) }))).toBe(false)
    expect(windingDown(scene())).toBe(true)
    expect(windingDown(scene({ planned: true }))).toBe(false)
    expect(windingDown(scene({ animationId: 'missionary' }))).toBe(false)
    expect(windingDown(scene({ comfort: { ana: { level: 5, reason: 'happy' } } }))).toBe(false)
    expect(windingDown(scene({ comfort: { ana: { level: 4, reason: 'fine' } } }))).toBe(true)
  })

  it('puts the nudge in her prompt only once it is due', () => {
    const content = fixture()
    const state = createInitialState(content)
    const beats = [{ activityName: 'Talking', locationName: 'Home' }]
    const quiet = buildCharacterPrompt({ content, state, loveInterestId: 'ana', sceneBeats: beats })
    expect(quiet).not.toContain('longer than one like it usually runs')
    expect(quiet).not.toContain('never mention it')
    const due = buildCharacterPrompt({ content, state, loveInterestId: 'ana', sceneBeats: beats, windDown: 9 })
    expect(due).toContain('This scene has gone on for 9 exchanges, longer than one like it usually runs.')
  })
})
