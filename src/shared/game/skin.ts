import { SKIN_TONES, basePoseId, poseMedia, type Animation, type ContentPack, type GameState, type LoveInterest, type SkinTone } from '../model'

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

/**
 * Her sex-acts as a player of a tone sees them: act by act, those drawn for his tone where she has that act drawn for
 * it at all, and the light ones otherwise. An act comes whole from one tone or the other, pregnant form and all, so that
 * what is shown pregnant is the same man as what is shown before.
 */
export function posesForTone(li: Pick<LoveInterest, 'animations' | 'tonedAnimations'>, tone: SkinTone): Animation[] {
  const own = tone === 'light' ? [] : (li.tonedAnimations[tone] ?? [])
  const drawn = new Set(own.filter((pose) => poseMedia(pose).length > 0 && basePoseId(pose.id) === pose.id).map((pose) => pose.id))
  if (drawn.size === 0) return li.animations
  return [...li.animations.filter((pose) => !drawn.has(basePoseId(pose.id))), ...own.filter((pose) => drawn.has(basePoseId(pose.id)))]
}

// One pack for each pack and tone, so that a pack is the same object for as long as nothing changes.
const tonedPacks = new WeakMap<ContentPack, Map<SkinTone, ContentPack>>()

/** The pack as a player of a tone sees it: each love interest's sex-acts, and each group's, are those for his tone (`posesForTone`). */
export function withSkinTone(content: ContentPack, tone: SkinTone): ContentPack {
  if (tone === 'light' || ![...content.loveInterests, ...content.groups].some((one) => (one.tonedAnimations[tone] ?? []).length > 0)) return content
  let byTone = tonedPacks.get(content)
  if (!byTone) tonedPacks.set(content, (byTone = new Map()))
  let pack = byTone.get(tone)
  if (!pack)
    byTone.set(
      tone,
      (pack = {
        ...content,
        loveInterests: content.loveInterests.map((li) => ({ ...li, animations: posesForTone(li, tone) })),
        groups: content.groups.map((group) => ({ ...group, animations: posesForTone(group, tone) }))
      })
    )
  return pack
}

/**
 * The picture of a child of hers by itself, swaddled: one of the pack's `sprites/babies/`, by the tone it is drawn in,
 * or by what it takes from its mother instead where it does (`babyPicture` on her, a tint's own picture).
 */
export function babySprite(content: ContentPack, state: GameState, motherId: string): string {
  const mother = content.loveInterests.find((li) => li.id === motherId)
  const tone = mother ? babyToneBy(mother, state.player.skinTone) : state.player.skinTone
  const own = mother && takesHerTint(mother, tone) ? mother.babyPicture : undefined
  return own ?? `sprites/babies/${tone}.webp`
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
