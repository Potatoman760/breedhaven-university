import { describe, expect, it } from 'vitest'
import { CourseSchema, CourseworkConfigSchema, JobsConfigSchema, OrientationSchema, SocietiesConfigSchema, type ContentPack } from '../model'
import {
  acceptProposal,
  appointmentsNow,
  canKeep,
  findMeetingTime,
  keepAppointment,
  proposeMeeting,
  scheduleDays,
  scheduleHours,
  schedulePlan,
  upcomingAppointments
} from './appointments'
import { dayAgainst } from './agenda'
import { dayAgainstWith } from './freeTime'
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
  const coursework = CourseworkConfigSchema.parse({ weekdays: ['Two'], locationId: 'shop' })
  const course = CourseSchema.parse({
    id: 'c1',
    number: 'RID 101',
    title: 'Riddles',
    professor: 'Prof. Q',
    subject: 'Riddles',
    code: 'RID',
    level: 1,
    studentIds: ['ana'],
    locationId: 'shop',
    meetings: [{ weekday: 'Two', startHour: 8, hours: 2, kind: 'lecture' }]
  })
  return { content: { ...content, coursework }, state: { ...state, courses: [course], enrolment: [] } }
}

describe('a plan he puts to them himself', () => {
  const tea = { loveInterestIds: ['ana'], title: 'Tea', locationId: 'home', time: 2, hours: 2 }

  it('is offered as asked when everyone is free and the place is open', () => {
    expect(schedulePlan(content, state, tea)).toEqual({ proposal: { loveInterestId: 'ana', companionIds: [], title: 'Tea', time: 2, hours: 2, locationId: 'home' } })
    expect(schedulePlan(content, state, { ...tea, title: ' ' })).toMatchObject({ proposal: { title: 'Meet up' } })
  })

  it('moves to the nearest time after it that fits, and says what was in the way', () => {
    const term = withClass()
    const moved = schedulePlan(term.content, term.state, tea)
    expect(moved).toMatchObject({ proposal: { time: 4 } })
    expect('clash' in moved && moved.clash?.length).toBeGreaterThan(0)
    // The shop shuts at 15: asked for 16:00 there, it is the next morning.
    const shut = schedulePlan(content, state, { ...tea, locationId: 'shop', time: 10 })
    expect(shut).toMatchObject({ proposal: { time: 22 } })
    expect('clash' in shut && shut.clash?.join(' ')).toMatch(/closed then/)
    expect(schedulePlan(content, state, { ...tea, time: 0 })).toMatchObject({ proposal: { time: 2 } })
  })

  it('needs someone to make it with and somewhere to go', () => {
    expect(schedulePlan(content, state, { ...tea, loveInterestIds: [] })).toEqual({ error: 'Choose who it is with and where.' })
    expect(schedulePlan(content, state, { ...tea, locationId: 'the-moon' })).toEqual({ error: 'Choose who it is with and where.' })
  })

  it('is shown against her calendar as well as his, a clash in her hours as much as in his', () => {
    const term = withClass()
    const plan = { time: 2, hours: 2 }
    expect(dayAgainst(term.content, term.state, plan).clashes).toEqual([])
    const both = dayAgainstWith(term.content, term.state, plan, ['ana'])
    expect(both.clashes).toHaveLength(1)
    expect(both.clashes[0]).toContain('Ana')
    expect(both.hours.find((at) => at.hour === 8)).toMatchObject({ plan: true, holds: true, mine: both.clashes[0] })
    expect(both.hours.find((at) => at.hour === 11)).toMatchObject({ holds: false })
  })

  it('is offered for the civil hours of today and the fortnight after', () => {
    expect(scheduleHours(content, 2)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])
    const days = scheduleDays(content, state)
    expect(days[0]).toBe(-6)
    expect(days[1]).toBe(14)
  })
})

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
    expect(message).toContain('at 08:00, which is today, at Home')
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

  it('plans nothing on orientation day, and says so while it is still to come', () => {
    const inducted = { ...content, orientation: OrientationSchema.parse({ day: 1, steps: [{ id: 'tour', name: 'The tour', locationId: 'home', startHour: 8 }] }) }
    const today = proposeMeeting(inducted, state, 'ana', { activity: 'tea', place: 'home', earliest: 'today' })
    expect(today.proposal?.time).toBe(22)
    expect(today.message).toMatch(/^Two, 2 A at 08:00, the first time that fits what was asked, is taken: it is orientation day\. .*which is tomorrow/)
    const after = proposeMeeting(inducted, { ...state, time: 22 }, 'ana', { activity: 'tea', place: 'home' })
    expect(after.message).not.toContain('orientation')
  })

  it('keeps clear of his shifts and of her society, and says what was in the way of the time that was asked for', () => {
    const jobs = JobsConfigSchema.parse({ jobs: [{ id: 'clerk', title: 'Clerk', locationId: 'shop', bossId: 'bea', hourlyRate: 4, shifts: [{ weekday: 'Two', startHour: 8, hours: 2 }] }] })
    const working = { ...state, job: { jobId: 'clerk', hiredAt: 0, strikes: 0, settledTo: 0, worked: [], excused: [] } }
    const shifted = proposeMeeting({ ...content, jobs }, working, 'ana', { activity: 'tea', place: 'home' })
    expect(shifted.proposal?.time).toBe(4)
    expect(shifted.message).toMatch(/^Two, 2 A at 08:00, the first time that fits what was asked, is taken: he works a shift at the Shop\. /)

    // Societies meet once their fair has been, here the Feast on the third day; three days in, it is a Two again.
    const societies = SocietiesConfigSchema.parse({ fairId: 'feast', hours: 2, societies: [{ id: 'chess', name: 'the Chess Club', description: '', locationId: 'shop', weekday: 'Two', startHour: 8, stats: ['charisma'], memberIds: ['ana'] }] })
    const hers = proposeMeeting({ ...content, societies }, { ...state, time: 3 * 20 }, 'ana', { activity: 'tea', place: 'home' })
    expect(hers.proposal?.time).toBe(3 * 20 + 4)
    expect(hers.message).toContain('is taken: Ana has her Chess Club meeting.')
  })

  it('offers nothing for a plan she already has with him there, so that it is not booked twice', () => {
    const booked = acceptProposal(state, { loveInterestId: 'ana', companionIds: [], title: 'Tea', time: 22, hours: 2, locationId: 'home' })
    const { proposal, message } = proposeMeeting(content, booked, 'ana', { activity: 'tea', place: 'home', earliest: 'tomorrow' })
    expect(proposal).toBeUndefined()
    expect(message).toMatch(/^Already on Pat's calendar with you at .*: "Tea", .*Nothing new was suggested\./)
  })

  it('names a plan she has with him elsewhere, and still finds a time for the new one', () => {
    const shop = content.locations.find((l) => l.id !== 'home')!.id
    const booked = acceptProposal(state, { loveInterestId: 'ana', companionIds: [], title: 'Tea', time: 22, hours: 2, locationId: shop })
    const { proposal, message } = proposeMeeting(content, booked, 'ana', { activity: 'study', place: 'home' })
    expect(proposal).toBeDefined()
    expect(message).toMatch(/^Already on Pat's calendar with you: "Tea", .*it is booked: say so, and do not suggest another time for it\./)
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
    // Turning up earns nothing of itself: what she makes of the time is settled when the scene is over.
    expect(after.relationships['ana']).toEqual(state.relationships['ana'])
  })

  it('puts the love interest where the plan is, whatever their usual day', () => {
    expect(locationOf(content, { ...state, time: 2 }, ana)).toBe('shop')
    expect(locationOf(content, { ...booked, time: 2 }, ana)).toBe('home')
  })

  it('is mentioned in the character prompt', () => {
    const prompt = buildCharacterPrompt({ content, state: booked, loveInterestId: 'ana' })
    expect(prompt).toContain('Tea')
    expect(prompt).toContain('at 08:00')
    // Said as the whole of them, so that a meeting she only remembers talking of is not taken for one.
    expect(prompt).toContain('These are all of them, and each is on his calendar.')
    expect(buildCharacterPrompt({ content, state, loveInterestId: 'ana' })).toContain(`Plans you have made with ${state.player.name}\nNone. A meeting talked of`)
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

  it('puts everyone at the meeting place, and leaves what they make of it to the scene', () => {
    const plan = { loveInterestId: 'ana', companionIds: ['bea'], title: 'Tea', time: 4, hours: 2, locationId: 'home' }
    const due = { ...acceptProposal(busyBea, plan), time: 4 }
    expect(locationOf(crowd, due, cast[0])).toBe('home')
    expect(locationOf(crowd, due, cast[1])).toBe('shop')

    const { state: after } = keepAppointment(crowd, due, 'plan-1')
    expect(after.relationships).toEqual(due.relationships)
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

describe('asking for next week, or a day by name', () => {
  // The fixture's week is One, Two, Three, and the game starts on a Two: next week begins two days on.
  const content = fixture()
  const state = createInitialState(content)
  const day = (time: number | undefined) => (time === undefined ? undefined : Math.floor((time + content.calendar.start.hour) / content.calendar.hoursPerDay))
  const weekdayOn = (time: number) => content.calendar.weekdays[(content.calendar.startWeekday + day(time)!) % content.calendar.weekdays.length]

  it('is never answered with today', () => {
    const soonest = findMeetingTime(content, state, 'ana', { activity: 'tea', place: 'home' })!
    expect(day(soonest)).toBe(0)
    const next = findMeetingTime(content, state, 'ana', { activity: 'tea', place: 'home', earliest: 'next week' })!
    expect(day(next)).toBe(2)
    expect(weekdayOn(next)).toBe('One')
    // The same day of next week, by name: not today, though today is one.
    const sameDay = findMeetingTime(content, state, 'ana', { activity: 'tea', place: 'home', earliest: 'next week', weekday: 'Two' })!
    expect(day(sameDay)).toBe(3)
    expect(weekdayOn(sameDay)).toBe('Two')
    // A day by name alone is the next such day.
    expect(weekdayOn(findMeetingTime(content, state, 'ana', { activity: 'tea', place: 'home', weekday: 'three' })!)).toBe('Three')
  })

  it('says how far off the time it found is', () => {
    expect(proposeMeeting(content, state, 'ana', { activity: 'tea', place: 'home' }).message).toContain('which is today')
    expect(proposeMeeting(content, state, 'ana', { activity: 'tea', place: 'home', earliest: 'next week' }).message).toContain('which is 2 days from now')
  })
})
