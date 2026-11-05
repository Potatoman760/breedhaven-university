import type { LoveInterest, Outfit } from '../model'
import { t } from '../i18n'

/**
 * The outfits the game puts a woman in for its events, trips and the echoes below, which every love interest has: the
 * game's own with their pictures, and one of the player's own with none, for the player to draw. Each name is a
 * message key, read when it is given; each description is what the picture is drawn from, and stays English.
 */
export const GAME_OUTFITS = [
  { id: 'bathrobe', name: 'game.outfits.bathrobe', description: 'a short silk bathrobe, loosely tied at the waist and slipping off one shoulder, a deep plunging neckline showing her cleavage, the hem high on her bare thighs' },
  { id: 'swimsuit', name: 'game.outfits.swimsuit', description: 'a bikini' },
  { id: 'ao-dai', name: 'game.outfits.aoDai', coversStomach: true, description: 'a fitted silk Vietnamese ao dai: a long close-fitting tunic with a high mandarin collar, long sleeves and side slits up to the waist, worn over loose flowing silk trousers' },
  { id: 'sarong', name: 'game.outfits.sarong', coversStomach: true, description: 'a long silk sarong printed with large tropical hibiscus flowers, wrapped around her body and tied behind her neck as a halter dress, the thick opaque fabric hanging loose and smooth from her chest, falling to mid-calf, and a lei of fresh plumeria flowers around her neck' },
  { id: 'sari', name: 'game.outfits.sari', description: 'a traditional silk sari with a woven border, the pallu draped over one shoulder, worn with a matching short fitted blouse, and thin bangles' },
  { id: 'holi', name: 'game.outfits.holi', coversStomach: true, description: 'a simple, loose-fitting white cotton kurta tunic of thick opaque cotton, hanging straight and loose from her chest to her knees, over loose white cotton trousers, with a thin scarf, the clothes, her arms and her cheeks splashed and smeared with bright pink, yellow, green and blue festival color powder' },
  { id: 'echoes', name: 'game.outfits.echoes', coversStomach: true, day: true, locked: 'echoes', description: "a fantasy adventurer's outfit: a fitted leather jerkin over a linen shirt, a hooded traveling cloak hanging straight down her back close to her body, a belt with pouches, fitted trousers, and leather gloves" }
] as const

export type GameOutfit = (typeof GAME_OUTFITS)[number]

/** One of them as an outfit of hers with no pictures, and its pregnant form built on it. */
export function gameOutfit(made: GameOutfit): Outfit[] {
  const name = t(made.name)
  return [
    { id: made.id, name, description: made.description, sprites: {}, pregnant: false, ...('coversStomach' in made && { coversStomach: made.coversStomach }), ...('day' in made && { day: made.day }), ...('locked' in made && { locked: made.locked }) },
    { id: `${made.id}-pregnant`, name: t('game.outfits.pregnant', { name }), inherits: made.id, description: 'She has a round, pregnant belly.', sprites: {}, pregnant: true }
  ]
}

/** Her outfits with each standard one she does not have added after them, with no pictures. */
export function withGameOutfits<T extends Pick<LoveInterest, 'outfits'>>(li: T): T {
  const missing = GAME_OUTFITS.filter((made) => !li.outfits.some((outfit) => outfit.id === made.id))
  return missing.length === 0 ? li : { ...li, outfits: [...li.outfits, ...missing.flatMap(gameOutfit)] }
}

/**
 * Whether an outfit is ready to be worn: one of these, or the pregnant form of one, is once it has pictures (its own, or
 * another of hers it stands in for), since she is given it with none. Any other is as it always was.
 */
export function drawn(outfit: Outfit): boolean {
  const ofOurs = GAME_OUTFITS.some((made) => made.id === outfit.id || (outfit.pregnant && made.id === outfit.inherits))
  return !ofOurs || Object.keys(outfit.sprites).length > 0 || outfit.fallback !== undefined
}
