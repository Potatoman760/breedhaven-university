import { deflateSync, inflateSync } from 'node:zlib'
import { clearLeftCard, type Raster } from './backgroundKey'

/**
 * Just enough of PNG: the eight-bit colour pictures ComfyUI saves, read to plain RGBA and written back with their
 * transparency. No Electron, so the scripts that draw with ComfyUI use it as the app does.
 */

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

/** The chunks of a PNG that say something besides its pixels, such as the workflow ComfyUI writes into every picture it makes. */
export function textChunks(file: Buffer): Buffer[] {
  const kept: Buffer[] = []
  if (!file.subarray(0, 8).equals(SIGNATURE)) return kept
  for (let at = 8; at + 8 <= file.length; ) {
    const length = file.readUInt32BE(at)
    const type = file.toString('latin1', at + 4, at + 8)
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') kept.push(file.subarray(at, at + 12 + length))
    at += 12 + length
  }
  return kept
}

/** Writes a picture as a PNG with its transparency, and with any of `text` (whole chunks, as `textChunks` gives them) after its header. */
export function encodePng(image: Raster, text: Buffer[] = []): Buffer {
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
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), ...text, chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))])
}

/**
 * A picture a cut-out workflow made, with the card it left behind taken out (`clearLeftCard`). Anything that is not a
 * PNG this can read, or has no card left, comes back as it was.
 */
export function withoutLeftCard(file: Buffer): Buffer {
  let image: Raster
  try {
    image = decodePng(file)
  } catch {
    return file
  }
  const { image: cleaned, cleared } = clearLeftCard(image)
  return cleared > 0 ? encodePng(cleaned, textChunks(file)) : file
}
