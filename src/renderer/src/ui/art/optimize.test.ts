import { describe, expect, it } from 'vitest'
import { isPng, pngsIn, renamed } from './optimize'

describe('making pictures smaller', () => {
  const outfits = [
    { id: 'default', sprites: { happy: { image: 'sprites/a/happy.png', description: '' }, sad: { image: 'sprites/a/sad.webp', description: '' } } },
    { id: 'nude', sprites: { happy: { image: 'sprites/a/happy.png', description: 'the same file, in a second outfit' } } }
  ]
  const animations = [{ id: 'facial', image: 'sprites/a/end.PNG', clip: 'sprites/a/clip.mp4' }, { id: 'doggy', image: 'sprites/a/start.png' }]

  it('finds every PNG named, once each, and nothing else', () => {
    expect(pngsIn({ outfits, animations })).toEqual(['sprites/a/happy.png', 'sprites/a/end.PNG', 'sprites/a/start.png'])
    expect(isPng('a/b.webp')).toBe(false)
  })

  it('puts the new picture in every place the old one was, and changes nothing else', () => {
    const after = renamed(outfits, 'sprites/a/happy.png', 'sprites/a/happy.webp')
    expect(after[0].sprites.happy.image).toBe('sprites/a/happy.webp')
    expect(after[1].sprites).toEqual({ happy: { image: 'sprites/a/happy.webp', description: 'the same file, in a second outfit' } })
    expect(after[0].sprites).toMatchObject({ sad: { image: 'sprites/a/sad.webp' } })
    expect(outfits[0].sprites.happy.image).toBe('sprites/a/happy.png')
    expect(renamed(animations, 'sprites/a/start.png', 'sprites/a/start.webp')).toEqual([animations[0], { id: 'doggy', image: 'sprites/a/start.webp' }])
  })
})
