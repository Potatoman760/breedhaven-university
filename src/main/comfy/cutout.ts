import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { nativeImage } from 'electron'
import type { CutoutRequest, CutoutResult } from '../../shared/comfy'
import { ADDON_PREFIX } from '../../shared/editor'
import { describeColour, keyBackground, type Raster } from './backgroundKey'

/**
 * The thin part that knows how to open a PNG. All the judgement is in `backgroundKey.ts`,
 * which is pure and unit-tested; `nativeImage` needs a real Electron, so this is kept
 * small. Electron promises nothing about the bytes `toBitmap` hands back (on Windows they
 * are BGRA and premultiplied), so that is measured once here rather than assumed.
 */

// A 2×1 PNG: opaque red, then green at alpha 128. Answers which channel holds the red, and whether colour is scaled by alpha.
const PROBE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mP4z8Dwn+E/QwMAEHkDflwvYpMAAAAASUVORK5CYII='

interface BitmapLayout {
  /** Byte 0 is blue rather than red. */
  swizzled: boolean
  /** The colour channels have been multiplied by the alpha. */
  premultiplied: boolean
}

let measured: BitmapLayout | null = null

function bitmapLayout(): BitmapLayout {
  if (measured) return measured
  const bytes = nativeImage.createFromDataURL(`data:image/png;base64,${PROBE_PNG}`).toBitmap()
  // What every Chromium build has done for years, if the probe can't be read.
  measured = bytes.length !== 8 ? { swizzled: true, premultiplied: true } : { swizzled: bytes[2] > bytes[0], premultiplied: Math.max(bytes[4], bytes[5], bytes[6]) < 200 }
  return measured
}

/** An Electron bitmap as the straight RGBA the keyer works in. */
function toRaster(bytes: Buffer, width: number, height: number): Raster {
  const { swizzled, premultiplied } = bitmapLayout()
  const data = new Uint8ClampedArray(width * height * 4)
  for (let at = 0; at < data.length; at += 4) {
    const alpha = bytes[at + 3]
    const r = swizzled ? bytes[at + 2] : bytes[at]
    const g = bytes[at + 1]
    const b = swizzled ? bytes[at] : bytes[at + 2]
    // Recovers the colour a partly transparent pixel had before it was scaled.
    const scale = premultiplied ? (alpha === 0 ? 0 : 255 / alpha) : 1
    data[at] = Math.round(r * scale)
    data[at + 1] = Math.round(g * scale)
    data[at + 2] = Math.round(b * scale)
    data[at + 3] = alpha
  }
  return { width, height, data }
}

/** Straight RGBA back out as a PNG, in whatever convention this build wants. */
function toPng(image: Raster): Buffer {
  const { swizzled, premultiplied } = bitmapLayout()
  const bytes = Buffer.alloc(image.width * image.height * 4)
  for (let at = 0; at < bytes.length; at += 4) {
    const alpha = image.data[at + 3]
    const scale = premultiplied ? alpha / 255 : 1
    const r = Math.round(image.data[at] * scale)
    const b = Math.round(image.data[at + 2] * scale)
    bytes[at] = swizzled ? b : r
    bytes[at + 1] = Math.round(image.data[at + 1] * scale)
    bytes[at + 2] = swizzled ? r : b
    bytes[at + 3] = alpha
  }
  return nativeImage.createFromBitmap(bytes, { width: image.width, height: image.height }).toPNG()
}

/**
 * Takes the flat card out from behind a picture in the add-on folder: the card that can be
 * reached from the border, and the card the art has closed around (the gap inside a loop of
 * hair, or between an arm and the body). The cut-out goes into a new file
 * beside it: `default-neutral.png` becomes `default-neutral-cutout.png`. The original is
 * deleted once the cut-out is safely written, so the caller repoints whatever used it.
 */
export function cutoutArt(addonDir: string, request: CutoutRequest, prefix: string = ADDON_PREFIX): CutoutResult {
  const nothing = { ok: false, path: null, colour: null, cleared: 0, feathered: 0, enclosed: 0 }
  if (!request.path.startsWith(prefix)) return { ...nothing, message: 'Only pictures in your add-on folder can be cut out.' }
  const root = resolve(addonDir)
  const source = resolve(root, request.path.slice(prefix.length))
  if (!source.startsWith(root + sep) || !existsSync(source)) return { ...nothing, message: 'That picture is no longer there.' }
  if (extname(source).toLowerCase() !== '.png') return { ...nothing, message: 'Only a PNG can be cut out.' }

  // An undecodable file comes back as an empty image rather than throwing.
  const image = nativeImage.createFromBuffer(readFileSync(source))
  if (image.isEmpty()) return { ...nothing, message: 'That file could not be read as a picture.' }
  const { width, height } = image.getSize()
  const bitmap = image.toBitmap()
  if (bitmap.length !== width * height * 4) {
    return { ...nothing, message: `The picture decoded to ${bitmap.length} bytes for ${width}×${height}, which does not add up. Nothing was changed.` }
  }

  const outcome = keyBackground(toRaster(bitmap, width, height), { tolerance: request.tolerance, mode: 'gaps' })
  if (!outcome.ok) return { ...nothing, colour: outcome.reading ? describeColour(outcome.reading.colour) : null, message: outcome.message }

  const stem = basename(source, extname(source))
  let file = `${stem}-cutout.png`
  for (let n = 2; existsSync(join(dirname(source), file)); n++) file = `${stem}-cutout-${n}.png`
  const colour = describeColour(outcome.reading.colour)
  try {
    writeFileSync(join(dirname(source), file), toPng(outcome.image))
  } catch (cause) {
    return { ...nothing, colour, message: `Could not write it: ${(cause as Error).message}` }
  }

  // Only after the new file is on disk. A failed delete is untidy, not broken.
  let message = ''
  try {
    rmSync(source)
  } catch (cause) {
    message = `The original was kept: it could not be deleted (${(cause as Error).message}).`
  }
  const path = `${request.path.slice(0, request.path.lastIndexOf('/') + 1)}${file}`
  return { ok: true, path, colour, cleared: outcome.cleared, feathered: outcome.feathered, enclosed: outcome.enclosed, message }
}
