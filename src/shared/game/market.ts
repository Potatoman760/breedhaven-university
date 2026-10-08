import type {
  ContentPack,
  GameState,
  GiftReaction,
  Item,
  LoveInterest,
  SceneGift,
  Stall
} from '../model'
import type { PerformCheck } from './activities'
import { toDate } from './calendar'
import { applyEffect } from './conditions'
import { isOpen } from './schedule'

/** The stalls trading at a location. */
export function stallsAt(content: ContentPack, locationId: string): Stall[] {
  return content.stalls.filter((stall) => stall.locationId === locationId)
}

/** The gifts the player is carrying, with how many of each. */
export function carried(content: ContentPack, state: GameState): { item: Item; count: number }[] {
  return content.items
    .map((item) => ({ item, count: state.inventory[item.id] ?? 0 }))
    .filter((entry) => entry.count > 0)
}

export function canBuy(content: ContentPack, state: GameState, itemId: string): PerformCheck {
  const item = content.items.find((i) => i.id === itemId)
  const sold = stallsAt(content, state.locationId).some((stall) => stall.itemIds.includes(itemId))
  if (!item || !sold) return { ok: false, reasons: ['Not sold here'] }

  const reasons: string[] = []
  const location = content.locations.find((l) => l.id === state.locationId)
  if (location && !isOpen(location, toDate(content.calendar, state.time).hour)) {
    reasons.push(`${location.name} is closed`)
  }
  if (state.player.money < item.price) reasons.push('Not enough money')
  return { ok: reasons.length === 0, reasons }
}

/** Pays for the item and adds it to what the player is carrying. Takes no time. */
export function buy(content: ContentPack, state: GameState, itemId: string): GameState {
  const check = canBuy(content, state, itemId)
  if (!check.ok) throw new Error(`Cannot buy "${itemId}": ${check.reasons.join('; ')}`)
  const item = content.items.find((i) => i.id === itemId)!
  return {
    ...state,
    player: { ...state.player, money: state.player.money - item.price },
    inventory: { ...state.inventory, [itemId]: (state.inventory[itemId] ?? 0) + 1 }
  }
}

/**
 * How a love interest takes a gift: loved if it is a kind of thing they like, disliked
 * if it is a kind they dislike, and merely liked otherwise (or when it is both).
 */
export function giftReaction(item: Item, li: LoveInterest): GiftReaction {
  const among = (list: string[]) =>
    item.tags.some((tag) => list.some((entry) => entry.toLowerCase() === tag.toLowerCase()))
  const liked = among(li.likes)
  const disliked = among(li.dislikes)
  return liked && !disliked ? 'loved' : disliked && !liked ? 'disliked' : 'liked'
}

/** Hands over one carried item: it leaves the inventory and moves the person's affection. */
export function giveGift(
  content: ContentPack,
  state: GameState,
  loveInterestId: string,
  itemId: string
): { state: GameState; gift: SceneGift } {
  const item = content.items.find((i) => i.id === itemId)
  const li = content.loveInterests.find((c) => c.id === loveInterestId)
  const count = state.inventory[itemId] ?? 0
  if (!item || !li || count < 1) throw new Error(`Cannot give "${itemId}" to "${loveInterestId}"`)

  const reaction = giftReaction(item, li)
  const { [itemId]: _given, ...rest } = state.inventory
  const lighter = { ...state, inventory: count > 1 ? { ...rest, [itemId]: count - 1 } : rest }
  return {
    state: applyEffect(
      lighter,
      { type: 'meter', meter: 'affection', amount: content.relationships.gifts[reaction] },
      { content, loveInterestId }
    ),
    gift: { name: item.name, description: item.description, reaction, recipientId: loveInterestId }
  }
}

/**
 * Told to the character so they react to a gift in keeping with their tastes. In a group,
 * pass the recipient's first name so it is clear whose gift and whose taste it is.
 */
export function describeGift(gift: SceneGift, recipient?: string): string {
  if (recipient) {
    const taste = {
      loved: `It is exactly the kind of thing ${recipient} loves.`,
      liked: `${recipient} finds it a kind thought, though not especially to their taste.`,
      disliked: `${recipient} dislikes this kind of thing, and is honest about it in their own way, without cruelty.`
    }[gift.reaction]
    return `To ${recipient}: ${gift.name}${gift.description ? ` (${gift.description})` : ''}. ${taste}`
  }
  const taste = {
    loved: 'This is exactly the kind of thing you love.',
    liked: 'It is a kind thought, though not especially to your taste.',
    disliked: 'You dislike this kind of thing. Be honest about it in your own way, without cruelty.'
  }[gift.reaction]
  return `${gift.name}${gift.description ? ` (${gift.description})` : ''}. ${taste}`
}
