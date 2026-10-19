import { courseId, courseNumber, kindOf, type Catalogue, type ContentPack, type Course, type CourseMeeting, type LoveInterest } from '../model'

// How many courses of her own major a student takes, and how many besides.
const MAJOR_COURSES = 2
const ELECTIVES = 2

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

function studentsOf(content: ContentPack): LoveInterest[] {
  return content.loveInterests.filter((li) => kindOf(li) === 'student' && li.studies)
}

const overlap = (a: CourseMeeting, b: CourseMeeting): boolean =>
  a.weekday === b.weekday && a.startHour < b.startHour + b.hours && b.startHour < a.startHour + a.hours

/**
 * Lays out a term of the courses the curriculum has written, by rule and with no LLM: which of them are given, who
 * gives each, when each meets, and which love interests take which. It writes nothing of what a course is: that is
 * the curriculum's. The same seed and the same characters always give the same catalogue.
 *
 * A course is given when a love interest reads it or teaches it, or it is a general one. Meetings are placed one at
 * a time, each in the hours with the fewest classes already in them, so the week fills before anything overlaps.
 * Once it is full, classes share hours, but never two of the same major, and never two that the same love interest
 * teaches.
 *
 * Every course has a love interest in it, and none is a crowd: each student sits two courses of her own subject,
 * students are spread over the rest so that each has company, and whatever is still empty at the end is not offered.
 * A student's year has no say in it: any course is open to anyone.
 */
export function buildCatalogue(content: ContentPack, seed: number): Course[] {
  const config = content.coursework
  const curriculum = content.curriculum
  if (!config || !curriculum) return []
  const next = random(seed)
  const students = studentsOf(content)
  const teachers = content.loveInterests.filter((li) => kindOf(li) === 'teacher' && li.teaching)
  const majorOf = (li: LoveInterest) => curriculum.majors.find((major) => major.code === li.studies?.code)

  // ---- what courses there are
  const names = shuffled(config.professors, next)
  const courses: Course[] = curriculum.majors.flatMap((major, m) => {
    // One professor to a major, so a department has a face.
    const professor = names.length > 0 ? names[m % names.length] : 'To be announced'
    return major.courses
      .flatMap((written): Course[] => {
        const teacher = teachers.find((li) => li.teaching?.subjects.some((taught) => taught.code === major.code && taught.number === written.number))
        const read = students.some((li) => majorOf(li) === major)
        // Written, and nobody's this term: it waits for someone to read it or teach it.
        const general = major.general || written.general
        if (!general && !teacher && !read) return []
        return [
          {
            id: courseId(major.code, written.number),
            number: courseNumber(major.code, written.number),
            title: written.title,
            professor: teacher ? `${teacher.teaching?.title ?? ''} ${teacher.name}`.trim() : professor,
            description: written.description,
            subject: major.subject,
            code: major.code,
            general,
            stats: major.stats,
            teacherId: teacher?.id,
            studentIds: [],
            locationId: config.locationId,
            meetings: []
          }
        ]
      })
  })
  const practical = new Set(curriculum.majors.filter((major) => major.practical).map((major) => major.code))

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
  // How many love interests a class has in it, its teacher among them, and whether it can take another passing through.
  const inClass = (course: Course) => course.studentIds.length + (course.teacherId ? 1 : 0)
  const full = (course: Course) => inClass(course) >= config.maxPerClass
  // Everyone into two courses of her own subject first, before anyone passing through: one nobody teaches before one a
  // love interest does, and the emptiest first, so that the places go round those who study it. Only where there is
  // no room left among them does a class of her subject take a third.
  const own = (li: LoveInterest): Course[] => {
    const hers = courses
      .filter((course) => course.code === li.studies!.code)
      .sort((a, b) => Number(a.teacherId !== undefined) - Number(b.teacherId !== undefined) || inClass(a) - inClass(b))
    const roomy = hers.filter((course) => !full(course))
    const chosen = [...roomy, ...hers.filter((course) => !roomy.includes(course) && inClass(course) < config.maxMajorClass)].slice(0, MAJOR_COURSES)
    for (const course of chosen) course.studentIds.push(li.id)
    return chosen
  }
  const taking = new Map(shuffled(students, next).map((li) => [li.id, own(li)]))
  // Then her electives, one at a time and turn about, so that the places go round: any course of another subject. Of
  // those she takes first a class whose teacher has nobody yet, then one nobody is in, then one where she would have
  // company; so every class comes to have someone in it before any has two.
  const worth = (course: Course): number => (course.teacherId && course.studentIds.length === 0 ? 0 : inClass(course) === 0 ? 1 : 2)
  for (let round = 0; round < ELECTIVES; round++) {
    for (const li of shuffled(students, next)) {
      const hers = taking.get(li.id)!
      if (hers.length >= config.maxCourses) continue
      const open = shuffled(
        courses.filter((c) => c.code !== li.studies!.code && !hers.includes(c) && !full(c) && !hers.some((one) => clash(one, c))),
        next
      ).sort((a, b) => worth(a) - worth(b))
      const course = open[0]
      if (!course) continue
      hers.push(course)
      course.studentIds.push(li.id)
    }
  }
  return courses.filter((course) => inClass(course) > 0)
}

/** The courses the curriculum has written that a catalogue does not give, each with why: nobody reads or teaches it. */
export function dormantCourses(content: ContentPack, courses: Course[]): { number: string; title: string }[] {
  return (content.curriculum?.majors ?? []).flatMap((major) =>
    major.courses
      .filter((written) => !courses.some((course) => course.id === courseId(major.code, written.number)))
      .map((written) => ({ number: courseNumber(major.code, written.number), title: written.title }))
  )
}

/**
 * What a catalogue is built from, as one string: the rules, the courses there are to give, and each love interest's
 * place in the University. A saved catalogue whose own differs was built for other characters.
 */
export function catalogueBasis(content: ContentPack): string {
  const config = content.coursework
  if (!config) return ''
  const { weekdays, dayStart, dayEnd, locationId, lectureHours, labHours, lecturesPerWeek, maxPerClass, maxCourses, professors } = config
  const written = (content.curriculum?.majors ?? []).map((major) => [major.code, major.general, major.practical, major.courses.map((course) => course.number)])
  const people = content.loveInterests
    .filter((li) => kindOf(li) !== 'outsider')
    .map((li) => [li.id, li.name, kindOf(li), li.studies ? li.studies.code : null, li.teaching ? [li.teaching.title, li.teaching.subjects.map((subject) => [subject.code, subject.number])] : null])
  return JSON.stringify([weekdays, dayStart, dayEnd, locationId, lectureHours, labHours, lecturesPerWeek, maxPerClass, maxCourses, professors, written, people])
}

/** Whether the saved catalogue was built for characters or rules that have since changed. */
export function catalogueIsStale(content: ContentPack): boolean {
  return content.catalogue !== undefined && content.catalogue.basis !== catalogueBasis(content)
}

/** A catalogue ready to save: built from the seed, or the courses given, with today's basis. */
export function catalogueOf(content: ContentPack, seed: number, courses: Course[] = buildCatalogue(content, seed)): Catalogue {
  return { seed, basis: catalogueBasis(content), courses }
}

/**
 * A catalogue as it is kept on disk: only what was worked out for each course. What a course is called and what it
 * teaches is the curriculum's to say, and is put back from there when the pack is read.
 */
export function writtenCatalogue(catalogue: Catalogue): { seed: number; basis: string; courses: Pick<Course, 'id' | 'professor' | 'teacherId' | 'studentIds' | 'meetings'>[] } {
  return { seed: catalogue.seed, basis: catalogue.basis, courses: catalogue.courses.map(({ id, professor, teacherId, studentIds, meetings }) => ({ id, professor, teacherId, studentIds, meetings })) }
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
