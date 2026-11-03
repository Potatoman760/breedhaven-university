import { describe, expect, it } from 'vitest'
import { babyTone, babyToneFor, babyTonesOf, birthPictureFor } from './skin'
import { createInitialState } from './state'
import { fixture } from './testFixture'

describe('a child of theirs', () => {
  it('is halfway between his tone and hers, and the darker where halfway falls between two', () => {
    expect(babyTone('light', 'light')).toBe('light')
    expect(babyTone('dark', 'dark')).toBe('dark')
    expect(babyTone('light', 'dark')).toBe('medium')
    expect(babyTone('dark', 'light')).toBe('medium')
    expect(babyTone('light', 'medium')).toBe('medium')
    expect(babyTone('medium', 'light')).toBe('medium')
    expect(babyTone('dark', 'medium')).toBe('dark')
    expect(babyTone('medium', 'dark')).toBe('dark')
  })

  it('is drawn in only the tones it can have, or the one her children always are', () => {
    expect(babyTonesOf({ skinTone: 'light' })).toEqual(['light', 'medium'])
    expect(babyTonesOf({ skinTone: 'medium' })).toEqual(['medium', 'dark'])
    expect(babyTonesOf({ skinTone: 'dark' })).toEqual(['medium', 'dark'])
    expect(babyTonesOf({ skinTone: 'medium', ownBabyTone: 'light' })).toEqual(['light'])
  })

  it("is drawn in her picture of that tone, from the player's tone and hers", () => {
    const base = fixture()
    const content = { ...base, loveInterests: base.loveInterests.map((li) => ({ ...li, skinTone: 'light' as const, birthPictures: { light: 'l.png', medium: 'm.png' } })) }
    const pale = createInitialState(content, 'Wren', 0, undefined, '', 'light')
    const deep = createInitialState(content, 'Wren', 0, undefined, '', 'dark')
    expect(babyToneFor(content, deep, 'ana')).toBe('medium')
    expect(birthPictureFor(content, pale, 'ana')).toBe('l.png')
    expect(birthPictureFor(content, deep, 'ana')).toBe('m.png')
  })
})
