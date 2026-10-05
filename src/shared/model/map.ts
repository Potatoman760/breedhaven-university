import { z } from 'zod'

/** Where a location sits on the map image, as percentages from its top-left corner. */
export const MapPinSchema = z.object({
  locationId: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100)
})
export type MapPin = z.infer<typeof MapPinSchema>

/** A labelled area drawn behind the pins, e.g. "Campus". Position and size are percentages. */
export const MapRegionSchema = z.object({
  name: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().min(0).max(100),
  h: z.number().min(0).max(100)
})
export type MapRegion = z.infer<typeof MapRegionSchema>

export const MapSchema = z.object({
  name: z.string(),
  /** Image path inside the content pack. Without one the map is drawn as a plain chart. */
  image: z.string().optional(),
  regions: z.array(MapRegionSchema).default([]),
  /** How long it takes to go from any location to any other. */
  travelHours: z.number().int().min(1).default(1),
  pins: z.array(MapPinSchema)
})
export type GameMap = z.infer<typeof MapSchema>
