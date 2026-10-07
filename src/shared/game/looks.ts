import { EXPRESSIONS, picturedOutfit, type Expression, type LoveInterest, type Outfit, type Scene } from '../model'

// What an LLM may write for a face in place of its name here.
const ALSO_CALLED: Record<string, Expression> = {
  embarassed: 'embarrassed',
  blush: 'embarrassed',
  blushing: 'embarrassed',
  shy: 'embarrassed',
  horny: 'aroused',
  lustful: 'aroused',
  annoyed: 'angry',
  mad: 'angry',
  shocked: 'surprised',
  smile: 'happy',
  smiling: 'happy',
  calm: 'neutral'
}

/** The standard expression a word names, if it names one: "Happy", "embarassed" and "horny" all do. */
export function standardExpression(asked: string | null | undefined): Expression | undefined {
  const word = asked?.trim().toLowerCase() ?? ''
  return EXPRESSIONS.find((e) => e === word) ?? ALSO_CALLED[word]
}

/** The outfit to fall back on when one has no pictures: the same state of dress, not pregnant; then her usual clothes. */
function fallbacks(outfits: Outfit[], outfit: Outfit, defaultOutfitId: string): Outfit[] {
  const plain = outfit.pregnant ? outfits.find((o) => o.id === outfit.id.replace(/-?pregnant$/, '') || (outfit.id === 'pregnant' && o.id === defaultOutfitId)) : undefined
  const usual = outfits.find((o) => o.id === defaultOutfitId)
  // Each is looked for where its pictures are: an outfit set to show another's has none of its own to offer.
  return [outfit, plain, usual].filter((o): o is Outfit => o !== undefined).map((o) => picturedOutfit(outfits, o))
}

/**
 * The picture to show for an outfit and an expression. An expression that has not been
 * drawn shows the outfit's neutral one, and an outfit with no pictures at all borrows
 * from the one nearest it, so that a character always has a face.
 */
export function spriteFor(
  who: Pick<LoveInterest, 'outfits' | 'defaultOutfitId'>,
  outfit: Outfit | undefined,
  expression: string | undefined
): string | undefined {
  if (!outfit) return undefined
  for (const tried of fallbacks(who.outfits, outfit, who.defaultOutfitId)) {
    const sprite = tried.sprites[expression ?? 'neutral'] ?? tried.sprites['neutral'] ?? Object.values(tried.sprites)[0]
    if (sprite) return sprite.image
  }
  return undefined
}

/** How someone in a scene currently appears, as last chosen by the LLM: the lead on the scene itself, the others beside it. */
export function lookOf(scene: Pick<Scene, 'loveInterestId' | 'outfitId' | 'expression' | 'looks'>, id: string): { outfitId?: string; expression?: string } {
  return id === scene.loveInterestId ? { outfitId: scene.outfitId, expression: scene.expression } : (scene.looks?.[id] ?? {})
}
