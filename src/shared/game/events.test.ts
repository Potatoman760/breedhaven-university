import { describe, expect, it } from 'vitest'
import { BackgroundSchema, type CalendarEvent, type GameState } from '../model'
import { canPerform } from './activities'
import {
  addEvents,
  buildEventPrompt,
  describeEvent,
  eventHours,
  eventsOn,
  eventOutfits,
  mapDressingAt,
  songAt,
  parseGeneratedEvents,
  removeEvent,
  upcomingEvents
} from './events'
import { dayAgenda } from './agenda'
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
  program: [],
  secret: false,
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

describe('eventOutfits', () => {
  it('are what a part starts its scene in, and an outfit named for each event, each with where it is worn', () => {
    const spa = { ...content, calendar: { ...content.calendar, events: content.calendar.events.map((e) => ({ ...e, program: [{ id: 'soak', name: 'The soak', day: 1, startHour: 8, hours: 2, outfitId: 'bathrobe' } as never] })) } }
    expect(eventOutfits(spa)).toEqual([
      { id: 'bathrobe', worn: ['the Feast: The soak'] },
      { id: 'feast', worn: ['all of the Feast'] }
    ])
  })
})

describe('mapDressingAt', () => {
  const dressed = { ...content.locations[1], backgrounds: [...content.locations[1].backgrounds, BackgroundSchema.parse({ id: 'feast', name: 'the Feast' })] }
  const winter = { ...content, calendar: { ...content.calendar, events: content.calendar.events.map((e) => ({ ...e, mapDressing: 'wreath.png' })) } }

  it('is the dressing of an event that is on, on a place dressed for it', () => {
    expect(mapDressingAt(winter, atDay(2), dressed)).toBe('wreath.png')
  })

  it('comes with the song of an event that has one, at a place dressed for it, on its day', () => {
    const singing = { ...content, calendar: { ...content.calendar, events: content.calendar.events.map((e) => ({ ...e, song: 'carol.mp3' })) } }
    expect(songAt(singing, atDay(2), dressed)).toBe('carol.mp3')
    expect(songAt(singing, atDay(3), dressed)).toBeUndefined()
    expect(songAt(singing, atDay(2), content.locations[0])).toBeUndefined()
    expect(songAt(content, atDay(2), dressed)).toBeUndefined()
  })

  it('is nothing on another day, on a place not dressed for it, or for an event with none', () => {
    expect(mapDressingAt(winter, atDay(3), dressed)).toBeUndefined()
    expect(mapDressingAt(winter, atDay(2), content.locations[0])).toBeUndefined()
    expect(mapDressingAt(content, atDay(2), dressed)).toBeUndefined()
  })
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
      'Today is Two, 2 A.\nInvent 2 new events that start after today and no later than Three, 1 A.'
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
        program: [],
        secret: false,
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

describe('an event with a place and hours, and a holiday with neither', () => {
  const content = fixture()
  const state = createInitialState(content)
  const fair: CalendarEvent = { id: 'fair', name: 'the Fair', description: 'Stalls and cider.', month: 'a', day: 1, durationDays: 2, locationId: 'shop', startHour: 10, hours: 4, noClasses: false, generated: false, program: [], secret: false }
  const holiday: CalendarEvent = { id: 'rest', name: 'Rest Day', description: 'Nobody works.', month: 'a', day: 2, durationDays: 1, noClasses: true, generated: false, program: [], secret: false }
  const both = { ...content, calendar: { ...content.calendar, events: [fair, holiday] } }

  it('are told apart wherever they are told: to a character, and on the calendar', () => {
    expect(eventHours(fair)).toBe('10:00 to 14:00')
    expect(eventHours(holiday)).toBeUndefined()
    expect(describeEvent(both, fair)).toBe('Stalls and cider. It is at the Shop, from 10:00 to 14:00 each day.')
    expect(describeEvent(both, holiday)).toBe('Nobody works.')
    expect(buildCharacterPrompt({ content: both, state, loveInterestId: 'ana' })).toContain('Today is the Fair. Stalls and cider. It is at the Shop, from 10:00 to 14:00 each day.')

    const agenda = dayAgenda(both, state, 0).filter((item) => item.kind === 'event')
    expect(agenda).toEqual([
      { kind: 'event', id: 'event-rest', title: 'Rest Day', detail: undefined, description: 'Nobody works.', startHour: undefined, hours: undefined },
      { kind: 'event', id: 'event-fair', title: 'the Fair', detail: 'the Shop', description: 'Stalls and cider.', startHour: 10, hours: 4 }
    ])
  })

  it('can be invented with hours, which are kept only when they fit in a day', () => {
    const reply = JSON.stringify([
      { name: 'Night Market', description: 'Lanterns.', month: 'b', day: 1, durationDays: 1, locationId: 'shop', startHour: 18, hours: 9 },
      { name: 'Quiet Day', description: 'Nothing.', month: 'b', day: 2, durationDays: 1, locationId: null, startHour: null, hours: null }
    ])
    const made = parseGeneratedEvents(reply, { content, state })
    expect(made.map((e) => [e.name, e.startHour, e.hours])).toEqual([
      ['Night Market', 18, 2],
      ['Quiet Day', undefined, undefined]
    ])
  })
})
