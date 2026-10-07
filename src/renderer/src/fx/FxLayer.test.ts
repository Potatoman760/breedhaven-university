import { describe, expect, it, vi } from 'vitest'

// The layer's module starts nothing by being imported, but it does pull in the effects
// manager, which would load Phaser; the choice of transition needs neither.
vi.mock('./stageFx', () => ({ stageFx: {} }))

const { transitionBetween } = await import('./FxLayer')

const day = { screen: 'day', locationId: 'court', backgroundId: 'terraces', periodId: 'morning' }

describe('transitionBetween', () => {
  it('marks nothing the first time, or when nothing worth marking has changed', () => {
    expect(transitionBetween(null, day)).toBeNull()
    expect(transitionBetween(day, { ...day })).toBeNull()
    // Picking another view of the same place is a plain cut.
    expect(transitionBetween(day, { ...day, backgroundId: 'steps' })).toBeNull()
  })

  it('wipes to another place, whatever else changed with it', () => {
    expect(transitionBetween(day, { ...day, locationId: 'inn' })).toBe('wipe')
    expect(transitionBetween(day, { screen: 'scene', locationId: 'inn', backgroundId: 'bar', periodId: 'evening' })).toBe('wipe')
  })

  it('opens an iris on a scene and dissolves out of one', () => {
    expect(transitionBetween(day, { ...day, screen: 'scene' })).toBe('iris')
    expect(transitionBetween({ ...day, screen: 'scene' }, { ...day, screen: 'summary' })).toBe('dissolve')
    expect(transitionBetween({ ...day, screen: 'summary' }, day)).toBe('dissolve')
  })

  it('fades when only the time of day has moved on', () => {
    expect(transitionBetween(day, { ...day, periodId: 'evening' })).toBe('fade')
  })
})
