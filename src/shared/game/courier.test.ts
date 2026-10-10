import { describe, expect, it } from 'vitest'
import type { ContentPack, GameState } from '../model'
import {
  contactsSaid,
  addNote,
  answerInvite,
  DM_CLOSE,
  DM_OPEN,
  messageText,
  canGoToInvite,
  planFor,
  cancelAppointment,
  chanceOfDm,
  plansWith,
  settleAppointments,
  STOOD_UP,
  chanceOfWriting,
  sceneEndWriter,
  courierExcerpt,
  courierRound,
  courierRoundDue,
  fallbackInvite,
  giveContact,
  hasContact,
  inviteStands,
  markRead,
  offersContact,
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
const fresh = createInitialState(content)
// She has given him her Bloomr already, except where a test says otherwise.
const start: GameState = { ...fresh, contacts: ['ana'] }
const strong: GameState = { ...start, player: { ...start.player, stats: { strength: 19 } } }
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
    expect(scene).toContain('## Messages you and Pat have sent each other in Bloomr DMs, oldest first\nPat: Lunch?')
    expect(buildCharacterPrompt({ content, state: start, loveInterestId: 'ana' })).not.toContain('in Bloomr DMs')
  })

  it('are written with a prompt of their own', () => {
    const note = buildCharacterPrompt({ content, state: chatted, loveInterestId: 'ana', mode: 'courier' })
    expect(note).toContain('## How to write your message')
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

describe('her Bloomr', () => {
  it('has to be given before he can message her or she writes to him', () => {
    expect(hasContact(fresh, 'ana')).toBe(false)
    expect(chanceOfWriting(content, { ...strong, contacts: [] }, 'ana')).toBe(0)
    const given = giveContact(fresh, 'ana')
    expect(hasContact(given, 'ana')).toBe(true)
    expect(giveContact(given, 'ana')).toBe(given)
  })

  it('is offered unasked only by someone taken with him', () => {
    const feeling = (affection: number, desire: number): GameState => ({ ...fresh, relationships: { ana: { affection, trust: 0, desire } } })
    expect(offersContact(content, fresh, 'ana')).toBe(false)
    expect(offersContact(content, feeling(60, 0), 'ana')).toBe(true)
    expect(offersContact(content, feeling(10, 50), 'ana')).toBe(true)
    expect(offersContact(content, { ...strong, contacts: [] }, 'ana')).toBe(true)
    expect(offersContact(content, giveContact(feeling(60, 0), 'ana'), 'ana')).toBe(false)

    const asked = buildCharacterPrompt({ content, state: fresh, loveInterestId: 'ana', sceneBeats: [{ activityName: 'Tea' }] })
    expect(asked).toContain('## Bloomr')
    expect(asked).toContain('Your Bloomr handle is @ana')
    expect(asked).toContain('You do not offer it unasked.')
    expect(asked).toContain('Giving it is saying or showing the handle in the reply')
    expect(buildCharacterPrompt({ content, state: feeling(60, 0), loveInterestId: 'ana', sceneBeats: [{ activityName: 'Tea' }] })).toContain('offer it unasked')
    expect(buildCharacterPrompt({ content, state: start, loveInterestId: 'ana', sceneBeats: [{ activityName: 'Tea' }] })).not.toContain('## Bloomr')
  })
})

describe('a handle said aloud', () => {
  it('counts as her Bloomr given, for someone in the scene whose contact he does not have', () => {
    const pack = fixture()
    const ana = pack.loveInterests[0]
    const fresh = { ...createInitialState(pack), contacts: [] }
    expect(contactsSaid(pack, fresh, [ana.id], 'Here. I am @ANA in Bloomr DMs.')).toEqual([ana.id])
    expect(contactsSaid(pack, fresh, [ana.id], 'Maybe when I know you better.')).toEqual([])
    expect(contactsSaid(pack, fresh, [], 'I am @ana.')).toEqual([])
    expect(contactsSaid(pack, { ...fresh, contacts: [ana.id] }, [ana.id], 'I am @ana.')).toEqual([])
  })
})

describe('going straight to what an invitation is for', () => {
  const asked = addNote(start, 'ana', { from: 'them', text: 'Tea at four?', proposal: tea, read: true })
  const note = (state: GameState) => state.courier['ana'][0]

  it('can be done for one today that stands, answered or not, and never for one turned down or over', () => {
    expect(canGoToInvite(content, asked, note(asked))).toBe(true)
    const accepted = answerInvite(content, asked, 'ana', 0, true)
    expect(canGoToInvite(content, accepted, note(accepted))).toBe(true)
    expect(planFor(accepted, tea)).toMatchObject({ title: 'Tea', time: 4, locationId: 'home' })
    // Under way, it can still be walked in on; once over, it cannot.
    expect(canGoToInvite(content, { ...accepted, time: 5 }, note(accepted))).toBe(true)
    expect(canGoToInvite(content, { ...accepted, time: 6 }, note(accepted))).toBe(false)

    const declined = answerInvite(content, asked, 'ana', 0, false)
    expect(canGoToInvite(content, declined, note(declined))).toBe(false)
    expect(planFor(declined, tea)).toBeUndefined()
    // One for another day is waited for like any other plan.
    const tomorrow = addNote(start, 'ana', { from: 'them', text: 'Tomorrow?', proposal: { ...tea, time: 24 }, read: true })
    expect(canGoToInvite(content, tomorrow, note(tomorrow))).toBe(false)
    expect(canGoToInvite(content, start, { proposal: undefined })).toBe(false)
  })

  it('has her book it herself when he asks and she is willing', () => {
    const prompt = buildCharacterPrompt({ content, state: start, loveInterestId: 'ana', mode: 'courier' })
    expect(prompt).toContain('call the propose_meeting tool in this same message')
    expect(prompt).toContain('never ask him to name one')
  })
})

describe('what she sends', () => {
  const thinking =
    'Looking at the conversation, Pat\'s last message was "No problem, see you then Morwenna" — a simple, slightly flat sign-off. Morwenna would respond with something teasing but brief.\n\nSee you then, darling. Try not to miss me too terribly before Windsday.'
  const message = 'See you then, darling. Try not to miss me too terribly before Windsday.'

  it('is what is between the tags, and nothing she said to herself around it', () => {
    expect(messageText(`Let me think.\n\n${DM_OPEN}${message}${DM_CLOSE}\n\nThat fits her.`, 'Morwenna Thriceborn')).toBe(message)
    expect(messageText(`${DM_OPEN} ${message}`, 'Morwenna Thriceborn')).toBe(message)
    expect(messageText(`First try: ${DM_OPEN}no${DM_CLOSE} Better: <DM>${message}</DM>`, 'Morwenna')).toBe(message)
  })

  it('is the last paragraph when the tags were left off and the rest is working-out', () => {
    expect(messageText(thinking, 'Morwenna Thriceborn')).toBe(message)
    expect(messageText(`I should keep this short.\n\n${message}`, 'Ana')).toBe(message)
    // A message of her own in two paragraphs is left alone, and so is a plain one.
    expect(messageText('Running late.\n\nSave me a seat?', 'Ana')).toBe('Running late.\n\nSave me a seat?')
    expect(messageText(message, 'Morwenna')).toBe(message)
    expect(messageText(`${DM_OPEN}${DM_CLOSE}`, 'Ana')).toBe('')
  })

  it('is asked for between the tags', () => {
    expect(buildCharacterPrompt({ content, state: start, loveInterestId: 'ana', mode: 'courier' })).toContain(`between ${DM_OPEN} and ${DM_CLOSE}`)
  })
})

describe('writing as a scene ends', () => {
  const feels = (affection: number, desire = 0): GameState => ({ ...start, relationships: { ana: { affection, trust: 0, desire } } })

  it('is likelier the more she feels, the more they are to each other, and when she has just been with him', () => {
    expect(chanceOfDm(content, fresh, 'ana')).toBe(0)
    expect(chanceOfDm(content, feels(0), 'ana')).toBeCloseTo(0.03)
    expect(chanceOfDm(content, feels(50), 'ana')).toBeCloseTo(0.03 + 0.125)
    expect(chanceOfDm(content, feels(50, 100), 'ana')).toBeCloseTo(0.03 + 0.125 + 0.1)
    expect(chanceOfDm(content, feels(50), 'ana', ['ana'])).toBeCloseTo(0.03 + 0.125 + 0.1)
    const status = content.relationships.statuses[0]
    if (status) {
      const together = { ...feels(50), bonds: [{ statusId: status.id, memberIds: ['ana'], since: 0 }] }
      expect(chanceOfDm(content, together, 'ana')).toBeCloseTo(0.03 + 0.125 + (status.committed ? 0.15 : 0.08))
    }
    expect(chanceOfDm(content, { ...feels(100, 100), player: strong.player, bonds: [] }, 'ana', ['ana'])).toBeLessThanOrEqual(0.6)
  })

  it('waits on a message of hers he has not read, and is slower after one he never answered', () => {
    const unread = addNote(feels(50), 'ana', { from: 'them', text: 'Hey.', read: false })
    expect(chanceOfDm(content, unread, 'ana')).toBe(0)
    expect(chanceOfDm(content, markRead(unread, 'ana'), 'ana')).toBeCloseTo((0.03 + 0.125) / 2)
    const answered = addNote(markRead(unread, 'ana'), 'ana', { from: 'player', text: 'Hey yourself.', read: true })
    expect(chanceOfDm(content, answered, 'ana')).toBeCloseTo(0.03 + 0.125)
  })

  it('names one writer at most, the same every time, and nobody whose Bloomr he does not have', () => {
    const fond = feels(100, 100)
    let wrote = 0
    for (let time = 0; time < 200; time++) {
      const now = { ...fond, time }
      const writer = sceneEndWriter(content, now, ['ana'])
      expect(sceneEndWriter(content, now, ['ana'])).toBe(writer)
      expect(sceneEndWriter(content, { ...now, contacts: [] }, ['ana'])).toBeUndefined()
      if (writer) wrote++
    }
    // 0.03 + 0.25 + 0.1 + 0.1 = 0.48 of the time, give or take.
    expect(wrote).toBeGreaterThan(60)
    expect(wrote).toBeLessThan(135)
  })

  it('is asked for as a message of her own, with no invitation needed', () => {
    const prompt = buildCharacterPrompt({ content, state: feels(50), loveInterestId: 'ana', mode: 'note' })
    expect(prompt).toContain('How to write your message')
    expect(prompt).toContain('You need not ask to meet')
  })
})

describe('a plan he does not keep', () => {
  const liked: GameState = { ...start, relationships: { ana: { affection: 40, trust: 30, desire: 5 } } }
  const invited = addNote(liked, 'ana', { from: 'them', text: 'Tea?', proposal: tea, read: true })
  const booked = answerInvite(content, invited, 'ana', 0, true)

  it('is held against him once its hours have gone by, and remembered', () => {
    expect(booked.appointments).toHaveLength(1)
    // Still to come, or under way, nothing is settled: he may yet turn up.
    expect(settleAppointments(content, booked)).toEqual({ state: booked, missed: [] })
    expect(settleAppointments(content, { ...booked, time: tea.time + 1 }).missed).toEqual([])
    const after = settleAppointments(content, { ...booked, time: tea.time + tea.hours })
    expect(after.missed.map((plan) => plan.title)).toEqual(['Tea'])
    expect(after.state.appointments).toEqual([])
    expect(after.state.relationships['ana']).toEqual({ affection: 40 + STOOD_UP.affection, trust: 30 + STOOD_UP.trust, desire: 5 })
    expect(after.state.memories['ana'].at(-1)?.summary).toMatch(/never turned up for "Tea" at Home.*and sent no word/)
    // Once counted, it is not counted again.
    expect(settleAppointments(content, after.state).missed).toEqual([])
  })

  it('can be called off by DM first: it comes off the calendar, nothing is held against him, and the message is what is left of it', () => {
    expect(plansWith(booked, 'ana').map((plan) => plan.title)).toEqual(['Tea'])
    expect(plansWith(booked, 'nobody')).toEqual([])
    const plan = booked.appointments[0]
    const called = cancelAppointment(content, booked, plan.id)
    expect(called.appointments).toEqual([])
    expect(plansWith(called, 'ana')).toEqual([])
    const thread = called.courier['ana']
    expect(thread[0].answer).toBe('cancelled')
    expect(thread.at(-1)).toMatchObject({ from: 'player', read: true })
    expect(thread.at(-1)?.text).toMatch(/^I'm sorry, I can't make Tea on /)
    // Nothing is left to miss.
    const later = settleAppointments(content, { ...called, time: tea.time + tea.hours })
    expect(later.missed).toEqual([])
    expect(later.state.relationships['ana']).toEqual(liked.relationships['ana'])
    // She is told what became of it when she next writes.
    expect(buildCharacterPrompt({ content, state: called, loveInterestId: 'ana', mode: 'courier' })).toContain('accepted, then called off by')
    // One that has begun cannot be called off, only missed.
    expect(cancelAppointment(content, { ...booked, time: tea.time }, plan.id).appointments).toHaveLength(1)
  })
})
