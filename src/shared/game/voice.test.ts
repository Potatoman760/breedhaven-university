import { describe, expect, it } from 'vitest'
import { lineKey, spokenOf } from './voice'

describe('a line written ahead', () => {
  it('is found by who says it and its words, whatever the player is called', () => {
    expect(lineKey('tamsin', 'Hi, Jack!', 'Jack')).toBe(lineKey('tamsin', 'Hi, {player}!', '{player}'))
    expect(lineKey('tamsin', 'Hi, Jack!', 'Jack')).not.toBe(lineKey('anwen', 'Hi, Jack!', 'Jack'))
    expect(lineKey('tamsin', 'Hi there!', 'Jack')).not.toBe(lineKey('tamsin', 'Hi there.', 'Jack'))
  })

  it('is said without what she does and without his name', () => {
    expect(spokenOf('{player}? Is that you?')).toBe('Is that you?')
    expect(spokenOf('Welcome to Breedhaven, {player}.')).toBe('Welcome to Breedhaven.')
    expect(spokenOf('*She laughs.* You came, {player}! *She waves.*')).toBe('You came!')
    expect(spokenOf('*She waves.*')).toBe('')
  })
})
