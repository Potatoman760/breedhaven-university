import { z } from 'zod'

/**
 * The moments the game makes a sound at. The interface's own come first, then what happens in the story.
 * Which file each plays is the content's to say, so that any of them can be swapped without touching code.
 */
export const CUES = ['click', 'open', 'close', 'phoneOn', 'phoneOff', 'bagOpen', 'bagClose', 'cards', 'chips', 'build', 'notice', 'message', 'coins', 'door', 'skill', 'bond', 'pregnancy', 'birth', 'relic'] as const
export type Cue = (typeof CUES)[number]

/** One sound file in the pack, how loud it is played, and whose it is. */
export const SoundSchema = z.object({
  /** Its path inside the content pack: `sounds/ui/click.ogg`. */
  file: z.string(),
  /** How loud, from 0 to 1, before the player's own volume is applied. */
  volume: z.number().min(0).max(1).default(1),
  /** Where it came from and under what license, for the credits. */
  credit: z.string().default('')
})
export type Sound = z.infer<typeof SoundSchema>

/** What a pose sounds like: a loop played under it, or, with `clip`, the clip's own audio while a clip is shown and the loop only under a still. */
export const PoseSoundSchema = SoundSchema.extend({
  clip: z.boolean().default(false)
})
export type PoseSound = z.infer<typeof PoseSoundSchema>

export const SoundsSchema = z.object({
  cues: z.partialRecord(z.enum(CUES), SoundSchema).default({}),
  /** Loops played behind a place, by an id of their own so that places can share one. */
  ambience: z.record(z.string(), SoundSchema).default({}),
  /** Which ambience plays at each location, by location id: by day, and by night if it differs. A place left out is silent. */
  places: z.record(z.string(), z.object({ day: z.string(), night: z.string().optional() })).default({}),
  /** What plays while an NSFW pose is up in a scene, by the id of the pose (one drawn pregnant plays its base pose's). */
  poses: z.record(z.string(), PoseSoundSchema).default({})
})
export type Sounds = z.infer<typeof SoundsSchema>
