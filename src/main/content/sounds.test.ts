import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CUES } from '../../shared/model'
import { loadContentPack } from './loader'

// The sounds are swapped by hand in sounds.json, and a file renamed or left behind would only be heard as silence.
describe('the sounds of the default pack', () => {
  const dir = join(process.cwd(), 'content', 'default')
  const { sounds } = loadContentPack(dir)

  it('has a file for every cue, every loop, and everything it plays', () => {
    expect(CUES.filter((cue) => !sounds.cues[cue])).toEqual([])
    const files = [...Object.values(sounds.cues), ...Object.values(sounds.ambience)].map((sound) => sound.file)
    expect(files.filter((file) => !existsSync(join(dir, file)))).toEqual([])
  })

  it('credits every sound', () => {
    const all = { ...sounds.cues, ...sounds.ambience }
    expect(Object.entries(all).filter(([, sound]) => sound.credit === '').map(([id]) => id)).toEqual([])
  })
})
