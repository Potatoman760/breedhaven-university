import { describe, expect, it } from 'vitest'
import { ContentError, validateContentPack } from '../model'
import { attendEventPart, eventPartsToday, partCast, requiredEventPart } from './eventParts'
import { addEventGoers, eventKeeping, eventsOn, upcomingEvents } from './events'
import { wornOutfit } from './pregnancy'
import { backgroundFor } from './schedule'
import { createInitialState } from './state'
import { rawFixture } from './testFixture'

// The game starts at 06:00 on 2 a of a 20-hour day, which is the first of the fair's two days at the shop. Its opening
// at 08:00 has to be gone to and opens on written lines; the dance on its second day is a choice.
const raw = rawFixture()
const fair = {
  id: 'fair',
  name: 'the Fair',
  month: 'a',
  day: 2,
  durationDays: 2,
  locationId: 'shop',
  program: [
    { id: 'opening', name: 'The opening', startHour: 8, hours: 2, required: true, direction: 'Ribbons are cut.', cutscene: { speakerId: 'ana', scenes: [{ locationId: 'shop', lines: ['Welcome to the fair!'] }] } },
    { id: 'dance', name: 'The dance', day: 2, startHour: 12, hours: 3 }
  ]
}
const content = validateContentPack({ ...raw, calendar: { ...raw.calendar, events: [...raw.calendar.events, fair] } })
const event = content.calendar.events.find((one) => one.id === 'fair')!
const start = createInitialState(content)

describe('the parts of an event', () => {
  it('are on, on their own day, until they are over, and a required one holds the day', () => {
    expect(eventPartsToday(content, start).map(({ part }) => part.id)).toEqual(['opening'])
    expect(requiredEventPart(content, start)?.part.id).toBe('opening')
    // The opening is over at 10:00, four hours in.
    expect(eventPartsToday(content, { ...start, time: 4 })).toEqual([])
    // The dance is on the second day, twenty hours on.
    expect(eventPartsToday(content, { ...start, time: 20 }).map(({ part }) => part.id)).toEqual(['dance'])
  })

  it('takes him there at its hour, reads its cutscene, and is gone to once', () => {
    const { state, cutscene, scene } = attendEventPart(content, addEventGoers(start, 'fair', ['ana']), 'fair', 'opening')
    // Two hours early, then the two hours it lasts.
    expect(state.time).toBe(4)
    expect(state.locationId).toBe('shop')
    expect(cutscene?.scenes[0].lines).toEqual(['Welcome to the fair!'])
    expect(scene).toMatchObject({ loveInterestId: 'ana', companionIds: [], beats: [{ activityName: 'the Fair: The opening', direction: 'Ribbons are cut.' }] })
    expect(eventPartsToday(content, { ...state, time: 0 })).toEqual([])
    expect(() => attendEventPart(content, state, 'fair', 'opening')).toThrow()
  })

  it('is with whoever said she would be there, else those he is closest to, and with nobody it only passes the time', () => {
    expect(partCast(content, addEventGoers(start, 'fair', ['ana']), event, event.program[0])).toEqual(['ana'])
    expect(partCast(content, { ...start, met: ['ana'] }, event, event.program[0])).toEqual(['ana'])
    expect(attendEventPart(content, { ...start, met: [] }, 'fair', 'opening').scene).toBeNull()
  })

  it('dresses her for the whole day of it, and keeps her at a part only for its hours', () => {
    const festive = validateContentPack({
      ...raw,
      calendar: { ...raw.calendar, events: [...raw.calendar.events, fair] },
      loveInterests: raw.loveInterests.map((li) => ({ ...li, outfits: [...li.outfits, { id: 'fair', name: 'Fair dress', description: 'a dress with ribbons' }] }))
    })
    const ana = festive.loveInterests[0]
    // From the first hour of the fair's day to its last, whatever its parts' hours.
    expect(wornOutfit(festive, start, ana)?.id).toBe('fair')
    expect(wornOutfit(festive, { ...start, time: 13 }, ana)?.id).toBe('fair')
    // A scene that has put her in something else keeps her in it; the day after it is over, she is in her own clothes.
    expect(wornOutfit(festive, start, ana, 'default')?.id).toBe('default')
    expect(wornOutfit(festive, { ...start, time: 40 }, ana)?.id).toBe('default')
    // Having said she would come, she is at the opening while it is on, and at the fair's place; not before it, nor after.
    const going = addEventGoers(start, 'fair', ['ana'])
    expect(eventKeeping(festive, { ...going, time: 2 }, 'ana')?.locationId).toBe('shop')
    expect(eventKeeping(festive, going, 'ana')).toBeUndefined()
    expect(eventKeeping(festive, { ...going, time: 4 }, 'ana')).toBeUndefined()
  })

  it('keeps a secret one off the calendar and out of talk, and still plays it, in the view it asks for', () => {
    const beat = { ...fair, id: 'beat', name: 'A beat', day: 3, secret: true, program: [{ id: 'meet', name: 'A meeting', startHour: 8, viewId: 'default' }] }
    const shop = { id: 'shop', name: 'the Shop', backgrounds: [{ id: 'default', name: 'Default', images: {} }] }
    const told = validateContentPack({ ...raw, locations: raw.locations.map((l) => (l.id === 'shop' ? shop : l)), calendar: { ...raw.calendar, events: [beat] } })
    const before = createInitialState(told)
    expect(upcomingEvents(told, before, 7)).toEqual([])
    const on = { ...before, time: 20 }
    expect(eventsOn(told, on).map((one) => one.id)).toEqual(['beat'])
    expect(attendEventPart(told, { ...on, met: ['ana'] }, 'beat', 'meet').scene?.viewId).toBe('default')
  })

  it('dresses a place by the event\'s id as well as its name', () => {
    const place = { ...content.locations[0], backgrounds: [{ id: 'default', name: 'Default', images: {} }, { id: 'fair', name: 'Bunting', images: {} }] }
    expect(backgroundFor(place, undefined, ['the Fair', 'fair'])?.id).toBe('fair')
    expect(backgroundFor(place, undefined, [])?.id).toBe('default')
  })

  it('will not load a part on a day the event does not have, or a cutscene by someone who does not exist', () => {
    const late = { ...fair, program: [{ id: 'late', name: 'Late', day: 3, startHour: 8 }] }
    expect(() => validateContentPack({ ...raw, calendar: { ...raw.calendar, events: [late] } })).toThrow(ContentError)
    const ghost = { ...fair, program: [{ ...fair.program[0], cutscene: { speakerId: 'nobody', scenes: [{ locationId: 'shop', lines: ['Boo'] }] } }] }
    expect(() => validateContentPack({ ...raw, calendar: { ...raw.calendar, events: [ghost] } })).toThrow(ContentError)
    // Nor one that dresses its speaker in something she does not have.
    const undressed = { ...fair, program: [{ ...fair.program[0], cutscene: { ...fair.program[0].cutscene, outfitId: 'ballgown' } }] }
    expect(() => validateContentPack({ ...raw, calendar: { ...raw.calendar, events: [undressed] } })).toThrow(ContentError)
  })
})
