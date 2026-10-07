import { describe, expect, it } from 'vitest'
import { createInitialState, reconcileState } from './state'
import { fixture } from './testFixture'

const content = fixture()

describe('createInitialState', () => {
  it('uses the given player name, or the default when blank', () => {
    expect(createInitialState(content, ' Robin ').player.name).toBe('Robin')
    expect(createInitialState(content, '  ').player.name).toBe('Pat')
    expect(createInitialState(content).player.name).toBe('Pat')
  })
})

describe('reconcileState', () => {
  it('leaves a save that matches the content unchanged', () => {
    const state = { ...createInitialState(content), time: 30, locationId: 'shop' }
    expect(reconcileState(state, content)).toEqual(state)
  })

  it('gives a love interest added since the game began a fresh relationship', () => {
    const stale = { ...createInitialState(content), relationships: { old: { affection: 50, trust: 0, desire: 0 } } }
    const fixed = reconcileState(stale, content)
    expect(fixed.relationships.ana).toEqual({ affection: 0, trust: 0, desire: 0 })
    expect(fixed.relationships.old.affection).toBe(50)
  })
})
