import { describe, expect, it } from 'vitest'
import { validateContentPack, type GameState } from '../model'
import { attendEventPart, eventPartsToday } from './eventParts'
import { bookGetaway, canBookGetaway, dayStart, getawayDays, getawayOf, tellOfGetaways, upcomingTrips } from './getaways'
import { sleep } from './sleep'
import { createInitialState } from './state'
import { rawFixture } from './testFixture'
import { comeHome, tripUnderway } from './trips'

// The fixture's term is seven days of a three-day week, beginning on a Two: the days that are a Two after today are the
// fourth (2 b) and the seventh (2 a of the next year), and the Feast is the third (1 b).
const raw = rawFixture()
const [ana] = raw.loveInterests
const getaway = {
  id: 'beach',
  name: 'A weekend at the Shop',
  locationId: 'shop',
  summary: 'a shop by the sea',
  days: 2,
  startsOn: 'Two',
  from: { month: 'a', day: 1 },
  until: { month: 'b', day: 2 },
  most: 2,
  price: 50,
  gain: { affection: 6, trust: 4, desire: 2 },
  minStage: 'friend',
  homeAt: 12,
  road: 'sprites/fx/road.webp',
  program: [
    { id: 'swim', name: 'A swim', day: 1, startHour: 12, hours: 2, outfitId: 'swimsuit' },
    { id: 'dawn', name: 'Dawn', day: 2, startHour: 7, hours: 2 }
  ]
}
const content = validateContentPack({ ...raw, loveInterests: [...raw.loveInterests, { ...ana, id: 'bea', name: 'Bea Stone' }], getaways: { trips: [getaway] } })
const [beach] = content.getaways.trips
const close = { affection: 40, trust: 40, desire: 40 }
const start: GameState = { ...createInitialState(content), met: ['ana', 'bea'], relationships: { ana: close, bea: { affection: 5, trust: 5, desire: 5 } }, player: { ...createInitialState(content).player, money: 500 } }

describe('a weekend getaway', () => {
  it('can be booked for a weekend it is had in, after today, all of it before the year ends and nothing else on', () => {
    expect(getawayDays(content, start, beach)).toEqual([3])
    // Not past the last day it is had.
    expect(getawayDays(content, start, { ...beach, until: { month: 'a', day: 3 } })).toEqual([])
    // Not over another event.
    expect(getawayDays(content, start, { ...beach, startsOn: 'One' })).toEqual([5])
    // Friends and up, as many as it takes, for its price a head.
    expect(canBookGetaway(content, start, beach, 3, ['ana']).ok).toBe(true)
    expect(canBookGetaway(content, start, beach, 3, ['bea']).reasons).toEqual(['Not everyone would come'])
    expect(canBookGetaway(content, start, beach, 6, ['ana']).reasons).toEqual(['Not that weekend'])
  })

  it('becomes an event of his own on those days, paid for, with a group chat, and that weekend is taken', () => {
    const booked = bookGetaway(content, start, beach, 3, ['ana'])
    expect(booked.player.money).toBe(400)
    expect(booked.events).toMatchObject([{ id: 'beach@3', name: 'A weekend at the Shop', month: 'b', day: 2, durationDays: 2, locationId: 'shop', summary: 'a shop by the sea', homeAt: 12, road: 'sprites/fx/road.webp' }])
    expect(booked.events[0].program.every((part) => part.onTrip)).toBe(true)
    expect(booked.trips).toEqual({ 'beach@3': ['ana'] })
    expect(booked.groupChats['trip:beach@3'].notes[0].text).toBe('I booked us a weekend at the Shop! 2 days away together.')
    expect(getawayOf(content, 'beach@3')?.id).toBe('beach')
    expect(getawayOf(content, 'mistmoon-break')).toBeUndefined()
    expect(getawayDays(content, booked, beach)).toEqual([])
    expect(upcomingTrips(content, booked)).toMatchObject([{ event: { id: 'beach@3' }, dayIndex: 3, ids: ['ana'] }])
  })

  it('is told of once, by the one who sends it, from its hour on its day', () => {
    const told = { ...content, getaways: { ...content.getaways, notice: { fromId: 'ana', day: 2, hour: 8, text: 'Look at the Trips app.' } } }
    expect(tellOfGetaways(content, start)).toBe(start)
    expect(tellOfGetaways(told, { ...start, time: dayStart(told, 1) + 7 })).toEqual({ ...start, time: dayStart(told, 1) + 7 })
    const sent = tellOfGetaways(told, { ...start, time: dayStart(told, 1) + 8 })
    expect(sent.courier.ana?.at(-1)).toMatchObject({ from: 'them', text: 'Look at the Trips app.', read: false })
    expect(tellOfGetaways(told, sent)).toBe(sent)
    // A day late, it is still sent.
    expect(tellOfGetaways(told, { ...start, time: dayStart(told, 3) }).courier.ana?.length).toBe(1)
  })

  it('plays as a trip: its parts his and hers, a night there, and home when it is done', () => {
    const booked = bookGetaway(content, start, beach, 3, ['ana'])
    const at = { ...booked, time: dayStart(content, 3) + 12 }
    expect(eventPartsToday(content, at).map(({ part }) => part.id)).toEqual(['swim'])
    const swum = attendEventPart(content, at, 'beach@3', 'swim')
    expect(swum.scene).toMatchObject({ loveInterestId: 'ana', outfitId: 'swimsuit' })
    expect(tripUnderway(content, swum.state)?.id).toBe('beach@3')
    const morning = sleep(content, swum.state)
    const done = attendEventPart(content, morning, 'beach@3', 'dawn').state
    const home = comeHome(content, done)
    expect(home).toMatchObject({ companions: ['ana'], tripId: 'beach@3' })
    expect(home.state.locationId).not.toBe('shop')
    expect(upcomingTrips(content, { ...home.state, time: dayStart(content, 5) })).toEqual([])
  })

  it('has every part over before midnight, so that its scene is on its own day', () => {
    const late = { ...getaway, program: [{ id: 'night', name: 'A night', day: 1, startHour: 21, hours: 3 }] }
    expect(() => validateContentPack({ ...raw, getaways: { trips: [late] } })).toThrow(/ends at 24:00/)
  })

  it('makes those along glad of it as it sets off, once, before the first scene, and nobody left at home minds', () => {
    const booked = bookGetaway(content, { ...start, relationships: { ...start.relationships, bea: close } }, beach, 3, ['ana'])
    const swum = attendEventPart(content, { ...booked, time: dayStart(content, 3) + 12 }, 'beach@3', 'swim')
    expect(swum.state.relationships.ana).toEqual({ affection: 46, trust: 44, desire: 42 })
    // The first scene begins from it.
    expect(swum.scene?.baseline.relationship).toEqual({ affection: 46, trust: 44, desire: 42 })
    expect(swum.state.relationships.bea).toEqual(close)
    // Not again on the trip's later parts.
    const done = attendEventPart(content, sleep(content, swum.state), 'beach@3', 'dawn')
    expect(done.state.relationships.ana).toEqual(swum.state.relationships.ana)
  })
})
