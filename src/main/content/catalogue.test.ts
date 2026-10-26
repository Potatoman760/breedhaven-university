import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { catalogueIsStale, coursesClash } from '../../shared/game'
import { courseOf, kindOf } from '../../shared/model'
import { loadContentPack } from './loader'

/** The game's own catalogue, as it ships: built for the characters there are, with company in every class and a crowd in none. */
describe('the catalogue of the default pack', () => {
  const content = loadContentPack(join(process.cwd(), 'content', 'default'))
  const courses = content.catalogue!.courses
  const inClass = (course: (typeof courses)[number]) => course.studentIds.length + (course.teacherId ? 1 : 0)

  it('was built for the characters and rules as they are now', () => {
    expect(catalogueIsStale(content)).toBe(false)
    expect(new Set(courses.map((course) => course.id)).size).toBe(courses.length)
  })

  it('has one or two love interests in every class, the teacher counted', () => {
    expect(content.coursework!.maxPerClass).toBe(2)
    for (const course of courses) {
      expect(inClass(course), course.number).toBeGreaterThanOrEqual(1)
      expect(inClass(course), course.number).toBeLessThanOrEqual(2)
    }
  })

  it('has a place for everyone of the University, and asks nobody to be in two rooms at once', () => {
    for (const li of content.loveInterests) {
      if (kindOf(li) === 'outsider' || kindOf(li) === 'npc') continue
      const hers = courses.filter((course) => course.teacherId === li.id || course.studentIds.includes(li.id))
      expect(hers.length, li.id).toBeGreaterThanOrEqual(1)
      if (kindOf(li) === 'student') {
        expect(hers, li.id).toHaveLength(4)
        // Four courses, not one taken twice in two of its sections.
        expect(new Set(hers.map(courseOf)).size, li.id).toBe(4)
      }
      for (const a of hers) for (const b of hers) if (a !== b) expect(coursesClash(a, b), `${li.id}: ${a.number} and ${b.number}`).toBe(false)
    }
  })

  it('still teaches every general subject, since the skills are learnt in them', () => {
    for (const general of content.coursework!.generalEd) expect(courses.some((course) => course.code === general.code), general.code).toBe(true)
  })
})
