import { describe, expect, it } from 'vitest'
import type { GameState } from '../model'
import { buildCharacterPrompt, lessonCue, openingCue, sceneTurns } from './prompt'
import { dialogueLines, lookLines } from './scene'
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

describe('who speaks first', () => {
  it('has the character open a scene, and keeps the exchange starting with the player\'s side', () => {
    const opening = sceneTurns([], 'Pat')
    expect(opening).toEqual([{ role: 'user', content: openingCue('Pat') }])
    expect(opening[0].content).toContain('you open it')

    const hers = { role: 'assistant' as const, content: '*The bell rings.* Ana: You came.' }
    const his = { role: 'user' as const, content: 'I did.' }
    expect(sceneTurns([hers, his], 'Pat')).toEqual([opening[0], hers, his])
    // A scene the player opened himself is sent as it is.
    expect(sceneTurns([his, hers], 'Pat')).toEqual([his, hers])
    // The time goes beside the latest thing said to her, and nowhere else; what is kept of the conversation is untouched.
    expect(sceneTurns([hers, his], 'Pat', undefined, 'It is now 12:00 (Afternoon), daytime.').at(-1)).toEqual({ role: 'user', content: `${his.content}\n[It is now 12:00 (Afternoon), daytime.]` })
    expect(sceneTurns([], 'Pat', undefined, 'It is now 22:00 (Night), dark out.')[0].content).toMatch(/\[It is now 22:00 \(Night\), dark out\.\]$/)
    expect(sceneTurns([his, hers], 'Pat', undefined, 'noon')).toEqual([his, hers])
    // Someone walking in as he speaks goes in front of his line, and stays there in what is sent after.
    const walkedIn = { ...his, cue: 'Bea walks in.' }
    expect(sceneTurns([walkedIn, hers], 'Pat')[0]).toEqual({ role: 'user', content: '[Bea walks in.]\nI did.' })
  })
})

describe('what she wrote before', () => {
  it('goes back with the hidden lines it began with, so she keeps writing them', () => {
    const reply = '[EXPRESSION: happy]\n[COMFORT: 4 he is easy company]\nAna: You came.\n[OUTFIT: nude]'
    expect(lookLines(reply)).toBe('[EXPRESSION: happy]\n[COMFORT: 4 he is easy company]')
    expect(lookLines('Ana: You came.')).toBe('')

    const his = { role: 'user' as const, content: 'I did.' }
    const hers = { role: 'assistant' as const, content: 'Ana: You came.', tags: lookLines(reply) }
    expect(sceneTurns([his, hers], 'Pat')).toEqual([his, { role: 'assistant', content: '[EXPRESSION: happy]\n[COMFORT: 4 he is easy company]\nAna: You came.' }])
    // One that carried none goes back as it is.
    expect(sceneTurns([his, { role: 'assistant', content: 'Ana: Hm.' }], 'Pat')[1].content).toBe('Ana: Hm.')
  })
})

describe('the lecture a class opens with', () => {
  const lesson = { speaker: 'Doctor Reed', course: 'Riddles (RID 101)', about: 'How a riddle is built.' }

  it('is asked for in place of the usual opening, at its own length', () => {
    const cue = sceneTurns([], 'Pat', lesson)[0].content
    expect(cue).toBe(lessonCue('Pat', lesson))
    expect(cue).toContain('5 to 8 lines')
    expect(cue).toContain('starts with "Doctor Reed:"')
    // He is not called on: he could not know the answer to a lesson that was made up.
    expect(cue).toContain('Pat is never called on')
    expect(cue).toContain('Never on a question from Doctor Reed')
    expect(cue).toContain('How a riddle is built.')

    const scene = { content: fixture(), state: createInitialState(fixture()), loveInterestId: 'ana', sceneBeats: [{ activityName: 'Riddles' }], look: {} }
    const opening = buildCharacterPrompt({ ...scene, lesson, opening: true })
    expect(opening).toContain('write 5 to 8 lines')
    expect(opening).toContain('5 to 8 lines of the lecture')
    expect(opening).not.toContain('Say one thing and stop')
    // Once it has been given, replies are short again, and the teacher keeps a voice.
    const later = buildCharacterPrompt({ ...scene, lesson, opening: false })
    expect(later).toContain('Say one thing and stop')
    expect(later).toContain('a line of theirs starts with "Doctor Reed:"')
    expect(later).toContain('does not call on Pat')
    expect(later).toContain('Only when Pat himself speaks to Doctor Reed')
    expect(buildCharacterPrompt({ ...scene, opening: true })).not.toContain('lecture')
  })

  it('is read back with the teacher as its speaker, though she is not one of the cast', () => {
    const cast = [{ id: 'ana', name: 'Ana Vey' }]
    const lines = dialogueLines('*The room settles.*\nDoctor Reed: A riddle hides its answer.\nReed: Who can tell me how?\nAna: He always starts like this.\nSomeone: unknown', cast, ['Doctor Reed'])
    expect(lines).toEqual([
      { action: true, text: 'The room settles.' },
      { action: false, text: 'A riddle hides its answer.', speakerName: 'Doctor Reed' },
      { action: false, text: 'Who can tell me how?', speakerName: 'Doctor Reed' },
      { action: false, text: 'He always starts like this.', speakerId: 'ana' },
      { action: false, text: 'Someone: unknown' }
    ])
  })
})
