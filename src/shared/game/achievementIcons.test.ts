import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS } from './achievements'

// Steam asks for both of every achievement's icons: the one shown once it is earned, and the one before.
describe('achievement icons', () => {
  it('every achievement has both', () => {
    const dir = join(process.cwd(), 'src', 'assets', 'achievements')
    for (const id of ACHIEVEMENTS) {
      expect(existsSync(join(dir, `${id}.jpg`)), id).toBe(true)
      expect(existsSync(join(dir, `${id}-locked.jpg`)), `${id} locked`).toBe(true)
    }
  })
})
