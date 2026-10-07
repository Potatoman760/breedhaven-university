import { z } from 'zod'
import { AppointmentSchema } from './appointment'
import { CalendarEventSchema } from './calendar'
import { AttendanceSchema, CourseSchema, GradeSchema } from './course'
import { ChildSchema, PregnancySchema } from './pregnancy'
import { EmploymentSchema } from './job'
import { BondSchema } from './relationship'
import { PostSchema } from './feed'
import { CourierNoteSchema } from './stats'

export const PlayerSchema = z.object({
  name: z.string(),
  stats: z.record(z.string(), z.number()).default({}),
  energy: z.number(),
  maxEnergy: z.number().positive(),
  money: z.number(),
  traitIds: z.array(z.string()).default([])
})
export type Player = z.infer<typeof PlayerSchema>

export const RelationshipStateSchema = z.object({
  affection: z.number(),
  trust: z.number(),
  desire: z.number()
})
export type RelationshipState = z.infer<typeof RelationshipStateSchema>

/** What a love interest retains of one scene: a short summary, not the transcript. */
export const MemorySchema = z.object({
  /** Game time (hours since start) at which the scene ended. */
  time: z.number().int().min(0),
  summary: z.string()
})
export type Memory = z.infer<typeof MemorySchema>

/** One love interest's friends and enemies among the others, by id. */
export const RapportSchema = z.object({ friends: z.array(z.string()), enemies: z.array(z.string()) })
export type Rapport = z.infer<typeof RapportSchema>

/** Everything that changes during play. Plain JSON, so it doubles as the save format. */
export const GameStateSchema = z.object({
  /** Hours elapsed since the calendar's start moment. */
  time: z.number().int().min(0),
  locationId: z.string(),
  player: PlayerSchema,
  /** Keyed by love interest id. */
  relationships: z.record(z.string(), RelationshipStateSchema),
  flags: z.record(z.string(), z.boolean()),
  unlockedCodexIds: z.array(z.string()),
  /** Keyed by love interest id, oldest first. */
  memories: z.record(z.string(), z.array(MemorySchema)),
  /** Plans made with love interests that are still to come. */
  appointments: z.array(AppointmentSchema),
  /** Makes each game's run of weather different. */
  weatherSeed: z.number().int(),
  /** This game's course catalogue, generated when it started. */
  courses: z.array(CourseSchema),
  /** Ids of the courses the player is taking. Null until they have chosen. */
  enrolment: z.array(z.string()).nullable(),
  /** Keyed by course id. */
  attendance: z.record(z.string(), AttendanceSchema),
  /** Training points banked toward the next point of each stat, by stat. */
  training: z.record(z.string(), z.number()),
  /** How much he has trained each stat on one day of the game, so that a day's work on one thing counts for less and less. */
  trainedOn: z.object({ day: z.number().int(), points: z.record(z.string(), z.number()) }),
  /** How far along he is in each course he takes: points earned in class and by study, by course id. */
  coursePoints: z.record(z.string(), z.number()),
  /** The grades he has been given, by course id: at the midterm, and at the final. */
  grades: z.record(z.string(), z.object({ midterm: GradeSchema.optional(), final: GradeSchema.optional() })),
  /** Gifts the player is carrying: how many of each item id. */
  inventory: z.record(z.string(), z.number().int().min(0)),
  /** Pregnancies under way, by the mother's love interest id. */
  pregnancies: z.record(z.string(), PregnancySchema),
  /** The player's children, in order of birth. */
  children: z.array(ChildSchema),
  /** How many steps of orientation the player has attended. */
  orientationStep: z.number().int().min(0),
  /** What the player and love interests have agreed to be to each other. */
  bonds: z.array(BondSchema),
  /** How pairs of love interests feel about each other, keyed by both ids sorted and joined with "|". */
  ties: z.record(z.string(), z.number()),
  /**
   * Who among the love interests is friends with whom, and enemies with whom, by id.
   * Settled when the game begins, and changed by what happens in it.
   */
  rapport: z.record(z.string(), RapportSchema),
  /** What the player has found out about each love interest: fact ids, by love interest id. */
  revealed: z.record(z.string(), z.array(z.string())),
  /** Messages exchanged on Chats, by love interest id, oldest first. */
  courier: z.record(z.string(), z.array(CourierNoteSchema)),
  /** The love interests the player has met, by id: everyone he has been in a scene with. */
  met: z.array(z.string()),
  /** The job the player holds, or null when he has none. */
  job: EmploymentSchema.nullable(),
  /** Jobs he has quit or been let go from. None of them will have him back. */
  formerJobs: z.array(z.string()),
  /** Those who can be messaged, by id: love interests who have given the player their Chats, and the boss of any job he has held. */
  contacts: z.array(z.string()),
  /** The last day on which love interests had their chance to write unprompted. */
  courierDay: z.number().int(),
  /** Posts on Bloomr, oldest first. */
  feed: z.array(PostSchema),
  /** The last day on which love interests posted. */
  feedDay: z.number().int(),
  /** The last day on which the drama engine had someone turn up in a scene. */
  dramaDay: z.number().int(),
  /** Calendar events generated during this playthrough, on top of the authored ones. */
  events: z.array(CalendarEventSchema)
})
export type GameState = z.infer<typeof GameStateSchema>

/** The starting player and location for a new game. */
export const NewGameSchema = z.object({
  player: PlayerSchema,
  locationId: z.string()
})
export type NewGame = z.infer<typeof NewGameSchema>
