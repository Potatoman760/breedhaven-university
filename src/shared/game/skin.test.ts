import { describe, expect, it } from 'vitest'
import { babySprite, babyTone, babyToneFor, babyTonesOf, birthPictureFor, posesForTone, withSkinTone } from './skin'
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

  it("is pictured by itself in the pack's picture for its tone, or its mother's own where it takes her tint", () => {
    const base = fixture()
    const ana = base.loveInterests.find((li) => li.id === 'ana')!
    const tinted = { ...base, loveInterests: [{ ...ana, skinTone: 'light' as const, babyTint: 'Pale.', babyPicture: 'sprites/babies/pale.webp' }] }
    const his = (skinTone: 'light' | 'medium' | 'dark') => ({ ...createInitialState(base), player: { ...createInitialState(base).player, skinTone } })
    expect(babySprite(tinted, his('light'), 'ana')).toBe('sprites/babies/pale.webp')
    // A darker father outweighs her tint, and the child is drawn as any of its tone.
    expect(babySprite(tinted, his('dark'), 'ana')).toBe('sprites/babies/medium.webp')
    expect(babySprite(base, his('dark'), 'ana')).toBe(`sprites/babies/${babyToneFor(base, his('dark'), 'ana')}.webp`)
  })

  it("shows a player her sex-acts for his tone, act by act, and the light ones for any act it has none of", () => {
    const pose = (id: string, image?: string) => ({ id, name: id, description: '', loop: true, ...(image && { image }) })
    const ana = {
      animations: [pose('blowjob', 'l-bj.png'), pose('pregnant-blowjob', 'l-pbj.png'), pose('doggy', 'l-dog.png'), pose('pregnant-doggy', 'l-pdog.png')],
      tonedAnimations: { dark: [pose('blowjob', 'd-bj.png'), pose('doggy'), pose('pregnant-doggy', 'd-pdog.png')] }
    }
    const dark = posesForTone(ana, 'dark')
    // Blowjob is drawn dark, so the dark one is shown, and with no pregnant one of its own the pregnant form is not borrowed.
    expect(dark.filter((one) => one.id.endsWith('blowjob')).map((one) => one.image)).toEqual(['d-bj.png'])
    // Doggy has no dark picture of itself, so the act is the light one, pregnant form and all.
    expect(dark.filter((one) => one.id.endsWith('doggy')).map((one) => one.image)).toEqual(['l-dog.png', 'l-pdog.png'])
    expect(posesForTone(ana, 'medium')).toBe(ana.animations)
    expect(posesForTone(ana, 'light')).toBe(ana.animations)
    // The pack a game of a tone reads has her so, and is the same object while nothing changes.
    const base = fixture()
    const content = { ...base, loveInterests: base.loveInterests.map((li) => ({ ...li, ...ana })) }
    expect(withSkinTone(content, 'dark').loveInterests[0].animations).toEqual(dark)
    expect(withSkinTone(content, 'dark')).toBe(withSkinTone(content, 'dark'))
    expect(withSkinTone(content, 'light')).toBe(content)
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
