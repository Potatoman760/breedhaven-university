import { describe, expect, it } from 'vitest'
import { BackgroundSchema, CalendarEventSchema, type ContentPack, type GameState } from '../model'
import { attendEventPart } from './eventParts'
import { beginMasquerade, guessable, guessDancer, inMasks, masqueradeDancers, nextDance } from './masquerade'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Fixture calendar: months a (3 days) and b (2 days), 20-hour days; the game starts on 2 a at 06:00. The ball is on 3 a.
const base = fixture()
const [ana] = base.loveInterests
const ids = ['bea', 'cy', 'dee', 'eve', 'lira']
const mask = (id: string) => ({ id, name: id[0].toUpperCase() + id.slice(1), description: `a ${id} gown`, sprites: { neutral: `${id}.png` }, walk: `${id}-walk.png`, animations: [{ id: 'doggy', name: 'Doggy', image: `${id}-doggy.png` }] })
const ball = CalendarEventSchema.parse({
  id: 'ball',
  name: 'the Ball',
  month: 'a',
  day: 3,
  locationId: 'shop',
  program: [{ id: 'dance', name: 'The dance', startHour: 8, hours: 3, masquerade: { masks: [mask('red'), mask('blue'), mask('green')], standInId: 'lira', privateViewId: 'terrace' } }]
})
const content: ContentPack = {
  ...base,
  loveInterests: [ana, ...ids.map((id) => ({ ...ana, id, name: `${id[0].toUpperCase()}${id.slice(1)} Doe` }))],
  locations: base.locations.map((l) => (l.id === 'shop' ? { ...l, backgrounds: [...l.backgrounds, BackgroundSchema.parse({ id: 'terrace', name: 'The terrace' })] } : l)),
  calendar: { ...base.calendar, events: [ball] }
}
const part = ball.program[0]
const masquerade = part.masquerade!
// Each closer to him than the last, as named: ana least, eve most.
const game = (met: string[], seed = 1): GameState => {
  const start = createInitialState(content, undefined, seed)
  const closeness = Object.fromEntries(['ana', ...ids].map((id, i) => [id, { affection: i * 10, trust: i * 5, desire: i }]))
  return { ...start, time: 20 + 2, met, relationships: { ...start.relationships, ...closeness } }
}

describe('masqueradeDancers', () => {
  it('are the three closest to him he is in no arrangement with, not the stand-in, each in a mask', () => {
    const state = { ...game(['ana', 'bea', 'cy', 'dee', 'eve', 'lira']), bonds: [{ statusId: 'exclusive', memberIds: ['eve'], since: 0 }] }
    const dancers = masqueradeDancers(content, state, masquerade)
    expect(dancers.map((one) => one.id).sort()).toEqual(['bea', 'cy', 'dee'])
    expect(dancers.every((one) => one.maskId)).toBe(true)
    expect(new Set(dancers.map((one) => one.maskId)).size).toBe(3)
  })

  it('come in an order that is not how close each is', () => {
    const orders = Array.from({ length: 20 }, (_, seed) => masqueradeDancers(content, game(['bea', 'cy', 'dee', 'eve'], seed), masquerade).map((one) => one.id).join())
    expect(new Set(orders).size).toBeGreaterThan(1)
  })

  it('are made up to the number by the stand-in, as she is, and are only her with nobody else', () => {
    expect(masqueradeDancers(content, game(['bea', 'cy']), masquerade).at(-1)).toEqual({ id: 'lira' })
    expect(masqueradeDancers(content, game([]), masquerade)).toEqual([{ id: 'lira' }])
  })
})

describe('the ball', () => {
  const state = game(['bea', 'cy', 'dee'])

  it('is its dances one after another through its hours, and then the unmasking', () => {
    const begun = attendEventPart(content, state, 'ball', 'dance')
    expect(begun.scene?.dance).toBe(true)
    expect(begun.scene?.mask?.revealed).toBe(false)
    expect(begun.scene?.beats[0].direction).toContain('start no sex-act')
    expect(guessable(content, begun.state)).toEqual([])
    const second = nextDance(content, begun.state)!
    const third = nextDance(content, second.state)!
    expect(third.state.time - second.state.time).toBe(1)
    expect(new Set([begun.scene!.loveInterestId, second.scene.loveInterestId, third.scene.loveInterestId])).toEqual(new Set(['bea', 'cy', 'dee']))
    expect(nextDance(content, third.state)).toBeUndefined()
    expect(guessable(content, third.state)).toHaveLength(3)
  })

  it('costs her affection when he names her wrongly, and is over', () => {
    const done = { ...beginMasquerade(content, state, ball, part).state, masquerade: { ...beginMasquerade(content, state, ball, part).state.masquerade!, danced: 3 } }
    const wrong = guessDancer(content, done, 'bea', 'cy')
    expect(wrong.correct).toBe(false)
    expect(wrong.state.relationships['bea'].affection).toBe(done.relationships['bea'].affection - 10)
    expect(wrong.state.masquerade).toBeUndefined()
  })

  it('takes him somewhere quiet with her, still masked, when he names her rightly', () => {
    const started = beginMasquerade(content, state, ball, part).state
    const done = { ...started, masquerade: { ...started.masquerade!, danced: 3 } }
    const right = guessDancer(content, done, 'cy', 'cy')
    expect(right.correct).toBe(true)
    expect(right.scene).toMatchObject({ loveInterestId: 'cy', viewId: 'terrace', uninhibited: ['cy'], mask: { revealed: true } })
  })
})

describe('inMasks', () => {
  const scene = { loveInterestId: 'bea', mask: { maskId: 'red', revealed: false } }

  it('shows her in her mask, by its name, with its sex-acts, until he has named her', () => {
    const shown = inMasks(content, scene, true).loveInterests.find((li) => li.id === 'bea')!
    expect(shown.name).toBe('Red')
    expect(shown.animations.map((a) => a.image)).toEqual(['red-doggy.png'])
    // On the loading screen, she walks in the gown.
    expect(shown.walkSprite).toBe('red-walk.png')
    expect(inMasks(content, { ...scene, mask: { maskId: 'red', revealed: true } }, true).loveInterests.find((li) => li.id === 'bea')!.name).toBe('Bea Doe')
  })

  it('leaves her herself for the LLM, in the gown', () => {
    const told = inMasks(content, scene, false).loveInterests.find((li) => li.id === 'bea')!
    expect(told.name).toBe('Bea Doe')
    expect(told.outfits.map((o) => o.description)).toEqual(['a red gown'])
  })
})
