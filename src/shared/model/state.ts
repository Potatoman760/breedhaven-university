import { z } from 'zod'
import { AppointmentSchema } from './appointment'
import { CalendarEventSchema } from './calendar'
import { AttendanceSchema, CourseSchema } from './course'
import { BondSchema } from './relationship'
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
  affection: z.number().default(0),
  trust: z.number().default(0),
  desire: z.number().default(0)
})
export type RelationshipState = z.infer<typeof RelationshipStateSchema>

/** What a love interest retains of one scene: a short summary, not the transcript. */
export const MemorySchema = z.object({
  /** Game time (hours since start) at which the scene ended. */
  time: z.number().int().min(0),
  summary: z.string()
})
export type Memory = z.infer<typeof MemorySchema>

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
  memories: z.record(z.string(), z.array(MemorySchema)).default({}),
  /** Plans made with love interests that are still to come. */
  appointments: z.array(AppointmentSchema).default([]),
  /** Makes each game's run of weather different. */
  weatherSeed: z.number().int().default(0),
  /** This game's course catalogue, generated when it started. */
  courses: z.array(CourseSchema).default([]),
  /** Ids of the courses the player is taking. Null until they have chosen. */
  enrolment: z.array(z.string()).nullable().default(null),
  /** Keyed by course id. */
  attendance: z.record(z.string(), AttendanceSchema).default({}),
  /** Gifts the player is carrying: how many of each item id. */
  inventory: z.record(z.string(), z.number().int().min(0)).default({}),
  /** What the player and love interests have agreed to be to each other. */
  bonds: z.array(BondSchema).default([]),
  /** How pairs of love interests feel about each other, keyed by both ids sorted and joined with "|". */
  ties: z.record(z.string(), z.number()).default({}),
  /** Notes exchanged by courier, by love interest id, oldest first. */
  courier: z.record(z.string(), z.array(CourierNoteSchema)).default({}),
  /** The last day on which love interests had their chance to write unprompted. */
  courierDay: z.number().int().default(-1),
  /** Calendar events generated during this playthrough, on top of the authored ones. */
  events: z.array(CalendarEventSchema).default([])
})
export type GameState = z.infer<typeof GameStateSchema>

/** The starting player and location for a new game. */
export const NewGameSchema = z.object({
  player: PlayerSchema,
  locationId: z.string()
})
export type NewGame = z.infer<typeof NewGameSchema>
