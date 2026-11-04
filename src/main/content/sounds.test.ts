import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CUES, FX_KINDS, NSFW_POSES } from '../../shared/model'
import { loadContentPack } from './loader'

// The sounds are swapped by hand in sounds.json, and a file renamed or left behind would only be heard as silence.
describe('the sounds of the default pack', () => {
  const dir = join(process.cwd(), 'content', 'default')
  const { sounds } = loadContentPack(dir)

  it('has a file for every cue, every loop, and everything it plays', () => {
    expect(CUES.filter((cue) => !sounds.cues[cue])).toEqual([])
    const files = [...Object.values(sounds.cues), ...Object.values(sounds.ambience), ...Object.values(sounds.poses)].map((sound) => sound.file)
    expect(files.filter((file) => !existsSync(join(dir, file)))).toEqual([])
  })

  it('has a sound for every pose', () => {
    expect(NSFW_POSES.filter((pose) => !sounds.poses[pose.id]).map((pose) => pose.id)).toEqual([])
  })

  it('plays the clip of creampie and facial for its own audio', () => {
    expect(['creampie', 'facial'].filter((id) => !sounds.poses[id]?.clip)).toEqual([])
  })

  it("has every sound of every love interest's voice, the same ones for each", () => {
    const { loveInterests } = loadContentPack(dir)
    const files = loveInterests.flatMap((li) => Object.values(li.reactions))
    expect(files.filter((file) => !existsSync(join(dir, file)))).toEqual([])
    const sets = new Set(loveInterests.map((li) => Object.keys(li.reactions).sort().join(',')))
    expect([...sets]).toHaveLength(1)
    expect([...sets][0]).not.toBe('')
  })

  it("has every catch phrase recorded, and in her verbal quirks", () => {
    const { loveInterests } = loadContentPack(dir)
    for (const li of loveInterests) {
      for (const [phrase, file] of Object.entries(li.catchphrases)) {
        expect(file, `${li.id}: ${phrase}`).not.toBe('')
        expect(existsSync(join(dir, file)), `${li.id}: ${file}`).toBe(true)
        expect(li.ai.verbalQuirks.join(' ').toLowerCase(), `${li.id}: ${phrase}`).toContain(phrase.toLowerCase())
      }
    }
  })

  it('has the file of every fight sound and weather loop, each for a kind there is', () => {
    const { calendar } = loadContentPack(dir)
    const files = [...Object.values(sounds.fight).flat(), ...Object.values(sounds.weather), ...Object.values(sounds.music)].map((sound) => sound.file)
    expect(files.filter((file) => !existsSync(join(dir, file)))).toEqual([])
    expect(Object.keys(sounds.fight).filter((kind) => !(FX_KINDS as readonly string[]).includes(kind))).toEqual([])
    expect(Object.keys(sounds.weather).filter((id) => !calendar.weather.some((w) => w.id === id))).toEqual([])
  })

  it('has the recording of every voiced line it lists', () => {
    expect(Object.values(sounds.lines).filter((file) => !existsSync(join(dir, file)))).toEqual([])
  })

  it('credits every sound', () => {
    const all = { ...sounds.cues, ...sounds.ambience, ...sounds.poses }
    expect(Object.entries(all).filter(([, sound]) => sound.credit === '').map(([id]) => id)).toEqual([])
  })
})
