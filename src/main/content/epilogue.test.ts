import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HOME_PICTURE, LOVE_PICTURE, SIGNATURES } from '../../shared/game/epilogue'

// The epilogue names the pictures of its screens in code: a file renamed or left out would only be a blank screen.
describe('the epilogue of the default pack', () => {
  it('has the pictures its love and house screens are told over, and the certificate\'s signatures', () => {
    for (const file of [LOVE_PICTURE, HOME_PICTURE, ...Object.values(SIGNATURES)]) expect(existsSync(join(process.cwd(), 'content', 'default', file)), file).toBe(true)
  })
})
