import { z } from 'zod'
import { ConditionSchema } from './condition'
import { StudiesSchema, TeachingSchema } from './course'
import { StatSchema } from './stats'

/**
 * One picture of the character. Written in content either as just the image path, or as
 * an object that also describes it so the LLM can tell when it fits.
 */
export const SpriteSchema = z
  .union([z.string(), z.object({ image: z.string(), description: z.string().default('') })])
  .transform((sprite) => (typeof sprite === 'string' ? { image: sprite, description: '' } : sprite))
export type Sprite = z.infer<typeof SpriteSchema>

/** The faces every outfit can be drawn with. In a scene the LLM picks one of these for each love interest in every reply. */
export const EXPRESSIONS = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'embarrassed', 'aroused'] as const
export type Expression = (typeof EXPRESSIONS)[number]

/** The seed a love interest's pictures are generated with unless she is given one of her own. */
export const DEFAULT_IMAGE_SEED = 60

/**
 * The four outfits every love interest has. The pregnant two are worn once a pregnancy
 * shows, in place of the other two. A character may have more besides.
 */
export const STANDARD_OUTFITS = [
  { id: 'default', name: 'Usual clothes', description: '', pregnant: false },
  { id: 'pregnant', name: 'Pregnant', inherits: 'default', description: 'She has a round, pregnant belly.', pregnant: true },
  { id: 'nude', name: 'Nude', description: 'nothing at all, completely nude', pregnant: false },
  { id: 'nude-pregnant', name: 'Nude, pregnant', inherits: 'nude', description: 'She has a round, pregnant belly.', pregnant: true }
] as const

export const OutfitSchema = z.object({
  id: z.string(),
  name: z.string(),
  /**
   * What the character is wearing, told to the AI and to an image model. For an outfit
   * that inherits, only what it adds to the one it builds on.
   */
  description: z.string().default(''),
  /**
   * The id of another of her outfits whose description this one builds on. Hers is then
   * that description with this outfit's own added to it: `pregnant` is `default` plus
   * "She has a round, pregnant belly."
   */
  inherits: z.string().optional(),
  /**
   * The id of another of her outfits whose pictures stand for this one, when she looks the
   * same in both: a slime whose nude is her default. This outfit then needs none of its own.
   */
  fallback: z.string().optional(),
  /** Sprites keyed by their title: one of `EXPRESSIONS`, or any other name for a picture of some other kind. */
  sprites: z.record(z.string(), SpriteSchema).default({}),
  /** Drawn pregnant. Worn once a pregnancy shows, and not before. */
  pregnant: z.boolean().default(false)
})
export type Outfit = z.infer<typeof OutfitSchema>

/** The outfit whose pictures are shown for this one: itself, or the one it falls back on (and the one that falls back on, and so on). */
export function picturedOutfit(outfits: Outfit[], outfit: Outfit): Outfit {
  const seen = new Set<string>()
  let at = outfit
  for (let next: Outfit | undefined = outfit; next && !seen.has(next.id); next = outfits.find((o) => o.id === at.fallback)) {
    seen.add(next.id)
    at = next
  }
  return at
}

/**
 * An outfit's description in its parts: the description of the outfit it builds on (and
 * of the one that builds on, and so on), then what it adds itself. One part for an outfit
 * that inherits nothing.
 */
export function outfitParts(outfits: Outfit[], outfit: Outfit | undefined): string[] {
  const parts: string[] = []
  const seen = new Set<string>()
  // Followed from the outfit back to where its description starts, however the content is written.
  for (let at = outfit; at && !seen.has(at.id); at = outfits.find((o) => o.id === at?.inherits)) {
    seen.add(at.id)
    if (at.description.trim() !== '') parts.unshift(at.description.trim())
  }
  return parts
}

/** An outfit's whole description, with whatever it inherits in front of what it adds. */
export function outfitDescription(outfits: Outfit[], outfit: Outfit | undefined): string {
  return outfitParts(outfits, outfit)
    .map((part, i, all) => (i < all.length - 1 && !/[.!?]$/.test(part) ? `${part}.` : part))
    .join(' ')
}

/**
 * A video that takes the place of the character's sprite. The LLM decides when
 * to play one from its name and description.
 */
export const AnimationSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Tells the LLM what the animation shows, so it knows when it fits. */
  description: z.string().default(''),
  /** Video path inside the content pack, e.g. an .mp4 file. */
  video: z.string(),
  /** Plays round and round until something ends it. When false it plays once, and the sprite comes back. */
  loop: z.boolean().default(true)
})
export type Animation = z.infer<typeof AnimationSchema>

/** Where the character is at a given time. The first matching entry wins. */
export const ScheduleEntrySchema = z.object({
  weekdays: z.array(z.string()).optional(),
  periods: z.array(z.string()).optional(),
  locationId: z.string()
})
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>

/** A love interest's own room: somewhere private a scene can go, with artwork of its own. */
export const RoomSchema = z.object({
  /** What it is, in a few words: "a garret at the Honeyed Bee". */
  name: z.string(),
  /** Told to the LLM when a scene is there. */
  description: z.string().default(''),
  /** The location it is in. Going there from that location takes no time. */
  locationId: z.string(),
  /** Image path inside the content pack. Left out, the location's own artwork is shown. */
  background: z.string().optional()
})
export type Room = z.infer<typeof RoomSchema>

export const SecretSchema = z.object({
  text: z.string(),
  /** Until these pass, the character keeps the secret to themselves. */
  revealWhen: z.array(ConditionSchema).default([])
})
export type Secret = z.infer<typeof SecretSchema>

/** Fields that exist only to steer the AI when this character speaks. */
export const LoveInterestAiSchema = z.object({
  speechPattern: z.string().default(''),
  tone: z.string().default(''),
  verbalQuirks: z.array(z.string()).default([]),
  exampleDialogue: z.array(z.object({ user: z.string(), reply: z.string() })).default([]),
  backstory: z.string().default(''),
  /** Things they know and will tell the player if asked: directions, gossip, how the place works. */
  knowledge: z.array(z.string()).default([]),
  secrets: z.array(SecretSchema).default([]),
  /** How the character treats the player at each relationship stage, keyed by stage id. */
  stageNotes: z.record(z.string(), z.string()).default({}),
  extraInstructions: z.string().default('')
})
export type LoveInterestAi = z.infer<typeof LoveInterestAiSchema>

/**
 * What a character is. The first three are love interests; an `npc` is someone to talk to
 * and work for, with a look, a voice and a place to be found, and no relationship to build.
 * Changing an NPC's kind is all it takes to make a love interest of her.
 */
export const LOVE_INTEREST_KINDS = ['student', 'teacher', 'outsider', 'npc'] as const
export type LoveInterestKind = (typeof LOVE_INTEREST_KINDS)[number]

/**
 * A character: a love interest, or an NPC. Both are written the same way, in the same
 * folder, and only an id, a name, an age and an outfit are needed; everything else has a
 * default, so an NPC's file can be as short as she is.
 */
export const LoveInterestSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** What they are, in a few words: "hall manager of the Cloister Halls". Shown beside an NPC's name. */
  role: z.string().default(''),
  age: z.number().int().min(18),
  pronouns: z.string().default('she/her'),
  bio: z.string().default(''),
  appearance: z.string().default(''),
  personality: z.string().default(''),
  traitIds: z.array(z.string()).default([]),
  likes: z.array(z.string()).default([]),
  dislikes: z.array(z.string()).default([]),
  /**
   * The stats they are drawn to in the player. High ones make them warmer, quicker to
   * grow fond, and more likely to write and invite him unprompted.
   */
  admires: z.array(StatSchema).max(3).default([]),
  /**
   * Other love interests she is friends with in every game, by id, and those she is at
   * odds with. A student with few of either is given more at random when a game begins.
   */
  friends: z.array(z.string()).default([]),
  enemies: z.array(z.string()).default([]),
  birthday: z.object({ month: z.string(), day: z.number().int().min(1) }).optional(),
  /** Their name on Chats and Bloomr, without the @. Left out, one is made from their name. */
  handle: z.string().optional(),
  outfits: z.array(OutfitSchema).min(1),
  defaultOutfitId: z.string(),
  /**
   * How far down their sprites the face sits, as a percentage of the image height. Used
   * to crop small portraits. Most figures fill the image, with the face near the top.
   */
  faceY: z.number().min(0).max(100).default(4),
  /**
   * ImageGen preferred seed: the seed her pictures are generated with, so that a new one
   * comes out looking like the ones she has. Left out, each picture gets a seed of its own.
   */
  imageSeed: z.number().int().min(0).optional(),
  /**
   * How tall she stands on stage, as a percentage of a full-height figure. Her pictures
   * are drawn filling the frame like anyone's; someone short is made so here, standing on
   * the same floor as the others. Portraits are cut from the picture as drawn.
   */
  stageHeight: z.number().min(30).max(120).default(100),
  /**
   * Where things stand with the player when a game begins, for someone he already knows: an
   * old friend. She has been met and he has her Chats from the first day. Left out, they
   * are strangers.
   */
  startsAt: z.object({ affection: z.number().min(0), trust: z.number().min(0), desire: z.number().min(0) }).optional(),
  /** How long she carries a child, in days, when it differs from the usual. */
  pregnancyDays: z.number().int().min(1).optional(),
  /**
   * What they are. A student has `studies` and takes courses; a teacher has `teaching` and
   * gives them; an outsider is a love interest with nothing to do with classes; an `npc` is
   * not a love interest at all. Left out, it is read off `studies` and `teaching`.
   */
  kind: z.enum(LOVE_INTEREST_KINDS).optional(),
  /** A student's own subject. Omitted for anyone who isn't one. */
  studies: StudiesSchema.optional(),
  /** What a teacher teaches. Omitted for anyone who isn't one. */
  teaching: TeachingSchema.optional(),
  animations: z.array(AnimationSchema).default([]),
  schedule: z.array(ScheduleEntrySchema).default([]),
  /** Where she lives. A scene can move there. */
  room: RoomSchema.optional(),
  ai: LoveInterestAiSchema.prefault({})
})
export type LoveInterest = z.infer<typeof LoveInterestSchema>

/** Whether a character is a student, a teacher, a love interest from outside the University, or an NPC. */
export function kindOf(li: Pick<LoveInterest, 'kind' | 'studies' | 'teaching'>): LoveInterestKind {
  return li.kind ?? (li.teaching ? 'teacher' : li.studies ? 'student' : 'outsider')
}
