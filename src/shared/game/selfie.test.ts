import { describe, expect, it } from 'vitest'
import type { GameState } from '../model'
import { addNote, courierExcerpt } from './courier'
import { buildSelfiePrompt, parseSelfie, selfieDraft } from './selfie'
import { createInitialState } from './state'
import { fixture } from './testFixture'

const content = fixture()
const start = (): GameState => createInitialState(content)
const ana = content.loveInterests.find((li) => li.id === 'ana')!

describe('a selfie asked for in a DM', () => {
  it('is written from how she stands with him and what they have said', () => {
    const state = addNote(start(), 'ana', { from: 'player', text: 'Send me a selfie?', read: true })
    const { system, user } = buildSelfiePrompt(content, state, ana)
    expect(system).toContain('only Ana is in it')
    expect(user).toContain('With Pat: Stranger')
    expect(user).toContain('Pat: Send me a selfie?')
  })

  it('is drawn as she is dressed, alone, as a selfie', () => {
    const prompt = selfieDraft(content, start(), ana, 'She is smiling.', 'phone framing')
    expect(prompt).toContain('A close-up phone selfie of one person, solo')
    expect(prompt).toContain('a red dress')
    expect(prompt).toContain('She is smiling.')
    expect(prompt).toContain('phone framing')
  })

  it('reads the message and the picture, and nothing without a message', () => {
    expect(parseSelfie('Sure!\n{"text": " \\"hi\\" ", "picture": " She is waving. "}')).toEqual({ text: 'hi', picture: 'She is waving.' })
    expect(parseSelfie('{"picture": "She is waving."}')).toBeUndefined()
    expect(parseSelfie('no json')).toBeUndefined()
  })

  it('is remembered in the thread as having been sent', () => {
    const state = addNote(start(), 'ana', { from: 'them', text: 'Here you go', image: 'photos/ana/1.png', read: false })
    expect(courierExcerpt(content, state, 'ana').at(-1)).toBe('Ana: Here you go [sent with a selfie]')
  })
})
