import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classChangeDeadline, getawayDays } from '../../shared/game'
import { createInitialState } from '../../shared/game/state'
import { loadContentPack } from './loader'

// The weekend getaways of the default pack: the coast and the campground for friends and up, three flown to for those
// dating, each with weekends to be had in the term, pictures and clips for every view, and its outfits on every woman
// who wears clothes.
describe('the weekend getaways of the default pack', () => {
  const dir = join(process.cwd(), 'content', 'default')
  const content = loadContentPack(dir)

  it('are the coast, the campground, the bay, the atoll and the lake, two days each, with weekends free in the term', () => {
    expect(content.getaways.trips.map((one) => [one.id, one.locationId, one.days, one.minStage, one.price])).toEqual([
      ['brightshore-weekend', 'brightshore', 2, 'friend', 90],
      ['fernhollow-camping', 'fernhollow', 2, 'friend', 40],
      ['jadewater-cruise', 'jadewater', 2, 'dating', 250],
      ['coralmere-escape', 'coralmere', 2, 'dating', 250],
      ['saffron-lake-weekend', 'saffron-lake', 2, 'dating', 200]
    ])
    const state = createInitialState(content)
    for (const one of content.getaways.trips) expect(getawayDays(content, state, one).length, one.id).toBeGreaterThan(3)
  })

  it('make those along gladder the more they cost, in what each is about', () => {
    expect(content.getaways.trips.map((one) => [one.id, one.price, one.gain.affection, one.gain.trust, one.gain.desire])).toEqual([
      ['brightshore-weekend', 90, 7, 5, 7],
      ['fernhollow-camping', 40, 5, 5, 3],
      ['jadewater-cruise', 250, 12, 10, 10],
      ['coralmere-escape', 250, 10, 7, 15],
      ['saffron-lake-weekend', 200, 12, 8, 8]
    ])
  })

  it('are told of by Tamsin, a friend from the start, on the Sunday after class changes close', () => {
    const notice = content.getaways.notice!
    expect(notice.fromId).toBe('tamsin')
    const deadline = classChangeDeadline(content)!
    expect(notice.day).toBe(deadline.dayIndex + 2)
    expect(content.calendar.weekdays[(content.calendar.startWeekday + notice.day - 1) % content.calendar.weekdays.length]).toBe('Sunday')
    expect(notice.text).toContain('Trips app')
  })

  it('drive the coast road to the coast and the autumn road to the woods, and fly to the bay, the atoll and the lake', () => {
    const sky = ['sprites/fx/fly-sky.webp', 'airship']
    expect(content.getaways.trips.map((one) => [one.road, one.travel])).toEqual([['sprites/fx/drive-road-coast.webp', undefined], [undefined, undefined], sky, sky, sky])
  })

  it('have a picture for every view and a clip where it has one, at places that are only for them', () => {
    for (const one of content.getaways.trips) {
      const place = content.locations.find((location) => location.id === one.locationId)!
      expect(place.eventOnly, place.id).toBe(true)
      for (const view of place.backgrounds) {
        expect(existsSync(join(dir, view.images.day!)), view.images.day).toBe(true)
        if (view.clip) expect(existsSync(join(dir, view.clip)), view.clip).toBe(true)
      }
      for (const part of one.program) expect(place.backgrounds.some((view) => view.id === part.viewId), `${one.id}.${part.id}`).toBe(true)
      // Its own road to drive along, where it has one: the coast's for the coast.
      if (one.road) expect(existsSync(join(dir, one.road)), one.road).toBe(true)
    }
  })

  it('put everyone on the bay cruise in her ao dai, but in the cave, which every love interest but Lira has, pregnant too', () => {
    const cruise = content.getaways.trips.find((one) => one.id === 'jadewater-cruise')!
    expect(cruise.program.map((part) => part.outfitId)).toEqual(['ao-dai', 'ao-dai', undefined])
    for (const li of content.loveInterests.filter((one) => one.id !== 'lira')) {
      expect(li.outfits.find((outfit) => outfit.id === 'ao-dai')?.sprites.neutral, li.id).toBeDefined()
      expect(li.outfits.find((outfit) => outfit.id === 'ao-dai-pregnant')?.sprites.neutral, li.id).toBeDefined()
    }
  })

  it('put everyone at the atoll in her swimsuit and then her sarong, and at the lake in her sari and then her festival whites', () => {
    const outfits = (id: string) => content.getaways.trips.find((one) => one.id === id)!.program.map((part) => part.outfitId)
    expect(outfits('coralmere-escape')).toEqual(['swimsuit', 'sarong', 'sarong'])
    expect(outfits('saffron-lake-weekend')).toEqual(['sari', 'sari', 'holi'])
    for (const li of content.loveInterests.filter((one) => one.id !== 'lira')) {
      for (const id of ['sarong', 'sari', 'holi']) {
        expect(li.outfits.find((outfit) => outfit.id === id)?.sprites.neutral, `${li.id} ${id}`).toBeDefined()
        expect(li.outfits.find((outfit) => outfit.id === `${id}-pregnant`)?.sprites.neutral, `${li.id} ${id}`).toBeDefined()
      }
    }
  })

  it('put everyone at the beach in her swimsuit, which every love interest but Lira has, pregnant too', () => {
    for (const li of content.loveInterests.filter((one) => one.id !== 'lira')) {
      const swimsuit = li.outfits.find((outfit) => outfit.id === 'swimsuit')
      expect(swimsuit?.sprites.neutral, li.id).toBeDefined()
      expect(li.outfits.find((outfit) => outfit.id === 'swimsuit-pregnant')?.sprites.neutral, li.id).toBeDefined()
    }
  })
})
