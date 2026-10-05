import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCharacterPrompt, createInitialState } from '../../shared/game'
import { loadContentPack } from './loader'

describe('the default content pack', () => {
  const dir = join(process.cwd(), 'content', 'default')
  const content = loadContentPack(dir)

  it('loads and validates', () => {
    expect(content.loveInterests.length).toBeGreaterThan(0)
    expect(content.codex.length).toBeGreaterThan(0)
    expect(content.calendar.months).toHaveLength(6)
  })

  it('produces a prompt for every love interest', () => {
    const state = createInitialState(content)
    for (const li of content.loveInterests) {
      expect(buildCharacterPrompt({ content, state, loveInterestId: li.id })).toContain(li.name)
    }
  })

  it('has a file on disk for every sprite and animation it names', () => {
    const missing = content.loveInterests.flatMap((li) =>
      [
        ...li.outfits.flatMap((outfit) => Object.values(outfit.sprites).map((s) => s.image)),
        ...li.animations.map((animation) => animation.video)
      ].filter((path) => !existsSync(join(dir, path)))
    )
    expect(missing).toEqual([])
  })

  it('has a file on disk for every background and the map', () => {
    const images = [
      ...content.locations.flatMap((l) => l.backgrounds.map((b) => b.image)),
      ...(content.map?.image ? [content.map.image] : [])
    ]
    expect(images.length).toBeGreaterThan(0)
    expect(images.filter((path) => !existsSync(join(dir, path)))).toEqual([])
  })
})
