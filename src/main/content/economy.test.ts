import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hoursPerWeek, isOpen } from '../../shared/game'
import { loadContentPack } from './loader'

/**
 * The game's money, pinned. Wages, the rent, a child's keep and the price of every room are balanced against each
 * other, and a change to one that breaks the balance should fail here and be made on purpose: a player with any job
 * can keep the house and a child with care; a strong one can build most of it; and one whose stats have outgrown his job can
 * finish it by the end of the year.
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
    expect(house).toBeGreaterThanOrEqual(2900)
    expect(house).toBeLessThanOrEqual(3500)
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

  it('lets a player who is good at his job finish the house by the end of the year, with a houseful in it', () => {
    // A good job, not the best, with half the bonus there is for being better than it asks, for every week of the
    // year: it pays for the whole house, built and fitted out, over the rent and four children in it. Earned, not hard.
    const { bonusCap } = content.jobs!
    const good = weekly.slice(-5)[2] * (1 + bonusCap / 2)
    expect(good * 19 + content.newGame.player.money - rent * 4 - baby * 4 * 8 - house).toBeGreaterThanOrEqual(400)
  })

  it('makes his stats what finishes it: the rate alone does not', () => {
    // The same job and household with no bonus leaves the house unfinished, so that getting better at the work is worth something.
    const good = weekly.slice(-5)[2]
    expect(good * 19 + content.newGame.player.money - rent * 4 - baby * 4 * 8).toBeLessThan(house)
  })

  it('keeps every shift clear of the teaching day, so that any job can be held with any timetable', () => {
    const school = content.coursework!
    for (const job of jobs) {
      const place = content.locations.find((l) => l.id === job.locationId)!
      for (const shift of job.shifts) {
        const at = `${job.id}, ${shift.weekday} ${shift.startHour}:00`
        // On a day classes meet, work is after the last of them; the other days are free.
        if (school.weekdays.includes(shift.weekday)) expect(shift.startHour, at).toBeGreaterThanOrEqual(school.dayEnd)
        // It is over by midnight, when he sleeps, and the place is open for all of it.
        expect(shift.startHour + shift.hours, at).toBeLessThanOrEqual(24)
        for (let hour = shift.startHour; hour < shift.startHour + shift.hours; hour++) expect(isOpen(place, hour), `${at}: shut at ${hour}:00`).toBe(true)
      }
      // No two of its shifts on one day.
      expect(new Set(job.shifts.map((shift) => shift.weekday)).size, job.id).toBe(job.shifts.length)
    }
  })
})
