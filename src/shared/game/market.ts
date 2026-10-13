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
import { applyEffect, applyEffects } from './conditions'
import { isOpen } from './schedule'
import { factor } from './modifiers'

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

/** What something costs him: its price, less what he has learnt of getting a better one. */
export function priceOf(content: ContentPack, state: GameState, item: Pick<Item, 'price'>): number {
  return Math.max(0, Math.round(item.price * factor(content, state, 'prices')))
}

/**
 * Whether he can buy something. At a stall he has to be where it is sold, while the place is open. Ordered from his phone,
 * anything any stall sells can be had, from wherever he is and at any hour.
 */
export function canBuy(content: ContentPack, state: GameState, itemId: string, byPhone = false): PerformCheck {
  const item = content.items.find((i) => i.id === itemId)
  const sold = (byPhone ? content.stalls : stallsAt(content, state.locationId)).some((stall) => stall.itemIds.includes(itemId))
  if (!item || !sold) return { ok: false, reasons: [byPhone ? 'Not sold anywhere' : 'Not sold here'] }

  const reasons: string[] = []
  const location = content.locations.find((l) => l.id === state.locationId)
  if (!byPhone && location && !isOpen(location, toDate(content.calendar, state.time).hour)) {
    reasons.push(`${location.name} is closed`)
  }
  if (state.player.money < priceOf(content, state, item)) reasons.push('Not enough money')
  return { ok: reasons.length === 0, reasons }
}

/** Pays for the item and adds it to what the player is carrying. Takes no time. */
export function buy(content: ContentPack, state: GameState, itemId: string, byPhone = false): GameState {
  const check = canBuy(content, state, itemId, byPhone)
  if (!check.ok) throw new Error(`Cannot buy "${itemId}": ${check.reasons.join('; ')}`)
  const item = content.items.find((i) => i.id === itemId)!
  return {
    ...state,
    player: { ...state.player, money: state.player.money - priceOf(content, state, item) },
    inventory: { ...state.inventory, [itemId]: (state.inventory[itemId] ?? 0) + 1 }
  }
}

/** What he is carrying with one fewer of something: used, or given away. Unchanged when he has none. */
export function consume(state: GameState, itemId: string): GameState {
  const count = state.inventory[itemId] ?? 0
  if (count < 1) return state
  const { [itemId]: _gone, ...rest } = state.inventory
  return { ...state, inventory: count > 1 ? { ...rest, [itemId]: count - 1 } : rest }
}

/** Whether he can use something he carries: it is a thing that is used, and where it is used on a woman, he is with one. */
export function canUse(content: ContentPack, state: GameState, itemId: string, loveInterestId?: string): PerformCheck {
  const item = content.items.find((i) => i.id === itemId)
  if (!item?.use) return { ok: false, reasons: ['It is not something to use'] }
  if ((state.inventory[itemId] ?? 0) < 1) return { ok: false, reasons: ['You have none'] }
  if (item.use.on === 'her' && loveInterestId === undefined) return { ok: false, reasons: ['It is for someone you are with'] }
  return { ok: true, reasons: [] }
}

/** Uses one of something he carries: it is gone, and what it does is done. */
export function useItem(content: ContentPack, state: GameState, itemId: string, loveInterestId?: string): GameState {
  const item = content.items.find((i) => i.id === itemId)
  if (!item?.use || !canUse(content, state, itemId, loveInterestId).ok) return state
  return applyEffects(consume(state, itemId), item.use.effects, { content, loveInterestId: item.use.on === 'her' ? loveInterestId : undefined, source: item.name })
}

/**
 * How a love interest takes a gift: loved if it is a kind of thing they like, disliked
 * if it is a kind they dislike, and merely liked otherwise (or when it is both).
 */
export function giftReaction(item: Item, li: LoveInterest): GiftReaction {
  // Made to be given: there is nobody it does not suit.
  if (item.lovedByAll) return 'loved'
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
  const worth = content.relationships.gifts[reaction]
  return {
    state: applyEffect(
      lighter,
      // A gift that lands is worth more from someone who knows how to choose one; one that does not is no worse for it.
      { type: 'meter', meter: 'affection', amount: worth > 0 ? Math.round(worth * factor(content, state, 'gifts')) : worth },
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
