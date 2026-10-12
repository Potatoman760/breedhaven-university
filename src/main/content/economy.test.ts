import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hoursPerWeek } from '../../shared/game'
import { loadContentPack } from './loader'

/**
 * The game's money, pinned. Wages, the rent, a child's keep and the price of every room are balanced against each
 * other, and a change to one that breaks the balance should fail here and be made on purpose: a player with any job
 * can keep the house and a child with care; a strong one can build most of it; and nobody can stop minding money.
 */
describe('the economy of the default pack', () => {
  const content = loadContentPack(join(process.cwd(), 'content', 'default'))
  const jobs = content.jobs!.jobs
  const housing = content.housing!
  const weekly = jobs.map((job) => job.hourlyRate * hoursPerWeek(job)).sort((a, b) => a - b)
  const builds = housing.rooms.reduce((sum, room) => sum + room.cost, 0)
  const upgrades = housing.rooms.reduce((sum, room) => sum + room.tiers.reduce((more, tier) => more + tier.cost, 0), 0)
  const house = builds + upgrades
  const { rent } = housing
  const baby = housing.babies.weeklyCost

  it('pays a living at the bottom and not a fortune at the top', () => {
    expect(weekly[0]).toBeGreaterThanOrEqual(90)
    expect(weekly.at(-1)).toBeLessThanOrEqual(280)
    // Work anyone can walk into, for someone with nothing to show yet.
    const open = jobs.filter((job) => Object.keys(job.requirements).length === 0).map((job) => job.hourlyRate * hoursPerWeek(job))
    expect(open.length).toBeGreaterThanOrEqual(3)
    for (const pay of open) {
      expect(pay).toBeGreaterThanOrEqual(90)
      expect(pay).toBeLessThanOrEqual(130)
    }
  })

  it('prices the whole house as most of a good year, not a week of it', () => {
    expect(house).toBeGreaterThanOrEqual(3400)
    expect(house).toBeLessThanOrEqual(4200)
    // The house he is given can take one of them and one child before anything is built.
    const given = housing.rooms.filter((room) => room.startsBuilt)
    expect(given.reduce((sum, room) => sum + room.beds, 0)).toBeGreaterThanOrEqual(1)
    expect(given.reduce((sum, room) => sum + room.cots, 0)).toBeGreaterThanOrEqual(1)
    expect(given.every((room) => room.cost === 0)).toBe(true)
  })

  it('lets a casual player keep the house and one child, with a little over to build', () => {
    // The worst open job, for the thirteen weeks from a move in the sixth week to the end of term.
    const lowest = Math.min(...jobs.filter((job) => Object.keys(job.requirements).length === 0).map((job) => job.hourlyRate * hoursPerWeek(job)))
    const earned = lowest * 13
    const upkeep = rent * 3 + baby * 6
    expect(upkeep).toBeLessThanOrEqual(earned * 0.7)
    const cheapest = Math.min(...housing.rooms.filter((room) => room.cost > 0).map((room) => room.cost))
    expect(earned - upkeep).toBeGreaterThanOrEqual(cheapest)
  })

  it('lets a strong player build most of it', () => {
    const top = weekly.slice(-5)
    const median = top[2]
    const left = median * 16 - rent * 3 - baby * 2 * 6
    expect(left).toBeGreaterThanOrEqual(house * 0.6)
  })

  it('lets nobody stop minding money', () => {
    // Every week of the year at the best wage there is, with what he started with, does not buy the lot.
    const most = weekly.at(-1)! * 19 + content.newGame.player.money
    expect(most).toBeLessThan(house + rent * 4 + baby * 3 * 8)
  })
})
