import { describe, expect, it } from 'vitest'
import type { CalendarEvent, GameState } from '../model'
import { canPerform } from './activities'
import {
  addEvents,
  buildEventPrompt,
  eventsOn,
  parseGeneratedEvents,
  removeEvent,
  upcomingEvents
} from './events'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Fixture calendar: months a (3 days) and b (2 days), 20-hour days, game starts on
// 2 a of year 1 at 06:00 and runs 7 days. The authored "feast" recurs yearly on 1 b.
const content = fixture()
const start = (): GameState => createInitialState(content)
const atDay = (dayIndex: number): GameState => ({ ...start(), time: dayIndex * 20 })
const ids = (events: CalendarEvent[]) => events.map((e) => e.id)
const event = (extra: Partial<CalendarEvent>): CalendarEvent => ({
  noClasses: false,
  id: 'fair',
  name: 'the Fair',
  description: '',
  month: 'a',
  day: 3,
  year: 1,
  durationDays: 1,
  generated: true,
  ...extra
})

describe('eventsOn', () => {
  it('finds authored events on their day, every year', () => {
    expect(ids(eventsOn(content, atDay(0)))).toEqual([])
    expect(ids(eventsOn(content, atDay(2)))).toEqual(['feast'])
    expect(ids(eventsOn(content, atDay(3)))).toEqual([])
    expect(ids(eventsOn(content, atDay(7)))).toEqual(['feast'])
  })

  it('includes generated events from the state, only in their year', () => {
    const state = addEvents(start(), [event({})])
    expect(ids(eventsOn(content, { ...state, time: 20 }))).toEqual(['fair'])
    expect(ids(eventsOn(content, { ...state, time: 6 * 20 }))).toEqual([])
  })

  it('covers every day of a multi-day event, across month and year boundaries', () => {
    const state = addEvents(start(), [event({ month: 'b', day: 2, durationDays: 3 })])
    expect(ids(eventsOn(content, { ...state, time: 2 * 20 }))).toEqual(['feast'])
    expect(ids(eventsOn(content, { ...state, time: 3 * 20 }))).toEqual(['fair'])
    expect(ids(eventsOn(content, { ...state, time: 5 * 20 }))).toEqual(['fair'])
    expect(ids(eventsOn(content, { ...state, time: 6 * 20 }))).toEqual([])
  })
})

describe('upcomingEvents', () => {
  it('lists events starting within the window, soonest first', () => {
    const state = addEvents(start(), [event({})])
    expect(upcomingEvents(content, state, 1).map((u) => [u.event.id, u.inDays])).toEqual([
      ['fair', 1]
    ])
    expect(upcomingEvents(content, state, 5).map((u) => [u.event.id, u.inDays])).toEqual([
      ['fair', 1],
      ['feast', 2]
    ])
  })

  it("looks ahead to next year's occurrence once this year's has passed", () => {
    expect(upcomingEvents(content, atDay(3), 5).map((u) => [u.event.id, u.inDays])).toEqual([
      ['feast', 4]
    ])
  })
})

describe('events in play', () => {
  it('gate activities through the event condition', () => {
    const feastOnly = { ...content.activities[0], requirements: [{ type: 'event' as const, eventId: 'feast' }] }
    expect(canPerform(feastOnly, atDay(0), content).reasons).toEqual(['Requires it to be the Feast'])
    expect(canPerform(feastOnly, atDay(2), content).ok).toBe(true)
  })

  it('appear in the character prompt, today and ahead', () => {
    const state = addEvents(start(), [event({ description: 'Stalls fill the square.' })])
    const text = buildCharacterPrompt({ content, state, loveInterestId: 'ana' })
    expect(text).toContain('the Fair is tomorrow. Stalls fill the square.')
    expect(text).toContain('the Feast is in 2 days.')
    expect(buildCharacterPrompt({ content, state: atDay(2), loveInterestId: 'ana' })).toContain(
      'Today is the Feast.'
    )
  })

  it('can be removed again', () => {
    expect(removeEvent(addEvents(start(), [event({})]), 'fair').events).toEqual([])
  })
})

describe('buildEventPrompt', () => {
  it('gives the LLM the calendar, the existing events and the date window', () => {
    const { system, user } = buildEventPrompt({ content, state: start(), count: 2, windowDays: 4 })
    expect(system).toContain('JSON array')
    expect(user).toContain('- a (A, 3 days)\n- b (B, 2 days)')
    expect(user).toContain('- shop (the Shop)')
    expect(user).toContain('- the Feast: 1 B')
    expect(user).toContain('- Town: A small town.')
    expect(user).toContain(
      'Today is Two, 2 A, Year 1.\nInvent 2 new events that start after today and no later than Three, 1 A, Year 2.'
    )
  })
})

describe('parseGeneratedEvents', () => {
  const parse = (items: unknown[], state = start()) =>
    parseGeneratedEvents(`Here you go:\n\`\`\`json\n${JSON.stringify(items)}\n\`\`\``, {
      content,
      state
    })

  it('reads events out of a reply with surrounding text', () => {
    expect(
      parse([
        { name: 'Night Market', description: 'Lanterns and stalls.', month: 'B', day: '2', durationDays: 2, locationId: 'shop' }
      ])
    ).toEqual([
      {
        id: 'generated-1',
        name: 'Night Market',
        description: 'Lanterns and stalls.',
        month: 'b',
        day: 2,
        year: 1,
        durationDays: 2,
        locationId: 'shop',
        generated: true,
        noClasses: false
      }
    ])
  })

  it('places a date that has already passed this year in the next one, if the game lasts that long', () => {
    expect(parse([{ name: 'Thaw', month: 'a', day: 1 }])[0]).toMatchObject({ year: 2, durationDays: 1 })
    expect(parse([{ name: 'Late', month: 'b', day: 1 }], atDay(3))).toEqual([])
  })

  it('drops entries that are malformed, impossible or duplicates', () => {
    const events = parse([
      { name: 'No such month', month: 'zz', day: 1 },
      { name: 'No such day', month: 'b', day: 3 },
      { name: 'The Feast', month: 'a', day: 3 },
      { description: 'nameless', month: 'a', day: 3 },
      { name: 'Good', month: 'a', day: 3, durationDays: 99, locationId: 'nowhere' },
      { name: 'good', month: 'b', day: 2 }
    ])
    expect(events.map((e) => e.name)).toEqual(['Good'])
    expect(events[0]).toMatchObject({ durationDays: 7, locationId: undefined })
  })

  it('gives each event an id not already in use', () => {
    const state = addEvents(start(), [event({ id: 'generated-1' })])
    const events = parse(
      [
        { name: 'One', month: 'b', day: 1 },
        { name: 'Two', month: 'b', day: 2 }
      ],
      state
    )
    expect(ids(events)).toEqual(['generated-2', 'generated-3'])
  })

  it('throws when the reply has no JSON array', () => {
    expect(() => parseGeneratedEvents('Sorry, I cannot do that.', { content, state: start() })).toThrow(
      /did not return a list of events/
    )
    expect(() => parseGeneratedEvents('[{"name": "cut off', { content, state: start() })).toThrow()
  })
})
