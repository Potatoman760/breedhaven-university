import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  answerHousingOffer,
  attendViewing,
  buildCharacterPrompt,
  courierThread,
  createInitialState,
  dayAgenda,
  isResident,
  scheduleViewing,
  sceneExtras,
  sendHousingOffer,
  settleAppointments,
  toDate,
  viewingAppointment,
  withHousing
} from '../../shared/game'
import { SceneSchema, type GameState } from '../../shared/model'
import { loadContentPack } from './loader'

/** Being shown the house, played through on the game's own content: yes to the offer, the hour set, the scene, the keys. */
describe('the viewing of the house', () => {
  const written = loadContentPack(join(process.cwd(), 'content', 'default'))
  const housing = written.housing!
  const seen = (state: GameState) => withHousing(written, state)
  const start = createInitialState(seen(createInitialState(written)))
  const mother = written.loveInterests.find((li) => li.kind !== 'npc' && li.id !== housing.nannyId)!.id
  // She is carrying his child and they have an arrangement: that is what the Office writes about.
  const offered = sendHousingOffer(seen(start), { ...start, pregnancies: { [mother]: { conceivedAt: 0, dueAt: 2000 } }, bonds: [{ statusId: 'casual', memberIds: [mother], since: 0 }] })
  const offerAt = courierThread(offered, housing.officerId).findIndex((note) => note.offer === 'housing')
  const accepted = answerHousingOffer(seen(offered), offered, offerAt, true)

  it('is what saying yes sets in train: the house is not his yet', () => {
    expect(offerAt).toBeGreaterThanOrEqual(0)
    expect(accepted.housing.status).toBe('accepted')
    expect(isResident(seen(accepted), accepted)).toBe(false)
    expect(seen(accepted).locations.some((l) => l.id === housing.locationId)).toBe(false)
    expect(seen(accepted).loveInterests.some((li) => li.id === housing.nannyId)).toBe(false)
  })

  const set = scheduleViewing(seen(accepted), accepted)
  const plan = viewingAppointment(set)!

  it('is set for a free stretch of a day to come, in office hours, and she writes to say when', () => {
    expect(plan).toMatchObject({ id: 'house-viewing', kind: 'viewing', loveInterestId: housing.officerId, locationId: housing.viewing!.meetLocationId, hours: 2 })
    const date = toDate(written.calendar, plan.time)
    expect(date.dayIndex).toBeGreaterThan(toDate(written.calendar, accepted.time).dayIndex)
    expect(date.hour).toBeGreaterThanOrEqual(9)
    expect(date.hour + plan.hours).toBeLessThanOrEqual(19)
    // Nothing else of his is in those hours.
    const others = dayAgenda(seen(accepted), accepted, date.dayIndex).filter((item) => item.startHour !== undefined && item.startHour < date.hour + plan.hours && date.hour < item.startHour + (item.hours ?? 1))
    expect(others).toEqual([])
    expect(dayAgenda(seen(set), set, date.dayIndex).find((item) => item.id === 'plan-house-viewing')?.title).toBe(`Viewing of ${housing.name}`)
    expect(courierThread(set, housing.officerId).at(-1)?.text).toContain('I show every Sire his house in person')
    // Once is enough.
    expect(scheduleViewing(seen(set), set)).toBe(set)
  })

  it('is set again when he does not come, with nothing held against him but the wait', () => {
    const late: GameState = { ...set, time: plan.time + plan.hours + 1 }
    // It is not a plan stood up: the ordinary reckoning leaves it alone.
    expect(settleAppointments(seen(late), late).state.appointments).toEqual(late.appointments)
    const again = scheduleViewing(seen(late), late)
    expect(viewingAppointment(again)!.time).toBeGreaterThan(late.time)
    expect(again.appointments.filter((one) => one.kind === 'viewing')).toHaveLength(1)
    expect(courierThread(again, housing.officerId).at(-1)?.text).toContain('you were not at')
    expect(again.housing.status).toBe('accepted')
  })

  it('kept, is a scene at the house with the officer and the nanny, and the house is his', () => {
    const there: GameState = { ...set, time: plan.time, locationId: plan.locationId }
    const { state: after, scene } = attendViewing(seen(there), there, plan.id)
    expect(() => SceneSchema.parse(scene)).not.toThrow()
    expect(after.housing.status).toBe('resident')
    expect(after.locationId).toBe(housing.locationId)
    expect(after.time).toBe(plan.time + plan.hours)
    expect(viewingAppointment(after)).toBeUndefined()
    expect(scene).toMatchObject({ loveInterestId: housing.nannyId, guideId: housing.officerId, npc: false })
    // The pack as it is now has the house and the nanny in it, and the officer is there to be spoken to.
    const pack = seen(after)
    expect(sceneExtras(pack, after, scene).map((npc) => npc.id)).toEqual([housing.officerId])
    const prompt = buildCharacterPrompt({ content: pack, state: after, loveInterestId: scene.loveInterestId, sceneBeats: scene.beats, extras: sceneExtras(pack, after, scene), look: scene, opening: true })
    expect(prompt).toContain(`This is the hour ${after.player.name} is given ${housing.name}`)
    expect(prompt).toContain('Una Fairweather')
    expect(scheduleViewing(pack, after)).toBe(after)
  })
})
