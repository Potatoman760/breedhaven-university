import { describe, expect, it } from 'vitest'
import { JobsConfigSchema, validateContentPack, type GameState } from '../model'
import { shiftNow } from './jobs'
import { toDate } from './calendar'
import { addGroupNote, markGroupRead, unreadNotes } from './courier'
import { attendEventPart, eventPartsToday } from './eventParts'
import { sleep } from './sleep'
import { createInitialState } from './state'
import { rawFixture } from './testFixture'
import { awayOnDay, bookTrip, canBookTrip, comeHome, nextTripPart, tripChoices, tripCost, tripUnderway } from './trips'

// The game starts at 06:00 on 2 a, a 20-hour day. The booking is that morning at home; the trip is the next two days
// at the shop: an evening on the first, a morning on the second.
const raw = rawFixture()
const [ana] = raw.loveInterests
const booking = { eventId: 'trip', most: 2, price: 100, minStage: 'friend', blurb: '', highlights: [] }
const notice = { id: 'notice', name: 'the Notice', month: 'a', day: 2, secret: true, locationId: 'home', program: [{ id: 'book', name: 'Book', startHour: 7, hours: 1, required: true, booking }] }
const trip = {
  id: 'trip',
  name: 'the Trip',
  month: 'a',
  day: 3,
  durationDays: 2,
  locationId: 'shop',
  program: [
    { id: 'first', name: 'First night', day: 1, startHour: 12, hours: 2, required: true, onTrip: true, outfitId: 'robe' },
    { id: 'last', name: 'Last morning', day: 2, startHour: 7, hours: 2, required: true, onTrip: true }
  ]
}
const content = validateContentPack({
  ...raw,
  loveInterests: [...raw.loveInterests, { ...ana, id: 'bea', name: 'Bea Stone' }, { ...ana, id: 'cy', name: 'Cy Vane' }],
  calendar: { ...raw.calendar, events: [...raw.calendar.events, notice, trip] }
})
const close = { affection: 40, trust: 40, desire: 40 }
const far = { affection: 5, trust: 5, desire: 5 }
const start: GameState = { ...createInitialState(content), met: ['ana', 'bea', 'cy'], relationships: { ana: close, bea: close, cy: far }, player: { ...createInitialState(content).player, money: 500 } }

describe('a trip', () => {
  it('is booked for those close enough, as many as it takes, for its price a head', () => {
    expect(tripChoices(content, start, booking).map((li) => li.id)).toEqual(['ana', 'bea'])
    expect(tripCost(booking, ['ana', 'bea'])).toBe(300)
    expect(canBookTrip(content, start, booking, []).ok).toBe(false)
    expect(canBookTrip(content, start, booking, ['cy']).reasons).toEqual(['Not everyone would come'])
    expect(canBookTrip(content, { ...start, player: { ...start.player, money: 200 } }, booking, ['ana', 'bea']).reasons).toEqual(['It costs $300'])
    const booked = bookTrip(content, start, booking, ['ana', 'bea'])
    expect(booked.player.money).toBe(200)
    expect(booked.trips).toEqual({ trip: ['ana', 'bea'] })
    // A group chat for it, named for the trip, with them in it and him telling them.
    expect(booked.groupChats['trip:trip']).toMatchObject({ name: 'Trip', memberIds: ['ana', 'bea'], notes: [{ from: 'player' }] })
    expect(booked.groupChats['trip:trip'].notes[0].text).toContain('I booked us')
    // What they say in it counts on his phone until he reads it.
    const answered = addGroupNote(booked, 'trip:trip', { from: 'them', speakerId: 'ana', text: 'Yes!!', read: false })
    expect(unreadNotes(answered)).toBe(1)
    expect(unreadNotes(markGroupRead(answered, 'trip:trip'))).toBe(0)
  })

  it('is his and theirs alone: its parts are for one who booked it, with those he booked', () => {
    const day = { ...start, time: 26 }
    expect(eventPartsToday(content, day)).toEqual([])
    const booked = { ...bookTrip(content, start, booking, ['bea']), time: 26 }
    expect(eventPartsToday(content, booked).map(({ part }) => part.id)).toEqual(['first'])
    expect(attendEventPart(content, booked, 'trip', 'first').scene).toMatchObject({ loveInterestId: 'bea', companionIds: [], outfitId: 'robe' })
    // Everyone in it starts in what the part says.
    const both = { ...bookTrip(content, start, booking, ['ana', 'bea']), time: 26 }
    expect(attendEventPart(content, both, 'trip', 'first').scene).toMatchObject({ outfitId: 'robe', looks: { bea: { outfitId: 'robe' } } })
  })

  it('takes his shifts off him on its days, and leaves them on the others', () => {
    const jobs = JobsConfigSchema.parse({ jobs: [{ id: 'clerk', title: 'Clerk', locationId: 'shop', bossId: 'ana', hourlyRate: 4, shifts: content.calendar.weekdays.map((weekday) => ({ weekday, startHour: 8, hours: 4 })) }] })
    const working: GameState = { ...start, job: { jobId: 'clerk', hiredAt: 0, strikes: 0, settledTo: 0, worked: [], excused: [] } }
    const withJob = { ...content, jobs }
    // 08:00 on the trip's first day, and on the day before it.
    const onTrip = { ...bookTrip(withJob, working, booking, ['ana']), time: 22 }
    expect(shiftNow(withJob, onTrip)).toBeUndefined()
    expect(shiftNow(withJob, { ...onTrip, trips: {} })?.job.id).toBe('clerk')
    expect(shiftNow(withJob, { ...onTrip, time: 2 })?.job.id).toBe('clerk')
  })

  it('keeps him away while it lasts: he sleeps there, works no shifts, and comes home when it is done', () => {
    const booked = { ...bookTrip(content, start, booking, ['ana']), time: 26 }
    expect(awayOnDay(content, booked, 1)).toBe(true)
    expect(awayOnDay(content, booked, 0)).toBe(false)
    expect(nextTripPart(content, booked)).toMatchObject({ part: { id: 'first' }, today: true })
    const first = attendEventPart(content, booked, 'trip', 'first').state
    expect(tripUnderway(content, first)?.id).toBe('trip')
    // The next is tomorrow: he sleeps first, and then it is today.
    expect(nextTripPart(content, first)).toMatchObject({ part: { id: 'last' }, today: false })
    expect(nextTripPart(content, sleep(content, first))).toMatchObject({ part: { id: 'last' }, today: true })
    const slept = sleep(content, first)
    expect(slept.locationId).toBe('shop')
    expect(comeHome(content, slept).state).toBe(slept)
    const done = attendEventPart(content, slept, 'trip', 'last').state
    expect(tripUnderway(content, done)).toBeUndefined()
    const home = comeHome(content, done)
    expect(home.state.locationId).toBe(content.newGame.room?.locationId ?? content.newGame.locationId)
    expect(home.state.time).toBe(done.time)
    // A trip that has him home at an hour has the drive take him there.
    const late = { ...content, calendar: { ...content.calendar, events: content.calendar.events.map((event) => (event.id === 'trip' ? { ...event, homeAt: 15 } : event)) } }
    expect(toDate(content.calendar, comeHome(late, done).state.time).hour).toBe(15)
    expect(home.companions).toEqual(['ana'])
    expect(comeHome(content, home.state).state).toBe(home.state)
  })
})
