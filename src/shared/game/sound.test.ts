import { describe, expect, it } from 'vitest'
import { ContentError, validateContentPack, type ContentPack } from '../model'
import { createInitialState } from './state'
import { ambienceAt, soundCues } from './sound'
import { rawFixture } from './testFixture'

// Home has a loop of its own by night; the shop is indoors and has one only by day, and it is dark from 15:00.
const raw = rawFixture()
const content: ContentPack = validateContentPack({
  ...raw,
  calendar: { ...raw.calendar, periods: [raw.calendar.periods[0], { ...raw.calendar.periods[1], light: 'night' }] },
  locations: raw.locations.map((l) => (l.id === 'shop' ? { ...l, indoors: true } : l)),
  sounds: {
    ambience: { birds: { file: 'sounds/birds.ogg' }, crickets: { file: 'sounds/crickets.ogg', volume: 0.5 }, shop: { file: 'sounds/shop.ogg' } },
    places: { home: { day: 'birds', night: 'crickets' }, shop: { day: 'shop' } }
  }
})
const start = createInitialState(content)

describe('soundCues', () => {
  it('hears nothing when nothing that makes a sound has changed', () => {
    expect(soundCues(content, start, { ...start, time: start.time + 1 })).toEqual([])
  })

  it('hears a purchase, a new message and a door, the weightiest first', () => {
    const after = { ...start, locationId: 'shop', player: { ...start.player, money: start.player.money - 5 }, courier: { ana: [{ from: 'them' as const, text: 'Hi', time: 0, read: false }] } }
    expect(soundCues(content, start, after)).toEqual(['message', 'coins', 'door'])
  })

  it('opens no door to a place out of doors, and makes nothing of his own messages', () => {
    const shop = { ...start, locationId: 'shop' }
    const after = { ...shop, locationId: 'home', courier: { ana: [{ from: 'player' as const, text: 'Hi', time: 0, read: false }] } }
    expect(soundCues(content, shop, after)).toEqual([])
  })

  it('puts a birth before the rest of what came with it', () => {
    const after = { ...start, children: [{ motherId: 'ana', bornAt: 0, daughter: true, name: 'Mab' }], skillsTold: ['x'] }
    expect(soundCues(content, start, after)).toEqual(['birth', 'skill'])
  })
})

describe('ambienceAt', () => {
  it('plays the place by day and its night loop after dark', () => {
    expect(ambienceAt(content, start)?.file).toBe('sounds/birds.ogg')
    expect(ambienceAt(content, { ...start, time: 9 })).toEqual({ file: 'sounds/crickets.ogg', volume: 0.5, credit: '' })
  })

  it('keeps the day loop at night for a place with none of its own, and is silent where none is set', () => {
    expect(ambienceAt(content, { ...start, locationId: 'shop', time: 9 })?.file).toBe('sounds/shop.ogg')
    const silent = validateContentPack(rawFixture())
    expect(ambienceAt(silent, createInitialState(silent))).toBeUndefined()
  })

  it('will not load a pack whose places name a loop or a location that does not exist', () => {
    expect(() => validateContentPack({ ...raw, sounds: { places: { nowhere: { day: 'birds' } } } })).toThrow(ContentError)
  })
})
