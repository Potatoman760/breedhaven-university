import { describe, expect, it } from 'vitest'
import { CurriculumSchema, type ContentPack } from '../model'
import { buildMajorDraftPrompt, majorDraftSchema, parseMajorDraft } from './draftMajor'
import { fixture } from './testFixture'

const topics = Array.from({ length: 6 }, (_, i) => ({ title: `Class ${i + 1}`, content: 'What is taught.', question: { ask: `Question ${i + 1}?`, answer: 'Yes', wrong: ['No', 'Maybe', 'Never'] } }))
const content: ContentPack = {
  ...fixture(),
  curriculum: CurriculumSchema.parse({
    colleges: [{ id: 'arts', name: 'the College of Arts' }],
    majors: [{ code: 'JRN', subject: 'Journalism', college: 'arts', courses: [{ number: '101', title: 'Reporting', topics, skill: { id: 'scoop', name: 'Scoop', description: 'You dig.', passive: { kind: 'wages', amount: 1.2 } } }] }]
  })
}
const idea = { subject: 'Astronomy', college: 'arts', notes: 'The night sky of the Expanse.' }

/** A reply as the LLM is asked to write it. */
const reply = (patch: Record<string, unknown> = {}) => ({
  code: 'AST',
  stats: ['intelligence', 'wisdom'],
  practical: true,
  courses: [
    { number: '101', title: 'The Night Sky', description: 'Stars and their names.', topics, skill: { name: 'Star Reader', description: 'You read the sky: training in wisdom is 50% more effective.', effect: { kind: 'training', amount: 1.5, stats: ['wisdom'] }, upgrade: { description: 'You read any sky: training in wisdom is 100% more effective.', amount: 2 } } },
    { number: '130', title: 'Instruments', description: 'Lenses and the lab.', topics, skill: { name: 'Scoop', description: 'You know prices: shops charge 20% less.', effect: { kind: 'prices', amount: 0.8 }, upgrade: { description: 'Shops charge 30% less.', amount: 0.7 } } }
  ],
  ...patch
})

describe('drafting a subject', () => {
  it('asks for one with the codes in use, the kinds of skill there are, and what the author wants', () => {
    const { system, user } = buildMajorDraftPrompt(content, idea)
    expect(system).toContain('- training:')
    expect(system).not.toContain('- fertility:')
    expect(user).toContain('- JRN: Journalism')
    expect(user).toContain('The new subject: Astronomy, in the College of Arts.')
    expect(user).toContain('The night sky of the Expanse.')
    expect(majorDraftSchema().safeParse(reply()).success).toBe(true)
  })

  it('turns a reply into a subject to open: named and placed as asked, each skill its own, stronger at 70', () => {
    const major = parseMajorDraft(content, idea, `Here it is:\n${JSON.stringify(reply())}`)
    expect(major).toMatchObject({ code: 'AST', subject: 'Astronomy', college: 'arts', general: false, practical: true })
    expect(major.courses.map((course) => course.number)).toEqual(['101', '130'])
    expect(major.courses[0].skill).toMatchObject({ id: 'star-reader', at: 30, passive: { kind: 'training', amount: 1.5, stats: ['wisdom'] }, upgrade: { at: 70, passive: { kind: 'training', amount: 2, stats: ['wisdom'] } } })
    // A skill named as one already is gets an id of its own.
    expect(major.courses[1].skill?.id).toBe('scoop-2')
    expect(major.courses[1].skill?.passive).toEqual({ kind: 'prices', amount: 0.8 })
  })

  it('refuses a code in use, too few courses, two of one number, or a kind of skill not offered', () => {
    expect(() => parseMajorDraft(content, idea, JSON.stringify(reply({ code: 'JRN' })))).toThrow('already in use')
    expect(() => parseMajorDraft(content, idea, JSON.stringify(reply({ courses: [reply().courses[0]] })))).toThrow('courses')
    expect(() => parseMajorDraft(content, idea, JSON.stringify(reply({ courses: [reply().courses[0], reply().courses[0]] })))).toThrow('one number')
    const fertile = reply().courses.map((course, i) => (i === 0 ? { ...course, skill: { ...course.skill, effect: { kind: 'fertility', amount: 2 } } } : course))
    expect(() => parseMajorDraft(content, idea, JSON.stringify(reply({ courses: fertile })))).toThrow('effect.kind')
    expect(() => parseMajorDraft(content, idea, 'Sorry.')).toThrow()
  })
})
