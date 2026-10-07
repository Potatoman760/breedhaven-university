import { z } from 'zod'
import { StatSchema } from './stats'

/** What a love interest studies: her major. The catalogue has a few courses in it, one of them at her year. */
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

/** What a love interest who teaches at the University teaches. Each subject becomes a course every game. */
export const TeachingSchema = z.object({
  /** The department or college they belong to: "the College of Business". */
  department: z.string(),
  /** How they are styled in the catalogue, before their name: "Professor", "Dr". */
  title: z.string().default('Professor'),
  subjects: z.array(StudiesSchema).min(1)
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
  /** Catalogue number, e.g. `POL 101`. */
  number: z.string(),
  title: z.string(),
  professor: z.string(),
  description: z.string().default(''),
  subject: z.string(),
  /** Its major's catalogue prefix, e.g. `POL`. Two courses with the same one never meet at the same time. */
  code: z.string(),
  /** The year it is taught at: 1-4 for undergraduates, 5 for graduates. */
  level: z.number().int().min(1).max(5),
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
 * its classes and by studying for it, and is graded on what he has at the midterm and at
 * the final: each takes the place of the course's last class of its week.
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
  /** The share of the marks then to be had that is a pass. */
  passAt: z.number().min(0).max(1).default(0.6),
  /** The places that are good for studying, besides his own room and a classmate's. */
  studyLocationIds: z.array(z.string()).default([])
})
export type Grading = z.infer<typeof GradingSchema>

/** A grade given at an examination, kept for what the game later makes of it. */
export const GradeSchema = z.object({
  letter: z.enum(['A', 'B', 'C', 'D', 'F']),
  /** What he had in the course when it was sat, and what was to be had by then. */
  points: z.number(),
  outOf: z.number(),
  passed: z.boolean(),
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
  /** How many courses the catalogue has in each love interest's major. */
  coursesPerMajor: z.number().int().min(1).default(3),
  /** The most courses anyone, player or love interest, may take. */
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
  /** Classes attended so far. */
  count: z.number().int().min(0),
  /** The last meeting attended, so the same class can't be sat twice. */
  last: z.string()
})
export type Attendance = z.infer<typeof AttendanceSchema>
