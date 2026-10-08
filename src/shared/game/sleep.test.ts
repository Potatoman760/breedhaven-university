import { describe, expect, it } from 'vitest'
import { toDate } from './calendar'
import { checkOuting } from './outing'
import { SLEEP_HOURS, dayMisses, homeOf, isSleepTime, sleep, wakeTime } from './sleep'
import { createInitialState } from './state'
import { fixture } from './testFixture'

const content = fixture()
// The fixture's day has twenty hours, and a new game starts at 06:00.
const state = createInitialState(content)
const hourOf = (time: number) => toDate(content.calendar, time).hour
const midnight = content.calendar.hoursPerDay - hourOf(state.time)

describe('the small hours', () => {
  it('are from midnight until he wakes', () => {
    expect(hourOf(state.time)).toBe(SLEEP_HOURS.until)
    expect(isSleepTime(content, state)).toBe(false)
    expect(isSleepTime(content, { ...state, time: state.time + midnight - 1 })).toBe(false)
    for (let hour = 0; hour < SLEEP_HOURS.until; hour++) expect(isSleepTime(content, { ...state, time: state.time + midnight + hour })).toBe(true)
  })

  it('end the same morning for someone still up past midnight, and the next morning otherwise', () => {
    const late = { ...state, time: state.time + midnight + 2 }
    expect(wakeTime(content, late)).toBe(state.time + content.calendar.hoursPerDay)
    expect(wakeTime(content, state)).toBe(state.time + content.calendar.hoursPerDay)
    const afternoon = { ...state, time: state.time + 7 }
    expect(wakeTime(content, afternoon)).toBe(state.time + content.calendar.hoursPerDay)
  })

  it('let nothing start in them or run into them', () => {
    const walk = { title: 'A walk', description: '', withIds: [], locationId: state.locationId, hours: 2 }
    const late = { ...state, time: state.time + midnight - 1 }
    expect(checkOuting(content, late, walk).blockers).toContain('It would run past midnight, and the night is for sleeping')
    expect(checkOuting(content, { ...state, time: state.time + midnight - 2 }, walk).blockers).not.toContain(
      'It would run past midnight, and the night is for sleeping'
    )
  })
})

describe('sleep', () => {
  it('ends the day at any hour: he wakes at six, rested', () => {
    const tired = { ...state, time: state.time + 3, player: { ...state.player, energy: 5 } }
    const woke = sleep(content, tired)
    expect(hourOf(woke.time)).toBe(SLEEP_HOURS.until)
    expect(toDate(content.calendar, woke.time).dayIndex).toBe(toDate(content.calendar, tired.time).dayIndex + 1)
    expect(woke.player.energy).toBe(woke.player.maxEnergy)
    expect(isSleepTime(content, woke)).toBe(false)
  })

  it('is in his own bed, wherever the night found him', () => {
    expect(sleep(content, { ...state, locationId: 'shop' }).locationId).toBe('home')
    // With a room of his own somewhere else, that is where he wakes.
    const roomed = { ...content, newGame: { ...content.newGame, room: { name: 'a room over the shop', description: '', locationId: 'shop' } } }
    expect(homeOf(roomed)).toBe('shop')
    expect(sleep(roomed, state).locationId).toBe('shop')
  })

  it('says which plans the rest of the day would have held', () => {
    const plan = { id: 'plan-1', loveInterestId: 'bea', companionIds: [], title: 'Study', time: state.time + 4, hours: 2, locationId: state.locationId }
    const tomorrow = { ...plan, id: 'plan-2', title: 'Tea', time: state.time + content.calendar.hoursPerDay + 3 }
    const missed = dayMisses(content, { ...state, appointments: [plan, tomorrow] })
    expect(missed.some((line) => line.startsWith('Study'))).toBe(true)
    expect(missed.some((line) => line.startsWith('Tea'))).toBe(false)
  })
})
