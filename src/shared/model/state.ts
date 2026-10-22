import { z } from 'zod'
import { BoonSchema } from './modifier'
import { ExpeditionStateSchema } from './expedition'
import { HousingStateSchema } from './housing'
import { RoomSchema } from './loveInterest'
import { AppointmentSchema } from './appointment'
import { CalendarEventSchema } from './calendar'
import { AttendanceSchema, CourseSchema, GradeSchema } from './course'
import { ChildSchema, PregnancySchema } from './pregnancy'
import { EmploymentSchema } from './job'
import { BondSchema } from './relationship'
import { PostPlanSchema, PostSchema } from './feed'
import { CourierNoteSchema } from './stats'

export const PlayerSchema = z.object({
  name: z.string(),
  stats: z.record(z.string(), z.number()).default({}),
  energy: z.number(),
  maxEnergy: z.number().positive(),
  money: z.number(),
  /**
   * Who he is, as every character is told it: his age, where he is from, what is known of
   * him. The content has one to start from, and the player may write his own when a game
   * begins; a game keeps the one it began with. `{player}` in it stands for his name.
   */
  bio: z.string().default(''),
  /** What the player added to it when the game began, told along with it. `{player}` stands for his name here too. */
  about: z.string().default('')
})
export type Player = z.infer<typeof PlayerSchema>

export const RelationshipStateSchema = z.object({
  affection: z.number(),
  trust: z.number(),
  desire: z.number()
})
export type RelationshipState = z.infer<typeof RelationshipStateSchema>

/**
 * How much a memory matters to the one who keeps it, most first. A core memory is one that defines what she and the
 * player are to each other; a fleeting one is soon gone. It decides which of her memories she is told in a scene.
 */
export const MEMORY_LEVELS = ['core', 'normal', 'fleeting'] as const
export type MemoryLevel = (typeof MEMORY_LEVELS)[number]
export const MEMORY_LEVEL_LABELS: Record<MemoryLevel, string> = { core: 'Core', normal: 'Normal', fleeting: 'Fleeting' }

/** What a love interest retains of one scene: a short summary, not the transcript. */
export const MemorySchema = z.object({
  /** Game time (hours since start) at which the scene ended. */
  time: z.number().int().min(0),
  summary: z.string(),
  level: z.enum(MEMORY_LEVELS).default('normal')
})
export type Memory = z.infer<typeof MemorySchema>

/** One love interest's friends and enemies among the others, by id. */
export const RapportSchema = z.object({ friends: z.array(z.string()), enemies: z.array(z.string()) })
export type Rapport = z.infer<typeof RapportSchema>

/** Everything that changes during play. Plain JSON, so it doubles as the save format. */
/** The one thing he works on when he has nothing else to do. */
export const FocusSchema = z.object({ kind: z.enum(['stat', 'course']), id: z.string() })
export type Focus = z.infer<typeof FocusSchema>

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
  /** The societies he belongs to, and the meetings of them he has been to, each as `<society id>:<day>`. */
  societies: z.array(z.string()),
  societyMeetings: z.array(z.string()),
  /** Training points banked toward the next point of each stat, by stat. */
  training: z.record(z.string(), z.number()),
  /** How much he has trained each stat on one day of the game, so that a day's work on one thing counts for less and less. */
  trainedOn: z.object({ day: z.number().int(), points: z.record(z.string(), z.number()) }),
  /** What he gives his spare hours to: a stat, or a course he takes. Hours skipped on the way to the next thing are spent on it. */
  focus: FocusSchema.optional(),
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
  /** Each pair of love interests he has seen in a scene together, by tie key: what they are to each other is his to know from then on. */
  seenTogether: z.array(z.string()),
  /** What the player has found out about each love interest: fact ids, by love interest id. */
  revealed: z.record(z.string(), z.array(z.string())),
  /** Messages exchanged in Bloomr DMs, by love interest id, oldest first. */
  courier: z.record(z.string(), z.array(CourierNoteSchema)),
  /** Group chats on Bloomr, by id: what each is called, who is in it besides him, and what has been said in it. */
  groupChats: z.record(z.string(), z.object({ name: z.string(), memberIds: z.array(z.string()), notes: z.array(CourierNoteSchema) })).default({}),
  /** The love interests the player has met, by id: everyone he has been in a scene with. */
  met: z.array(z.string()),
  /** The job the player holds, or null when he has none. */
  job: EmploymentSchema.nullable(),
  /** How many scenes each love interest has had sex with the player in, by id. Counted once a scene, when it ends. */
  timesIntimate: z.record(z.string(), z.number().int().min(0)).default({}),
  /** How many scenes he has had sex in with two or more love interests at once. Kept, and shown nowhere yet. */
  threesomes: z.number().int().min(0).default(0),
  /** What is changing the game's numbers for a while: what he has drunk, and charms he has set off. */
  boons: z.array(BoonSchema).default([]),
  /** When he last did each thing he can make or set off, by the skill's id: the game time. */
  abilityUsed: z.record(z.string(), z.number().int()).default({}),
  /** The skills he has been told he has, by id: earning one is said once. */
  skillsTold: z.array(z.string()).default([]),
  /** The love interests who took something against the Bloom and have stopped, by id. */
  offBirthControl: z.array(z.string()).default([]),
  /** Who has said she will be at an event, by the event's id: she is there when he goes to it. */
  eventGoers: z.record(z.string(), z.array(z.string())).default({}),
  /** The parts of events he has been to, each as the event's id and the part's, joined with a colon. */
  partsAttended: z.array(z.string()).default([]),
  /** The trips he has booked, by event id: who is going with him. */
  trips: z.record(z.string(), z.array(z.string())).default({}),
  /**
   * A masked ball under way: the part it is (event and part ids, joined with a colon), those who dance with him in the
   * order they come, each in her mask (none for the stand-in, who comes as she is), how many have, and the hour it began.
   */
  masquerade: z
    .object({
      part: z.string(),
      dancers: z.array(z.object({ id: z.string(), maskId: z.string().optional() })),
      danced: z.number().int().min(0),
      startedAt: z.number().int()
    })
    .optional(),
  /** He is in his own room, in the place it is in, and not merely somewhere in that place: what is shown behind him is the room. */
  inOwnRoom: z.boolean().default(false),
  /** Jobs he has quit or been let go from. None of them will have him back. */
  formerJobs: z.array(z.string()),
  /** Those who can be messaged, by id: love interests who have given the player their Bloomr, and the boss of any job he has held. */
  contacts: z.array(z.string()),
  /** The last day on which love interests had their chance to write unprompted. */
  courierDay: z.number().int(),
  /** Posts on Bloomr, oldest first. */
  feed: z.array(PostSchema),
  /** The last day on which love interests posted. */
  feedDay: z.number().int(),
  /** The day's posts still to be written and drawn. Kept with the game, so that one saved or closed while they were being made takes them up again. */
  feedPlans: z.array(PostPlanSchema).default([]),
  /** The game time up to which he has looked at the feed: a post that went up after it is new to him. */
  feedSeen: z.number().int().default(-1),
  /** The last day on which the drama engine had someone turn up in a scene. */
  dramaDay: z.number().int(),
  /** Calendar events generated during this playthrough, on top of the authored ones. */
  events: z.array(CalendarEventSchema),
  /** How things stand with the house the Sire Relations Office lets him, if it has come to that. */
  housing: HousingStateSchema.prefault({}),
  /** The Undercroft: how deep he has got, what he has brought up for good, and a run under way. */
  expedition: ExpeditionStateSchema.prefault({})
})
export type GameState = z.infer<typeof GameStateSchema>

/** The starting player and location for a new game. */
/**
 * What he looks like, for pictures of him: written as an image model is given a character, and his neutral sprite,
 * from which his portrait is cut wherever one is shown.
 */
export const PlayerLookSchema = z.object({
  /** His body and face, as a picture: no clothes, no name. */
  appearance: z.string().default(''),
  /** What he usually wears. */
  clothes: z.string().default(''),
  /** His neutral sprite: a picture in the pack. */
  sprite: z.string().optional(),
  /** How far down the sprite his face is, for the portrait cut from it. */
  faceY: z.number().min(0).max(100).default(4),
  /** The seed the art tool draws him with, so that one picture of him looks like the next. */
  imageSeed: z.number().int().optional()
})
export type PlayerLook = z.infer<typeof PlayerLookSchema>

export const NewGameSchema = z.object({
  player: PlayerSchema,
  look: PlayerLookSchema.prefault({}),
  locationId: z.string(),
  /** His own room: somewhere private a scene can go, with artwork of its own, as a love interest's is. */
  room: RoomSchema.optional()
})
export type NewGame = z.infer<typeof NewGameSchema>
