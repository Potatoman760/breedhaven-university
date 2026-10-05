import { z } from 'zod'
import { MAX_SCENE_CAST, type ContentPack, type Course, type CourseMeeting, type GameState, type LoveInterest } from '../model'
import type { PerformCheck } from './activities'
import { toDate } from './calendar'
import { applyEffects } from './conditions'

// Titles used when the LLM isn't available, by year of study.
const FALLBACK_TITLES = [
  'Foundations of {subject}',
  'Topics in {subject}',
  'Advanced {subject}',
  'Senior Seminar in {subject}',
  'Graduate Colloquium in {subject}'
]

// How many courses a love interest takes when the LLM isn't available to choose for them.
const FALLBACK_LOAD = 3

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

const clock = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

/** "Solday 08:00" */
export function describeMeetings(course: Course): string {
  return course.meetings.map((m) => `${m.weekday} ${clock(m.startHour)}`).join(' and ')
}

/** The course in a love interest's own subject, which they always take. */
function ownCourseId(li: LoveInterest): string | undefined {
  return li.studies ? `course-${li.id}` : undefined
}

/**
 * Builds this game's catalogue with plain placeholder wording: a course in each love
 * interest's subject, plus the general-education courses, each given one weekly time
 * slot. Nobody but a course's own student is enrolled yet. The LLM may then rewrite the
 * titles, professors and descriptions, and choose everyone's timetable.
 */
export function draftCourses(content: ContentPack): Course[] {
  const config = content.coursework
  if (!config) return []
  const used = new Map<string, number>()
  const base = { locationId: config.locationId, meetings: [] as CourseMeeting[], professor: '' }
  const DEFAULT_STATS = ['intelligence' as const]

  const own = content.loveInterests.flatMap((li): Course[] => {
    if (!li.studies) return []
    const { subject, code, level } = li.studies
    // Second and later courses with the same prefix and level count upward: 101, 102...
    const key = `${code} ${level}`
    const ordinal = (used.get(key) ?? 0) + 1
    used.set(key, ordinal)
    const title = FALLBACK_TITLES[level - 1].replace('{subject}', subject)
    return [
      {
        ...base,
        id: `course-${li.id}`,
        number: `${code} ${level}${String(ordinal).padStart(2, '0')}`,
        title,
        description: `${title}, as taught at the University this term.`,
        subject,
        stats: li.studies.stats ?? DEFAULT_STATS,
        general: false,
        studentIds: [li.id]
      }
    ]
  })
  const general = config.generalEd.map(
    (g): Course => ({
      ...base,
      id: `course-${g.code.toLowerCase()}`,
      number: `${g.code} 101`,
      title: g.subject,
      description: `${g.subject}, a general course open to every student.`,
      subject: g.subject,
      stats: g.stats ?? DEFAULT_STATS,
      general: true,
      studentIds: []
    })
  )

  // Alternate the two kinds so every day of the week gets a mix.
  const courses: Course[] = []
  for (let i = 0; i < Math.max(own.length, general.length); i++) {
    if (own[i]) courses.push(own[i])
    if (general[i]) courses.push(general[i])
  }

  // Every day and start time a class can be given, in order through the week. Stepping
  // through them by a stride that shares no factor with their number visits each once,
  // scattering neighbouring courses across the week.
  const slots: CourseMeeting[] = config.weekdays.flatMap((weekday) =>
    config.startHours.map((startHour) => ({ weekday, startHour }))
  )
  let stride = Math.min(3, slots.length)
  while (stride > 1 && gcd(stride, slots.length) !== 1) stride++

  return courses.map((course, i) => ({
    ...course,
    professor: config.professors[i % Math.max(1, config.professors.length)] ?? 'To be announced',
    meetings: [slots[(i * stride) % slots.length]]
  }))
}

/** Reads the first JSON value of the given bracket kind out of an LLM reply. */
function extractJson(reply: string, open: '[' | '{'): unknown {
  const start = reply.indexOf(open)
  const end = reply.lastIndexOf(open === '[' ? ']' : '}')
  if (start < 0 || end < start) return undefined
  try {
    return JSON.parse(reply.slice(start, end + 1))
  } catch {
    return undefined
  }
}

/** The prompt asking the LLM to name and describe the drafted courses, as a JSON array. */
export function buildCoursePrompt(content: ContentPack, drafts: Course[]): { system: string; user: string } {
  const system = [
    'You write the course catalogue for a university in a low-fantasy, low-technology ' +
      'medieval setting. Courses are taught by lecture and disputation; there is no modern science or technology.',
    'Reply with only a JSON array and nothing else, with one object per course, in the order given. Each object has:',
    '- "title": the course title, a few words, fitting its subject and level',
    '- "professor": the name of the professor, with a title such as Magistra, Magister or Doctor',
    '- "description": one or two sentences, as it would read in a catalogue'
  ].join('\n')

  const lore = content.codex.filter((entry) => entry.alwaysInclude && entry.startsUnlocked)
  const levelOf = (course: Course): string => {
    if (course.general) return 'general-education course open to all years'
    const level = content.loveInterests.find((li) => ownCourseId(li) === course.id)?.studies?.level ?? 1
    return level >= 5 ? 'graduate course' : `year ${level} undergraduate course`
  }
  const user = [
    ...(lore.length > 0 ? ['Setting:', ...lore.map((e) => `- ${e.title}: ${e.content}`), ''] : []),
    `Write ${drafts.length} courses:`,
    ...drafts.map((c, i) => `${i + 1}. ${c.number}: subject ${c.subject}, ${levelOf(c)}`)
  ].join('\n')
  return { system, user }
}

const GeneratedCourseSchema = z.object({
  title: z.string().trim().min(1),
  professor: z.string().trim().min(1),
  description: z.string().trim().default('')
})

/**
 * Merges the LLM's wording into the drafts, by position. A course whose entry is missing
 * or malformed keeps its draft wording. Throws only when the reply has no JSON array.
 */
export function parseGeneratedCourses(reply: string, drafts: Course[]): Course[] {
  const entries = extractJson(reply, '[')
  if (!Array.isArray(entries)) throw new Error('The LLM did not return a list of courses.')
  return drafts.map((draft, i) => {
    const parsed = GeneratedCourseSchema.safeParse(entries[i])
    return parsed.success ? { ...draft, ...parsed.data } : draft
  })
}

/** The prompt asking the LLM to choose each love interest's courses for the term, as a JSON object. */
export function buildTimetablePrompt(content: ContentPack, courses: Course[]): { system: string; user: string } {
  const max = content.coursework?.maxCourses ?? 0
  const system = [
    'You decide which courses each student at a university takes this term, to suit who they are.',
    'Reply with only a JSON object and nothing else. Each key is a student id; each value is ' +
      'an array of the course numbers that student takes.',
    'Rules:',
    `- Each student takes between 2 and ${max} courses.`,
    '- A student with a required course must take it.',
    '- Choose the rest by their personality, interests and dislikes. Not everyone takes the same ones.',
    '- Use only the course numbers listed.'
  ].join('\n')

  const user = [
    'Courses:',
    ...courses.map((c) => `- ${c.number}: ${c.title} (${c.subject}), ${describeMeetings(c)}`),
    '',
    'Students:',
    ...content.loveInterests.map((li) => {
      const required = courses.find((c) => c.id === ownCourseId(li))
      return [
        `- ${li.id}: ${li.name}.`,
        required ? `Required: ${required.number}.` : 'No required course.',
        li.personality,
        li.likes.length > 0 ? `Likes ${li.likes.join(', ')}.` : '',
        li.dislikes.length > 0 ? `Dislikes ${li.dislikes.join(', ')}.` : ''
      ]
        .filter(Boolean)
        .join(' ')
    })
  ].join('\n')
  return { system, user }
}

/**
 * A timetable for everyone without the LLM: each love interest takes their own course
 * and a couple of general ones, dealt out in turn so they don't all share the same.
 */
export function fallbackTimetable(content: ContentPack, courses: Course[]): Course[] {
  const general = courses.filter((c) => c.general)
  const taking = new Map<string, Set<string>>(courses.map((c) => [c.id, new Set<string>()]))
  content.loveInterests.forEach((li, i) => {
    const own = ownCourseId(li)
    if (own && taking.has(own)) taking.get(own)!.add(li.id)
    const extras = Math.min(general.length, FALLBACK_LOAD - (own ? 1 : 0))
    for (let k = 0; k < extras; k++) {
      // Spread each student's picks across the list, offset by their position.
      const pick = general[(i + k * Math.max(1, Math.floor(general.length / extras))) % general.length]
      taking.get(pick.id)!.add(li.id)
    }
  })
  return courses.map((c) => ({ ...c, studentIds: [...taking.get(c.id)!] }))
}

/**
 * Applies the LLM's choice of courses for each love interest. Unknown numbers are
 * ignored, a required course is always kept, the load is capped, and anyone the reply
 * leaves out (or leaves with nothing) gets the fallback timetable. Throws only when the
 * reply has no JSON object.
 */
export function parseTimetable(reply: string, content: ContentPack, courses: Course[]): Course[] {
  const chosen = extractJson(reply, '{')
  if (typeof chosen !== 'object' || chosen === null || Array.isArray(chosen)) {
    throw new Error('The LLM did not return a timetable.')
  }
  const max = content.coursework?.maxCourses ?? 0
  const byNumber = new Map(courses.map((c) => [c.number.toLowerCase(), c.id]))
  const fallback = fallbackTimetable(content, courses)
  const taking = new Map<string, string[]>(courses.map((c) => [c.id, []]))

  for (const li of content.loveInterests) {
    const own = ownCourseId(li)
    const asked: unknown = (chosen as Record<string, unknown>)[li.id]
    const picked = (Array.isArray(asked) ? asked : [])
      .map((n) => byNumber.get(String(n).trim().toLowerCase()))
      .filter((id): id is string => id !== undefined)
    // The required course first, so the cap can never drop it.
    let ids = [...new Set([...(own && taking.has(own) ? [own] : []), ...picked])].slice(0, max)
    if (picked.length === 0) {
      ids = fallback.filter((c) => c.studentIds.includes(li.id)).map((c) => c.id)
    }
    for (const id of ids) taking.get(id)!.push(li.id)
  }
  return courses.map((c) => ({ ...c, studentIds: taking.get(c.id)! }))
}

/** Whether two courses ever meet at the same time. */
export function coursesClash(a: Course, b: Course): boolean {
  return a.meetings.some((m) =>
    b.meetings.some((n) => n.weekday === m.weekday && n.startHour === m.startHour)
  )
}

/** Whether a course can be added to a selection: room left, and no clash with one already picked. */
export function canEnrol(content: ContentPack, state: GameState, selected: string[], courseId: string): PerformCheck {
  const course = state.courses.find((c) => c.id === courseId)
  if (!course) return { ok: false, reasons: ['No such course'] }
  const reasons: string[] = []
  const max = content.coursework?.maxCourses ?? 0
  if (selected.length >= max) reasons.push(`You can take at most ${max} courses`)
  const clash = state.courses.find((c) => selected.includes(c.id) && c.id !== courseId && coursesClash(c, course))
  if (clash) reasons.push(`Meets at the same time as ${clash.number}`)
  return { ok: reasons.length === 0, reasons }
}

/** The courses the player is taking. */
export function enrolledCourses(state: GameState): Course[] {
  return state.courses.filter((c) => state.enrolment?.includes(c.id))
}

/** The meeting of a course that is under way at the current time, if one is. */
export function meetingNow(content: ContentPack, state: GameState, course: Course): CourseMeeting | undefined {
  const date = toDate(content.calendar, state.time)
  const hours = content.coursework?.hours ?? 0
  return course.meetings.find(
    (m) => m.weekday === date.weekday && date.hour >= m.startHour && date.hour < m.startHour + hours
  )
}

/** Courses from the catalogue that are meeting at the current time, whether or not the player takes them. */
export function coursesInSession(content: ContentPack, state: GameState): Course[] {
  return state.courses.filter((course) => meetingNow(content, state, course) !== undefined)
}

export function canAttend(content: ContentPack, state: GameState, courseId: string): PerformCheck {
  const config = content.coursework
  const course = state.courses.find((c) => c.id === courseId)
  if (!config || !course) return { ok: false, reasons: ['No such course'] }

  const reasons: string[] = []
  const date = toDate(content.calendar, state.time)
  const meeting = meetingNow(content, state, course)
  if (!state.enrolment?.includes(courseId)) reasons.push('You are not taking this course')
  if (!meeting) reasons.push('It is not meeting now')
  if (state.locationId !== course.locationId) {
    const where = content.locations.find((l) => l.id === course.locationId)
    reasons.push(`Go to ${where?.name ?? course.locationId} first`)
  }
  if (meeting && state.attendance[courseId]?.last === `${date.dayIndex}:${meeting.startHour}`) {
    reasons.push('You have already sat this class')
  }
  if (state.player.energy < config.energy) reasons.push(`Requires ${config.energy} energy`)
  return { ok: reasons.length === 0, reasons }
}

/** The love interests the player sits with in a class: those they are closest to, up to a scene's worth. */
export function classmates(state: GameState, course: Course): string[] {
  const affection = (id: string) => state.relationships[id]?.affection ?? 0
  return [...course.studentIds]
    .filter((id) => state.relationships[id] !== undefined)
    .sort((a, b) => affection(b) - affection(a))
    .slice(0, MAX_SCENE_CAST)
}

/**
 * Sits the class that is under way, until it ends: raises the stats the course teaches and a little
 * affection with every love interest in the class, and costs energy.
 */
export function attend(content: ContentPack, state: GameState, courseId: string): GameState {
  const check = canAttend(content, state, courseId)
  if (!check.ok) throw new Error(`Cannot attend "${courseId}": ${check.reasons.join('; ')}`)
  const config = content.coursework!
  const course = state.courses.find((c) => c.id === courseId)!
  const date = toDate(content.calendar, state.time)
  const meeting = meetingNow(content, state, course)!

  let after = applyEffects(
    state,
    [
      // The class's worth is shared between what it teaches: all of it to one stat, or half each to two.
      ...course.stats.map((stat) => ({
        type: 'stat' as const,
        stat,
        amount: Math.ceil(config.statGain / course.stats.length)
      })),
      { type: 'energy', amount: -config.energy }
    ],
    { content }
  )
  for (const loveInterestId of course.studentIds) {
    after = applyEffects(
      after,
      [{ type: 'meter', meter: 'affection', amount: config.affection }],
      { content, loveInterestId }
    )
  }
  return {
    ...after,
    // Arriving late still keeps you until the class is over.
    time: after.time + (meeting.startHour + config.hours - date.hour),
    attendance: {
      ...after.attendance,
      [courseId]: {
        count: (after.attendance[courseId]?.count ?? 0) + 1,
        last: `${date.dayIndex}:${meeting.startHour}`
      }
    }
  }
}
