import { describe, expect, it } from 'vitest'
import { ItemSchema, StallSchema, type ContentPack, type GameState } from '../model'
import { buy, canBuy, carried, giftReaction, giveGift, stallsAt } from './market'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// The fixture's shop (open 05:00-15:00) gets one stall. Ana likes flowers and dislikes salt.
const base = fixture()
const content: ContentPack = {
  ...base,
  items: [
    ItemSchema.parse({ id: 'posy', name: 'Posy', description: 'wild flowers', price: 5, tags: ['Flowers'] }),
    ItemSchema.parse({ id: 'pretzel', name: 'Pretzel', price: 3, tags: ['salt'] }),
    ItemSchema.parse({ id: 'stone', name: 'Stone', price: 1, tags: ['stones'] }),
    ItemSchema.parse({ id: 'salted-rose', name: 'Salted rose', price: 9, tags: ['flowers', 'salt'] })
  ],
  stalls: [StallSchema.parse({ id: 'stall', name: 'Stall', locationId: 'shop', itemIds: ['posy', 'pretzel', 'stone'] })],
  loveInterests: [{ ...base.loveInterests[0], likes: ['flowers'], dislikes: ['Salt'] }]
}
const ana = content.loveInterests[0]
const item = (id: string) => content.items.find((i) => i.id === id)!
const atShop = (money: number): GameState => {
  const state = createInitialState(content)
  return { ...state, locationId: 'shop', player: { ...state.player, money } }
}

describe('buying', () => {
  it('finds the stalls at a location', () => {
    expect(stallsAt(content, 'shop').map((s) => s.id)).toEqual(['stall'])
    expect(stallsAt(content, 'home')).toEqual([])
  })

  it('takes the price and adds the item to what is carried', () => {
    const after = buy(content, buy(content, atShop(20), 'posy'), 'posy')
    expect(after.player.money).toBe(10)
    expect(carried(content, after)).toEqual([{ item: item('posy'), count: 2 }])
    expect(after.time).toBe(0)
  })

  it('refuses without enough money, away from the stall, or when the place is shut', () => {
    expect(canBuy(content, atShop(4), 'posy').reasons).toEqual(['Not enough money'])
    expect(canBuy(content, { ...atShop(20), locationId: 'home' }, 'posy').reasons).toEqual(['Not sold here'])
    expect(canBuy(content, atShop(20), 'salted-rose').reasons).toEqual(['Not sold here'])
    expect(canBuy(content, { ...atShop(20), time: 10 }, 'posy').reasons).toEqual(['the Shop is closed'])
    expect(() => buy(content, atShop(0), 'posy')).toThrow(/Not enough money/)
  })
})

describe('giving', () => {
  it('judges a gift by the likes and dislikes it matches, ignoring case', () => {
    expect(giftReaction(item('posy'), ana)).toBe('loved')
    expect(giftReaction(item('pretzel'), ana)).toBe('disliked')
    expect(giftReaction(item('stone'), ana)).toBe('liked')
    expect(giftReaction(item('salted-rose'), ana)).toBe('liked')
  })

  it('uses up the item and moves affection by how well it suits', () => {
    const carrying = { ...atShop(0), inventory: { posy: 2, pretzel: 1 } }
    const loved = giveGift(content, carrying, 'ana', 'posy')
    expect(loved.gift).toEqual({ name: 'Posy', description: 'wild flowers', reaction: 'loved', recipientId: 'ana' })
    expect(loved.state.inventory).toEqual({ posy: 1, pretzel: 1 })
    expect(loved.state.relationships.ana.affection).toBe(6)

    const disliked = giveGift(content, loved.state, 'ana', 'pretzel')
    expect(disliked.state.inventory).toEqual({ posy: 1 })
    expect(disliked.state.relationships.ana.affection).toBe(3)
  })

  it('refuses to give what is not carried', () => {
    expect(() => giveGift(content, atShop(0), 'ana', 'posy')).toThrow(/Cannot give/)
  })

  it('tells the character what they were given and how they feel about it', () => {
    const { state, gift } = giveGift(content, { ...atShop(0), inventory: { posy: 1 } }, 'ana', 'posy')
    const prompt = buildCharacterPrompt({ content, state, loveInterestId: 'ana', gifts: [gift] })
    expect(prompt).toContain('## Gifts Pat has given you in this scene')
    expect(prompt).toContain('- Posy (wild flowers). This is exactly the kind of thing you love.')
    expect(buildCharacterPrompt({ content, state, loveInterestId: 'ana' })).not.toContain('## Gifts')
  })
})

describe('ordering from his phone', () => {
  it('buys from any stall, wherever he is and whatever the hour, for the same money', () => {
    const away = { ...atShop(20), locationId: 'home', time: 10 }
    expect(canBuy(content, away, 'posy').ok).toBe(false)
    expect(canBuy(content, away, 'posy', true).ok).toBe(true)
    const after = buy(content, away, 'posy', true)
    expect(after.inventory['posy']).toBe(1)
    expect(after.player.money).toBeLessThan(20)
    expect(canBuy(content, { ...away, player: { ...away.player, money: 0 } }, 'posy', true).reasons).toEqual(['Not enough money'])
    expect(canBuy(content, away, 'no-such-thing', true).reasons).toEqual(['Not sold anywhere'])
  })
})
