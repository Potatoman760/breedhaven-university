import { z } from 'zod'

/**
 * The kinds of drama the engine can bring into a scene. Each is someone who was not
 * invited turning up part-way through, or a friend brought along from the start.
 */
export const DRAMA_KINDS = ['confrontation', 'rival', 'friend'] as const
export type DramaKind = (typeof DRAMA_KINDS)[number]

/**
 * The numbers the drama engine weighs things with. Every score is in the same loose
 * units, and `divisor` turns the total into a chance, so the feel of the game can be
 * tuned here without touching code. A content pack without this has no drama.
 */
export const DramaConfigSchema = z.object({
  /** The pressure that would make drama certain, were it not for `maxChance`. */
  divisor: z.number().positive().default(240),
  /** However much is simmering, a scene is never likelier than this to be interrupted. */
  maxChance: z.number().min(0).max(1).default(0.5),
  /** Days after an interruption during which there is no other. */
  cooldownDays: z.number().int().min(0).default(2),
  /** How much every hook but the strongest adds to the pressure, as a share of its score. */
  othersShare: z.number().min(0).max(1).default(0.25),
  /** How many of the player's lines the scene gets before she arrives: from 1 up to this. */
  maxLinesBefore: z.number().int().min(1).default(3),

  /** How much right she has to mind, by what she and the player are to each other. */
  claim: z
    .object({
      exclusive: z.number().default(40),
      /** Dating or further, with nothing agreed. */
      dating: z.number().default(20),
      /** Only friends so far, but she wants him. */
      wanting: z.number().default(8),
      /** An arrangement that lets him see others. */
      open: z.number().default(5),
      /** The desire at which a friend counts as wanting him. */
      wantingDesire: z.number().default(50)
    })
    .prefault({}),
  /** How much of a claim a scene provokes: a date, time with someone he is dating, anything else. */
  romance: z.object({ date: z.number().default(1), dating: z.number().default(0.8), other: z.number().default(0.4) }).prefault({}),
  /** Added to a confrontation when she and the one he is with are enemies, or friends. */
  enemyOfLead: z.number().default(15),
  friendOfLead: z.number().default(-5),
  /** Added for each other woman with a claim beyond the first, and the most that can come to. */
  perSecret: z.number().default(4),
  maxSecrets: z.number().default(16),
  /** What an enemy of the one he is with starts from, and a friend of hers. */
  rival: z.number().default(15),
  friend: z.number().default(12),
  /** Added when the friend is someone the player has never spent time with. */
  unmet: z.number().default(10),

  /** Added to any score when her day has her at this very place. */
  nearby: z.number().default(15),
  /** What a score is multiplied by when she can't be placed anywhere. */
  unplaced: z.number().default(0.5),
  /** How often a friend who comes is there from the start, brought along, and not someone who turns up later. */
  broughtAlong: z.number().min(0).max(1).default(0.5)
})
export type DramaConfig = z.infer<typeof DramaConfigSchema>

/** Drama planned for a scene: who turns up, as what, and when. */
export const SceneDramaSchema = z.object({
  kind: z.enum(DRAMA_KINDS),
  actorId: z.string(),
  /** How many lines the player says before she arrives. None for a friend who was brought along and is there from the start. */
  afterLines: z.number().int().min(0),
  /** She has arrived. */
  fired: z.boolean(),
  /** Why the engine chose her, in sentences the LLM is given when she walks in. */
  reasons: z.array(z.string())
})
export type SceneDrama = z.infer<typeof SceneDramaSchema>
