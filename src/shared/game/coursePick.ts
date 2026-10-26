import type { ContentPack, Course, GameState } from '../model'
import { canEnrol, courseLabel, describeMeetings } from './courses'
import { skillFor } from './skills'
import { t } from '../i18n'

/**
 * Having the LLM choose his courses from what he says he wants: "I want to major in biology", "whatever gets me
 * into bed fastest", "classes with Tamsin". It is shown the catalogue and names courses; which of those he can
 * actually take together is settled here, not by it.
 */

const firstName = (name: string): string => name.split(' ')[0]

/** One course as the LLM is shown it: its number, what it is, when it meets, what it teaches and who is in it. */
function courseLine(content: ContentPack, course: Course): string {
  const skill = skillFor(content, course)
  const people = content.loveInterests.filter((li) => li.id === course.teacherId || course.studentIds.includes(li.id)).map((li) => `${firstName(li.name)}${li.id === course.teacherId ? t('llm.coursePick.teaches') : ''}`)
  return [
    t('llm.coursePick.course', { label: courseLabel(course), title: course.title, subject: course.subject, general: Boolean(course.general), stats: course.stats.join(t('llm.coursePick.and')) }),
    t('llm.coursePick.meets', { meetings: describeMeetings(course) }),
    skill ? t('llm.coursePick.skill', { name: skill.name, description: skill.description }) : '',
    people.length > 0 ? t('llm.coursePick.with', { people: people.join(', ') }) : ''
  ]
    .filter(Boolean)
    .join(' ')
}

/** The prompt asking the LLM to pick courses for what the player typed. */
export function buildCoursePickPrompt(content: ContentPack, state: GameState, text: string): { system: string; user: string } {
  const most = content.coursework?.maxCourses ?? 0
  const system = [
    t('llm.coursePick.systemRole', { player: state.player.name }),
    t('llm.coursePick.systemReply'),
    '{"courses": string[], "why": string}',
    t('llm.coursePick.systemCourses', { field: '"courses"', most }),
    t('llm.coursePick.systemClash'),
    t('llm.coursePick.systemWhy', { field: '"why"' }),
    t('llm.coursePick.systemOnly')
  ].join('\n')
  const user = [t('llm.coursePick.says', { text }), '', t('llm.coursePick.catalog'), ...state.courses.map((course) => courseLine(content, course))].join('\n')
  return { system, user }
}

/** What the LLM chose, as far as it can be taken: the courses, and what it said of them. */
export interface CoursePick {
  courseIds: string[]
  why: string
  /** Courses it named that could not be taken with the rest, by number: a clash, or one too many. */
  dropped: string[]
}

/**
 * Reads the LLM's choice. Each course it names is taken in turn if it is in the catalogue and can be taken with
 * those before it; one that clashes or is one too many is left out and said so. Throws when nothing in the reply
 * can be read as a choice.
 */
export function parseCoursePick(reply: string, content: ContentPack, state: GameState): CoursePick {
  const found = /\{[\s\S]*\}/.exec(reply)
  if (!found) throw new Error(t('llm.coursePick.notChoice'))
  let read: { courses?: unknown; why?: unknown }
  try {
    read = JSON.parse(found[0]) as { courses?: unknown; why?: unknown }
  } catch {
    throw new Error(t('llm.coursePick.notChoice'))
  }
  const named = Array.isArray(read.courses) ? read.courses.filter((one): one is string => typeof one === 'string') : []
  const plain = (number: string) => number.toLowerCase().replace(/[^a-z0-9]/g, '')
  const courseIds: string[] = []
  const dropped: string[] = []
  for (const number of named) {
    // Named by its number, however it was spaced; a title after it is let by. A section named is that section; a
    // course given more than once and named by its number alone is whichever section of it he can take.
    const exact = state.courses.find((one) => one.section !== undefined && plain(courseLabel(one)) === plain(number))
    const candidates = exact ? [exact] : state.courses.filter((one) => plain(one.number) === plain(number) || plain(number).startsWith(plain(one.number)))
    if (candidates.length === 0 || candidates.some((one) => courseIds.includes(one.id))) continue
    const course = candidates.find((one) => canEnrol(content, state, courseIds, one.id).ok)
    if (course) courseIds.push(course.id)
    else dropped.push(courseLabel(candidates[0]))
  }
  if (courseIds.length === 0) throw new Error(t('llm.coursePick.noneFound'))
  return { courseIds, why: typeof read.why === 'string' ? read.why.trim() : '', dropped }
}
