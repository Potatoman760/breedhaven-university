import { describe, expect, it } from 'vitest'
import type { ContentPack, Outfit } from '../model'
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
})
