import { SKIN_TONES, type ContentPack, type GameState, type LoveInterest, type SkinTone } from '../model'

/**
 * The tone a child of two tones is drawn in: halfway between them, and where halfway falls between two, the darker, as
 * dark skin carries over light. Light with dark is medium; medium with dark is dark.
 */
export function babyTone(his: SkinTone, hers: SkinTone): SkinTone {
  return SKIN_TONES[Math.ceil((SKIN_TONES.indexOf(his) + SKIN_TONES.indexOf(hers)) / 2)]
}

/** The tone a child of hers by a father of a tone is drawn in: one she always has (`ownBabyTone`), or the two's. */
export function babyToneBy(mother: Pick<LoveInterest, 'skinTone' | 'ownBabyTone'>, his: SkinTone): SkinTone {
  return mother.ownBabyTone ?? babyTone(his, mother.skinTone)
}

/** Every tone a child of hers can be drawn in, whoever the father: the birth pictures she needs. */
export function babyTonesOf(mother: Pick<LoveInterest, 'skinTone' | 'ownBabyTone'>): SkinTone[] {
  return SKIN_TONES.filter((tone) => SKIN_TONES.some((his) => babyToneBy(mother, his) === tone))
}

/**
 * Whether a child of hers in a tone takes her tint (`babyTint`): always, where all her children look alike; otherwise
 * only one of her own tone, as a pale mother's child is pale only when the father is too.
 */
export function takesHerTint(mother: Pick<LoveInterest, 'skinTone' | 'ownBabyTone' | 'babyTint'>, tone: SkinTone): boolean {
  return mother.babyTint !== undefined && (mother.ownBabyTone !== undefined || tone === mother.skinTone)
}

/** The tone a child of hers by the player is drawn in, in this game. */
export function babyToneFor(content: ContentPack, state: GameState, motherId: string): SkinTone {
  const mother = content.loveInterests.find((li) => li.id === motherId)
  return mother ? babyToneBy(mother, state.player.skinTone) : state.player.skinTone
}

/** Her picture with their child just born, in its tone, if she has one drawn in it. */
export function birthPictureFor(content: ContentPack, state: GameState, motherId: string): string | undefined {
  return content.loveInterests.find((li) => li.id === motherId)?.birthPictures[babyToneFor(content, state, motherId)]
}
