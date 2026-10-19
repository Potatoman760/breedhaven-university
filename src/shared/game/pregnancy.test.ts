import { describe, expect, it } from 'vitest'
import { PregnancyConfigSchema, type ContentPack, type GameState } from '../model'
import { evaluateCondition } from './conditions'
import {
  canConceive,
  periodDay,
  conceive,
  daysUntilDue,
  deliverChild,
  describeChildren,
  describePregnancy,
  pregnancyStage,
  ordinaryOutfit,
  wearableOutfits,
  wornOutfit
} from './pregnancy'
import { buildCharacterPrompt } from './prompt'
import { parseDirectives } from './scene'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// A 20-hour day. Pregnancies last 10 days here, and show from the third.
const base = fixture()
const [ana] = base.loveInterests
const content: ContentPack = {
  ...base,
  loveInterests: [
    {
      ...ana,
      outfits: [...ana.outfits, { id: 'round', name: 'Round', description: 'visibly pregnant', sprites: {}, pregnant: true }]
    },
    { ...ana, id: 'bea', name: 'Bea Stone' }
  ],
  pregnancy: PregnancyConfigSchema.parse({
    chance: 0.5,
    birthControlChance: 0.5,
    periodDays: 0,
    lengthDays: 10,
    recoveryDays: 3,
    daughterChance: 0.5,
    birthLocationId: 'shop',
    stages: [
      { id: 'early', name: 'newly with child', from: 0, description: 'Nothing shows yet.' },
      { id: 'showing', name: 'showing', from: 0.25, showing: true, description: 'Your belly has rounded.' }
    ]
  })
}
const start = createInitialState(content)
const certain: ContentPack = { ...content, pregnancy: { ...content.pregnancy!, chance: 1, birthControlChance: 1 } }
const pregnant = conceive(certain, start, 'ana')
const at = (state: GameState, day: number): GameState => ({ ...state, time: day * 20 })

describe('conception', () => {
  it('is a throw of the dice once a day for each woman, the same however often it is thrown', () => {
    const results = Array.from({ length: 400 }, (_, seed) => conceive(content, { ...start, weatherSeed: seed }, 'ana'))
    const took = results.filter((state) => state.pregnancies['ana']).length
    expect(took).toBeGreaterThan(150)
    expect(took).toBeLessThan(250)

    const unlucky = results.findIndex((state) => !state.pregnancies['ana'])
    const state = { ...start, weatherSeed: unlucky }
    expect(conceive(content, { ...state, time: 5 }, 'ana').pregnancies).toEqual({})
    // Another day is another throw.
    expect(Array.from({ length: 30 }, (_, day) => conceive(content, at(state, day), 'ana')).some((s) => s.pregnancies['ana'])).toBe(true)
  })

  it('sets the day the child is due, the same length for everyone', () => {
    expect(pregnant.pregnancies['ana']).toEqual({ conceivedAt: 0, dueAt: 200 })
    expect(conceive(certain, { ...start, time: 7 }, 'bea').pregnancies['bea']).toEqual({ conceivedAt: 7, dueAt: 207 })
    expect(daysUntilDue(content, at(pregnant, 4), 'ana')).toBe(6)
  })

  it('cannot happen to someone already carrying, a stranger to the game, or a pack without the rules', () => {
    expect(conceive(certain, at(pregnant, 3), 'ana')).toEqual(at(pregnant, 3))
    expect(conceive(certain, start, 'nobody')).toBe(start)
    expect(conceive(base, createInitialState(base), 'ana').pregnancies).toEqual({})
    expect(canConceive(base, createInitialState(base), 'ana')).toBe(false)
  })

  it('is asked of the LLM with a tag, which is taken out of the reply', () => {
    expect(parseDirectives('Stay.\n[SEEDED]\n[END SCENE]')).toMatchObject({ text: 'Stay.', ended: true, seeded: [''] })
    expect(parseDirectives('Ana: Oh.\n[seeded: Ana]\n[SEEDED: Bea Stone]').seeded).toEqual(['Ana', 'Bea Stone'])
    expect(parseDirectives('Hello.').seeded).toEqual([])

    // They have met before: nothing can come of a scene in which she will not go to bed with him.
    const known = { ...start, memories: { ana: [{ time: 0, summary: 'They met.', level: 'normal' as const }], bea: [{ time: 0, summary: 'They met.', level: 'normal' as const }] } }
    const scene = { content, state: known, loveInterestId: 'ana', sceneBeats: [{ activityName: 'Tea' }] }
    expect(buildCharacterPrompt({ ...scene, state: start })).not.toContain('## Conception')
    expect(buildCharacterPrompt(scene)).toContain('write [SEEDED] on a line of its own')
    expect(buildCharacterPrompt({ ...scene, companionIds: ['bea'] })).toContain('write [SEEDED: name]')
    // Not asked for when it could come to nothing.
    expect(buildCharacterPrompt({ ...scene, state: { ...pregnant, memories: known.memories } })).not.toContain('## Conception')
    expect(buildCharacterPrompt({ ...scene, mode: 'courier' })).not.toContain('## Conception')
  })
})

describe('carrying', () => {
  it('moves through its stages, and shows in what she wears once it shows', () => {
    expect(pregnancyStage(content, start, 'ana')).toBeUndefined()
    expect(pregnancyStage(content, at(pregnant, 2), 'ana')?.id).toBe('early')
    expect(pregnancyStage(content, at(pregnant, 3), 'ana')?.id).toBe('showing')

    const her = content.loveInterests[0]
    expect(wornOutfit(content, at(pregnant, 2), her)?.id).toBe('default')
    expect(wornOutfit(content, at(pregnant, 3), her)?.id).toBe('round')
    // What can be asked for is always her ordinary outfits: the pregnant form is the game's to give.
    expect(wearableOutfits(her).map((o) => o.id)).toEqual(['default'])
    // Nor is an outfit kept for one night of the content.
    expect(wearableOutfits({ outfits: [...her.outfits, { id: 'slip', name: 'Slip', description: '', sprites: {}, pregnant: false, oneOff: true }] }).map((o) => o.id)).toEqual(['default'])
    expect(ordinaryOutfit(her, wornOutfit(content, at(pregnant, 3), her)!).id).toBe('default')
    // With the four standard outfits, whatever is chosen for her is given in the form that fits her now.
    const blank = (id: string, isPregnant: boolean) => ({ id, name: id, description: '', sprites: {}, pregnant: isPregnant })
    const four = { ...her, outfits: [blank('default', false), blank('pregnant', true), blank('nude', false), blank('nude-pregnant', true)] }
    const showing = at(pregnant, 3)
    expect(wornOutfit(content, showing, four)?.id).toBe('pregnant')
    expect(wornOutfit(content, showing, four, 'nude')?.id).toBe('nude-pregnant')
    expect(wornOutfit(content, showing, four, 'nude-pregnant')?.id).toBe('nude-pregnant')
    expect(wornOutfit(content, at(pregnant, 2), four, 'nude')?.id).toBe('nude')
    expect(wornOutfit(content, start, four, 'nude-pregnant')?.id).toBe('nude')
    expect(wornOutfit(content, start, four, 'pregnant')?.id).toBe('default')
    expect(ordinaryOutfit(four, wornOutfit(content, showing, four, 'nude')!).id).toBe('nude')
    // She is told she shows, and is offered the same outfits as ever: never the pregnant ones by name.
    const told = buildCharacterPrompt({ content: { ...content, loveInterests: [four, ...content.loveInterests.slice(1)] }, state: showing, loveInterestId: 'ana', look: {} })
    expect(told).toContain('showing. Every picture of you is drawn pregnant by the game')
    expect(told).toContain('You are wearing "default".')
    expect(told).toContain('- nude (nude)')
    expect(told).not.toContain('- pregnant (')
    expect(told).not.toContain('nude-pregnant')
    // Someone with no pregnant outfit keeps what she has.
    const bea = conceive(certain, start, 'bea')
    expect(wornOutfit(content, { ...bea, time: 150 }, content.loveInterests[1])?.id).toBe('default')
  })

  it('is told to her, and to the others once anyone could see it', () => {
    expect(describePregnancy(content, pregnant, 'ana')[0]).toMatch(/^Today the Bloom locked in/)
    const later = describePregnancy(content, at(pregnant, 4), 'ana')
    expect(later[0]).toBe("You are carrying Pat's child: day 5 of about 10, showing. Pat knows.")
    expect(later[1]).toBe('Your belly has rounded.')
    expect(later[2]).toBe('The child is due in about 6 days.')

    expect(describePregnancy(content, at(pregnant, 2), 'bea')).toEqual([])
    expect(describePregnancy(content, at(pregnant, 4), 'bea')).toEqual([
      "Ana is visibly pregnant, and the whole University knows the child is Pat's."
    ])
    expect(buildCharacterPrompt({ content, state: at(pregnant, 4), loveInterestId: 'ana' })).toContain(
      "## Children\nYou are carrying Pat's child"
    )
    expect(buildCharacterPrompt({ content, state: at(pregnant, 4), loveInterestId: 'bea', companionIds: ['ana'] })).toContain(
      "Of Ana, in her own words: You are carrying Pat's child"
    )
  })

  it('can be asked about by activities and secrets', () => {
    const ctx = { content, state: pregnant, loveInterestId: 'ana' }
    expect(evaluateCondition({ type: 'pregnant', value: true }, ctx)).toBe(true)
    expect(evaluateCondition({ type: 'pregnant', loveInterestId: 'bea', value: true }, ctx)).toBe(false)
    expect(evaluateCondition({ type: 'pregnant', loveInterestId: 'bea', value: false }, ctx)).toBe(true)
  })
})

describe('her period', () => {
  const cycling: ContentPack = { ...certain, pregnancy: { ...certain.pregnancy!, periodDays: 4 } }
  it('comes for four days of every twenty-eight, on days of her own, and nothing can be conceived in them', () => {
    const days = Array.from({ length: 28 }, (_, day) => periodDay(cycling, at(start, day), 'ana'))
    expect(days.filter((day) => day !== undefined).sort()).toEqual([1, 2, 3, 4])
    const first = days.indexOf(1)
    const on = at(start, first)
    expect(canConceive(cycling, on, 'ana')).toBe(false)
    expect(conceive(cycling, on, 'ana')).toBe(on)
    expect(describePregnancy(cycling, on, 'ana').join(' ')).toContain('You are on your period: day 1 of 4')
    // It comes round again, and a day clear of it is as it was.
    expect(periodDay(cycling, at(start, first + 28), 'ana')).toBe(1)
    const clear = at(start, days.indexOf(undefined))
    expect(canConceive(cycling, clear, 'ana')).toBe(true)
    expect(describePregnancy(cycling, clear, 'ana').join(' ')).not.toContain('period')
  })

  it('stops while she is carrying, and is nobody\'s in a pack without one', () => {
    const days = Array.from({ length: 28 }, (_, day) => periodDay(cycling, at(start, day), 'ana'))
    const carrying = conceive(cycling, at(start, days.indexOf(undefined)), 'ana')
    expect(periodDay(cycling, { ...carrying, time: days.indexOf(1) * 20 + 28 * 20 * 0 }, 'ana')).toBeUndefined()
    const none: ContentPack = { ...cycling, pregnancy: { ...cycling.pregnancy!, periodDays: 0 } }
    expect(Array.from({ length: 28 }, (_, day) => periodDay(none, at(start, day), 'ana')).every((day) => day === undefined)).toBe(true)
  })
})

describe('birth', () => {
  it('comes when the time is up, records the child, and leaves her able to conceive again after a rest', () => {
    // Nobody who is not carrying is brought to bed.
    expect(deliverChild(content, at(pregnant, 11), 'bea', 200)).toEqual({ state: at(pregnant, 11) })
    const due = at(pregnant, 11)
    const { state: after, child } = deliverChild(content, due, 'ana', 200)
    expect(child).toMatchObject({ motherId: 'ana', bornAt: 200 })
    expect(after.pregnancies).toEqual({})
    expect(after.children).toEqual([child])

    expect(canConceive(content, after, 'ana')).toBe(false)
    expect(canConceive(content, at(after, 13), 'ana')).toBe(true)
    expect(describePregnancy(content, after, 'ana')[0]).toMatch(/^You have borne Pat a (daughter|son), whose name is \w+, born yesterday\./)
    expect(describePregnancy(content, after, 'bea')[0]).toMatch(/^Ana has borne Pat a (daughter|son), \w+\.$/)
    // A child with no house to live in is at the creche.
    expect(describePregnancy(content, after, 'ana')[0]).toContain("at the University's creche")
  })

  it('gives daughters and sons in the proportion the content sets', () => {
    const girls = Array.from({ length: 400 }, (_, seed) => deliverChild(content, at({ ...pregnant, weatherSeed: seed }, 10), 'ana', 200).child!.daughter).filter(Boolean).length
    expect(girls).toBeGreaterThan(150)
    expect(girls).toBeLessThan(250)
    const child = (daughter: boolean) => ({ motherId: 'ana', bornAt: 0, daughter, name: 'Ada' })
    expect(describeChildren([child(true)])).toBe('a daughter')
    expect(describeChildren([child(true), child(false), child(true)])).toBe('2 daughters and a son')
  })
})

describe('an outfit and its pregnant form', () => {
  it('are parent and child: the pregnant one names the other, and is worn in its place once she shows', async () => {
    const { ordinaryOutfit, pregnantForm } = await import('./pregnancy')
    const blank = (id: string, isPregnant: boolean, inherits?: string) => ({ id, name: id, description: '', sprites: {}, pregnant: isPregnant, inherits })
    const outfits = [blank('default', false), blank('pregnant', true, 'default'), blank('nude', false), blank('nude-pregnant', true, 'nude'), blank('gown', false), blank('gown-round', true, 'gown'), blank('swimsuit', false, 'nude')]
    const her = { outfits, defaultOutfitId: 'default' }
    const of = (id: string) => outfits.find((o) => o.id === id)!
    expect(pregnantForm(her, of('default'))?.id).toBe('pregnant')
    expect(pregnantForm(her, of('nude'))?.id).toBe('nude-pregnant')
    // One of her own, with a pregnant form of its own.
    expect(pregnantForm(her, of('gown'))?.id).toBe('gown-round')
    // One with none borrows that of the outfit it is built on.
    expect(pregnantForm(her, of('swimsuit'))?.id).toBe('nude-pregnant')
    expect(ordinaryOutfit(her, of('pregnant')).id).toBe('default')
    expect(ordinaryOutfit(her, of('nude-pregnant')).id).toBe('nude')
    expect(ordinaryOutfit(her, of('gown-round')).id).toBe('gown')
    expect(ordinaryOutfit(her, of('gown')).id).toBe('gown')
  })
})
