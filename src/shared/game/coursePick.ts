import type { ContentPack, Course, GameState } from '../model'
import { canEnrol, describeMeetings } from './courses'
import { skillFor } from './skills'

/**
 * Having the LLM choose his courses from what he says he wants: "I want to major in biology", "whatever gets me
 * into bed fastest", "classes with Tamsin". It is shown the catalogue and names courses; which of those he can
 * actually take together is settled here, not by it.
 */

const firstName = (name: string): string => name.split(' ')[0]

/** One course as the LLM is shown it: its number, what it is, when it meets, what it teaches and who is in it. */
function courseLine(content: ContentPack, course: Course): string {
  const skill = skillFor(content, course)
  const people = content.loveInterests.filter((li) => li.id === course.teacherId || course.studentIds.includes(li.id)).map((li) => `${firstName(li.name)}${li.id === course.teacherId ? ' (teaches)' : ''}`)
  return [
    `- ${course.number}: ${course.title} (${course.subject}${course.general ? ', general' : ''}; trains ${course.stats.join(' and ')}).`,
    `Meets ${describeMeetings(course)}.`,
    skill ? `Teaches "${skill.name}": ${skill.description}` : '',
    people.length > 0 ? `With ${people.join(', ')}.` : ''
  ]
    .filter(Boolean)
    .join(' ')
}

/** The prompt asking the LLM to pick courses for what the player typed. */
export function buildCoursePickPrompt(content: ContentPack, state: GameState, text: string): { system: string; user: string } {
  const most = content.coursework?.maxCourses ?? 0
  const system = [
    `You choose a term's courses for ${state.player.name}, a student, from a catalogue, to suit what he says he wants.`,
    'Reply with one JSON object and nothing else:',
    '{"courses": string[], "why": string}',
    `- "courses": the numbers of the courses to take, exactly as listed, best first. Choose ${most}, or fewer only if he asks for fewer.`,
    '- No two may meet on the same day at the same hour.',
    '- "why": one or two sentences to him, saying what you chose and why it suits what he asked.',
    'Use only course numbers from the catalogue.'
  ].join('\n')
  const user = [`He says: "${text}"`, '', 'Catalogue:', ...state.courses.map((course) => courseLine(content, course))].join('\n')
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
  if (!found) throw new Error('The reply was not a choice of courses.')
  let read: { courses?: unknown; why?: unknown }
  try {
    read = JSON.parse(found[0]) as { courses?: unknown; why?: unknown }
  } catch {
    throw new Error('The reply was not a choice of courses.')
  }
  const named = Array.isArray(read.courses) ? read.courses.filter((one): one is string => typeof one === 'string') : []
  const plain = (number: string) => number.toLowerCase().replace(/[^a-z0-9]/g, '')
  const courseIds: string[] = []
  const dropped: string[] = []
  for (const number of named) {
    // Named by its number, however it was spaced; a title after it is let by.
    const course = state.courses.find((one) => plain(one.number) === plain(number) || plain(number).startsWith(plain(one.number)))
    if (!course || courseIds.includes(course.id)) continue
    if (canEnrol(content, state, courseIds, course.id).ok) courseIds.push(course.id)
    else dropped.push(course.number)
  }
  if (courseIds.length === 0) throw new Error('None of the courses it named are in the catalogue.')
  return { courseIds, why: typeof read.why === 'string' ? read.why.trim() : '', dropped }
}
