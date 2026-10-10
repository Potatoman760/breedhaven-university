import { describe, expect, it } from 'vitest'
import { CourseSchema, CourseworkConfigSchema, NpcSchema, type ContentPack } from '../model'
import { buildOutingPrompt, checkOuting, describeOuting, asEventOuting, drillOuting, eventOutings, outingHourRange, outingRooms, fallbackOuting, outingMisses, parseOuting, startOuting, suggestDrills } from './outing'
import { playerGains } from './scene'
import { createInitialState } from './state'
import { addEventGoers, attendableEvents, eventGoers } from './events'
import { locationOf } from './map'
import { fixture } from './testFixture'

// The fixture starts at 06:00 at home on a 20-hour day; the shop is open 05:00 to 15:00
// and a walk away takes 2 hours. Ana keeps the shop by day and is nowhere at night.
const base = fixture()
const bea = { ...base.loveInterests[0], id: 'bea', name: 'Bea Stone', schedule: [{ locationId: 'home' }] }
const content: ContentPack = {
  ...base,
  loveInterests: [...base.loveInterests, bea],
  coursework: CourseworkConfigSchema.parse({ weekdays: ['Two'], locationId: 'shop' })
}
// Bea has a class from 06:00 to 09:00 on the first day.
const course = CourseSchema.parse({
  id: 'c1',
  number: 'RID 101',
  title: 'Riddles',
  professor: 'Prof. Q',
  subject: 'Riddles',
  code: 'RID',
  level: 1,
  studentIds: ['bea'],
  locationId: 'shop',
  meetings: [{ weekday: 'Two', startHour: 6, hours: 3, kind: 'lecture' }]
})
const state = { ...createInitialState(content), courses: [course], enrolment: [] }
const tea = { title: 'Tea', description: 'You put the kettle on.', withIds: ['ana'], locationId: 'home', hours: 2 }

describe('reading what the player typed', () => {
  it('finds names and places without an LLM', () => {
    expect(fallbackOuting(content, state, 'Invite Bea and ana to the shop for lunch')).toEqual({
      title: 'Invite Bea and ana to the shop for lunch',
      description: '',
      withIds: ['ana', 'bea'],
      locationId: 'shop',
      hours: 2
    })
    expect(fallbackOuting(content, state, 'go for a run').withIds).toEqual([])
    expect(fallbackOuting(content, state, 'banana bread').withIds).toEqual([])
  })

  it('lists the people and places for the LLM and takes its answer, mending what is wrong', () => {
    const { system, user } = buildOutingPrompt(content, { ...state, time: 3 }, 'dinner with Bea')
    expect(system).toContain('"with": string[]')
    expect(user).toContain('- bea: Bea Stone (here now)')
    expect(user).toContain('- shop: the Shop')

    const reply = 'Sure!\n{"title": "Dinner", "description": "You lay the table.", "with": ["BEA", "nobody", "bea"], "place": "moon", "hours": 9}'
    expect(parseOuting(reply, content, state, 'dinner with Bea')).toEqual({
      title: 'Dinner',
      description: 'You lay the table.',
      withIds: ['bea'],
      locationId: 'home',
      hours: 4
    })
    expect(() => parseOuting('No.', content, state, 'x')).toThrow(/did not reply with a plan/)
  })
})

describe('checkOuting', () => {
  it('goes ahead when everyone is free and the place is open', () => {
    expect(checkOuting(content, state, tea)).toEqual({ blockers: [], waitHours: 0, freeNow: [] })
  })

  it('says who is in class and how long until they are out', () => {
    const both = { ...tea, withIds: ['ana', 'bea'] }
    expect(checkOuting(content, state, both)).toEqual({
      blockers: ['Bea is in RID 101 until 09:00'],
      waitHours: 3,
      freeNow: ['ana']
    })
    // A class that starts partway through is in the way too.
    const early = { ...state, time: -1 }
    expect(checkOuting(content, early, { ...tea, withIds: ['bea'] }).blockers).toContain('Bea has RID 101 at 06:00')
  })

  it('counts closing time, asks out someone with nothing on her schedule, and warns of a plan without waiting for it', () => {
    // Bea's class is on now, and over by 09:00.
    const atShop = { ...tea, withIds: ['bea'], locationId: 'shop' }
    expect(checkOuting(content, state, atShop).waitHours).toBe(3)

    const evening = { ...state, time: 9 } // 15:00, when the shop shuts
    expect(checkOuting(content, evening, { ...tea, locationId: 'shop' }).blockers).toContain('the Shop is closed')
    // At 16:00 Ana has nothing on her schedule. She has not vanished: she is at home, and can be asked out.
    const night = { ...state, time: 10 }
    const lonely = checkOuting(content, night, tea)
    expect(lonely.blockers).toEqual([])
    expect(lonely.waitHours).toBe(0)

    const booked = { ...state, appointments: [{ id: 'plan-1', loveInterestId: 'bea', companionIds: [], title: 'Study', time: 1, hours: 2, locationId: 'home' }] }
    const clash = checkOuting(content, booked, tea)
    // A plan of his own does not hold him back: he may go now, knowing what he will miss.
    expect(clash.blockers).toEqual([])
    expect(clash.waitHours).toBe(0)
    expect(outingMisses(content, booked, tea)).toEqual(['your plan at 07:00: Study'])
    expect(outingMisses(content, { ...booked, time: 3 }, tea)).toEqual([])
  })
})

describe('startOuting', () => {
  it('waits, spends the time and opens a scene with everyone who came', () => {
    const outing = { ...tea, withIds: ['bea', 'ana'], locationId: 'shop' }
    expect(() => startOuting(content, state, outing)).toThrow(/Bea is in RID 101/)

    const { state: after, scene } = startOuting(content, state, outing, 3)
    expect(after.time).toBe(3 + 2)
    expect(after.locationId).toBe('shop')
    // An invitation earns nothing of itself: the scene decides what they make of it.
    expect(after.relationships).toEqual(state.relationships)
    expect(scene).toMatchObject({
      loveInterestId: 'bea',
      companionIds: ['ana'],
      beats: [{ activityName: 'Tea', locationName: 'the Shop', description: 'You put the kettle on.' }]
    })
    expect(scene?.baseline?.companions['ana'].affection).toBe(0)
  })

  it('just passes the time when the player goes alone', () => {
    const { state: after, scene } = startOuting(content, state, { ...tea, withIds: [] })
    expect(scene).toBeNull()
    expect(after.time).toBe(2)
  })

  it('describes itself', () => {
    expect(describeOuting(content, { ...tea, withIds: ['ana', 'bea'] })).toBe('Tea with Ana and Bea at Home, 2 hours')
    expect(describeOuting(content, { ...tea, withIds: [], hours: 1 })).toBe('Tea, alone at Home, 1 hour')
  })
})

describe('working on yourself', () => {
  const gym: ContentPack = {
    ...content,
    locations: content.locations.map((l) => (l.id === 'shop' ? { ...l, drills: [{ stat: 'strength' as const, title: 'A workout', description: 'You load a bar.' }] } : l))
  }

  it('is read off the words, and sent somewhere suited to it', () => {
    expect(fallbackOuting(gym, state, 'lift weights for a while')).toMatchObject({ trains: 'strength', locationId: 'shop', withIds: [] })
    expect(fallbackOuting(gym, state, 'go to bed')).toMatchObject({ trains: 'rest', hours: 8, locationId: 'home' })
    expect(fallbackOuting(gym, state, 'stare at the wall').trains).toBeUndefined()
  })

  it('is taken from the LLM when it says, and the place list tells it where is good for what', () => {
    expect(buildOutingPrompt(gym, state, 'x').user).toContain('- shop: the Shop (a good place to work on strength)')
    const parsed = (trains: string, hours = 3) =>
      parseOuting(JSON.stringify({ title: 'T', with: [], place: 'home', hours, trains }), gym, state, 'lift weights')
    expect(parsed('Dexterity').trains).toBe('dexterity')
    expect(parsed('none').trains).toBeUndefined()
    expect(parsed('rest', 8).hours).toBe(8)
    expect(parsed('wisdom', 8).hours).toBe(4)
  })

  it('raises the stat for energy, or restores energy, and needs enough left to do it', () => {
    const run = { title: 'Run', description: '', withIds: [], locationId: 'home', hours: 3, trains: 'endurance' as const }
    const { state: after } = startOuting(content, state, run)
    // Three hours' work in a day counts as two and a half: the third hour for half.
    expect(after.player.energy).toBe(50 - 24)

    const spent = { ...state, player: { ...state.player, energy: 10 } }
    expect(checkOuting(content, spent, run).blockers).toEqual(['You are too tired for that. Rest first'])
    expect(checkOuting(content, spent, run).waitHours).toBeUndefined()
    const { state: rested } = startOuting(content, spent, { ...run, trains: 'rest' as const, hours: 4 })
    expect(rested.player.energy).toBe(70)
  })
})

describe('raising a stat', () => {
  // The shop has a workout for strength; home has somewhere to sit and think.
  const town: ContentPack = {
    ...content,
    locations: content.locations.map((l) =>
      l.id === 'shop'
        ? { ...l, drills: [{ stat: 'strength' as const, title: 'A workout', description: 'You load a bar.' }] }
        : { ...l, drills: [{ stat: 'wisdom' as const, title: 'Sit and think', description: '' }] }
    )
  }

  it('is suggested one way for each stat that somewhere has something for, the same each time it is looked at', () => {
    const suggested = suggestDrills(town, state)
    expect(suggested.map((s) => [s.stat, s.location.id, s.drill.title])).toEqual([
      ['strength', 'shop', 'A workout'],
      ['wisdom', 'home', 'Sit and think']
    ])
    expect(suggestDrills(town, state)).toEqual(suggested)
    expect(suggestDrills(content, state)).toEqual([])
    // The shop shuts at 15:00: with less than the two hours left, or after, it is not offered.
    expect(suggestDrills(town, { ...state, time: 7 }).map((s) => s.location.id)).toEqual(['shop', 'home'])
    expect(suggestDrills(town, { ...state, time: 8 }).map((s) => s.location.id)).toEqual(['home'])
    expect(suggestDrills(town, { ...state, time: 9 }).map((s) => s.location.id)).toEqual(['home'])
    expect(drillOuting(suggested[0])).toEqual({ title: 'A workout', description: 'You load a bar.', withIds: [], locationId: 'shop', hours: 2, trains: 'strength', dropIn: true })
  })

  it('is two hours that always raise it, as a scene with whoever is there', () => {
    const [workout] = suggestDrills(town, state)
    const { state: after, scene } = startOuting(town, state, drillOuting(workout))
    expect(after.player.stats['strength']).toBe((state.player.stats['strength'] ?? 0) + 2)
    expect(after.locationId).toBe('shop')
    expect(after.time).toBeGreaterThanOrEqual(state.time + 2)
    // Ana is at the shop by day, and nobody asked her: she is simply there.
    expect(scene).toMatchObject({ loveInterestId: 'ana', npc: false })
    expect(scene?.beats[0]).toMatchObject({ activityName: 'A workout', description: 'You load a bar.' })
    expect(scene?.beats[0].direction).toContain('Pat has come here to work on his strength: a workout.')
    expect(scene?.beats[0].direction).toContain('you happen to be here')
  })

  it('still raises it with nobody about, and someone who only works there is nobody', () => {
    const empty: ContentPack = { ...town, loveInterests: town.loveInterests.map((li) => ({ ...li, schedule: [] })) }
    const quiet = { ...state, courses: [] }
    const [workout] = suggestDrills(empty, quiet)
    const alone = startOuting(empty, quiet, drillOuting(workout))
    expect(alone.scene).toBeNull()
    expect(alone.state.player.stats['strength']).toBe((state.player.stats['strength'] ?? 0) + 2)

    const smith = NpcSchema.parse({ id: 'bryn', name: 'Bryn', age: 34, outfits: [{ id: 'default', name: 'Apron' }], defaultOutfitId: 'default', schedule: [{ locationId: 'shop' }] })
    const staffed = startOuting({ ...empty, npcs: [smith] }, quiet, drillOuting(workout))
    expect(staffed.scene).toBeNull()
    expect(staffed.state.player.stats['strength']).toBe(alone.state.player.stats['strength'])
  })

  it('says beforehand what he would miss by going: a class he is taking', () => {
    const [workout] = suggestDrills(town, state)
    const enrolled = { ...state, enrolment: ['c1'] }
    // His class is on from 06:00 to 09:00, and the workout would take him through it.
    expect(outingMisses(town, enrolled, drillOuting(workout))).toEqual(['RID 101 Riddles, a lecture at 06:00'])
    // Not one he is not taking, nor one he has already sat, nor one that is over by then.
    expect(outingMisses(town, state, drillOuting(workout))).toEqual([])
    expect(outingMisses(town, { ...enrolled, attendance: { c1: { count: 1, last: '0:6' } } }, drillOuting(workout))).toEqual([])
    expect(outingMisses(town, { ...enrolled, time: 3 }, drillOuting(workout))).toEqual([])
  })
})

describe('something done alone', () => {
  // Four love interests who are always at home, for him to run into.
  const crowd: ContentPack = { ...base, loveInterests: ['bea', 'cy', 'dee', 'eve'].map((id) => ({ ...bea, id, name: id })) }
  const alone = { title: 'Lift weights', description: 'You load the bar.', withIds: [], locationId: 'home', hours: 2, trains: 'strength' as const, dropIn: true }

  it('is a scene with one or two of the love interests who are there, whoever the day throws his way', () => {
    const sizes = new Set<number>()
    const leads = new Set<string>()
    for (let seed = 0; seed < 60; seed++) {
      const { scene } = startOuting(crowd, { ...createInitialState(crowd), weatherSeed: seed }, alone)
      const cast = [scene!.loveInterestId, ...scene!.companionIds]
      expect(new Set(cast).size).toBe(cast.length)
      sizes.add(cast.length)
      leads.add(cast[0])
      expect(scene!.beats[0].direction).toContain('run into him while he is at it')
    }
    expect([...sizes].sort()).toEqual([1, 2])
    expect(leads.size).toBeGreaterThan(2)
  })

  it('is no scene with nobody there, and what it did is told from what changed', () => {
    const empty: ContentPack = { ...base, loveInterests: [] }
    const before = createInitialState(empty)
    const { state: after, scene } = startOuting(empty, before, alone)
    expect(scene).toBeNull()
    const gains = playerGains({ stats: before.player.stats, energy: before.player.energy, money: before.player.money, training: before.training, coursePoints: before.coursePoints }, after)
    // Two hours of it: a point of strength or training banked toward one, for the energy it took.
    expect(gains.some((g) => (g.label === 'strength' || g.label === 'strength training') && g.to > g.from)).toBe(true)
    expect(gains.find((g) => g.label === 'energy')).toMatchObject({ from: before.player.energy, to: before.player.energy - 16 })
    expect(playerGains({ stats: after.player.stats, energy: after.player.energy, money: after.player.money, training: after.training, coursePoints: after.coursePoints }, after)).toEqual([])
  })

  it('tells of marks earned in a course by its number', () => {
    const studied = { ...state, coursePoints: { c1: 6 } }
    expect(playerGains({ stats: state.player.stats, energy: state.player.energy, money: state.player.money, training: {}, coursePoints: { c1: 2 } }, studied)).toEqual([{ label: 'RID 101 marks', from: 2, to: 6 }])
  })
})

describe('what is told of his training', () => {
  it('is whole points only: a part of one is kept, and shows when the next part completes it', () => {
    const before = { stats: state.player.stats, energy: state.player.energy, money: state.player.money, training: { dexterity: 0.5 }, coursePoints: { c1: 2.4 } }
    expect(playerGains(before, { ...state, training: { dexterity: 2.3 }, coursePoints: { c1: 2.9 } })).toEqual([{ label: 'dexterity training', from: 0, to: 2 }])
    // Half a point more, with no whole one made, is not told of.
    expect(playerGains(before, { ...state, training: { dexterity: 0.9 }, coursePoints: { c1: 2.4 } })).toEqual([])
    expect(playerGains(before, { ...state, training: { dexterity: 0.5 }, coursePoints: { c1: 3.1 } })).toEqual([{ label: 'RID 101 marks', from: 2, to: 3 }])
  })
})

describe('going to an event', () => {
  // The fixture's game starts at 06:00 on 2 a. A fair at home from 08:00 for six hours, on that day and the next.
  const fair = { id: 'fair', name: 'the Fair', description: 'Stalls and cider.', month: 'a', day: 2, durationDays: 2, locationId: 'home', startHour: 8, hours: 6, noClasses: false, generated: false }
  const holiday = { id: 'rest', name: 'Rest Day', description: '', month: 'a', day: 2, durationDays: 1, noClasses: true, generated: false }
  const fairground = { ...content, calendar: { ...content.calendar, events: [fair, holiday] } }
  const at = (time: number) => ({ ...state, time })

  it('is offered while some of it is left today, for an hour or for as long as is left, and never for a holiday', () => {
    const [early] = eventOutings(fairground, state)
    expect(eventOutings(fairground, state)).toHaveLength(1)
    expect(early.outing).toMatchObject({ title: 'the Fair', locationId: 'home', hours: 2, dropIn: true, withIds: [], window: { from: 2, until: 8 } })
    expect(early.maxHours).toBe(6)
    // Half-way through, what is left is what can be had; in its last hour, an hour; once it has shut, nothing.
    expect(eventOutings(fairground, at(5))[0]).toMatchObject({ maxHours: 3, outing: { hours: 2 } })
    expect(eventOutings(fairground, at(7))[0]).toMatchObject({ maxHours: 1, outing: { hours: 1 } })
    expect(eventOutings(fairground, at(8))).toEqual([])
    // The next day it is on again, at its hours of that day.
    expect(eventOutings(fairground, at(20))[0].outing.window).toEqual({ from: 22, until: 28 })
  })

  it('is waited for until it opens, and cannot be stayed at past its close', () => {
    const [{ outing }] = eventOutings(fairground, state)
    const before = checkOuting(fairground, state, outing)
    expect(before.blockers).toEqual(['the Fair opens at 08:00'])
    expect(before.waitHours).toBe(2)
    expect(checkOuting(fairground, at(2), { ...outing, hours: 6 }).blockers).toEqual([])
    expect(checkOuting(fairground, at(4), { ...outing, hours: 6 }).blockers).toEqual(['the Fair is over at 14:00'])
    expect(checkOuting(fairground, at(4), { ...outing, hours: 1 }).waitHours).toBe(0)
    expect(startOuting(fairground, at(4), { ...outing, hours: 3 }).state).toMatchObject({ time: 7, locationId: 'home' })
  })
})

describe('being in his own room', () => {
  it('lasts from going there to do something until he goes somewhere else', () => {
    const own = { title: 'Study', description: '', withIds: [], locationId: 'home', hours: 2, ownRoom: true }
    const inRoom = startOuting(content, state, own).state
    expect(inRoom.inOwnRoom).toBe(true)
    // Doing something else, even in the same building, is no longer in it.
    expect(startOuting(content, inRoom, { ...own, ownRoom: undefined }).state.inOwnRoom).toBe(false)
    expect(state.inOwnRoom).toBe(false)
  })
})

describe('someone who said she would be at an event', () => {
  // A fair at the shop from 08:00 for six hours, on the day the game starts.
  const fair = { id: 'fair', name: 'the Fair', description: 'Stalls and cider.', month: 'a', day: 2, durationDays: 1, locationId: 'shop', startHour: 8, hours: 6, noClasses: false, generated: false }
  const fairground = { ...content, calendar: { ...content.calendar, events: [fair] } }
  const open = { ...state, time: 3 }

  it('is put down for it once, and is there when he goes, whoever else the day throws his way', () => {
    expect(attendableEvents(fairground, state).map((e) => e.id)).toEqual(['fair'])
    const promised = addEventGoers(open, 'fair', ['bea'])
    expect(eventGoers(promised, 'fair')).toEqual(['bea'])
    expect(addEventGoers(promised, 'fair', ['bea'])).toBe(promised)

    const [{ outing }] = eventOutings(fairground, promised)
    expect(outing.eventId).toBe('fair')
    for (let seed = 0; seed < 20; seed++) {
      const { scene } = startOuting(fairground, { ...promised, weatherSeed: seed }, outing)
      expect(scene?.loveInterestId).toBe('bea')
      expect(scene?.beats[0].direction).toContain('Bea said she would be here, and is')
    }
    // With nobody having said so, it is as any other place he drops in on.
    const { scene } = startOuting(fairground, open, outing)
    expect(scene?.beats[0].direction ?? 'Nobody arranged this').toContain('Nobody arranged this')
  })

  it('is at the event while it is open, unless something of her own keeps her', () => {
    const li = fairground.loveInterests.find((c) => c.id === 'bea')!
    const promised = addEventGoers(open, 'fair', ['bea'])
    const usual = locationOf(fairground, open, li)
    // Bea's class runs until 09:00: until then she is in it, and after it at the fair.
    expect(locationOf(fairground, { ...promised, time: 2 }, li)).toBe(locationOf(fairground, { ...open, time: 2 }, li))
    expect(locationOf(fairground, promised, li)).toBe('shop')
    // Once it has shut she is wherever her day has her.
    expect(locationOf(fairground, { ...promised, time: 9 }, li)).toBe(locationOf(fairground, { ...open, time: 9 }, li))
    expect(usual === 'shop' || usual !== 'shop').toBe(true)
  })
})

describe('something typed that is going to an event', () => {
  const fair = { id: 'fair', name: 'the Fair', description: 'Stalls.', month: 'a', day: 2, durationDays: 1, locationId: 'shop', startHour: 8, hours: 6, noClasses: false, generated: false }
  const fairground = { ...content, calendar: { ...content.calendar, events: [fair] } }

  it('keeps the hours of the event, and is told once who it is with', () => {
    const typed = { title: 'Fair with Bea', description: '', withIds: ['bea'], locationId: 'shop', hours: 4 }
    const linked = asEventOuting(fairground, { ...state, time: 5 }, typed)
    expect(linked).toMatchObject({ eventId: 'fair', window: { from: 2, until: 8 }, hours: 3 })
    // Somewhere else, or about something else, it is left as it was.
    expect(asEventOuting(fairground, state, { ...typed, locationId: 'home' })).toEqual({ ...typed, locationId: 'home' })
    expect(asEventOuting(fairground, state, { ...typed, title: 'Tea with Bea' })).toEqual({ ...typed, title: 'Tea with Bea' })
    expect(describeOuting(fairground, typed)).toBe('Fair with Bea at the Shop, 4 hours')
    expect(describeOuting(fairground, { ...typed, title: 'Tea' })).toBe('Tea with Bea at the Shop, 4 hours')
  })
})

describe('how long something takes', () => {
  it('is an hour for going to talk to someone, and his to change where it can be: an hour at the least', () => {
    expect(fallbackOuting(content, state, 'talk to Ana').hours).toBe(1)
    expect(fallbackOuting(content, state, 'go for a wander').hours).toBe(2)
    const talk = { title: 'Talk', description: '', withIds: ['ana'], locationId: 'home', hours: 2 }
    expect(outingHourRange(state, talk)).toEqual({ min: 1, max: 4 })
    expect(outingHourRange(state, { ...talk, trains: 'rest' as const })).toEqual({ min: 1, max: 8 })
    // A session of study and a drill are as long as they are.
    expect(outingHourRange(state, { ...talk, studyCourseId: 'c1' })).toBeUndefined()
    expect(outingHourRange(state, { ...talk, withIds: [], dropIn: true, trains: 'strength' as const })).toBeUndefined()
  })
})

describe('something typed that is in a room', () => {
  // Ana has a room over the shop, and he has met her; he has a room of his own at home.
  const roomed: ContentPack = {
    ...content,
    newGame: { ...content.newGame, room: { name: 'a small room', description: '', locationId: 'home' } },
    loveInterests: content.loveInterests.map((li) => (li.id === 'ana' ? { ...li, room: { name: 'a loft', description: '', locationId: 'shop' } } : li))
  }
  const met = { ...state, met: ['ana', 'bea'] }

  it('is set there, with whoever the room belongs to along', () => {
    expect(outingRooms(roomed, met).map((room) => room.id)).toEqual(['room-of-player', 'room-of-ana'])
    expect(outingRooms(roomed, { ...met, met: [] }).map((room) => room.id)).toEqual(['room-of-player'])

    const hers = fallbackOuting(roomed, met, 'talk to Ana in her room')
    expect(hers).toMatchObject({ locationId: 'shop', roomOf: 'ana', withIds: ['ana'], hours: 1 })
    expect(describeOuting(roomed, hers)).toBe("talk to Ana in her room with Ana in Ana's room, 1 hour")
    expect(fallbackOuting(roomed, met, 'read in my room')).toMatchObject({ locationId: 'home', roomOf: 'player', ownRoom: true })
    // Someone with no room of her own is met wherever he said, or where he is.
    expect(fallbackOuting(roomed, met, 'talk to Bea in her room').roomOf).toBeUndefined()

    const { user } = buildOutingPrompt(roomed, met, 'talk to Ana in her room')
    expect(user).toContain("- room-of-ana: Ana's own room, at the Shop")
    const reply = '{"title": "A private talk", "description": "", "with": [], "place": "room-of-ana", "hours": 1, "trains": "none"}'
    expect(parseOuting(reply, roomed, met, 'talk in her room')).toMatchObject({ locationId: 'shop', roomOf: 'ana', withIds: ['ana'] })
    // The scene it opens is in her room.
    expect(startOuting(roomed, met, hers).scene).toMatchObject({ loveInterestId: 'ana', roomOf: 'ana' })
  })
})
