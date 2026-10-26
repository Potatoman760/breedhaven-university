import { z } from 'zod'
import { StatSchema, type Stat } from './stats'
import { t } from '../i18n'

/** The two lights a place is drawn in. Each period of the day is one or the other. */
export const LIGHTS = [
  { id: 'day', get name() { return t('game.light.day') } },
  { id: 'night', get name() { return t('game.light.night') } }
] as const
export type Light = (typeof LIGHTS)[number]['id']

/**
 * Something to do at a place that works on one of the player's stats: a workout at the gym,
 * an hour in a reading cell, a bowl of something enormous at the restaurant. These are what
 * the day view suggests when he asks how to raise a stat.
 */
export const DrillSchema = z.object({
  stat: StatSchema,
  /** A few words, as it reads after "Raise strength:" and as the scene is named: "A workout on the racks". */
  title: z.string(),
  /** A line of narration that opens it. */
  description: z.string().default('')
})
export type Drill = z.infer<typeof DrillSchema>

/** The view every location has, and the one shown unless the player picks another: the place itself. */
export const DEFAULT_VIEW = { id: 'default', name: 'Default' } as const

/**
 * One view of a location: a spot within it. As an outfit has a picture for each expression,
 * a view has one by day and one by night; whichever has not been drawn shows the other.
 */
export const BackgroundSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Its pictures, by day and by night: image paths inside the content pack. */
  images: z.partialRecord(z.enum(['day', 'night']), z.string()).default({}),
  /** A looping clip of it, played muted behind a scene there in place of its pictures, by day and night alike. */
  clip: z.string().optional(),
  /** Under a roof: the weather is not drawn over it. Left out, it is as the location says. */
  indoors: z.boolean().optional(),
  /** Told to the LLM in a scene at this view, after what the place itself is: what this spot of it is. */
  description: z.string().optional(),
  /** What this view looks like, for an image model, in place of the location's own: so that the rooms of one house are not all drawn alike. */
  appearance: z.string().optional()
})
export type Background = z.infer<typeof BackgroundSchema>

export const LocationSchema = z.object({
  id: z.string(),
  /** The picture beside it on the map, by name: "book", "coffee", "bed". Left out, a map pin. */
  icon: z.string().optional(),
  /** Its emblem: a picture in the pack, shown in place of the drawn icon. */
  iconImage: z.string().optional(),
  name: z.string(),
  /** Told to the LLM in a scene there: what the place is, what goes on in it, and what a scene can draw on. */
  description: z.string().default(''),
  /** What it looks like, for an image model: only what can be seen, with nobody in it. Pictures of it are generated from this. */
  appearance: z.string().default(''),
  /**
   * Views of the location. The first is its `default` view, which every location has and
   * which is shown unless the player picks another.
   */
  backgrounds: z.array(BackgroundSchema).default([]),
  /** Open from `fromHour` up to but not including `toHour`; may wrap past midnight. Omitted means always open. */
  open: z
    .object({
      fromHour: z.number().int().min(0),
      toHour: z.number().int().min(0)
    })
    .optional(),
  /** The place is under a roof, wherever one of its views doesn't say otherwise. */
  indoors: z.boolean().default(false),
  /**
   * Nobody comes here who was not asked: a residence hall, where every room is someone's
   * own. Everywhere else is public, and anyone may turn up.
   */
  private: z.boolean().default(false),
  /** Only an event takes him here, a trip or a ball: it is not on the map, nor anywhere to go of his own accord. */
  eventOnly: z.boolean().default(false),
  /** What can be done here to raise a stat. The stats these name are the ones the place is good for. */
  drills: z.array(DrillSchema).default([])
})
export type Location = z.infer<typeof LocationSchema>

/** The stats a place is good for working on: those it has something to do for. */
export function trainsAt(location: Pick<Location, 'drills'>): Stat[] {
  return [...new Set(location.drills.map((drill) => drill.stat))]
}
