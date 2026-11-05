import { describe, expect, it } from 'vitest'
import { buildMomentPrompt, parseMomentLines } from './momentLines'
import { createInitialState } from './state'
import { fixture } from './testFixture'

const base = fixture()
const [ana] = base.loveInterests
// A trip to the shop, for the drives there and back.
const trip = { ...base.calendar.events[0], id: 'trip', name: 'the Trip', locationId: 'shop', summary: 'a shop by the sea', durationDays: 3 }
const content = { ...base, calendar: { ...base.calendar, events: [...base.calendar.events, trip] }, loveInterests: [ana, { ...ana, id: 'bea', name: 'Bea Stone' }, { ...ana, id: 'cy', name: 'Cy Vane' }] }
const state = createInitialState(content)

describe('the lines at the lanterns', () => {
  it('asks his dates, and only them, for a few romantic words at the pond', () => {
    const { system, user } = buildMomentPrompt(content, state, ['ana', 'bea'], 'lanterns')
    expect(system).toContain('Lantern Festival')
    expect(system).toContain('using only Ana and Bea')
    expect(system).toContain('3 or 4 lines')
    expect(user).toContain('Bea, ')
    expect(user).not.toContain('Cy, ')
    expect(buildMomentPrompt(content, state, ['ana'], 'lanterns').system).toContain('2 lines')
    // The drives ask of whoever is in the car, about the trip it is.
    expect(buildMomentPrompt(content, state, ['bea'], 'drive-there', [], 'trip').system).toContain('on the way to the Shop, a shop by the sea, for the Trip')
    expect(buildMomentPrompt(content, state, ['bea'], 'drive-there', [], 'trip').system).toContain('3 days away')
    expect(buildMomentPrompt(content, state, ['bea'], 'drive-home', [], 'trip').system).toContain('road back from the Shop')
  })

  it('keeps what his dates say, and nothing said by anyone else', () => {
    const reply = 'Ana: I wished for you.\nCy: And me?\nBea: *laughs* Mine goes higher.\nnarration with no name'
    expect(parseMomentLines(reply, content, ['ana', 'bea'])).toEqual([
      { speakerId: 'ana', text: 'I wished for you.' },
      { speakerId: 'bea', text: 'Mine goes higher.' }
    ])
  })
})
