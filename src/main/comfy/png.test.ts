import { describe, expect, it } from 'vitest'
import type { Raster } from './backgroundKey'
import { decodePng, encodePng, textChunks, withoutLeftCard } from './png'

/** A text chunk as a PNG holds one: what ComfyUI writes the workflow into. */
function text(keyword: string, value: string): Buffer {
  const body = Buffer.from(`${keyword}\0${value}`, 'latin1')
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write('tEXt', 4, 'latin1')
  // The checksum is not read back by anything here.
  return Buffer.concat([head, body, Buffer.alloc(4)])
}

/** Two inked columns of her running off the bottom of the frame, with the card left between them. */
function legs(): Raster {
  const width = 6
  const height = 4
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      if (x === 1 || x === 4) data.set([0, 0, 0, 255], at)
      else if (y >= 2 && (x === 2 || x === 3)) data.set([255, 255, 255, 255], at)
    }
  }
  return { width, height, data }
}

describe('a picture a cut-out workflow made', () => {
  it('comes back with the card it left taken out, and keeps what ComfyUI wrote into it', () => {
    const file = encodePng(legs(), [text('prompt', '{"29": {}}')])
    const cleaned = withoutLeftCard(file)
    const image = decodePng(cleaned)
    expect(image.data[(3 * 6 + 2) * 4 + 3]).toBe(0)
    expect(image.data[(3 * 6 + 1) * 4 + 3]).toBe(255)
    expect(textChunks(cleaned).map((chunk) => chunk.toString('latin1', 8, 14))).toEqual(['prompt'])
  })

  it('is handed back untouched when there is nothing to take out, or it is not a PNG it can read', () => {
    const clean = encodePng({ width: 2, height: 2, data: new Uint8ClampedArray(16) })
    expect(withoutLeftCard(clean)).toBe(clean)
    const junk = Buffer.from('not a picture')
    expect(withoutLeftCard(junk)).toBe(junk)
  })
})
