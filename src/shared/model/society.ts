import { z } from 'zod'
import { IntroSchema } from './orientation'
import { StatSchema } from './stats'

/**
 * A meeting of a society that is more than its usual hour: a written setup, read as a cutscene, and then a scene with
 * everyone of it who is there in which nothing holds anyone back. `{player}` is filled in.
 */
export const AdultEventSchema = z.object({
  /** Which of his own meetings of the society it is, counted from 1. */
  meeting: z.number().int().min(1),
  name: z.string(),
  intro: IntroSchema,
  /** Told to the LLM: what is going on tonight, in a sentence or two. */
  direction: z.string(),
  /**
   * Those held to their own wishes tonight, unless he has been to bed with her before: then she is as free as everyone
   * else, and the night is told the way written for that (`ifIntimate`), where there is one.
   */
  reserved: z
    .array(z.object({ loveInterestId: z.string(), ifIntimate: z.object({ intro: IntroSchema, direction: z.string() }).optional() }))
    .default([])
})
export type AdultEvent = z.infer<typeof AdultEventSchema>

/**
 * A student society: a club that meets once a week for an hour after classes, at a place of its own. A couple of
 * students belong to each, and the player may join it: a meeting is a scene with them, and trains what it is about.
 */
export const SocietySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** What it is and what its meetings are like, for the player and the LLM. */
  description: z.string(),
  locationId: z.string(),
  /** The day of the week it meets, one of the calendar's `weekdays`, and the hour it starts. */
  weekday: z.string(),
  startHour: z.number().int().min(0).max(23),
  /** What a meeting trains: its hour's worth is shared between them, as a class's is. */
  stats: z.array(StatSchema).min(1).max(2),
  /** The students who belong to it. */
  memberIds: z.array(z.string()).default([]),
  /** The teacher who sponsors it: at its meetings and its table at the fair, but not one of its members. */
  sponsorId: z.string().optional(),
  /** Its emblem: a picture in the pack, shown in place of the drawn icon. */
  iconImage: z.string().optional(),
  /** What each meeting he goes to is about, in order, a line or two each: the first he attends is the first. */
  syllabus: z.array(z.string()).default([]),
  /** The meetings that are more than that, by which of his it is. */
  adultEvents: z.array(AdultEventSchema).default([])
})
export type Society = z.infer<typeof SocietySchema>

/** A spot on the fair's picture, in percent of it from its top left corner. */
const SpotSchema = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })

/**
 * The societies' fair: each society's table on the picture of it, with what it gives away to whoever stops by; who
 * wanders the fair without a table; what each of them says to him on saying hello; and the scene two rival tables make
 * once he has been to both. Its picture is the view of the fair's place whose id is the fair's.
 */
export const SocietiesFairSchema = z.object({
  tables: z.array(SpotSchema.extend({ societyId: z.string(), gift: z.string().optional() })),
  visitors: z.array(SpotSchema.extend({ id: z.string() })).default([]),
  /**
   * By booth (a society's id, or a visitor's): the hello read there as a cutscene, one for each company that stands at
   * it, since the students take turns at their tables. Lines start with the speaker's name or are *narration*.
   */
  hellos: z.record(z.string(), z.array(z.object({ cast: z.array(z.string()).min(1), lines: z.array(z.string()).min(1) })).min(1)),
  rivalry: z.object({ societyIds: z.tuple([z.string(), z.string()]), intro: IntroSchema }).optional()
})
export type SocietiesFair = z.infer<typeof SocietiesFairSchema>

export const SocietiesConfigSchema = z.object({
  /** The event at which the societies sign up new members: none can be joined, and none meets, before it begins. */
  fairId: z.string(),
  /** How long a meeting runs. */
  hours: z.number().int().min(1).default(1),
  /** The most societies the player may belong to at once, and the most students one society holds. */
  maxJoined: z.number().int().min(1).default(2),
  maxMembers: z.number().int().min(1).default(2),
  /** Stat points an hour of a meeting is worth, and what it costs. */
  statGain: z.number().min(0).default(1),
  energy: z.number().default(6),
  societies: z.array(SocietySchema),
  fair: SocietiesFairSchema.optional()
})
export type SocietiesConfig = z.infer<typeof SocietiesConfigSchema>
