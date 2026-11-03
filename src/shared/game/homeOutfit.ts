import { babyOutfitId, type ContentPack, type GameState, type LoveInterest, type Outfit, type Scene } from '../model'
import { toDate } from './calendar'
import { AWAKE_HOURS, whereAtHome } from './homeLife'
import { babiesAtHome } from './housing'
import { pregnancyStage, wornOutfit } from './pregnancy'
import { babyToneFor } from './skin'

/**
 * Her holding their child, where she is shown so: in the house, about it while the household is up, with a child of
 * theirs living there, and not herself showing with another; in the outfit for its tone, where she has one drawn. Kept
 * apart from `wornOutfit`, as the house reaches back to the pregnancy rules it is part of.
 */
export function outfitAtHome(content: ContentPack, state: GameState, li: LoveInterest): Outfit | undefined {
  const hour = toDate(content.calendar, state.time).hour
  if (hour < AWAKE_HOURS.from || hour >= AWAKE_HOURS.to) return undefined
  if (state.locationId !== content.housing?.locationId || whereAtHome(content, state, li.id) === undefined) return undefined
  if (!babiesAtHome(state).some((child) => child.motherId === li.id) || pregnancyStage(content, state, li.id)?.showing) return undefined
  const outfit = li.outfits.find((one) => one.id === babyOutfitId(babyToneFor(content, state, li.id)))
  return outfit?.sprites.neutral ? outfit : undefined
}

/** What she is shown in about the house: holding their child where she is, otherwise what she has on. */
export function shownOutfit(content: ContentPack, state: GameState, li: LoveInterest): Outfit | undefined {
  return outfitAtHome(content, state, li) ?? wornOutfit(content, state, li)
}

/** A scene as it opens in the house: whoever in it is holding their child starts so, unless the scene has dressed her already. */
export function dressForHome(content: ContentPack, state: GameState, scene: Scene): Scene {
  let next = scene
  for (const id of [scene.loveInterestId, ...scene.companionIds]) {
    const li = content.loveInterests.find((one) => one.id === id)
    const outfit = li && outfitAtHome(content, state, li)
    if (!outfit) continue
    if (id === scene.loveInterestId) next = next.outfitId === undefined ? { ...next, outfitId: outfit.id } : next
    else if (next.looks?.[id]?.outfitId === undefined) next = { ...next, looks: { ...next.looks, [id]: { ...next.looks?.[id], outfitId: outfit.id } } }
  }
  return next
}
