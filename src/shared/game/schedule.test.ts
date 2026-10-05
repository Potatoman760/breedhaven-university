import { describe, expect, it } from 'vitest'
import { LocationSchema } from '../model'
import { backgroundFor } from './schedule'

const location = LocationSchema.parse({
  id: 'inn',
  name: 'the Inn',
  backgrounds: [
    { id: 'night', name: 'By candlelight', image: 'inn-night.png', periods: ['night'] },
    { id: 'room', name: 'Common room', image: 'inn.png' },
    { id: 'outside', name: 'Outside', image: 'inn-outside.png' }
  ]
})

describe('backgroundFor', () => {
  it('prefers a view made for the current period', () => {
    expect(backgroundFor(location, 'night')?.id).toBe('night')
  })

  it('otherwise uses the first view that is not tied to a period', () => {
    expect(backgroundFor(location, 'day')?.id).toBe('room')
  })

  it('uses the chosen view when it exists', () => {
    expect(backgroundFor(location, 'night', 'outside')?.id).toBe('outside')
    expect(backgroundFor(location, 'day', 'gone')?.id).toBe('room')
  })

  it('falls back to any view, or none', () => {
    const nightOnly = { ...location, backgrounds: [location.backgrounds[0]] }
    expect(backgroundFor(nightOnly, 'day')?.id).toBe('night')
    expect(backgroundFor({ ...location, backgrounds: [] }, 'day')).toBeUndefined()
  })
})
