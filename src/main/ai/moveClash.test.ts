import { describe, expect, it } from 'vitest'
import { buildCharacterPrompt } from '../../shared/game/prompt'
import { createInitialState } from '../../shared/game/state'
import { fixture } from '../../shared/game/testFixture'
import { moveClash } from '../../shared/game/upcoming'
import { CourseSchema, CourseworkConfigSchema, type ContentPack, type GameState, type Scene } from '../../shared/model'
import { eventTool, meetingTool, moveTool } from './tools'

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
  it('is offered only then, and ends the scene with the going', () => {
    expect(eventTool(content, taking(8), scene, () => undefined)).toBeUndefined()
    const together: GameState = { ...taking(8), courses: [{ ...course(8, 'home'), studentIds: ['ana'] }] }
    const gone: string[][] = []
    const tool = eventTool(content, together, scene, (next, withIds) => gone.push([next.id, ...withIds]))!
    expect(tool.name).toBe('go_to_event')
    expect(tool.description).toContain('Pat has RID 101: Riddles at 08:00 at Home, and Ana is in it too')
    expect(tool.description).toContain('Use this and not move_scene')
    expect(tool.run({})).toMatch(/^You and Pat set off for RID 101: Riddles at Home./)
    expect(gone).toEqual([['rid', 'ana']])
    expect(eventTool(content, together, { ...scene, npc: true }, () => undefined)).toBeUndefined()
  })
})
