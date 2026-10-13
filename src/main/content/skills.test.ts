import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dormantCourses, skillFor, topicsOf } from '../../shared/game'
import { SKILL_GRANTS } from '../../shared/model'
import { loadContentPack } from './loader'

/** What the game's own courses teach, as they ship: something to be learnt for everything there is to learn, and a term's worth of classes written for every course. */
describe('the courses of the default pack', () => {
  const content = loadContentPack(join(process.cwd(), 'content', 'default'))
  const courses = content.catalogue!.courses

  it('each teach one thing, whether or not they are given this term', () => {
    const written = content.curriculum!.majors.flatMap((major) => major.courses.map((course) => ({ major, course })))
    expect(written).toHaveLength(33)
    for (const { major, course } of written) {
      const taught = content.skills.filter((skill) => skill.code === major.code && skill.level === course.level)
      expect(taught, `${major.code} ${course.level}`).toHaveLength(1)
      // Within reach in the first half of the term, and not on the first day.
      expect(taught[0].at).toBeGreaterThanOrEqual(15)
      expect(taught[0].at).toBeLessThanOrEqual(50)
    }
    expect(new Set(content.skills.map((skill) => skill.id)).size).toBe(content.skills.length)
    // The course a skill is shown for is the one that teaches it.
    for (const course of courses) expect(skillFor(content, course)?.level, course.number).toBe(course.level)
  })

  it('have something to ask at an examination about every topic', () => {
    for (const major of content.curriculum!.majors) {
      for (const course of major.courses) {
        for (const topic of course.topics) {
          const where = `${major.code} ${course.level}: ${topic.title}`
          expect(topic.question, where).toBeDefined()
          const { ask, answer, wrong } = topic.question!
          expect(ask.endsWith('?'), where).toBe(true)
          expect(answer.endsWith('.'), where).toBe(false)
          expect(new Set([answer, ...wrong].map((choice) => choice.toLowerCase())).size, where).toBe(4)
        }
      }
    }
    expect(content.coursework!.grading).toMatchObject({ passAt: 0.6, markAt: 0.8, examQuestions: 3 })
  })

  it('have each sight once, and nothing that shows him more of her than those six', () => {
    expect(content.skills.flatMap((skill) => (skill.grants ? [skill.grants] : [])).sort()).toEqual([...SKILL_GRANTS].sort())
  })

  it('have him make only things there are, and wait at least a few days between', () => {
    const abilities = content.skills.filter((skill) => skill.ability)
    expect(abilities.map((skill) => skill.id).sort()).toEqual(['bloom-cordial', 'charmed-confection', 'heartsease', 'resonance-token', 'stamina-band'])
    for (const skill of abilities) {
      expect(skill.ability!.cooldownDays, skill.id).toBeGreaterThanOrEqual(4)
      for (const effect of skill.ability!.effects) if (effect.type === 'item') expect(content.items.some((item) => item.id === effect.itemId), effect.itemId).toBe(true)
    }
    // What is made is not sold, and a thing for her says something to her.
    for (const id of ['heartsease-draught', 'bloom-cordial', 'charmed-confection']) expect(content.stalls.some((stall) => stall.itemIds.includes(id)), id).toBe(false)
    const cordial = content.items.find((item) => item.id === 'bloom-cordial')!
    expect(cordial.use).toMatchObject({ on: 'her', effects: [{ type: 'boon', modifier: { kind: 'unguarded' }, hours: 24, on: 'her' }] })
    expect(content.items.find((item) => item.id === 'charmed-confection')?.lovedByAll).toBe(true)
  })

  it('have six classes written for each, and none of it speaks to the player', () => {
    for (const course of courses) {
      const topics = topicsOf(content, course.id)
      expect(topics, course.number).toHaveLength(6)
      for (const topic of topics) {
        expect(topic.title.trim().length, `${course.number}: ${topic.title}`).toBeGreaterThan(0)
        expect(topic.content.length, `${course.number}: ${topic.title}`).toBeGreaterThanOrEqual(300)
        expect(topic.content.length, `${course.number}: ${topic.title}`).toBeLessThanOrEqual(560)
        expect(topic.content, `${course.number}: ${topic.title}`).not.toMatch(/\{player\}|\byou\b|—/i)
      }
    }
    // Some courses are written and not given this term, for want of anyone to read or teach them: they have their classes all the same.
    const dormant = dormantCourses(content, courses).map((course) => course.number)
    expect(dormant).toEqual(['MID 201', 'EDU 101', 'COM 101'])
    expect(content.syllabus).toHaveLength(courses.length + dormant.length)
    for (const entry of content.syllabus) expect(entry.topics, entry.courseId).toHaveLength(6)
  })
})
