import { describe, expect, it } from 'vitest'
import { CourseSchema, CourseworkConfigSchema, type ContentPack } from '../model'
import {
  acceptProposal,
  appointmentsNow,
  canKeep,
  findMeetingTime,
  keepAppointment,
  proposeMeeting,
  upcomingAppointments
} from './appointments'
import { locationOf } from './map'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// The fixture starts at 06:00 on a 20-hour day, so hour 8 is time 2 and the next day's is 22.
const content = fixture()
const state = createInitialState(content)
const ana = content.loveInterests[0]

/** The fixture with classes on "Two" (the day the game starts) at 08:00, which Ana takes. */
function withClass(): { content: ContentPack; state: typeof state } {
  const coursework = CourseworkConfigSchema.parse({ weekdays: ['Two'], startHours: [8], locationId: 'shop' })
  const course = CourseSchema.parse({
    id: 'c1',
    number: 'RID 101',
    title: 'Riddles',
    professor: 'Prof. Q',
    subject: 'Riddles',
    studentIds: ['ana'],
    locationId: 'shop',
    meetings: [{ weekday: 'Two', startHour: 8 }]
  })
  return { content: { ...content, coursework }, state: { ...state, courses: [course], enrolment: [] } }
}

describe('findMeetingTime', () => {
  it('picks the first civil hour from now on', () => {
    expect(findMeetingTime(content, state, 'ana', { activity: 'tea', place: 'home' })).toBe(2)
  })

  it('honours how soon and what time of day', () => {
    expect(findMeetingTime(content, state, 'ana', { activity: 'tea', place: 'home', earliest: 'tomorrow' })).toBe(22)
    expect(findMeetingTime(content, state, 'ana', { activity: 'tea', place: 'home', timeOfDay: 'Night' })).toBe(9)
  })

  it('keeps to the hours a place is open, and ends before the day does', () => {
    // The shop shuts at 15, when night begins.
    expect(findMeetingTime(content, state, 'ana', { activity: 'shop', place: 'shop', timeOfDay: 'night' })).toBeUndefined()
    const late = { ...state, time: 12 } // 18:00; the last start that ends by midnight
    expect(findMeetingTime(content, late, 'ana', { activity: 'tea', place: 'home' })).toBe(22)
  })

  it('avoids plans already made', () => {
    const booked = acceptProposal(state, { loveInterestId: 'ana', companionIds: [], title: 'Tea', time: 2, hours: 2, locationId: 'home' })
    expect(findMeetingTime(content, booked, 'ana', { activity: 'more tea', place: 'home' })).toBe(4)
  })

  it('avoids classes, the love interest\'s as well as the player\'s, and keeps the weekend clear of class days', () => {
    const term = withClass()
    expect(findMeetingTime(term.content, term.state, 'ana', { activity: 'tea', place: 'home' })).toBe(4)
    const mine = { ...term.state, courses: [{ ...term.state.courses[0], studentIds: [] }], enrolment: ['c1'] }
    expect(findMeetingTime(term.content, mine, 'ana', { activity: 'tea', place: 'home' })).toBe(4)
    expect(
      findMeetingTime(term.content, term.state, 'ana', { activity: 'tea', place: 'home', earliest: 'the weekend' })
    ).toBe(22)
  })

  it('does not plan past the end of the game', () => {
    const lastDay = { ...state, time: 6 * 20 + 13 }
    expect(findMeetingTime(content, lastDay, 'ana', { activity: 'tea', place: 'home' })).toBeUndefined()
  })
})

describe('proposeMeeting', () => {
  it('returns a proposal and tells the model exactly what to suggest', () => {
    const { proposal, message } = proposeMeeting(content, state, 'ana', { activity: ' study ', place: 'home' })
    expect(proposal).toEqual({ loveInterestId: 'ana', companionIds: [], title: 'study', time: 2, hours: 2, locationId: 'home' })
    expect(message).toContain('at 08:00, at Home')
    expect(message).toContain('Pat')
  })

  it('explains itself when the place is unknown or no time fits', () => {
    const lost = proposeMeeting(content, state, 'ana', { activity: 'tea', place: 'moon' })
    expect(lost.proposal).toBeUndefined()
    expect(lost.message).toContain('home, shop')

    const never = proposeMeeting(content, state, 'ana', { activity: 'tea', place: 'shop', timeOfDay: 'night' })
    expect(never.proposal).toBeUndefined()
    expect(never.message).toMatch(/No time could be found/)
  })
})

describe('keeping a plan', () => {
  const proposal = { loveInterestId: 'ana', companionIds: [], title: 'Tea', time: 2, hours: 2, locationId: 'home' }
  const booked = acceptProposal(state, proposal)

  it('goes on the calendar when accepted, soonest first', () => {
    const two = acceptProposal(booked, { ...proposal, title: 'Earlier', time: 1, hours: 1 })
    expect(two.appointments.map((a) => a.id)).toEqual(['plan-2', 'plan-1'])
    expect(upcomingAppointments(two).map((a) => a.title)).toEqual(['Earlier', 'Tea'])
    expect(upcomingAppointments({ ...two, time: 2 }).map((a) => a.title)).toEqual(['Tea'])
  })

  it('can only be kept at its time and place', () => {
    expect(canKeep(content, booked, 'plan-1').reasons).toEqual(['It is not time yet'])
    const due = { ...booked, time: 3 }
    expect(appointmentsNow(due)).toHaveLength(1)
    expect(canKeep(content, due, 'plan-1').ok).toBe(true)
    expect(canKeep(content, { ...due, locationId: 'shop' }, 'plan-1').reasons).toEqual(['Go to Home first'])
    expect(() => keepAppointment(content, booked, 'plan-1')).toThrow(/not time yet/)
  })

  it('rewards turning up, runs the clock to its end and comes off the calendar', () => {
    const { state: after, appointment } = keepAppointment(content, { ...booked, time: 2 }, 'plan-1')
    expect(appointment.title).toBe('Tea')
    expect(after.time).toBe(4)
    expect(after.appointments).toEqual([])
    expect(after.relationships['ana'].affection).toBe(state.relationships['ana'].affection + 3)
    expect(after.relationships['ana'].trust).toBe(state.relationships['ana'].trust + 2)
  })

  it('puts the love interest where the plan is, whatever their usual day', () => {
    expect(locationOf(content, { ...state, time: 2 }, ana)).toBe('shop')
    expect(locationOf(content, { ...booked, time: 2 }, ana)).toBe('home')
  })

  it('is mentioned in the character prompt', () => {
    const prompt = buildCharacterPrompt({ content, state: booked, loveInterestId: 'ana' })
    expect(prompt).toContain('Tea')
    expect(prompt).toContain('at 08:00')
  })
})

describe('plans with more than one love interest', () => {
  // Bea and Cy share Ana's file; Bea has a class at 08:00 on the first day.
  const cast = ['bea', 'cy', 'dee'].map((id) => ({ ...ana, id, name: `${id[0].toUpperCase()}${id.slice(1)} Stone` }))
  const term = withClass()
  const crowd: ContentPack = { ...term.content, loveInterests: [ana, ...cast] }
  const fresh = createInitialState(crowd)
  const busyBea = { ...fresh, courses: [{ ...term.state.courses[0], studentIds: ['bea'] }], enrolment: [] }

  it('waits until everyone is free', () => {
    expect(findMeetingTime(crowd, busyBea, 'ana', { activity: 'tea', place: 'home' })).toBe(2)
    expect(findMeetingTime(crowd, busyBea, 'ana', { activity: 'tea', place: 'home', with: ['bea'] })).toBe(4)
  })

  it('brings along at most two others, and never the proposer or a stranger', () => {
    const { proposal, message } = proposeMeeting(crowd, busyBea, 'ana', {
      activity: 'tea',
      place: 'home',
      with: ['Bea', 'ana', 'bea', 'cy', 'dee']
    })
    expect(proposal?.companionIds).toEqual(['bea', 'cy'])
    expect(message).toContain('You, Pat, Bea and Cy are all free')

    const lost = proposeMeeting(crowd, busyBea, 'ana', { activity: 'tea', place: 'home', with: ['zed'] })
    expect(lost.proposal).toBeUndefined()
    expect(lost.message).toContain('Nobody is called "zed"')
  })

  it('puts everyone at the meeting place and rewards each of them for a plan kept', () => {
    const plan = { loveInterestId: 'ana', companionIds: ['bea'], title: 'Tea', time: 4, hours: 2, locationId: 'home' }
    const due = { ...acceptProposal(busyBea, plan), time: 4 }
    expect(locationOf(crowd, due, cast[0])).toBe('home')
    expect(locationOf(crowd, due, cast[1])).toBe('shop')

    const { state: after } = keepAppointment(crowd, due, 'plan-1')
    expect(after.relationships['ana'].affection).toBe(3)
    expect(after.relationships['bea'].affection).toBe(3)
    expect(after.relationships['cy'].affection).toBe(0)
  })

  it('tells each of them about the plan, and the prompt for a group names every speaker', () => {
    const plan = { loveInterestId: 'ana', companionIds: ['bea'], title: 'Tea', time: 4, hours: 2, locationId: 'home' }
    const booked = acceptProposal(fresh, plan)
    expect(buildCharacterPrompt({ content: crowd, state: booked, loveInterestId: 'bea' })).toContain('with Ana too')
    expect(buildCharacterPrompt({ content: crowd, state: booked, loveInterestId: 'cy' })).not.toContain('Tea')

    const group = buildCharacterPrompt({ content: crowd, state: booked, loveInterestId: 'ana', companionIds: ['bea', 'cy'] })
    expect(group).toContain('## Also in the scene: Bea Stone')
    expect(group).toContain('## Also in the scene: Cy Stone')
    expect(group).toContain("Start every spoken line with the speaker's first name")
    const alone = buildCharacterPrompt({ content: crowd, state: booked, loveInterestId: 'ana' })
    expect(alone).not.toContain('Also in the scene')
    expect(alone).toContain('speak only as Ana')
  })
})
