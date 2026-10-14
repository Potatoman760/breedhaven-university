import { describe, expect, it } from 'vitest'
import { ExpeditionConfigSchema, validateContentPack, type ContentPack, type GameState } from '../model'
import { courierThread } from './courier'
import { attendDescent, descentAppointment, scheduleDescent } from './descent'
import { canGoBelow } from './expedition'
import { createInitialState } from './state'
import { rawFixture } from './testFixture'
import { summons } from './upcoming'

// The fixture's Shop is the way down, open from 05:00 to 15:00, and Ana is the one who knows of it.
const raw = rawFixture()
const expedition = (guided: boolean) =>
  ExpeditionConfigSchema.parse({
    entryLocationId: 'shop',
    hours: 2,
    ...(guided ? { guideId: 'ana', intro: { hours: 1, text: 'Meet me at {place}, {date}.', missedText: 'You were not at {place}. Again: {date}.' } } : {}),
    roles: [{ id: 'guard', name: 'Guard', footing: 30, actions: [{ id: 'bash', name: 'Bash', kind: 'attack', power: 4 }] }],
    enemies: [{ id: 'blob', name: 'Blob', footing: 10, attack: 1 }],
    depths: [{ name: 'the Drains', nodes: [{ kind: 'guardian', enemyIds: ['blob'] }], relic: { id: 'stone', name: 'Stone', description: '', modifier: { kind: 'rent', amount: 0.5 } } }]
  })
const content: ContentPack = validateContentPack({ ...raw, expedition: expedition(true) })
const start: GameState = createInitialState(content)

describe('being shown the way down', () => {
  it('is set for an hour of his that is free, by whoever knows of it, who writes to say when', () => {
    expect(canGoBelow(content, { ...start, locationId: 'shop' }, [], 0).reasons).toEqual(['There is no way down'])
    const set = scheduleDescent(content, start)
    const plan = descentAppointment(set)!
    expect(plan).toMatchObject({ kind: 'below', loveInterestId: 'ana', locationId: 'shop', hours: 1 })
    // From tomorrow on, and not before nine.
    expect(plan.time).toBeGreaterThanOrEqual(20 + 3)
    expect(courierThread(set, 'ana').at(-1)?.text).toMatch(/^Meet me at the Shop, .+\.$/)
    expect(set.expedition.invited).toBe(false)
    // Once set, it is not set again.
    expect(scheduleDescent(content, set)).toBe(set)
  })

  it('is put down again when he does not come', () => {
    const set = scheduleDescent(content, start)
    const first = descentAppointment(set)!
    const again = scheduleDescent(content, { ...set, time: first.time + first.hours })
    expect(descentAppointment(again)!.time).toBeGreaterThan(first.time)
    expect(again.appointments.filter((plan) => plan.kind === 'below')).toHaveLength(1)
    expect(courierThread(again, 'ana').at(-1)?.text).toContain('You were not at the Shop')
  })

  it('kept, is a scene with her at the stair in which he learns what is below, and the way down is his from then', () => {
    const set = scheduleDescent(content, start)
    const plan = descentAppointment(set)!
    const { state, scene } = attendDescent(content, { ...set, time: plan.time, locationId: 'shop' }, plan.id)
    expect(scene).toMatchObject({ loveInterestId: 'ana', companionIds: [], npc: false })
    expect(scene.beats[0].direction).toContain('An anchor will only re-seat under his hands')
    expect(scene.beats[0].direction).toContain('There are 1 anchors')
    expect(state).toMatchObject({ locationId: 'shop', expedition: { invited: true } })
    expect(state.met).toContain('ana')
    expect(descentAppointment(state)).toBeUndefined()
    // Shown, there is nothing more to set.
    expect(scheduleDescent(content, state)).toBe(state)
  })

  it('is not to be put off once it is the next thing on his day: nothing else is his to do until he has been', () => {
    const set = scheduleDescent(content, start)
    const plan = descentAppointment(set)!
    // The day before, his time is his own.
    expect(summons(content, set)).toBeUndefined()
    const thatMorning = { ...set, time: plan.time - 2 }
    expect(summons(content, thatMorning)?.id).toBe(plan.id)
    expect(summons(content, { ...set, time: plan.time })?.id).toBe(plan.id)
    // Once kept, or once it has gone by, he is free again.
    expect(summons(content, attendDescent(content, { ...set, time: plan.time, locationId: 'shop' }, plan.id).state)).toBeUndefined()
    expect(summons(content, { ...set, time: plan.time + plan.hours })).toBeUndefined()
  })

  it('is not needed where there is nobody to show him: the way down is simply open', () => {
    const unguided = validateContentPack({ ...raw, expedition: expedition(false) })
    const open = scheduleDescent(unguided, createInitialState(unguided))
    expect(open.expedition.invited).toBe(true)
    expect(open.appointments).toEqual([])
  })
})
