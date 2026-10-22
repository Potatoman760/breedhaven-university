import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CUES, NSFW_POSES } from '../../shared/model'
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

  it('credits every sound', () => {
    const all = { ...sounds.cues, ...sounds.ambience, ...sounds.poses }
    expect(Object.entries(all).filter(([, sound]) => sound.credit === '').map(([id]) => id)).toEqual([])
  })
})
