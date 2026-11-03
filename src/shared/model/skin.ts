import { z } from "zod";

/**
 * A skin tone, of three: the player's, chosen as a game begins, each love interest's, and so a child's, whose pictures
 * are drawn in each of the three.
 */
export const SKIN_TONES = ["light", "medium", "dark"] as const;
export type SkinTone = (typeof SKIN_TONES)[number];
export const SkinToneSchema = z.enum(SKIN_TONES);

/** The id of her outfit holding a child of a tone. */
export const babyOutfitId = (tone: SkinTone): string => `baby-${tone}`;
