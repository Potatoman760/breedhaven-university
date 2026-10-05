import { z } from 'zod'
import { StatSchema } from './stats'

/** What a love interest studies. Each one gets a course in their subject at the start of a game. */
export const StudiesSchema = z.object({
  subject: z.string(),
  /** Catalogue prefix, e.g. `POL`. */
  code: z.string(),
  /** Year of study: 1-4 for undergraduates, 5 for graduate students. */
  level: z.number().int().min(1).max(5),
  /** What a class in the subject teaches the player. */
  stats: z.array(StatSchema).min(1).max(2).default(['intelligence'])
})
export type Studies = z.infer<typeof StudiesSchema>

/** A weekly class time: a day and the hour it starts. Its length is the config's `hours`. */
export const CourseMeetingSchema = z.object({
  weekday: z.string(),
  startHour: z.number().int().min(0)
})
export type CourseMeeting = z.infer<typeof CourseMeetingSchema>

/** A course in this game's catalogue. Generated when the game starts and kept in the save. */
export const CourseSchema = z.object({
  id: z.string(),
  /** Catalogue number, e.g. `POL 101`. */
  number: z.string(),
  title: z.string(),
  professor: z.string(),
  description: z.string().default(''),
  subject: z.string(),
  /** A general-education course open to everyone, as opposed to one in a student's own subject. */
  general: z.boolean().default(false),
  /** The stats a class raises: one or two, mostly intelligence, wisdom or charisma. */
  stats: z.array(StatSchema).min(1).max(2).default(['intelligence']),
  /** The love interests taking this course this term. */
  studentIds: z.array(z.string()).default([]),
  locationId: z.string(),
  /** When it meets. New catalogues give every course exactly one weekly slot. */
  meetings: z.array(CourseMeetingSchema)
})
export type Course = z.infer<typeof CourseSchema>

/** A general-education course every game's catalogue includes. */
export const GeneralCourseSchema = z.object({
  /** Catalogue prefix, e.g. `HIS`. */
  code: z.string(),
  subject: z.string(),
  stats: z.array(StatSchema).min(1).max(2).default(['intelligence'])
})
export type GeneralCourse = z.infer<typeof GeneralCourseSchema>

/** The rules for coursework. A content pack without this has no courses. */
export const CourseworkConfigSchema = z.object({
  /** Days on which classes meet. */
  weekdays: z.array(z.string()).min(1),
  /** The hours of the day at which a class can start. With `weekdays` these make the time slots. */
  startHours: z.array(z.number().int().min(0)).min(1),
  /** Where classes are held. */
  locationId: z.string(),
  /** How long one class lasts. */
  hours: z.number().int().min(1).default(2),
  /** The most courses anyone, player or love interest, may take. */
  maxCourses: z.number().int().min(1).default(5),
  /** What attending one class gives and costs. */
  /** Stat points one class is worth, shared between the stats the course teaches. */
  statGain: z.number().int().min(0).default(2),
  energy: z.number().default(15),
  /** Affection gained with each classmate for sitting through a class together. */
  affection: z.number().default(1),
  /** General-education courses offered alongside the love interests' own subjects. */
  generalEd: z.array(GeneralCourseSchema).default([]),
  /** Names used for professors when the LLM isn't available to invent them. */
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
