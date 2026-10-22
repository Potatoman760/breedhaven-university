import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadWithAddons } from './addons'

// The game's own pack is the base; each test gets an empty add-on folder of its own.
const packDir = join(process.cwd(), 'content', 'default')
const addons = () => join(mkdtempSync(join(tmpdir(), 'bh-events-')), 'addons')
const base = loadWithAddons(packDir, addons())

describe('the Lantern Festival', () => {
  it('is a date at night in the lit garden: two at most, ten gained or lost', () => {
    const lanterns = base.content.calendar.events.find((event) => event.id === 'lantern-festival')!
    expect(lanterns.program).toHaveLength(1)
    expect(lanterns.program[0]).toMatchObject({ startHour: 18, viewId: 'lantern-festival', date: { most: 2, gain: 10, loss: 10 } })
    const garden = base.content.locations.find((place) => place.id === lanterns.locationId)!
    expect(garden.backgrounds.some((view) => view.id === 'lantern-festival')).toBe(true)
  })
})

describe('the Mistmoon Break', () => {
  it('is booked a week ahead, two at most at $150 a head, for those dating him, in place of the Arena Finals', () => {
    const events = base.content.calendar.events
    expect(events.some((event) => event.id === 'arena-finals')).toBe(false)
    const notice = events.find((event) => event.id === 'saltmere-booking')!
    expect(notice.secret).toBe(true)
    expect(notice.program[0]).toMatchObject({ required: true, booking: { eventId: 'mistmoon-break', most: 2, price: 150, minStage: 'dating' } })
  })

  it('is six outings at Saltmere over four days, each with its own opening, the first after the drive there', () => {
    const trip = base.content.calendar.events.find((event) => event.id === 'mistmoon-break')!
    expect(trip).toMatchObject({ durationDays: 4, noClasses: true, noBirths: true, locationId: 'saltmere', homeAt: 18 })
    expect(trip.program.map((part) => [part.day, part.animations])).toEqual([
      [1, ['drive-there', 'soak']],
      [2, ['cascade']],
      [2, ['market']],
      [3, ['private-bath']],
      [3, ['fireworks']],
      [4, ['last-morning']]
    ])
    expect(trip.program.every((part) => part.onTrip && part.required)).toBe(true)
    // The baths start them in their bathrobes.
    expect(trip.program.filter((part) => part.outfitId === 'bathrobe').map((part) => part.id)).toEqual(['first-soak', 'private-bath'])
    const saltmere = base.content.locations.find((place) => place.id === 'saltmere')!
    for (const part of trip.program) expect(saltmere.backgrounds.some((view) => view.id === part.viewId), part.id).toBe(true)
    // Each scene there plays its opening's clip behind it, silent.
    for (const part of trip.program) expect(saltmere.backgrounds.find((view) => view.id === part.viewId)?.clip, part.id).toBe(`sprites/saltmere/${part.viewId}.mp4`)
  })
})

describe('the Feast of First Frost', () => {
  it('snows, wreathes the places dressed for it, and plays its carol at each of them', () => {
    const frost = base.content.calendar.events.find((event) => event.id === 'first-frost')!
    expect(frost).toMatchObject({ weatherId: 'snow', mapDressing: 'sprites/fx/wreath.webp', song: 'sounds/music/magical-marketplace.mp3', presents: true })
    expect(existsSync(join(packDir, frost.song!))).toBe(true)
  })
})

describe('the Masquerade Ball', () => {
  it('takes the Harvest Fair\'s day: three hours of dancing in the Grand Ballroom, in three masks, with Lira standing in', () => {
    const events = base.content.calendar.events
    expect(events.some((event) => event.id === 'harvest-fair')).toBe(false)
    const ball = events.find((event) => event.id === 'masquerade')!
    expect(ball).toMatchObject({ month: 'emberfall', day: 20, locationId: 'ballroom' })
    expect(ball.program[0]).toMatchObject({ startHour: 19, hours: 3, masquerade: { standInId: 'lira', privateViewId: 'terrace', loss: 10 }, cutscene: { speakerId: 'agnes' } })
    const masks = ball.program[0].masquerade!.masks
    expect(masks.map((mask) => mask.id)).toEqual(['crimson', 'midnight', 'emerald'])
    for (const mask of masks) expect(mask.animations.map((pose) => pose.id), mask.id).toEqual(['blowjob', 'doggy', 'missionary', 'creampie'])
    expect(masks.every((mask) => mask.walk)).toBe(true)
    // Only the ball goes to the ballroom.
    expect(base.content.locations.find((place) => place.id === 'ballroom')?.eventOnly).toBe(true)
  })
})
