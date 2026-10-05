import { describe, expect, it } from 'vitest'
import type { GameState } from '../model'
import { canTravel, loveInterestsAt, travel, whereaboutsUnknown } from './map'
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
  it('moves the player and takes the map\'s travel time', () => {
    const after = travel(content, start(), 'shop')
    expect(after.locationId).toBe('shop')
    expect(after.time).toBe(2)
    expect(start().locationId).toBe('home')
  })

  it('refuses to go where the player already is', () => {
    expect(canTravel(content, start(), 'home').reasons).toEqual(['You are already here'])
    expect(() => travel(content, start(), 'home')).toThrow(/already here/)
  })

  it('refuses a place that will be closed on arrival', () => {
    // Leaving at 13:00 arrives at 15:00, when the shop shuts.
    expect(canTravel(content, { ...start(), time: 6 }, 'shop').ok).toBe(true)
    expect(canTravel(content, { ...start(), time: 7 }, 'shop').reasons).toEqual([
      'the Shop will be closed'
    ])
  })

  it('refuses unknown places, a finished game, and packs without a map', () => {
    expect(canTravel(content, start(), 'nowhere').ok).toBe(false)
    expect(canTravel(content, { ...start(), time: 134 }, 'shop').reasons).toContain('The game is over')
    expect(canTravel({ ...content, map: undefined }, start(), 'shop').ok).toBe(false)
  })
})
