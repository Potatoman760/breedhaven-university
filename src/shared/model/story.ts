import { z } from "zod";
import { EffectSchema } from "./condition";
import { IntroSchema } from "./orientation";

/** A cutscene and the direction of the scene that follows it: what is read, and then what the LLM is told. */
const TellingSchema = z.object({
  cutscene: IntroSchema,
  direction: z.string(),
});

/**
 * A story beat of one love interest: a scene written for her, earned as what she and the player are reaches a stage.
 * She asks him to come (`invitation`, a message from her) to somewhere at an hour; going there reads the cutscene
 * and opens a scene with her alone, run on the beat's direction. One ask: missed, it is gone. Each is had once.
 */
export const StoryBeatSchema = z.object({
  /**
   * What earns it: the relationship stage, by id; or `thriving`, a child of theirs kept thriving in his house for
   * `THRIVING_WEEKS` running, whatever they are to each other.
   */
  stage: z.string(),
  /** What she writes to ask him to come. */
  invitation: z.string(),
  locationId: z.string(),
  /** The view of the place it is in, when not its usual one. */
  viewId: z.string().optional(),
  /** Held in her own room, at the place she lives. */
  inHerRoom: z.boolean().default(false),
  /** What she wears for it, as the cutscene draws her; her pregnant form once she shows. */
  outfitId: z.string().optional(),
  /** The weekday it is asked for; left out, the next day there is. */
  weekday: z.string().optional(),
  startHour: z.number().int().min(0).max(23),
  hours: z.number().int().min(1).default(2),
  cutscene: IntroSchema,
  direction: z.string(),
  /** Told instead when he has already been to bed with her by then. */
  ifIntimate: TellingSchema.optional(),
  /**
   * Told instead when she has already stopped taking anything against the Bloom in this game (`offBirthControl`), or
   * is already carrying his child, by then: the same moment with nothing said of either, a confession and no more.
   * One who never took it is not "already off" it; for her only a pregnancy brings this. Comes before `ifIntimate`.
   */
  ifUnprotected: TellingSchema.optional(),
  /** What going to it does, as the scene opens: a meter of hers, a flag. */
  effects: z.array(EffectSchema).default([]),
  /** She has stopped taking anything against the Bloom, from this scene on. */
  stopsBirthControl: z.boolean().default(false),
});
export type StoryBeat = z.infer<typeof StoryBeatSchema>;

/** The beat a mother has for their child being kept well, and how many weeks running earn it. */
export const THRIVING_BEAT = "thriving";
export const THRIVING_WEEKS = 4;

/** The story beats of the pack, by love interest id, each in the order her stages come. */
export const StorySchema = z.record(z.string(), z.array(StoryBeatSchema));
export type Story = z.infer<typeof StorySchema>;
