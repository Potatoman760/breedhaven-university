/**
 * What the scripts that have ComfyUI draw things share: where the app keeps its ComfyUI settings, and just enough of
 * PNG to take the white card out from behind a picture and make it smaller without Electron. Not part of the app.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import { keyBackground, type Raster } from '../../src/main/comfy/backgroundKey'

export const PACK = resolve('content', 'default')

/** Where the app keeps its ComfyUI settings: the user data folder Electron gives an app of this name. */
export function settingsFile(): string {
  const base =
    process.platform === 'win32'
      ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Application Support')
        : (process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'))
  return join(base, 'breedhaven-dating-sim', 'comfy.json')
}

export const minutes = (ms: number) => `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`

// --- PNG, just enough of it: the eight-bit colour pictures ComfyUI saves, read to plain RGBA and written back with their transparency.

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc(bytes: Buffer): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function decodePng(file: Buffer): Raster {
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')
  let width = 0
  let height = 0
  let channels = 0
  const data: Buffer[] = []
  for (let at = 8; at < file.length; ) {
    const length = file.readUInt32BE(at)
    const type = file.toString('latin1', at + 4, at + 8)
    const body = file.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      const colour = body[9]
      if (body[8] !== 8 || (colour !== 2 && colour !== 6) || body[12] !== 0) throw new Error('only eight-bit colour PNGs that are not interlaced can be read')
      channels = colour === 6 ? 4 : 3
    } else if (type === 'IDAT') data.push(body)
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(data))
  const stride = width * channels
  const out = new Uint8ClampedArray(width * height * 4)
  let before = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? line[x - channels] : 0
      const up = before[x]
      const corner = x >= channels ? before[x - channels] : 0
      const paeth = () => {
        const p = left + up - corner
        const [a, b, c] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)]
        return a <= b && a <= c ? left : b <= c ? up : corner
      }
      line[x] = (line[x] + (filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : filter === 4 ? paeth() : 0)) & 0xff
    }
    for (let x = 0; x < width; x++) {
      const to = (y * width + x) * 4
      out[to] = line[x * channels]
      out[to + 1] = line[x * channels + 1]
      out[to + 2] = line[x * channels + 2]
      out[to + 3] = channels === 4 ? line[x * channels + 3] : 255
    }
    before = line
  }
  return { width, height, data: out }
}

export function encodePng(image: Raster): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(body.length, 0)
    head.write(type, 4, 'latin1')
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), body])), 0)
    return Buffer.concat([head, body, tail])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(image.width, 0)
  header.writeUInt32BE(image.height, 4)
  header.set([8, 6, 0, 0, 0], 8)
  const stride = image.width * 4
  const raw = Buffer.alloc((stride + 1) * image.height)
  for (let y = 0; y < image.height; y++) Buffer.from(image.data.buffer, image.data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

/**
 * Makes a picture smaller, to fit a square of so many pixels: each pixel of the small one is the average of those it
 * covers in the big one, weighted by how solid each is, so that the cut edge does not pick up the colour of the card.
 */
function shrink(image: Raster, most: number): Raster {
  const scale = Math.min(1, most / Math.max(image.width, image.height))
  if (scale === 1) return image
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const [top, bottom] = [Math.floor(y / scale), Math.min(image.height, Math.max(Math.floor(y / scale) + 1, Math.floor((y + 1) / scale)))]
    for (let x = 0; x < width; x++) {
      const [left, right] = [Math.floor(x / scale), Math.min(image.width, Math.max(Math.floor(x / scale) + 1, Math.floor((x + 1) / scale)))]
      let [r, g, b, a] = [0, 0, 0, 0]
      for (let sy = top; sy < bottom; sy++) {
        for (let sx = left; sx < right; sx++) {
          const at = (sy * image.width + sx) * 4
          const alpha = image.data[at + 3]
          r += image.data[at] * alpha
          g += image.data[at + 1] * alpha
          b += image.data[at + 2] * alpha
          a += alpha
        }
      }
      const to = (y * width + x) * 4
      const count = (bottom - top) * (right - left)
      data[to] = a > 0 ? r / a : 0
      data[to + 1] = a > 0 ? g / a : 0
      data[to + 2] = a > 0 ? b / a : 0
      data[to + 3] = a / count
    }
  }
  return { width, height, data }
}

/** Takes the white card out from behind a picture in the pack. Returns the path of the cut-out, or says why it was left as it is. */
export function cutOut(path: string, most?: number): { path: string; note: string } {
  const outcome = keyBackground(decodePng(readFileSync(join(PACK, path))), { mode: 'gaps' })
  if (!outcome.ok) return { path, note: `left on its card: ${outcome.message}` }
  const cut = path.replace(/\.png$/i, '-cutout.png')
  writeFileSync(join(PACK, cut), encodePng(most ? shrink(outcome.image, most) : outcome.image))
  rmSync(join(PACK, path), { force: true })
  return { path: cut, note: '' }
}
