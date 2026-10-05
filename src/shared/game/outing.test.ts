import { describe, expect, it } from 'vitest'
import { CourseSchema, CourseworkConfigSchema, type ContentPack } from '../model'
import { buildOutingPrompt, checkOuting, describeOuting, fallbackOuting, parseOuting, startOuting } from './outing'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// The fixture starts at 06:00 at home on a 20-hour day; the shop is open 05:00 to 15:00
// and a walk away takes 2 hours. Ana keeps the shop by day and is nowhere at night.
const base = fixture()
const bea = { ...base.loveInterests[0], id: 'bea', name: 'Bea Stone', schedule: [{ locationId: 'home' }] }
const content: ContentPack = {
  ...base,
  loveInterests: [...base.loveInterests, bea],
  coursework: CourseworkConfigSchema.parse({ weekdays: ['Two'], startHours: [6], locationId: 'shop', hours: 3 })
}
// Bea has a class from 06:00 to 09:00 on the first day.
const course = CourseSchema.parse({
  id: 'c1',
  number: 'RID 101',
  title: 'Riddles',
  professor: 'Prof. Q',
  subject: 'Riddles',
  studentIds: ['bea'],
  locationId: 'shop',
  meetings: [{ weekday: 'Two', startHour: 6 }]
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
    expect(checkOuting(content, early, { ...tea, withIds: ['bea'] }).blockers).toEqual(['Bea has RID 101 at 06:00'])
  })

  it('counts the walk, closing time, people who are not around, and plans already made', () => {
    // A two-hour walk to the shop: Bea's class is still on at 08:00, and over by 09:00.
    const atShop = { ...tea, withIds: ['bea'], locationId: 'shop' }
    expect(checkOuting(content, state, atShop).waitHours).toBe(1)

    const evening = { ...state, time: 8 } // 14:00, the shop shuts at 15:00
    expect(checkOuting(content, evening, { ...tea, locationId: 'shop' }).blockers).toContain('the Shop is closed')
    const night = { ...state, time: 10 } // 16:00: Ana has gone
    const lonely = checkOuting(content, night, tea)
    expect(lonely.blockers).toEqual(['Ana is not around'])
    expect(lonely.waitHours).toBe(9)

    const booked = { ...state, appointments: [{ id: 'plan-1', loveInterestId: 'bea', companionIds: [], title: 'Study', time: 1, hours: 2, locationId: 'home' }] }
    const clash = checkOuting(content, booked, tea)
    expect(clash.blockers).toEqual(['You have a plan at 07:00: Study'])
    expect(clash.waitHours).toBe(3)
  })
})

describe('startOuting', () => {
  it('waits, walks, spends the time and opens a scene with everyone who came', () => {
    const outing = { ...tea, withIds: ['bea', 'ana'], locationId: 'shop' }
    expect(() => startOuting(content, state, outing)).toThrow(/Bea is in RID 101/)

    const { state: after, scene } = startOuting(content, state, outing, 1)
    expect(after.time).toBe(1 + 2 + 2)
    expect(after.locationId).toBe('shop')
    expect(after.relationships['bea'].affection).toBe(1)
    expect(after.relationships['ana'].affection).toBe(1)
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
    locations: content.locations.map((l) => (l.id === 'shop' ? { ...l, trains: ['strength' as const] } : l))
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
    expect(after.player.stats['endurance']).toBe(3)
    expect(after.player.energy).toBe(50 - 24)

    const spent = { ...state, player: { ...state.player, energy: 10 } }
    expect(checkOuting(content, spent, run).blockers).toEqual(['You are too tired for that. Rest first'])
    expect(checkOuting(content, spent, run).waitHours).toBeUndefined()
    const { state: rested } = startOuting(content, spent, { ...run, trains: 'rest' as const, hours: 4 })
    expect(rested.player.energy).toBe(70)
  })
})
