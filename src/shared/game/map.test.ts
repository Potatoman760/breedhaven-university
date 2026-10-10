import { describe, expect, it } from 'vitest'
import type { GameState } from '../model'
import { canTravel, locationOf, loveInterestsAt, travel, whereaboutsUnknown } from './map'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Fixture: the player starts at home at 06:00; the shop is open 05:00-15:00; Ana is at
// the shop during the day period (05:00-15:00) and has no scheduled place at night.
const content = fixture()
const start = (): GameState => createInitialState(content)
const names = (list: { id: string }[]) => list.map((li) => li.id)

describe('tracking love interests', () => {
  it('places them by their schedule', () => {
    expect(names(loveInterestsAt(content, start(), 'shop'))).toEqual(['ana'])
    expect(names(loveInterestsAt(content, start(), 'home'))).toEqual([])
    expect(names(whereaboutsUnknown(content, start()))).toEqual([])
  })

  it('reports them as whereabouts unknown when the schedule has no entry', () => {
    const night = { ...start(), time: 9 }
    expect(names(loveInterestsAt(content, night, 'shop'))).toEqual([])
    expect(names(whereaboutsUnknown(content, night))).toEqual(['ana'])
  })
})

describe('travel', () => {
  it('moves the player, and takes no time', () => {
    const after = travel(content, start(), 'shop')
    expect(after.locationId).toBe('shop')
    expect(after.time).toBe(0)
    expect(start().locationId).toBe('home')
  })

  it('refuses to go where the player already is', () => {
    expect(canTravel(content, start(), 'home').reasons).toEqual(['You are already here'])
    expect(() => travel(content, start(), 'home')).toThrow(/already here/)
  })

  it('refuses a place that is closed', () => {
    // The shop shuts at 15:00.
    expect(canTravel(content, { ...start(), time: 8 }, 'shop').ok).toBe(true)
    expect(canTravel(content, { ...start(), time: 9 }, 'shop').reasons).toEqual([
      'the Shop is closed'
    ])
  })

  it('refuses unknown places, a finished game, and packs without a map', () => {
    expect(canTravel(content, start(), 'nowhere').ok).toBe(false)
    expect(canTravel(content, { ...start(), time: 134 }, 'shop').reasons).toContain('The game is over')
    expect(canTravel({ ...content, map: undefined }, start(), 'shop').ok).toBe(false)
  })
})

describe('someone with nothing on her schedule', () => {
  it('is in her own room: nowhere on the map, and listed as such', () => {
    const [ana] = content.loveInterests
    const idle = { ...ana, schedule: [], room: { name: 'a loft', description: '', locationId: 'shop' } }
    const quiet = { ...content, loveInterests: [idle] }
    expect(locationOf(quiet, start(), idle)).toBeUndefined()
    expect(whereaboutsUnknown(quiet, start()).map((li) => li.id)).toEqual([idle.id])
    expect(loveInterestsAt(quiet, start(), 'shop')).toEqual([])
  })
})
