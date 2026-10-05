import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseRange, resolveContentPath, serveContent } from './assets'

const pack = resolve('some', 'pack')

describe('resolveContentPath', () => {
  it('maps a content URL to a file in the pack', () => {
    expect(resolveContentPath(pack, 'content://pack/sprites/faye/happy%202.png')).toBe(
      join(pack, 'sprites', 'faye', 'happy 2.png')
    )
  })

  it('refuses paths that escape the pack', () => {
    // URL parsing itself collapses dot segments, so these stay inside the pack.
    expect(resolveContentPath(pack, 'content://pack/%2e%2e/%2e%2e/secret.txt')).toBe(
      join(pack, 'secret.txt')
    )
    expect(resolveContentPath(pack, 'content://pack/..%5C..%5Csecret.txt')).toBeUndefined()
    expect(resolveContentPath(pack, 'content://pack/')).toBeUndefined()
  })
})

describe('parseRange', () => {
  it('reads the forms a browser sends', () => {
    expect(parseRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 })
    expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
  })

  it('ignores a missing, malformed or unsatisfiable header', () => {
    expect(parseRange(null, 100)).toBeUndefined()
    expect(parseRange('bytes=-', 100)).toBeUndefined()
    expect(parseRange('items=0-5', 100)).toBeUndefined()
    expect(parseRange('bytes=100-', 100)).toBeUndefined()
    expect(parseRange('bytes=20-10', 100)).toBeUndefined()
  })
})

describe('serveContent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bh-assets-'))
  writeFileSync(join(dir, 'clip.mp4'), '0123456789')

  it('serves a whole file with its type', async () => {
    const response = serveContent(dir, new Request('content://pack/clip.mp4'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('video/mp4')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(await response.text()).toBe('0123456789')
  })

  it('serves the requested part of a file, as video playback needs', async () => {
    const request = new Request('content://pack/clip.mp4', { headers: { Range: 'bytes=2-5' } })
    const response = serveContent(dir, request)
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10')
    expect(await response.text()).toBe('2345')
  })

  it('answers 404 for a missing file and 403 outside the pack', () => {
    expect(serveContent(dir, new Request('content://pack/none.mp4')).status).toBe(404)
    expect(serveContent(dir, new Request('content://pack/..%5Csecret.txt')).status).toBe(403)
  })
})
