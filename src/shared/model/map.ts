import { z } from 'zod'

/** Where a location sits on the map image, as percentages from its top-left corner. */
export const MapPinSchema = z.object({
  locationId: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100)
})
export type MapPin = z.infer<typeof MapPinSchema>

/** The name of a part of the map, e.g. "Seedblossom", written over it centred on the point given in percent. */
export const MapRegionSchema = z.object({
  name: z.string(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100)
})
export type MapRegion = z.infer<typeof MapRegionSchema>

export const MapSchema = z.object({
  name: z.string(),
  /** The painted map, by its path inside the content pack. */
  image: z.string(),
  regions: z.array(MapRegionSchema).default([]),
  pins: z.array(MapPinSchema)
})
export type GameMap = z.infer<typeof MapSchema>
