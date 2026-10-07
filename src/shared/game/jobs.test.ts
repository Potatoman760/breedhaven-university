import { describe, expect, it } from 'vitest'
import { JobsConfigSchema, NpcSchema, validateContentPack, type ContentPack, type GameState } from '../model'
import { dayAgenda } from './agenda'
import { hasContact, courierThread } from './courier'
import {
  applyForJob,
  canApply,
  canWork,
  currentJob,
  excuseShift,
  hoursPerWeek,
  jobFacts,
  payShift,
  quitJob,
  settleShifts,
  shiftClashes,
  shiftLaterToday,
  shiftNow,
  shiftPay,
  startShift
} from './jobs'
import { workplaceNow } from './map'
import { npcsAt, sceneExtras } from './npcs'
import { createInitialState } from './state'
import { fixture, rawFixture } from './testFixture'

// The fixture's week is One, Two, Three on a 20-hour day; the game starts on a Two at 06:00,
// so time 0 is 06:00 on day 0, a day is 20 hours, and day 3 is the next Two. Ana is at the
// shop through the day. Bryn's own day has her at home; a shift has her at the shop all the same.
const smith = NpcSchema.parse({
  id: 'bryn',
  name: 'Bryn',
  role: 'the shopkeeper',
  age: 34,
  outfits: [{ id: 'default', name: 'Apron' }],
  defaultOutfitId: 'default',
  schedule: [{ periods: ['day'], locationId: 'home' }]
})
const jobs = JobsConfigSchema.parse({
  energyPerHour: 5,
  jobs: [
    {
      id: 'clerk',
      title: 'Shop clerk',
      description: 'Mind the counter.',
      locationId: 'shop',
      bossId: 'bryn',
      hourlyRate: 4,
      trains: 'strength',
      requirements: { strength: 6 },
      shifts: [
        { weekday: 'Two', startHour: 8, hours: 3 },
        { weekday: 'Three', startHour: 6, hours: 2 }
      ]
    },
    { id: 'porter', title: 'Porter', locationId: 'home', bossId: 'bryn', hourlyRate: 9, requirements: { strength: 12 }, shifts: [{ weekday: 'One', startHour: 6, hours: 4 }] }
  ]
})
const content: ContentPack = { ...fixture(), npcs: [smith], jobs }
const fresh = createInitialState(content)
const strong: GameState = { ...fresh, player: { ...fresh.player, stats: { strength: 8 } } }
const hired = applyForJob(content, strong, 'clerk')
const at = (state: GameState, time: number, locationId = 'shop'): GameState => ({ ...state, time, locationId })

describe('getting a job', () => {
  it('takes on anyone who meets what it asks, and nobody who does not', () => {
    expect(canApply(content, fresh, 'clerk').reasons).toEqual(['Needs strength 6 (you have 0)'])
    expect(canApply(content, strong, 'clerk').ok).toBe(true)
    // The better-paid job asks more.
    expect(canApply(content, strong, 'porter').reasons).toEqual(['Needs strength 12 (you have 8)'])
    expect(() => applyForJob(content, fresh, 'clerk')).toThrow(/Cannot take/)
    expect(hoursPerWeek(jobs.jobs[0])).toBe(5)
  })

  it('puts his boss in his Chats, with a word from her on when he starts', () => {
    expect(currentJob(content, hired)?.id).toBe('clerk')
    expect(hired.job).toEqual({ jobId: 'clerk', hiredAt: 0, strikes: 0, settledTo: 0, worked: [], excused: [] })
    expect(hasContact(strong, 'bryn')).toBe(false)
    expect(hasContact(hired, 'bryn')).toBe(true)
    expect(courierThread(hired, 'bryn')[0]).toMatchObject({ from: 'them', read: false })
    expect(courierThread(hired, 'bryn')[0].text).toContain('Shop clerk at the Shop. Your shifts are Two 08:00-11:00, Three 06:00-08:00')
  })

  it('is one at a time, and a job he has left will not have him back', () => {
    const mighty = { ...hired, player: { ...hired.player, stats: { strength: 20 } } }
    expect(canApply(content, mighty, 'porter').reasons).toEqual(['You already have a job: Shop clerk'])
    const gone = quitJob(content, mighty)
    expect(gone.job).toBeNull()
    expect(gone.formerJobs).toEqual(['clerk'])
    expect(canApply(content, gone, 'clerk').reasons).toEqual(['They will not have you back'])
    expect(canApply(content, gone, 'porter').ok).toBe(true)
    expect(jobFacts(content, gone, 'bryn')[0]).toContain('used to work for you')
  })

  it('warns of shifts that fall in his classes', () => {
    const lecture = { weekday: 'Two', startHour: 10, hours: 1, kind: 'lecture' as const }
    const course = { id: 'c', number: 'POL 101', title: 'T', professor: 'P', description: '', subject: 'S', code: 'POL', level: 1, general: false, stats: ['wisdom' as const], studentIds: [], locationId: 'shop', meetings: [lecture] }
    expect(shiftClashes({ ...strong, courses: [course], enrolment: ['c'] }, jobs.jobs[0])).toEqual(['Two 08:00-11:00 clashes with POL 101'])
    expect(shiftClashes({ ...strong, courses: [course], enrolment: [] }, jobs.jobs[0])).toEqual([])
  })
})

describe('working a shift', () => {
  it('can be clocked in for at the place while the shift is on', () => {
    expect(shiftNow(content, hired)).toBeUndefined()
    expect(shiftLaterToday(content, hired)).toMatchObject({ key: '0:8', shift: { startHour: 8 } })
    expect(shiftNow(content, at(hired, 2))).toMatchObject({ key: '0:8' })
    expect(shiftLaterToday(content, at(hired, 2))).toBeUndefined()
    expect(canWork(content, at(hired, 2, 'home')).reasons).toEqual(['Go to the Shop first'])
    expect(canWork(content, at(hired, 2)).ok).toBe(true)
    expect(canWork(content, at(hired, 5)).reasons).toEqual(['You have no shift now'])
    // Without a job there is nothing to clock in for.
    expect(shiftNow(content, at(strong, 2))).toBeUndefined()
  })

  it('is a scene at work with his boss there, kept until the shift ends and paid when it is over', () => {
    // An hour late, at 09:00: two hours left.
    const { state, scene } = startShift(content, at(hired, 3))
    expect(state.time).toBe(5)
    expect(state.player.energy).toBe(hired.player.energy - 10)
    expect(state.job?.worked).toEqual(['0:8'])
    // The work builds what the job is good for: two hours of it, which at his 8 is two points of strength.
    expect(state.player.stats['strength']).toBe(10)
    // Ana is at the shop, so the scene is with her, and his boss is about the place.
    expect(scene).toMatchObject({ loveInterestId: 'ana', npc: false, companionIds: [], shift: { jobId: 'clerk', key: '0:8', hours: 2 } })
    expect(scene.beats[0].direction).toContain("Pat's shift at work: he is shop clerk at the Shop, from 08:00 to 11:00")
    expect(scene.beats[0].direction).toContain('Bryn is his boss')
    expect(sceneExtras(content, state, scene).map((npc) => npc.id)).toEqual(['bryn'])
    expect(shiftPay(content, scene)).toBe(8)
    expect(payShift(content, state, scene).player.money).toBe(state.player.money + 8)
    expect(payShift(content, state, { shift: undefined })).toBe(state)
    // The same shift cannot be clocked in for twice.
    expect(() => startShift(content, { ...state, time: 4 })).toThrow(/Cannot work now/)
  })

  it('is a scene with the boss alone when nobody else he knows is there', () => {
    const empty: ContentPack = { ...content, loveInterests: content.loveInterests.map((li) => ({ ...li, schedule: [] })) }
    const { scene } = startShift(empty, at(hired, 2))
    expect(scene).toMatchObject({ loveInterestId: 'bryn', npc: true, shift: { hours: 3 } })
    expect(scene.beats[0].direction).toContain('Nobody else he knows is here')
  })
})

describe('missing a shift', () => {
  it('is a strike, told by his boss, and no strike when he worked it', () => {
    const missed = settleShifts(content, at(hired, 5))
    expect(missed.job).toMatchObject({ strikes: 1, settledTo: 5 })
    expect(courierThread(missed, 'bryn').at(-1)?.text).toBe('You missed your Two 08:00-11:00 shift without a word. That\'s 1 of 3 strikes.')
    // Counted once, however often it is looked at.
    expect(settleShifts(content, missed)).toBe(missed)
    expect(settleShifts(content, { ...missed, time: 6 }).job?.strikes).toBe(1)
    // Still on shift at 10:00: nothing to count yet.
    expect(settleShifts(content, at(hired, 4)).job?.strikes).toBe(0)

    const worked = settleShifts(content, startShift(content, at(hired, 2)).state)
    expect(worked.job?.strikes).toBe(0)
    expect(courierThread(worked, 'bryn')).toHaveLength(1)
  })

  it('counts for half when he told her that day before it began', () => {
    const told = excuseShift(hired, '0:8')
    expect(told.job?.excused).toEqual(['0:8'])
    expect(excuseShift(told, '0:8')).toBe(told)
    const after = settleShifts(content, at(told, 5))
    expect(after.job?.strikes).toBe(0.5)
    expect(courierThread(after, 'bryn').at(-1)?.text).toContain('it still counts for half: you\'re on 0.5 of 3')
    expect(shiftLaterToday(content, told)).toBeUndefined()
  })

  it('loses him the job at the third strike, for good', () => {
    // Day 0 (a Two), day 1 (a Three), and day 3 (the next Two): three shifts, none worked.
    const second = settleShifts(content, at(hired, 20 + 5))
    expect(second.job?.strikes).toBe(2)
    const third = settleShifts(content, at(second, 3 * 20 + 5))
    expect(third.job).toBeNull()
    expect(third.formerJobs).toEqual(['clerk'])
    expect(courierThread(third, 'bryn').at(-1)?.text).toContain("That's 3 strikes. Don't come back")
    expect(canApply(content, third, 'clerk').reasons).toContain('They will not have you back')
    // A shift from before he was taken on is not held against him.
    const late = applyForJob(content, at(strong, 6), 'clerk')
    expect(settleShifts(content, { ...late, time: 10 }).job?.strikes).toBe(0)
  })
})

describe('jobs elsewhere in the game', () => {
  it('are on his calendar, and known to his boss', () => {
    expect(dayAgenda(content, hired, 0).filter((item) => item.kind === 'work')).toEqual([
      { kind: 'work', id: 'work-8', title: 'Shift: Shop clerk', detail: 'the Shop', startHour: 8, hours: 3 }
    ])
    expect(dayAgenda(content, strong, 0).filter((item) => item.kind === 'work')).toEqual([])
    const facts = jobFacts(content, hired, 'bryn')
    expect(facts[0]).toContain('Pat works for you as shop clerk, paid 4 an hour')
    expect(facts[1]).toContain('He has 0 of 3 strikes')
    expect(facts[2]).toBe('He has a shift today at 08:00 that has not started yet.')
    expect(jobFacts(content, excuseShift(hired, '0:8'), 'bryn')[2]).toBe("He has already told you he will miss today's 08:00 shift.")
    expect(jobFacts(content, hired, 'someone-else')).toEqual([])
  })

  it('have the boss at the place for exactly the hours of the shifts, whoever holds the job', () => {
    // 08:00 to 11:00 on a Two is a shift: she is at the shop, though her own day has her at home.
    for (const time of [2, 3, 4]) expect(npcsAt(content, { ...fresh, time }, 'shop').map((npc) => npc.id)).toEqual(['bryn'])
    expect(workplaceNow(content, { ...fresh, time: 2 }, 'bryn')).toBe('shop')
    // Before and after it, she is where her own day puts her.
    for (const time of [0, 1, 5]) {
      expect(workplaceNow(content, { ...fresh, time }, 'bryn')).toBeUndefined()
      expect(npcsAt(content, { ...fresh, time }, 'home').map((npc) => npc.id)).toEqual(['bryn'])
    }
    expect(workplaceNow(content, { ...fresh, time: 2 }, 'ana')).toBeUndefined()
  })

  it('are checked with the rest of the content', () => {
    const pack = (job: object) => () => validateContentPack({ ...rawFixture(), npcs: [smith], jobs: { jobs: [{ ...jobs.jobs[0], ...job }] } })
    expect(pack({})).not.toThrow()
    expect(pack({ bossId: 'nobody' })).toThrow(/unknown character "nobody"/)
    expect(pack({ locationId: 'moon' })).toThrow()
    expect(pack({ shifts: [{ weekday: 'Funday', startHour: 8, hours: 3 }] })).toThrow()
  })
})
