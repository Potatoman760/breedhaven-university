import { z } from 'zod'
import { IntroSchema } from './orientation'
import { AnimationSchema, SpriteSchema } from './loveInterest'

/**
 * A disguise at a masked ball: a gown, a mask and an enchanted updo that hide whoever wears them. Every woman in it looks
 * the same, and is known only by the name of her gown. Its sex-acts are drawn in it too, and stand in for her own.
 */
export const MaskSchema = z.object({
  id: z.string(),
  /** What she is called while it hides her, in the interface and in narration: "Crimson". */
  name: z.string(),
  /** What she is wearing, told to the LLM: the gown, the mask, the updo. */
  description: z.string(),
  /** How far down its sprites her face is, in percent, for a portrait. */
  faceY: z.number().min(0).max(100).default(8),
  /** By expression, as an outfit's are. */
  sprites: z.record(z.string(), SpriteSchema).default({}),
  /** Her walking profile in it, for the loading screen, in place of her own. */
  walk: z.string().optional(),
  animations: z.array(AnimationSchema).default([])
})
export type Mask = z.infer<typeof MaskSchema>

export const MonthSchema = z.object({
  id: z.string(),
  name: z.string(),
  days: z.number().int().min(1)
})
export type Month = z.infer<typeof MonthSchema>

/** A named part of the day. Runs from `startHour` until the next period starts, wrapping past midnight. */
export const PeriodSchema = z.object({
  id: z.string(),
  name: z.string(),
  startHour: z.number().int().min(0),
  /** Whether it is light or dark out: which of a place's two pictures is shown. */
  light: z.enum(['day', 'night']).default('day')
})
export type Period = z.infer<typeof PeriodSchema>

/**
 * A holiday, festival or other dated happening. Authored ones live in the calendar
 * config; ones the LLM invents during a playthrough live in the game state. An event is
 * somewhere, between certain hours of each day it lasts: a fair, a match, a supper. A
 * holiday is the whole day and nowhere in particular, and has neither.
 */
/**
 * One scripted part of an event: somewhere to be, at an hour of one of its days, with people. It opens, if it has one,
 * on a cutscene of written lines, and goes on as a scene with its cast, as a step of orientation does. Each is
 * attended once.
 */
/** What an event part can play as it begins. */
export const PART_ANIMATIONS = ['lanterns', 'drive-there', 'soak', 'cascade', 'market', 'private-bath', 'fireworks', 'last-morning'] as const
export type PartAnimation = (typeof PART_ANIMATIONS)[number]

export const EventPartSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Which day of the event it is on, counting from 1. */
  day: z.number().int().min(1).default(1),
  startHour: z.number().int().min(0),
  hours: z.number().int().min(1).default(2),
  /** Left out, the event's own place. */
  locationId: z.string().optional(),
  /** The view of the place its scene is set in. Left out, the place as the day has it. */
  viewId: z.string().optional(),
  /** What everyone in its scene starts in, where she has it: a pregnant woman in its pregnant form. Left out, as they are dressed. */
  outfitId: z.string().optional(),
  /** Narration that opens the scene. */
  description: z.string().default(''),
  /** Told to the LLM: what is going on, and what the scene is for. */
  direction: z.string().default(''),
  /**
   * Who is there. Left out, whoever said she would be at the event; failing that, the love interests he is closest to
   * are dealt in, up to `castSize`.
   */
  castIds: z.array(z.string()).optional(),
  castSize: z.number().int().min(1).max(3).default(2),
  /** Nothing else can be done on its day until it has been attended or is over, as on orientation day. */
  required: z.boolean().default(false),
  /** Lines read before the scene, with nothing to answer: who says them, and where. */
  cutscene: IntroSchema.optional(),
  /**
   * Played as it begins, in turn, with whoever is in it: `lanterns`, her letting a lantern go at the pond; the drive to
   * a trip; and each of the trip's own openings.
   */
  animations: z.array(z.enum(PART_ANIMATIONS)).default([]),
  /**
   * The part where a trip is booked: after its lines, a screen to pick who comes (up to `most`, each at `minStage` or
   * closer with him) and pay `price` a head, him included. The trip is the event `eventId`.
   */
  booking: z
    .object({
      eventId: z.string(),
      most: z.number().int().min(1).max(3).default(2),
      price: z.number().int().min(0).default(150),
      minStage: z.string().default('dating'),
      /** The listing he books from: a line about the place, what is on, and how well it is spoken of, out of five. */
      blurb: z.string().default(''),
      highlights: z.array(z.string()).default([]),
      rating: z.number().min(0).max(5).optional()
    })
    .optional(),
  /** Part of a trip: only for one who booked it, with those he booked as its cast. */
  onTrip: z.boolean().default(false),
  /**
   * A masked ball: the women closest to him who are not in an arrangement with him, up to as many as there are masks,
   * each come to dance with him in turn in a mask that hides her. Too few, and `standInId` makes up the numbers as she
   * is. At the end he names one of them: rightly, and she takes him to `privateViewId`; wrongly, and she loses `loss`
   * of affection.
   */
  masquerade: z
    .object({
      masks: z.array(MaskSchema).min(1),
      standInId: z.string(),
      privateViewId: z.string(),
      loss: z.number().int().min(0).default(10)
    })
    .optional(),
  /**
   * A date: he picks who goes with him, up to `most`. Those he takes gain `gain` of affection, trust and desire; each
   * woman with a claim on him that he leaves out loses `loss` of each, and so does every one of them if he never goes.
   */
  date: z
    .object({
      most: z.number().int().min(1).max(3).default(2),
      gain: z.number().int().min(0).default(10),
      loss: z.number().int().min(0).default(10)
    })
    .optional()
})
export type EventPart = z.infer<typeof EventPartSchema>

export const CalendarEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  /** Month id and day of the month on which the event starts. */
  month: z.string(),
  day: z.number().int().min(1),
  /** Omitted for events that recur every year. */
  year: z.number().int().optional(),
  durationDays: z.number().int().min(1).default(1),
  locationId: z.string().optional(),
  /** The hour of the day it opens, on each day it lasts. Left out for something that is the whole day. */
  startHour: z.number().int().min(0).optional(),
  /** How many hours it runs from then. */
  hours: z.number().int().min(1).optional(),
  /** No classes meet while it lasts: a holiday, or a break between terms. */
  noClasses: z.boolean().default(false),
  /** The weather every day of it has, by id, whatever the month would give: snow for a winter festival. */
  weatherId: z.string().optional(),
  /** A picture laid around the map's emblem of every place dressed for it, while it runs: a wreath for a winter festival. */
  mapDressing: z.string().optional(),
  /** A song in the pack played once through as he comes to each place dressed for it, while it runs: a carol for a winter festival. */
  song: z.string().optional(),
  /** Every woman he meets while it runs brings him a present, once: one of the things she likes. */
  presents: z.boolean().optional(),
  /** Nobody is due while it runs: a child that would come in it is due the day after, worked out when she conceives. */
  noBirths: z.boolean().optional(),
  /** True for events invented by the LLM. */
  generated: z.boolean().default(false),
  /**
   * A story beat: kept off the calendar and out of what anyone says beforehand. It still dresses places and people, and
   * its program still happens.
   */
  secret: z.boolean().default(false),
  /** What happens at it, scripted, in the order it happens. */
  program: z.array(EventPartSchema).default([]),
  /** For a trip: the hour he is home on the day it ends, the drive back being as long as it takes. */
  homeAt: z.number().int().min(0).optional()
})
export type CalendarEvent = z.infer<typeof CalendarEventSchema>

/** A kind of weather a day can have. Each day's weather is drawn from the kinds its month allows. */
/** What a kind of weather looks like on the stage. */
export const WEATHER_EFFECTS = ['none', 'rain', 'storm', 'snow', 'mist', 'wind', 'motes'] as const
export type WeatherEffect = (typeof WEATHER_EFFECTS)[number]

export const WeatherTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Told to the AI so characters can remark on it. */
  description: z.string().default(''),
  /** Name of a built-in weather icon: clear, cloudy, rain, storm, fog, snow or wind. */
  icon: z.string().default('cloudy'),
  /** Its emblem: a picture in the pack, shown in place of the drawn icon. */
  iconImage: z.string().optional(),
  /**
   * What is drawn over outdoor views while it lasts: rain, a storm with lightning, snow,
   * drifting mist, leaves on the wind, or motes hanging in still air.
   */
  effect: z.enum(WEATHER_EFFECTS).default('none'),
  /**
   * How likely it is in each month, by month id, relative to the other kinds: written as
   * the percentage of days, though any numbers in proportion will do. A month left out
   * never has it. When given, it takes the place of `weight` and `months`.
   */
  chance: z.record(z.string(), z.number().min(0)).optional(),
  /** How likely it is relative to the other kinds, the same in every month it occurs in. */
  weight: z.number().positive().default(1),
  /** Month ids it can occur in. Omitted means any month. */
  months: z.array(z.string()).optional()
})
export type WeatherType = z.infer<typeof WeatherTypeSchema>

export const CalendarConfigSchema = z.object({
  months: z.array(MonthSchema).min(1),
  weekdays: z.array(z.string()).min(1),
  hoursPerDay: z.number().int().min(1).default(24),
  periods: z.array(PeriodSchema).min(1),
  /** The in-world moment the game begins. */
  start: z.object({
    year: z.number().int(),
    month: z.string(),
    day: z.number().int().min(1),
    hour: z.number().int().min(0).default(0)
  }),
  /** Index into `weekdays` of the first day of the game. */
  startWeekday: z.number().int().min(0).default(0),
  /** How many days the game runs for. */
  lengthDays: z.number().int().min(1),
  events: z.array(CalendarEventSchema).default([]),
  weather: z.array(WeatherTypeSchema).default([])
})
export type CalendarConfig = z.infer<typeof CalendarConfigSchema>
