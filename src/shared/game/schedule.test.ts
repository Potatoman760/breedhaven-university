import { describe, expect, it } from 'vitest'
import { LocationSchema } from '../model'
import { backgroundFor, viewImage } from './schedule'

const location = LocationSchema.parse({
  id: 'inn',
  name: 'the Inn',
  backgrounds: [
    { id: 'room', name: 'Common room', images: { day: 'inn.png', night: 'inn-night.png' } },
    { id: 'outside', name: 'Outside', images: { night: 'inn-outside-night.png' } },
    { id: 'cellar', name: 'Cellar' }
  ]
})

describe('backgroundFor', () => {
  it('shows the first view unless another is chosen', () => {
    expect(backgroundFor(location)?.id).toBe('room')
    expect(backgroundFor(location, 'outside')?.id).toBe('outside')
    expect(backgroundFor(location, 'gone')?.id).toBe('room')
    expect(backgroundFor({ ...location, backgrounds: [] })).toBeUndefined()
  })

  it('shows a view named for something going on today, whatever the case, unless another is chosen', () => {
    expect(backgroundFor(location, undefined, ['the Feast', ' OUTSIDE '])?.id).toBe('outside')
    expect(backgroundFor(location, undefined, ['the Feast'])?.id).toBe('room')
    // Only the whole name counts.
    expect(backgroundFor(location, undefined, ['Outside the walls'])?.id).toBe('room')
    expect(backgroundFor(location, 'cellar', ['Outside'])?.id).toBe('cellar')
  })
})

describe('viewImage', () => {
  const [room, outside, cellar] = location.backgrounds

  it('is the picture drawn for the light', () => {
    expect(viewImage(room, 'day')).toBe('inn.png')
    expect(viewImage(room, 'night')).toBe('inn-night.png')
  })

  it('falls back to the other when that one has not been drawn, and to nothing when the view has none', () => {
    expect(viewImage(outside, 'day')).toBe('inn-outside-night.png')
    expect(viewImage(cellar, 'day')).toBeUndefined()
    expect(viewImage(undefined, 'day')).toBeUndefined()
  })
})
