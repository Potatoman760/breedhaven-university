import { z } from 'zod'
import { StatSchema } from './stats'

/** One weekly shift of a job: a day, the hour it starts, and how long it runs. */
export const ShiftSchema = z.object({
  weekday: z.string(),
  startHour: z.number().int().min(0),
  hours: z.number().int().min(1)
})
export type Shift = z.infer<typeof ShiftSchema>

/**
 * A job the player can hold at a place: who he works for, what it pays an hour, what he
 * has to be to get it, and the shifts he is expected at each week. The shifts are settled
 * in the content, so a job is the same in every game.
 */
export const JobSchema = z.object({
  id: z.string(),
  /** What he is there: "Barista". */
  title: z.string(),
  /** A line or two for the job board: what the work is. */
  description: z.string().default(''),
  locationId: z.string(),
  /** The NPC he answers to. She is at work for every shift, and is in his Chats from the day he is taken on. */
  bossId: z.string(),
  /** Money for each hour worked. Better-paid jobs ask more of him. */
  hourlyRate: z.number().min(0),
  /** The stat the work itself builds, an hour of it for each hour of a shift. */
  trains: StatSchema.optional(),
  /** The least he must have of each stat named to be taken on. */
  requirements: z.partialRecord(StatSchema, z.number()).default({}),
  shifts: z.array(ShiftSchema).min(1)
})
export type Job = z.infer<typeof JobSchema>

/** The rules for jobs, and the jobs there are. A content pack without this has none. */
export const JobsConfigSchema = z.object({
  /** What an hour of work costs. */
  energyPerHour: z.number().default(5),
  /** How many strikes lose him the job. */
  strikes: z.number().min(1).default(3),
  /** What a missed shift counts for, and what it counts for when he told his boss beforehand. */
  missedStrike: z.number().default(1),
  excusedStrike: z.number().default(0.5),
  jobs: z.array(JobSchema).default([])
})
export type JobsConfig = z.infer<typeof JobsConfigSchema>

/** The job the player holds, and how he is doing at it. */
export const EmploymentSchema = z.object({
  jobId: z.string(),
  /** When he was taken on. Shifts before it are not his. */
  hiredAt: z.number().int(),
  strikes: z.number(),
  /** The game time up to which his shifts have been counted as worked or missed. */
  settledTo: z.number().int(),
  /** Shifts he has clocked in for, each as `day:startHour`. */
  worked: z.array(z.string()),
  /** Shifts he has told his boss he cannot make, likewise. */
  excused: z.array(z.string())
})
export type Employment = z.infer<typeof EmploymentSchema>

/** The shift a scene is, when it is one: paid when the scene ends. */
export const SceneShiftSchema = z.object({
  jobId: z.string(),
  key: z.string(),
  hours: z.number().int().min(1)
})
export type SceneShift = z.infer<typeof SceneShiftSchema>
