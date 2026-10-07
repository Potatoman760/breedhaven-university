import { z } from 'zod'
import { kindOf, MAX_SCENE_CAST, type Catalogue, type ContentPack, type Course, type CourseMeeting, type CourseworkConfig, type LoveInterest, type Stat } from '../model'

// Titles a course has until the LLM is asked for better ones, by year of study.
const PLAIN_TITLES = [
  'Foundations of {subject}',
  'Topics in {subject}',
  'Advanced {subject}',
  'Senior Seminar in {subject}',
  'Graduate Colloquium in {subject}'
]

// How many courses a student takes: this many, or one more.
const STUDENT_LOAD = 3

// How many courses one request asks the LLM to title.
export const WORDING_BATCH = 20

/** A run of numbers from 0 up to 1 that is the same every time for the same seed. */
function random(seed: number): () => number {
  let a = (seed | 0) + 0x9e3779b9
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The list in an order that depends only on the seed. */
function shuffled<T>(items: T[], next: () => number): T[] {
  return items
    .map((item) => ({ item, order: next() }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item)
}

/** A subject the catalogue has courses in. */
interface Major {
  code: string
  subject: string
  stats: Stat[]
  practical: boolean
  general: boolean
  /** The years a course must exist at: one for each student reading it, and each a love interest teaches. */
  levels: number[]
  /** The love interest who teaches it at a given year, where one does. */
  teachers: Map<number, LoveInterest>
}

function studentsOf(content: ContentPack): LoveInterest[] {
  return content.loveInterests.filter((li) => kindOf(li) === 'student' && li.studies)
}

/** Every subject there are courses in: the love interests' own first, in the order they are listed, then the general ones. */
function majorsOf(content: ContentPack, config: CourseworkConfig): Major[] {
  const majors = new Map<string, Major>()
  const major = (from: { code: string; subject: string; stats: Stat[]; practical: boolean }, general: boolean): Major => {
    const found = majors.get(from.code)
    if (found) return found
    const made: Major = { code: from.code, subject: from.subject, stats: from.stats, practical: from.practical, general, levels: [], teachers: new Map() }
    majors.set(from.code, made)
    return made
  }
  for (const li of content.loveInterests) {
    if (kindOf(li) === 'teacher' && li.teaching) {
      for (const taught of li.teaching.subjects) {
        const m = major(taught, false)
        if (!m.levels.includes(taught.level)) m.levels.push(taught.level)
        if (!m.teachers.has(taught.level)) m.teachers.set(taught.level, li)
      }
    } else if (kindOf(li) === 'student' && li.studies) {
      const m = major(li.studies, false)
      if (!m.levels.includes(li.studies.level)) m.levels.push(li.studies.level)
    }
  }
  for (const general of config.generalEd) {
    const m = major(general, true)
    if (m.general && m.levels.length === 0) m.levels.push(1)
  }
  return [...majors.values()]
}

/** The years a major's courses are taught at: those it must have, then the rest of an undergraduate's four, nearest first. */
function levelsFor(major: Major, wanted: number): number[] {
  if (major.general) return major.levels
  const levels = [...major.levels]
  for (const level of [1, 2, 3, 4]) {
    if (levels.length >= wanted) break
    if (!levels.includes(level)) levels.push(level)
  }
  return levels.sort((a, b) => a - b)
}

const overlap = (a: CourseMeeting, b: CourseMeeting): boolean =>
  a.weekday === b.weekday && a.startHour < b.startHour + b.hours && b.startHour < a.startHour + a.hours

/**
 * Builds the course catalogue by rule, with no LLM: what courses there are, their numbers
 * and professors, when each meets, and which love interests take which. The same seed and
 * the same characters always give the same catalogue.
 *
 * Meetings are placed one at a time, each in the hours with the fewest classes already in
 * them, so the week fills before anything overlaps. Once it is full, classes share hours,
 * but never two of the same major, and never two that the same love interest teaches.
 */
export function buildCatalogue(content: ContentPack, seed: number): Course[] {
  const config = content.coursework
  if (!config) return []
  const next = random(seed)
  const majors = majorsOf(content, config)

  // ---- what courses there are
  const names = shuffled(config.professors, next)
  const courses: Course[] = majors.flatMap((major, m) => {
    const ordinals = new Map<number, number>()
    // One professor to a major, so a department has a face.
    const professor = names.length > 0 ? names[m % names.length] : 'To be announced'
    return levelsFor(major, config.coursesPerMajor).map((level): Course => {
      const ordinal = (ordinals.get(level) ?? 0) + 1
      ordinals.set(level, ordinal)
      const number = `${major.code} ${level}${String(ordinal).padStart(2, '0')}`
      // A love interest who teaches the subject gives every course in it: the one listed for a year
      // where there is one, and otherwise whoever teaches the subject at all.
      const teacher = major.teachers.get(level) ?? [...major.teachers.values()][0]
      const title = major.general ? major.subject : PLAIN_TITLES[level - 1].replace('{subject}', major.subject)
      return {
        id: `course-${number.toLowerCase().replace(/\s+/g, '-')}`,
        number,
        title,
        professor: teacher ? `${teacher.teaching?.title ?? ''} ${teacher.name}`.trim() : professor,
        description: major.general ? `${major.subject}, a general course open to every student.` : `${title}, as taught at the University this term.`,
        subject: major.subject,
        code: major.code,
        level,
        general: major.general,
        stats: major.stats,
        teacherId: teacher?.id,
        studentIds: [],
        locationId: config.locationId,
        meetings: []
      }
    })
  })
  const practical = new Set(majors.filter((major) => major.practical).map((major) => major.code))

  // ---- when each meets
  const lastStart = (hours: number) => config.dayEnd - hours
  /** How many classes are already meeting in each hour of the week. */
  const load = new Map<string, number>()
  const at = (weekday: string, hour: number) => `${weekday} ${hour}`
  const loadOf = (meeting: CourseMeeting) => {
    let most = 0
    for (let h = meeting.startHour; h < meeting.startHour + meeting.hours; h++) most = Math.max(most, load.get(at(meeting.weekday, h)) ?? 0)
    return most
  }
  const place = (course: Course, kind: CourseMeeting['kind'], hours: number): void => {
    const candidates: { meeting: CourseMeeting; load: number; liked: number; order: number }[] = []
    for (const weekday of config.weekdays) {
      // A course's own meetings fall on different days.
      if (course.meetings.some((own) => own.weekday === weekday)) continue
      for (let startHour = config.dayStart; startHour <= lastStart(hours); startHour++) {
        const meeting: CourseMeeting = { weekday, startHour, hours, kind }
        const clashes = (other: Course) => other.meetings.some((theirs) => overlap(meeting, theirs))
        // Never against another course of the same major, nor one the same love interest teaches.
        if (courses.some((other) => other !== course && (other.code === course.code || (course.teacherId !== undefined && other.teacherId === course.teacherId)) && clashes(other))) continue
        // Liked, where there is a choice: its lectures at the same hour, and its professor in one room at a time.
        const sameHour = kind === 'lecture' && course.meetings.some((own) => own.kind === 'lecture' && own.startHour === startHour)
        const twoRooms = courses.some((other) => other !== course && other.professor === course.professor && clashes(other))
        candidates.push({ meeting, load: loadOf(meeting), liked: (sameHour ? 1 : 0) + (twoRooms ? 0 : 2), order: next() })
      }
    }
    // The emptiest hours first, so nothing overlaps while there is still room.
    candidates.sort((a, b) => a.load - b.load || b.liked - a.liked || a.order - b.order)
    const chosen = candidates[0]?.meeting
    if (!chosen) return
    course.meetings.push(chosen)
    for (let h = chosen.startHour; h < chosen.startHour + chosen.hours; h++) load.set(at(chosen.weekday, h), (load.get(at(chosen.weekday, h)) ?? 0) + 1)
  }
  // Labs first: a long block is the hardest thing to fit.
  for (const course of shuffled(courses.filter((c) => practical.has(c.code)), next)) place(course, 'lab', config.labHours)
  for (let n = 0; n < config.lecturesPerWeek; n++) {
    for (const course of shuffled(courses, next)) place(course, 'lecture', config.lectureHours)
  }
  const dayOf = (meeting: CourseMeeting) => config.weekdays.indexOf(meeting.weekday)
  for (const course of courses) {
    course.meetings.sort((a, b) => (a.kind === b.kind ? dayOf(a) - dayOf(b) || a.startHour - b.startHour : a.kind === 'lecture' ? -1 : 1))
  }

  // ---- who takes what
  const clash = (a: Course, b: Course) => a.meetings.some((m) => b.meetings.some((n) => overlap(m, n)))
  // A class is a scene with everyone in it, so it holds no more love interests than a scene does, its teacher among them.
  const full = (course: Course) => course.studentIds.length + (course.teacherId ? 1 : 0) >= MAX_SCENE_CAST
  const own = (li: LoveInterest) => courses.filter((c) => c.code === li.studies!.code && c.level === li.studies!.level)
  // Everyone into her own major's course first, so that nobody is kept out of it by someone passing through.
  for (const li of studentsOf(content)) for (const course of own(li)) course.studentIds.push(li.id)
  for (const li of studentsOf(content)) {
    const studies = li.studies!
    const taking = own(li)
    const wanted = Math.min(config.maxCourses, Math.max(taking.length, STUDENT_LOAD + (next() < 0.5 ? 0 : 1)))
    // The rest from the general courses and the first-year courses of other subjects: the ones anyone can walk into.
    const open = shuffled(
      courses.filter((c) => c.code !== studies.code && (c.general || c.level === 1)),
      next
    )
    for (const course of open) {
      if (taking.length >= wanted) break
      if (full(course) || taking.some((hers) => clash(hers, course))) continue
      taking.push(course)
      course.studentIds.push(li.id)
    }
  }
  return courses
}

/**
 * What a catalogue is built from, as one string: the rules, and each love interest's place
 * in the University. A saved catalogue whose own differs was built for other characters.
 */
export function catalogueBasis(content: ContentPack): string {
  const config = content.coursework
  if (!config) return ''
  const { weekdays, dayStart, dayEnd, locationId, lectureHours, labHours, lecturesPerWeek, coursesPerMajor, maxCourses, generalEd, professors } = config
  const people = content.loveInterests
    .filter((li) => kindOf(li) !== 'outsider')
    .map((li) => [li.id, li.name, kindOf(li), li.studies ?? null, li.teaching ?? null])
  return JSON.stringify([weekdays, dayStart, dayEnd, locationId, lectureHours, labHours, lecturesPerWeek, coursesPerMajor, maxCourses, generalEd, professors, people])
}

/** Whether the saved catalogue was built for characters or rules that have since changed. */
export function catalogueIsStale(content: ContentPack): boolean {
  return content.catalogue !== undefined && content.catalogue.basis !== catalogueBasis(content)
}

/** A catalogue ready to save: built from the seed, or the courses given, with today's basis. */
export function catalogueOf(content: ContentPack, seed: number, courses: Course[] = buildCatalogue(content, seed)): Catalogue {
  return { seed, basis: catalogueBasis(content), courses }
}

/** The courses a new game starts with: the saved catalogue's, with anyone no longer in the game left off the rolls. */
export function startingCourses(content: ContentPack): Course[] {
  const known = new Set(content.loveInterests.map((li) => li.id))
  return (content.catalogue?.courses ?? []).map((course) => ({
    ...course,
    teacherId: course.teacherId !== undefined && known.has(course.teacherId) ? course.teacherId : undefined,
    studentIds: course.studentIds.filter((id) => known.has(id))
  }))
}

/** The prompt asking the LLM to title and describe some courses, as a JSON object keyed by course number. */
export function buildCourseWordingPrompt(content: ContentPack, courses: Course[]): { system: string; user: string } {
  const system = [
    'You write the course catalogue for a modern university in a magitech fantasy setting, where ' +
      'everyday magic and modern science and technology exist side by side. Courses are taught by lecture ' +
      'and laboratory practical, and read like a real university catalogue.',
    'Reply with only a JSON object and nothing else. Each key is a course number exactly as given; each value is an object with:',
    '- "title": the course title, a few words, fitting its subject and year. Courses in one subject must have different titles.',
    '- "description": one or two sentences, as it would read in a catalogue'
  ].join('\n')

  const lore = content.codex.filter((entry) => entry.alwaysInclude && entry.startsUnlocked)
  const levelOf = (course: Course): string =>
    course.general ? 'general-education course open to all years' : course.level >= 5 ? 'graduate course' : `year ${course.level} undergraduate course`
  const user = [
    ...(lore.length > 0 ? ['Setting:', ...lore.map((e) => `- ${e.title}: ${e.content}`), ''] : []),
    `Write ${courses.length} courses:`,
    ...courses.map(
      (c) => `- ${c.number}: subject ${c.subject}, ${levelOf(c)}${c.meetings.some((m) => m.kind === 'lab') ? ', with a weekly lab' : ''}; taught by ${c.professor}`
    )
  ].join('\n')
  return { system, user }
}

const WordingSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().default('')
})

/**
 * Puts the LLM's titles and descriptions on the courses, by course number. A course the
 * reply leaves out or gets wrong keeps the wording it had. Throws only when the reply
 * holds no JSON object.
 */
export function parseCourseWording(reply: string, courses: Course[]): Course[] {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  let entries: unknown
  try {
    entries = start < 0 || end < start ? undefined : JSON.parse(reply.slice(start, end + 1))
  } catch {
    entries = undefined
  }
  if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) throw new Error('The LLM did not return the courses.')
  const byNumber = new Map(Object.entries(entries).map(([number, value]) => [number.trim().toLowerCase(), value]))
  return courses.map((course) => {
    const parsed = WordingSchema.safeParse(byNumber.get(course.number.toLowerCase()))
    return parsed.success ? { ...course, title: parsed.data.title, description: parsed.data.description || course.description } : course
  })
}
