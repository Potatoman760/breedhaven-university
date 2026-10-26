import { describe, expect, it } from 'vitest'
import { buildCharacterPrompt } from '../../shared/game/prompt'
import { createInitialState } from '../../shared/game/state'
import { fixture } from '../../shared/game/testFixture'
import { moveClash } from '../../shared/game/upcoming'
import { CourseSchema, CourseworkConfigSchema, type ContentPack, type GameState, type Scene } from '../../shared/model'
import { meetingTool, moveTool, NEXT_EVENT } from './tools'
import { parseDirectives } from '../../shared/game/scene'
import { canSleepOver, sleepOver } from '../../shared/game/sleep'

// The fixture starts at 06:00 at home, on a Two; the shop is a two-hour walk away. He takes a class at home at 08:00.
const base = fixture()
const content: ContentPack = { ...base, coursework: CourseworkConfigSchema.parse({ weekdays: ['Two'], locationId: 'home', energy: 5 }) }
const course = (startHour: number, locationId = 'home') =>
  CourseSchema.parse({
    id: 'rid',
    number: 'RID 101',
    title: 'Riddles',
    professor: 'Prof. Q',
    subject: 'Riddles',
    code: 'RID',
    level: 1,
    studentIds: [],
    locationId,
    meetings: [{ weekday: 'Two', startHour, hours: 1, kind: 'lecture' }]
  })
const taking = (startHour: number, locationId = 'home'): GameState => ({ ...createInitialState(content), courses: [course(startHour, locationId)], enrolment: ['rid'] })
const scene: Scene = {
  baseline: { stats: {}, energy: 0, money: 0, time: 0, relationship: { affection: 0, trust: 0, desire: 0 }, companions: {} },
  loveInterestId: 'ana',
  companionIds: [],
  nsfw: false,
  beats: [{ activityName: 'Tea' }],
  messages: [],
  gifts: [],
  conceived: [],
  departed: [],
  npc: false
}

describe('his timetable and where a scene may go', () => {
  it('is in the way when going would have him elsewhere as something of his starts', () => {
    // Arriving at 08:00, as the class at home begins.
    expect(moveClash(content, taking(8), 2, 'shop')).toMatchObject({ kind: 'class', id: 'rid' })
    // An hour clear before it is enough: arriving at 08:00 for a class at 09:00 is allowed, and so is anything later.
    expect(moveClash(content, taking(9), 2, 'shop')).toBeUndefined()
    expect(moveClash(content, taking(10), 2, 'shop')).toBeUndefined()
    // Less than the hour is not: arriving at 08:00 after staying on, for a class at 08:00.
    expect(moveClash(content, taking(8), 1, 'shop')).toBeUndefined()
    expect(moveClash(content, taking(8), 3, 'shop')).toMatchObject({ id: 'rid' })
    // Going to where it is, in time for it, is walking him to it.
    expect(moveClash(content, taking(8, 'shop'), 2, 'shop')).toBeUndefined()
    expect(moveClash(content, taking(7, 'shop'), 2, 'shop')).toMatchObject({ id: 'rid' })
    expect(moveClash(content, createInitialState(content), 2, 'shop')).toBeUndefined()
  })

  it('has the move refused, with why, and nothing moved', () => {
    const moves: string[] = []
    const tool = moveTool(content, taking(8), scene, (d) => moves.push(d.id))!
    // Two hours more here from 06:00 would have him at the shop as his class at home begins.
    const answer = tool.run({ place: 'shop', hours: 2 })
    expect(answer).toMatch(/^You cannot go to the Shop now: Pat has RID 101: Riddles at 08:00 at Home, in 2 hours, and has to be there\./)
    expect(answer).toContain('Nothing has moved and no time has passed.')
    expect(moves).toEqual([])
    // With the day clear, the same move goes ahead.
    const free = moveTool(content, createInitialState(content), scene, (d) => moves.push(d.id))!
    expect(free.run({ place: 'shop' })).toMatch(/^You and Pat go to the Shop\./)
    expect(moves).toEqual(['shop'])
  })

  it('lets her walk him to it, and says so when it refuses', () => {
    // His class is at the shop at 08:00: going there now gets him to it on time.
    const moves: string[] = []
    const tool = moveTool(content, taking(8, 'shop'), scene, (d) => moves.push(d.id))!
    expect(tool.run({ place: 'shop' })).toMatch(/^You and Pat go to the Shop\./)
    expect(moves).toEqual(['shop'])
    // Staying on three hours first would not, and the refusal says where he has to be.
    expect(tool.run({ place: 'shop', hours: 3 })).toContain('has RID 101: Riddles at 08:00 at the Shop')
    expect(moves).toEqual(['shop'])
  })

  it('is told to the character beforehand, when it is close', () => {
    const soon = buildCharacterPrompt({ content, state: taking(8), loveInterestId: 'ana', sceneBeats: scene.beats })
    expect(soon).toContain('Pat has RID 101: Riddles at 08:00 at Home, in 2 hours, and has to be there.')
    expect(soon).toContain('the game will refuse')
    expect(buildCharacterPrompt({ content, state: taking(12), loveInterestId: 'ana', sceneBeats: scene.beats })).not.toContain('has to be there')
    expect(buildCharacterPrompt({ content, state: createInitialState(content), loveInterestId: 'ana', sceneBeats: scene.beats })).not.toContain('has to be there')
  })
})

describe('going now and meeting later', () => {
  it('are told apart: each tool says which it is for, and a plan for where the scene has just gone is not made', () => {
    const state = createInitialState(content)
    expect(moveTool(content, state, scene, () => undefined)!.description).toContain('For meeting another time')
    const plans: string[] = []
    let gone: string | undefined
    const meet = meetingTool(content, state, 'ana', (p) => plans.push(p.locationId), ['ana'], () => gone)
    expect(meet.description).toContain('For going somewhere together right now, call move_scene')
    // By message there is no going anywhere together: the tool is the one way to arrange anything, today included, and says nothing of a tool that is not there.
    const byMessage = meetingTool(content, state, 'ana', () => undefined)
    expect(byMessage.description).not.toContain('move_scene')
    expect(byMessage.description).toContain('this is the only way anything is arranged')
    gone = 'shop'
    expect(meet.run({ activity: 'tea', place: 'shop' })).toMatch(/^You have just gone to the Shop with move_scene/)
    expect(plans).toEqual([])
    // Somewhere else, or with the scene where it was, a plan is made as ever.
    gone = undefined
    meet.run({ activity: 'tea', place: 'shop' })
    expect(plans).toEqual(['shop'])
  })
})

describe('setting off together for something of his that is hers too', () => {
  it('is a place the move tool offers only then, and ends the scene with the going', () => {
    const places = (tool: ReturnType<typeof moveTool>) => (tool!.parameters['properties'] as { place: { enum: string[] } }).place.enum
    const alone = moveTool(content, taking(8), scene, () => undefined, () => undefined)
    expect(places(alone)).not.toContain(NEXT_EVENT)

    const together: GameState = { ...taking(8), courses: [{ ...course(8, 'home'), studentIds: ['ana'] }] }
    const gone: string[][] = []
    const moved: string[] = []
    const tool = moveTool(content, together, scene, (d) => moved.push(d.id), (next, withIds) => gone.push([next.id, ...withIds]))!
    expect(places(tool)).toContain(NEXT_EVENT)
    expect(tool.description).toContain('next-event is RID 101: Riddles at 08:00 at Home, which Pat has next and Ana is in too')
    expect(tool.run({ place: NEXT_EVENT })).toMatch(/^You and Pat set off for RID 101: Riddles at Home\./)
    expect(gone).toEqual([['rid', 'ana']])
    expect(moved).toEqual([])
    // Asked for with nothing shared, it is not somewhere to go.
    expect(alone!.run({ place: NEXT_EVENT })).toMatch(/^You cannot go to "next-event"/)
  })
})

describe('spending the night together', () => {
  // The fixture's day is twenty hours long and starts at 06:00: time 14 is 20:00.
  const fresh = createInitialState(content)
  const evening: GameState = { ...fresh, time: 14, locationId: 'shop', player: { ...fresh.player, energy: 3 } }

  it('can be done from the evening on, and wakes him rested the next morning in the same place', () => {
    expect(canSleepOver(content, { ...evening, time: 13 })).toBe(false)
    expect(canSleepOver(content, evening)).toBe(true)
    const morning = sleepOver(content, evening)
    expect(morning.time).toBe(20)
    expect(morning.locationId).toBe('shop')
    expect(morning.player.energy).toBe(morning.player.maxEnergy)
  })

  it('is asked for with a line of its own, which she is told of only when it is late', () => {
    const late = buildCharacterPrompt({ content, state: evening, loveInterestId: 'ana', sceneBeats: scene.beats })
    expect(late).toContain('put [SLEEP] on a line of its own at its end: that closes the scene, and Pat wakes here in the morning')
    expect(buildCharacterPrompt({ content, state: fresh, loveInterestId: 'ana', sceneBeats: scene.beats })).not.toContain('[SLEEP]')
    expect(parseDirectives('They drift off.\n[SLEEP]')).toMatchObject({ text: 'They drift off.', slept: true })
  })
})

describe('saying she will be at an event', () => {
  const fair = { id: 'fair', name: 'the Fair', description: 'Stalls.', month: 'a', day: 2, durationDays: 1, locationId: 'shop', startHour: 8, hours: 6, noClasses: false, generated: false, program: [], secret: false }
  const fairground = { ...content, calendar: { ...content.calendar, events: [fair] } }
  const state = createInitialState(fairground)

  it('is a line of its own, which she is told of while there is an event to go to', () => {
    const told = buildCharacterPrompt({ content: fairground, state, loveInterestId: 'ana', sceneBeats: scene.beats })
    expect(told).toContain('write [ATTENDING: id] on a line of its own')
    expect(told).toContain('fair is the Fair')
    expect(buildCharacterPrompt({ content, state: createInitialState(content), loveInterestId: 'ana', sceneBeats: scene.beats })).not.toContain('[ATTENDING')
    expect(parseDirectives('See you there.\n[ATTENDING: fair]').attending).toEqual([{ name: '', eventId: 'fair' }])
  })
})

describe('agreeing in words to a plan already suggested', () => {
  const state = createInitialState(content)
  const pending = { loveInterestId: 'ana', companionIds: [], title: 'Tea', time: 30, hours: 2, locationId: 'shop' }

  it('is a line of its own, which she is told of only while such a plan is waiting', () => {
    const plain = buildCharacterPrompt({ content, state, loveInterestId: 'ana', sceneBeats: scene.beats })
    expect(plain).toContain('Making plans to meet again')
    expect(plain).toContain('Saying "see you then" without calling it arranges nothing')
    expect(plain).not.toContain('[AGREED]')
    const waiting = buildCharacterPrompt({ content, state, loveInterestId: 'ana', sceneBeats: scene.beats, pendingProposal: pending })
    expect(waiting).toContain('You have already suggested "Tea" on')
    expect(waiting).toContain('write [AGREED] on a line of its own at the end of your reply, which books it')
    expect(parseDirectives('Thursday it is.\n[AGREED]')).toMatchObject({ text: 'Thursday it is.', agreed: true })
  })
})
