import { describe, expect, it } from 'vitest'
import { ItemSchema, type ContentPack, type GameState } from '../model'
import { buildCharacterPrompt } from './prompt'
import { bringPresents, presentFrom } from './presents'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Fixture calendar: months a (3 days) and b (2 days), 20-hour days; the game starts on 2 a. The feast is on 1 b, day 2.
const base = fixture()
const content: ContentPack = {
  ...base,
  items: [
    ItemSchema.parse({ id: 'posy', name: 'Posy', description: 'wild flowers', price: 5, tags: ['flowers'] }),
    ItemSchema.parse({ id: 'rose', name: 'Rose', description: 'a red rose', price: 5, tags: ['flowers'] }),
    ItemSchema.parse({ id: 'salted-rose', name: 'Salted rose', price: 9, tags: ['flowers', 'salt'] }),
    ItemSchema.parse({ id: 'pretzel', name: 'Pretzel', price: 3, tags: ['salt'] }),
    ItemSchema.parse({ id: 'charm', name: 'Charm', price: 9, tags: ['flowers'], lovedByAll: true })
  ],
  loveInterests: base.loveInterests.map((li) => ({ ...li, likes: ['flowers'], dislikes: ['salt'] })),
  calendar: { ...base.calendar, events: base.calendar.events.map((event) => ({ ...event, presents: true })) }
}
const atDay = (day: number, seed = 1): GameState => ({ ...createInitialState(content, undefined, seed), time: day * 20 })
const ana = content.loveInterests[0]

describe('presentFrom', () => {
  it('is something she likes, not of a kind she dislikes nor made to please anyone', () => {
    for (let seed = 0; seed < 30; seed++) expect(['posy', 'rose']).toContain(presentFrom(content, atDay(2, seed), ana)?.id)
  })

  it('is the same all day, and varies from game to game', () => {
    expect(presentFrom(content, { ...atDay(2), time: 2 * 20 + 8 }, ana)).toBe(presentFrom(content, atDay(2), ana))
    expect(new Set(Array.from({ length: 30 }, (_, seed) => presentFrom(content, atDay(2, seed), ana)?.id)).size).toBe(2)
  })

  it('is nothing when nothing she likes is to be had', () => {
    expect(presentFrom({ ...content, items: content.items.filter((item) => item.tags.includes('salt')) }, atDay(2), ana)).toBeUndefined()
  })
})

describe('bringPresents', () => {
  it('puts her present in his bag the first time they meet on the day, and only then', () => {
    const first = bringPresents(content, atDay(2), ['ana'])
    expect(first.presents).toHaveLength(1)
    expect(first.state.inventory[first.presents[0].itemId]).toBe(1)
    const again = bringPresents(content, first.state, ['ana'])
    expect(again.presents).toEqual([])
    expect(again.state).toBe(first.state)
  })

  it('brings nothing on an ordinary day, or at an event without presents', () => {
    expect(bringPresents(content, atDay(1), ['ana']).presents).toEqual([])
    expect(bringPresents(base, atDay(2), ['ana']).presents).toEqual([])
  })

  it('has her give it in the scene', () => {
    const { state, presents } = bringPresents(content, atDay(2), ['ana'])
    const item = content.items.find((one) => one.id === presents[0].itemId)!
    const prompt = buildCharacterPrompt({ content, state, loveInterestId: 'ana', presents })
    expect(prompt).toContain(`You brought him ${item.name}`)
    // Opening the scene, she begins with it.
    expect(buildCharacterPrompt({ content, state, loveInterestId: 'ana', presents, opening: true })).toContain('Open the scene with it')
    expect(prompt).not.toContain('Open the scene with it')
  })
})
