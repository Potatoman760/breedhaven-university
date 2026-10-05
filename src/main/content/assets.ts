import { createReadStream, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'

/** The scheme the renderer uses to load artwork and video from the content pack. */
export const CONTENT_SCHEME = 'content'

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg'
}

/**
 * Maps a `content://pack/<path>` URL to a file inside the content pack directory.
 * Returns undefined for anything that would resolve outside it.
 */
export function resolveContentPath(packDir: string, url: string): string | undefined {
  const root = resolve(packDir)
  const file = resolve(root, `.${decodeURIComponent(new URL(url).pathname)}`)
  return file.startsWith(root + sep) ? file : undefined
}

/** The byte span a Range header asks for, or undefined if it has none or it can't be met. */
export function parseRange(
  header: string | null,
  size: number
): { start: number; end: number } | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '')
  if (!match || (match[1] === '' && match[2] === '')) return undefined
  // "bytes=-500" means the last 500 bytes.
  const start = match[1] === '' ? Math.max(0, size - Number(match[2])) : Number(match[1])
  const end = match[1] === '' || match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  return start <= end && start < size ? { start, end } : undefined
}

/**
 * Answers a `content://` request with the file from the pack. Range requests are
 * honoured, which video playback needs in order to seek and loop.
 */
export function serveContent(packDir: string, request: Request): Response {
  const file = resolveContentPath(packDir, request.url)
  if (!file) return new Response(null, { status: 403 })

  let size: number
  try {
    size = statSync(file).size
  } catch {
    return new Response(null, { status: 404 })
  }

  const headers = {
    'Content-Type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes'
  }
  const body = (options?: { start: number; end: number }) =>
    Readable.toWeb(createReadStream(file, options)) as unknown as ReadableStream

  const range = parseRange(request.headers.get('range'), size)
  if (!range) {
    return new Response(body(), { headers: { ...headers, 'Content-Length': String(size) } })
  }
  return new Response(body(range), {
    status: 206,
    headers: {
      ...headers,
      'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
      'Content-Length': String(range.end - range.start + 1)
    }
  })
}
