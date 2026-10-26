import { z } from 'zod'
import { StatSchema } from './stats'

/** What a love interest studies: her major, two courses of which she takes. Her year is who she is, not what she may take. */
export const StudiesSchema = z.object({
  subject: z.string(),
  /** Catalogue prefix, e.g. `POL`. */
  code: z.string(),
  /** Year of study: 1-4 for undergraduates, 5 for graduate students. */
  level: z.number().int().min(1).max(5),
  /** What a class in the subject teaches the player. */
  stats: z.array(StatSchema).min(1).max(2).default(['intelligence']),
  /** A practical subject: its courses have a weekly lab as well as their lectures. */
  practical: z.boolean().default(false)
})
export type Studies = z.infer<typeof StudiesSchema>

/** A course a teacher gives: its subject, and its number in that subject (`143` for `KIN 143`). */
export const TaughtSchema = StudiesSchema.omit({ level: true }).extend({ number: z.string() })
export type Taught = z.infer<typeof TaughtSchema>

/** What a love interest who teaches at the University teaches. Each of the courses is hers every game. */
export const TeachingSchema = z.object({
  /** The department or college they belong to: "the College of Business". */
  department: z.string(),
  /** How they are styled in the catalogue, before their name: "Professor", "Dr". */
  title: z.string().default('Professor'),
  subjects: z.array(TaughtSchema).min(1)
})
export type Teaching = z.infer<typeof TeachingSchema>

export const MEETING_KINDS = ['lecture', 'lab'] as const

/** A weekly class time: a day, the hour it starts, and how long it runs. A lecture is short; a lab is a long block. */
export const CourseMeetingSchema = z.object({
  weekday: z.string(),
  startHour: z.number().int().min(0),
  hours: z.number().int().min(1),
  kind: z.enum(MEETING_KINDS)
})
export type CourseMeeting = z.infer<typeof CourseMeetingSchema>

/** A course in the catalogue. Built in the editor before a game starts, and kept in the save. */
export const CourseSchema = z.object({
  id: z.string(),
  /**
   * A course too full for everyone who wants it is given more than once. Each further section is a class of its own,
   * with its own hours and roll, and names here the course it is a section of and which section it is. The first
   * section is the course itself, and has neither.
   */
  courseId: z.string().optional(),
  section: z.number().int().min(2).optional(),
  /** Catalog number, e.g. `POL 132`. */
  number: z.string(),
  title: z.string(),
  professor: z.string(),
  description: z.string().default(''),
  subject: z.string(),
  /** Its major's catalogue prefix, e.g. `POL`. Two courses with the same one never meet at the same time. */
  code: z.string(),
  /** A general-education course open to everyone, as opposed to one in a student's own subject. */
  general: z.boolean().default(false),
  /** The stats a class raises: one or two, mostly intelligence, wisdom or charisma. */
  stats: z.array(StatSchema).min(1).max(2).default(['intelligence']),
  /** The love interest who teaches it, when one does. Its professor is then that person. */
  teacherId: z.string().optional(),
  /** The love interests taking this course this term. */
  studentIds: z.array(z.string()).default([]),
  locationId: z.string(),
  /** When it meets each week: its lectures, and its lab if it has one. */
  meetings: z.array(CourseMeetingSchema)
})
export type Course = z.infer<typeof CourseSchema>

/**
 * The course catalogue every new game starts with, built in the editor. `basis` is a
 * fingerprint of what it was built from, so that it can be told when the characters or the
 * rules have changed since.
 */
export const CatalogueSchema = z.object({
  seed: z.number().int(),
  basis: z.string(),
  courses: z.array(CourseSchema)
})
export type Catalogue = z.infer<typeof CatalogueSchema>

/** A general-education course every game's catalogue includes. */
export const GeneralCourseSchema = z.object({
  /** Catalogue prefix, e.g. `HIS`. */
  code: z.string(),
  subject: z.string(),
  stats: z.array(StatSchema).min(1).max(2).default(['intelligence']),
  /** A practical subject, with a weekly lab. */
  practical: z.boolean().default(false)
})
export type GeneralCourse = z.infer<typeof GeneralCourseSchema>

export const EXAM_KINDS = ['midterm', 'final'] as const
export type ExamKind = (typeof EXAM_KINDS)[number]

/**
 * How a course is marked. The player fills a course's points up over the term, by sitting
 * its classes and by studying for it, and is graded at the midterm and at the final, each of
 * which takes the place of the course's last class of its week: on the points he has, and
 * what he answers on the day.
 */
export const GradingSchema = z.object({
  /** Full marks in a course. */
  points: z.number().min(1).default(100),
  /** How many of them sitting every class of the term comes to. The rest has to be studied for. */
  attendanceShare: z.number().min(0).default(60),
  /** What an hour of study is worth, and how long a session of it is. */
  studyPerHour: z.number().min(0).default(2),
  studyHours: z.number().int().min(1).default(2),
  /** What a session in his own room is worth on top. */
  ownRoomBonus: z.number().min(0).default(1),
  /** The weeks of the term, counted from 1, in which the examinations fall. The final week is the last of teaching. */
  midtermWeek: z.number().int().min(1).default(9),
  finalWeek: z.number().int().min(1).default(18),
  /** The share of the marks then to be had that is a pass, and a C: under it he fails. */
  passAt: z.number().min(0).max(1).default(0.6),
  /** The share that is the mark the course asks for, and a B. */
  markAt: z.number().min(0).max(1).default(0.8),
  /** How many questions an examination asks, each on a topic of a class he sat. All of them right lifts a pass by a letter. */
  examQuestions: z.number().int().min(0).default(3),
  /** The places that are good for studying, besides his own room and a classmate's. */
  studyLocationIds: z.array(z.string()).default([])
})
export type Grading = z.infer<typeof GradingSchema>

/** A grade given at an examination, kept for what the game later makes of it. */
export const GradeSchema = z.object({
  letter: z.enum(['A', 'B', 'C', 'F']),
  /** What he had in the course when it was sat, and what was to be had by then. */
  points: z.number(),
  outOf: z.number(),
  passed: z.boolean(),
  /** Whether he turned up for it. One he did not sit is failed. */
  sat: z.boolean(),
  /** The topics it asked him about, by their place in the syllabus, and how many he answered rightly. */
  topics: z.array(z.number().int().min(0)),
  correct: z.number().int().min(0),
  /** The game time it was given. */
  time: z.number().int()
})
export type Grade = z.infer<typeof GradeSchema>

/** The rules for coursework. A content pack without this has no courses. */
export const CourseworkConfigSchema = z.object({
  /** Days on which classes meet. */
  weekdays: z.array(z.string()).min(1),
  /** The teaching day: classes start no earlier than `dayStart` and are over by `dayEnd`. With `weekdays` these make the week's grid of hours. */
  dayStart: z.number().int().min(0).default(8),
  dayEnd: z.number().int().min(1).default(18),
  /** Where classes are held. */
  locationId: z.string(),
  /** How long a lecture and a lab run, and how many lectures a course has each week. */
  lectureHours: z.number().int().min(1).default(1),
  labHours: z.number().int().min(1).default(3),
  lecturesPerWeek: z.number().int().min(1).default(2),
  /** The most love interests one class holds, its teacher among them: few enough that sitting in it is time with them. */
  maxPerClass: z.number().int().min(1).default(2),
  /** The most a class may come to when those in it read its subject: her own subject's course is hers to sit, whoever else is in it. */
  maxMajorClass: z.number().int().min(1).default(3),
  /** The most courses anyone, player or love interest, may take; the player takes exactly this many, and begins no term with fewer. */
  maxCourses: z.number().int().min(1).default(5),
  /** Stat points an hour of class is worth, shared between the stats the course teaches. */
  statGain: z.number().int().min(0).default(1),
  /** What an hour of class costs. */
  energy: z.number().default(8),
  /** General-education courses offered alongside the love interests' own subjects. */
  generalEd: z.array(GeneralCourseSchema).default([]),
  /** How courses are marked, and where they can be studied for. */
  grading: GradingSchema.prefault({}),
  /** The professors who are not love interests. Each major is given one of them. */
  professors: z.array(z.string()).default([])
})
export type CourseworkConfig = z.infer<typeof CourseworkConfigSchema>

export const AttendanceSchema = z.object({
  /** The classes he has sat, in order, each as its day and the hour it began: "12:9". What he has been taught is worked out from these. */
  sat: z.array(z.string())
})
export type Attendance = z.infer<typeof AttendanceSchema>
