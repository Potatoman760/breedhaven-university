import { z } from 'zod'
import { AbilitySchema, SKILL_GRANTS, SkillUpgradeSchema } from './skill'
import { ModifierSchema } from './modifier'
import { StatSchema } from './stats'
import { TopicSchema } from './syllabus'

/** How many classes of a course are written: one for each topic of its syllabus. */
export const TOPICS_PER_COURSE = 6

/** A skill as its course writes it: everything but which course teaches it. */
const WrittenSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  at: z.number().min(0).default(30),
  grants: z.enum(SKILL_GRANTS).optional(),
  passive: ModifierSchema.optional(),
  ability: AbilitySchema.optional(),
  below: ModifierSchema.optional(),
  upgrade: SkillUpgradeSchema.optional()
})

/** A course as it is written: what it is called, what its classes are on, and what getting on in it teaches. */
export const WrittenCourseSchema = z.object({
  /** Its number in the catalog, after its subject's code: `132` for `BUS 132`. A label, not a year: any student may take it. */
  number: z.string().regex(/^1\d\d$/),
  title: z.string(),
  description: z.string().default(''),
  /** Open to everyone though its subject is one that is read: the first course of a department every student passes through. */
  general: z.boolean().default(false),
  /** Its syllabus: what each class is on, in the order they are taught. */
  topics: z.array(TopicSchema).length(TOPICS_PER_COURSE),
  /** What he learns to do by getting far enough in it. The course is what teaches it, so the skill does not say which. */
  skill: WrittenSkillSchema.optional()
})
export type WrittenCourse = z.infer<typeof WrittenCourseSchema>

/** A subject the University teaches: what a student majors in, or a general course open to everyone. */
export const MajorSchema = z.object({
  /** Catalogue prefix, e.g. `POL`. */
  code: z.string(),
  subject: z.string(),
  /** The college it belongs to, by id. */
  college: z.string(),
  /** A general subject: nobody reads it as her own, and its one course is open to all. */
  general: z.boolean().default(false),
  /** What a class in the subject teaches the player. */
  stats: z.array(StatSchema).min(1).max(2).default(['intelligence']),
  /** A practical subject: its courses have a weekly lab as well as their lectures. */
  practical: z.boolean().default(false),
  courses: z.array(WrittenCourseSchema).min(1)
})
export type Major = z.infer<typeof MajorSchema>

/**
 * Everything the University teaches, written down: its colleges, the subjects in them, and each subject's courses
 * with their syllabuses and what they teach. Characters do not make subjects up: a student majors in one of these and a
 * teacher gives courses from it. Which of the courses are given in a game, when, and to whom, is the catalogue's.
 */
export const CurriculumSchema = z.object({
  colleges: z.array(z.object({ id: z.string(), name: z.string() })),
  majors: z.array(MajorSchema)
})
export type Curriculum = z.infer<typeof CurriculumSchema>

/** A course's catalogue number: `POL 132`, its subject's code and the number written for it. */
export function courseNumber(code: string, number: string): string {
  return `${code} ${number}`
}

/** A course's id, from its number: `course-pol-132`. */
export function courseId(code: string, number: string): string {
  return `course-${courseNumber(code, number).toLowerCase().replace(/\s+/g, '-')}`
}

type Raw = Record<string, unknown>
const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value)

/** What a character's file says she studies or teaches, as the rest of the game has it: her subject in full, from the curriculum. */
function resolveSubject(majors: Major[], written: unknown): unknown {
  if (!isObject(written) || typeof written['major'] !== 'string') return written
  const major = majors.find((one) => one.code === written['major'])
  // A subject there is no such thing as is left as it is written, to be reported when the pack is checked.
  // A student's year goes along with her subject, and a teacher's course its number.
  const own = { ...(written['level'] !== undefined && { level: written['level'] }), ...(written['number'] !== undefined && { number: written['number'] }) }
  if (!major) return { subject: written['major'], code: written['major'], ...own, unknownMajor: true }
  return { subject: major.subject, code: major.code, ...own, stats: major.stats, practical: major.practical }
}

function resolveCharacter(majors: Major[], character: unknown): unknown {
  if (!isObject(character)) return character
  const teaching = character['teaching']
  return {
    ...character,
    ...(character['studies'] !== undefined && { studies: resolveSubject(majors, character['studies']) }),
    ...(isObject(teaching) && Array.isArray(teaching['subjects']) && { teaching: { ...teaching, subjects: teaching['subjects'].map((subject) => resolveSubject(majors, subject)) } })
  }
}

/**
 * Lays a pack's curriculum over the rest of it, before the pack is read: each character's subject is filled in from
 * the one she names, the general subjects, syllabuses and skills are drawn out of the courses they are written in,
 * and the catalogue's courses take their titles and the rest of what is written from the curriculum, keeping only
 * what was worked out for them: who gives each, who is in it and when it meets. A pack with no curriculum is left
 * as it is. Doing it twice changes nothing.
 */
export function resolveCurriculum(raw: unknown): unknown {
  if (!isObject(raw)) return raw
  const parsed = CurriculumSchema.safeParse(raw['curriculum'])
  if (!parsed.success) return raw
  const { majors } = parsed.data
  const written = majors.flatMap((major) => major.courses.map((course) => ({ major, course, id: courseId(major.code, course.number) })))
  const coursework = raw['coursework']
  const catalogue = raw['catalogue']
  const locationId = isObject(coursework) ? coursework['locationId'] : undefined
  return {
    ...raw,
    loveInterests: Array.isArray(raw['loveInterests']) ? raw['loveInterests'].map((one) => resolveCharacter(majors, one)) : raw['loveInterests'],
    ...(Array.isArray(raw['npcs']) && { npcs: raw['npcs'].map((one) => resolveCharacter(majors, one)) }),
    ...(isObject(coursework) && {
      coursework: { ...coursework, generalEd: majors.filter((major) => major.general).map(({ code, subject, stats, practical }) => ({ code, subject, stats, practical })) }
    }),
    syllabus: written.map(({ id, course }) => ({ courseId: id, topics: course.topics })),
    skills: written.flatMap(({ major, id, course }) => (course.skill ? [{ ...course.skill, code: major.code, courseId: id }] : [])),
    ...(isObject(catalogue) &&
      Array.isArray(catalogue['courses']) && {
        catalogue: {
          ...catalogue,
          // A course the curriculum no longer has is not given.
          courses: catalogue['courses'].flatMap((given) => {
            const found = isObject(given) ? written.find((one) => one.id === given['id']) : undefined
            if (!found || !isObject(given)) return []
            const { major, course } = found
            return [
              {
                id: found.id,
                number: courseNumber(major.code, course.number),
                title: course.title,
                description: course.description,
                subject: major.subject,
                code: major.code,
                general: major.general || course.general,
                stats: major.stats,
                locationId: given['locationId'] ?? locationId,
                professor: given['professor'],
                teacherId: given['teacherId'],
                studentIds: given['studentIds'],
                meetings: given['meetings']
              }
            ]
          })
        }
      })
  }
}
