import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isOpen } from '../../shared/game'
import { kindOf } from '../../shared/model'
import { loadContentPack } from './loader'

// The societies are hand-written: whoever is added to the cast has to be put in one, and every meeting has to be somewhere open after classes.
describe('the societies of the default pack', () => {
  const content = loadContentPack(join(process.cwd(), 'content', 'default'))
  const config = content.societies!

  it('has every student in at least one society', () => {
    const students = content.loveInterests.filter((li) => kindOf(li) === 'student')
    expect(students.filter((li) => !config.societies.some((society) => society.memberIds.includes(li.id))).map((li) => li.id)).toEqual([])
  })

  it('meets after classes, on a teaching day, somewhere open for the whole meeting', () => {
    const coursework = content.coursework!
    for (const society of config.societies) {
      const place = content.locations.find((l) => l.id === society.locationId)!
      expect(coursework.weekdays, society.id).toContain(society.weekday)
      expect(society.startHour, society.id).toBeGreaterThanOrEqual(coursework.dayEnd)
      for (let hour = society.startHour; hour < society.startHour + config.hours; hour++) expect(isOpen(place, hour), `${society.id} at ${hour}`).toBe(true)
    }
  })
})
