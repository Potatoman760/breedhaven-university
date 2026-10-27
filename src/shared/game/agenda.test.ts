import { describe, expect, it } from 'vitest'
import { dayAgainst, timeOn } from './agenda'
import { acceptProposal } from './appointments'
import { createInitialState } from './state'
import { fixture } from './testFixture'

const content = fixture()
const state = createInitialState(content)
const plan = (hour: number, hours = 2) => ({ loveInterestId: 'ana', companionIds: [], title: 'Tea', time: timeOn(content, 1, hour), hours, locationId: 'home' })

describe('dayAgainst', () => {
  const booked = acceptProposal(state, plan(10))

  it('lays a plan over the day it falls on, and names what of his it falls on', () => {
    const day = dayAgainst(content, booked, plan(11))
    expect(day.clashes).toHaveLength(1)
    expect(day.hours.find((one) => one.hour === 11)).toMatchObject({ plan: true, holds: true })
    // The other hour of it is clear: the plan he has ends at noon.
    expect(day.hours.find((one) => one.hour === 12)).toMatchObject({ plan: true, holds: false, mine: undefined })
  })

  it('finds nothing in the way of a plan at a free hour', () => {
    expect(dayAgainst(content, booked, plan(14)).clashes).toEqual([])
  })

  it('shows an event, but does not count it in the way: going to one is up to him', () => {
    const fair = { id: 'fair', name: 'The fair', description: '', month: 'a', day: 3, durationDays: 1, startHour: 13, hours: 3, noClasses: false, generated: true, program: [], secret: false }
    const day = dayAgainst(content, { ...state, events: [fair] }, plan(13))
    expect(day.clashes).toEqual([])
    expect(day.hours.find((one) => one.hour === 13)).toMatchObject({ mine: 'The fair', holds: false, plan: true })
  })

  it('widens the hours shown to take in a plan outside his usual day', () => {
    const hours = dayAgainst(content, state, plan(19, 1)).hours.map((one) => one.hour)
    expect(hours[0]).toBe(8)
    expect(hours.at(-1)).toBe(19)
  })
})
