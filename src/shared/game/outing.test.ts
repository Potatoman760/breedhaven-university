import { describe, expect, it } from 'vitest'
import { CourseSchema, CourseworkConfigSchema, NpcSchema, type ContentPack } from '../model'
import { buildOutingPrompt, checkOuting, describeOuting, drillOuting, fallbackOuting, outingMisses, parseOuting, startOuting, suggestDrills } from './outing'
import { playerGains } from './scene'
import { createInitialState } from './state'
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

  it('counts closing time, people who are not around, and plans already made', () => {
    // Bea's class is on now, and over by 09:00.
    const atShop = { ...tea, withIds: ['bea'], locationId: 'shop' }
    expect(checkOuting(content, state, atShop).waitHours).toBe(3)

    const evening = { ...state, time: 9 } // 15:00, when the shop shuts
    expect(checkOuting(content, evening, { ...tea, locationId: 'shop' }).blockers).toContain('the Shop is closed')
    const night = { ...state, time: 10 } // 16:00: Ana has gone, and is back at 05:00, but nothing starts before 06:00
    const lonely = checkOuting(content, night, tea)
    expect(lonely.blockers).toEqual(['Ana is not around'])
    expect(lonely.waitHours).toBe(10)

    const booked = { ...state, appointments: [{ id: 'plan-1', loveInterestId: 'bea', companionIds: [], title: 'Study', time: 1, hours: 2, locationId: 'home' }] }
    const clash = checkOuting(content, booked, tea)
    expect(clash.blockers).toEqual(['You have a plan at 07:00: Study'])
    expect(clash.waitHours).toBe(3)
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
