import { describe, expect, it } from 'vitest'
import { CalendarEventSchema, type ContentPack, type Outfit } from '../model'
import { dayOutfitsPlanned } from './dayDress'
import { dressForDay, keepDayOutfits, wornOutfit } from './pregnancy'
import { createInitialState } from './state'
import { fixture } from './testFixture'

const outfit = (id: string, day?: boolean): Outfit => ({ id, name: id, description: '', sprites: {}, pregnant: false, ...(day && { day }) })

/** Ana with her usual dress, two more outfits that last the day, and two for a scene alone. */
function wardrobe(): ContentPack {
  const content = fixture()
  const [ana] = content.loveInterests
  return { ...content, loveInterests: [{ ...ana, outfits: [outfit('default'), outfit('jeans', true), outfit('sundress', true), outfit('nude'), outfit('bathrobe')] }] }
}

const scene = (outfitId?: string) => ({ loveInterestId: 'ana', companionIds: [], outfitId, looks: {} })

describe('day outfits', () => {
  it('dress her in her usual clothes when nothing else lasts the day', () => {
    const content = fixture()
    expect(dressForDay(content, createInitialState(content)).dayOutfits).toEqual({ day: 0, worn: { ana: 'default' } })
  })

  it('draw from those that last the day as each day begins, the same as she is shown before it is kept', () => {
    const content = wardrobe()
    const ana = content.loveInterests[0]
    const start = createInitialState(content)
    const drawn = new Set<string>()
    for (let day = 0; day < 40; day++) {
      const morning = { ...start, time: day * content.calendar.hoursPerDay }
      const before = wornOutfit(content, morning, ana)?.id
      const dressed = dressForDay(content, morning)
      expect(dressed.dayOutfits.worn.ana).toBe(before)
      expect(dressForDay(content, dressed)).toBe(dressed)
      drawn.add(dressed.dayOutfits.worn.ana)
    }
    expect([...drawn].sort()).toEqual(['default', 'jeans', 'sundress'])
  })

  it('are kept on after a scene she changes into one in, for the rest of the day and no longer', () => {
    const content = wardrobe()
    const ana = content.loveInterests[0]
    const dressed = dressForDay(content, createInitialState(content))
    const changed = dressed.dayOutfits.worn.ana === 'jeans' ? 'sundress' : 'jeans'

    const kept = keepDayOutfits(content, dressed, scene(changed))
    expect(wornOutfit(content, kept, ana)?.id).toBe(changed)
    // An outfit for the scene alone comes off with it.
    expect(keepDayOutfits(content, kept, scene('nude'))).toEqual(kept)
    expect(keepDayOutfits(content, kept, scene())).toEqual(kept)

    const tomorrow = dressForDay(content, { ...kept, time: kept.time + content.calendar.hoursPerDay })
    expect(tomorrow.dayOutfits.day).toBe(1)
    expect(tomorrow.dayOutfits.worn.ana).toBe(wornOutfit(content, { ...dressed, time: dressed.time + content.calendar.hoursPerDay }, ana)?.id)
  })

  it("begin in what a part of today puts its cast in, where it can last the day, and leave everyone else as drawn", () => {
    const base = wardrobe()
    const [ana] = base.loveInterests
    const bea = { ...ana, id: 'bea', name: 'Bea' }
    // A day-long event starting on the game's first day, with a part for Ana alone.
    const event = (outfitId: string) =>
      CalendarEventSchema.parse({ id: 'fete', name: 'the Fete', month: 'a', day: 2, program: [{ id: 'garden', name: 'Garden', day: 1, startHour: 10, castIds: ['ana'], outfitId }] })
    const withPart = (outfitId: string): ContentPack => ({ ...base, loveInterests: [ana, bea], calendar: { ...base.calendar, events: [event(outfitId)] } })
    for (const day of ['jeans', 'sundress']) {
      const content = withPart(day)
      const start = createInitialState(content)
      expect(dayOutfitsPlanned(content, start)).toEqual({ ana: day })
      expect(dressForDay(content, start, dayOutfitsPlanned(content, start)).dayOutfits.worn.ana).toBe(day)
    }
    // Bea is not in it, and a bathrobe is for a scene alone: both are drawn as any other day.
    const robed = withPart('bathrobe')
    const start = createInitialState(robed)
    const drawn = dressForDay(robed, start).dayOutfits.worn
    expect(dressForDay(robed, start, dayOutfitsPlanned(robed, start)).dayOutfits.worn).toEqual(drawn)
  })
})
