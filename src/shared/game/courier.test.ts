import { describe, expect, it } from 'vitest'
import type { ContentPack, GameState } from '../model'
import {
  addNote,
  answerInvite,
  chanceOfWriting,
  courierExcerpt,
  courierRound,
  courierRoundDue,
  fallbackInvite,
  inviteStands,
  markRead,
  unreadNotes
} from './courier'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { fixture } from './testFixture'

const base = fixture()
const content: ContentPack = {
  ...base,
  loveInterests: [{ ...base.loveInterests[0], admires: ['strength'] }]
}
const start = createInitialState(content)
const strong: GameState = { ...start, player: { ...start.player, stats: { strength: 14 } } }
const tea = { loveInterestId: 'ana', companionIds: [], title: 'Tea', time: 4, hours: 2, locationId: 'home' }

describe('notes', () => {
  const chatted = addNote(addNote(start, 'ana', { from: 'player', text: 'Lunch?', read: true }), 'ana', {
    from: 'them',
    text: 'If you are buying.',
    proposal: tea,
    read: false
  })

  it('are kept per love interest, stamped with the time, unread until opened', () => {
    expect(chatted.courier['ana'].map((n) => n.time)).toEqual([0, 0])
    expect(unreadNotes(chatted)).toBe(1)
    expect(unreadNotes(chatted, 'nobody')).toBe(0)
    expect(unreadNotes(markRead(chatted, 'ana'))).toBe(0)
    expect(markRead(start, 'ana')).toBe(start)
  })

  it('carry invitations the player can accept onto the calendar, decline, or let lapse', () => {
    expect(inviteStands(content, chatted, tea)).toBe(true)
    const accepted = answerInvite(content, chatted, 'ana', 1, true)
    expect(accepted.appointments.map((a) => a.title)).toEqual(['Tea'])
    expect(accepted.courier['ana'][1].answer).toBe('accepted')
    // Answering twice changes nothing.
    expect(answerInvite(content, accepted, 'ana', 1, false)).toBe(accepted)

    const declined = answerInvite(content, chatted, 'ana', 1, false)
    expect(declined.appointments).toEqual([])
    expect(declined.courier['ana'][1].answer).toBe('declined')

    const late = answerInvite(content, { ...chatted, time: 5 }, 'ana', 1, true)
    expect(late.appointments).toEqual([])
    expect(late.courier['ana'][1].answer).toBe('lapsed')
  })

  it('are shown to the character, newest kept when there are too many', () => {
    const lines = courierExcerpt(content, chatted, 'ana')
    expect(lines[0]).toBe('Pat: Lunch?')
    expect(lines[1]).toMatch(/^Ana: If you are buying\. \[invitation: Tea, .* at 10:00; not yet answered\]$/)

    const long = Array.from({ length: 30 }, (_, i) => i).reduce(
      (state, i) => addNote(state, 'ana', { from: 'player', text: `${i} ${'x'.repeat(200)}`, read: true }),
      start
    )
    const kept = courierExcerpt(content, long, 'ana')
    expect(kept.join('').length).toBeLessThanOrEqual(2400)
    expect(kept.at(-1)).toMatch(/^Pat: 29 /)
    expect(kept.length).toBeLessThan(30)

    const scene = buildCharacterPrompt({ content, state: chatted, loveInterestId: 'ana', sceneBeats: [{ activityName: 'Tea' }] })
    expect(scene).toContain('## Notes you and Pat have sent each other by courier, oldest first\nPat: Lunch?')
    expect(buildCharacterPrompt({ content, state: start, loveInterestId: 'ana' })).not.toContain('by courier')
  })

  it('are written with a prompt of their own', () => {
    const note = buildCharacterPrompt({ content, state: chatted, loveInterestId: 'ana', mode: 'courier' })
    expect(note).toContain('## How to write your note')
    expect(note).toContain('You are at the Shop; Pat is elsewhere.')
    expect(note).not.toContain('How to write your reply')
    expect(note).not.toContain('Nobody has written to you just now')
    expect(buildCharacterPrompt({ content, state: chatted, loveInterestId: 'ana', mode: 'invite' })).toContain(
      'Nobody has written to you just now'
    )
  })
})

describe('writing unprompted', () => {
  const fond = (affection: number) => ({ ana: { affection, trust: 0, desire: 0 } })

  it('takes a reason: something admired in the player, or closeness', () => {
    expect(chanceOfWriting(content, start, 'ana')).toBe(0)
    expect(chanceOfWriting(content, strong, 'ana')).toBeCloseTo(0.24)
    expect(chanceOfWriting(content, { ...start, relationships: fond(50) }, 'ana')).toBeCloseTo(0.04 + 0.35 * 0.5)
    expect(chanceOfWriting(content, { ...strong, relationships: fond(100) }, 'ana')).toBe(0.5)
  })

  it('does not happen while an invitation is unanswered or a plan is already made', () => {
    const asked = addNote(strong, 'ana', { from: 'them', text: 'Tea?', proposal: tea, read: false })
    expect(chanceOfWriting(content, asked, 'ana')).toBe(0)
    expect(chanceOfWriting(content, answerInvite(content, asked, 'ana', 0, true), 'ana')).toBe(0)
    expect(chanceOfWriting(content, answerInvite(content, asked, 'ana', 0, false), 'ana')).toBeGreaterThan(0)
  })

  it('is settled once a day, from mid-morning, the same way every time', () => {
    expect(courierRoundDue(content, start)).toBe(false) // 06:00
    const morning = { ...strong, time: 3 }
    expect(courierRoundDue(content, morning)).toBe(true)
    const round = courierRound(content, morning)
    expect(round.state.courierDay).toBe(0)
    expect(courierRoundDue(content, round.state)).toBe(false)
    expect(courierRound(content, morning).writerId).toBe(round.writerId)

    // Over many games she writes on about a quarter of days, and never to someone unremarkable.
    const wrote = (state: GameState) =>
      Array.from({ length: 400 }, (_, seed) => courierRound(content, { ...state, weatherSeed: seed, time: 3 }).writerId).filter(
        Boolean
      ).length
    expect(wrote(strong)).toBeGreaterThan(60)
    expect(wrote(strong)).toBeLessThan(140)
    expect(wrote(start)).toBe(0)
  })

  it('can be done without an LLM', () => {
    const plain = fallbackInvite(content, strong, 'ana')
    expect(plain?.proposal).toMatchObject({ loveInterestId: 'ana', locationId: 'shop', time: 2 })
    expect(plain?.text).toContain('come and find me at the Shop')
  })
})
