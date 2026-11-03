/**
 * What the scripts that have ComfyUI draw things share: where the app keeps its ComfyUI settings, and taking the white
 * card out from behind a picture and making it smaller without Electron. Not part of the app.
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { keyBackground, type Raster } from '../../src/main/comfy/backgroundKey'
import { decodePng, encodePng } from '../../src/main/comfy/png'

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

/**
 * The workflow a picture to be cut out here is drawn with: the one backgrounds use, which leaves it on its white card.
 * The sprites' own takes the background away in ComfyUI, and what it leaves has no card to find.
 */
export const onCard = (settings: { defaults: Partial<Record<string, string>> }): string => settings.defaults['background'] ?? ''

export const minutes = (ms: number) => `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`

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

/**
 * Takes the white card out from behind a picture in the pack. Returns the path of the cut-out, or says why it was left
 * as it is. `gaps` also clears white closed in by the picture, such as between an arm and the body; `edge` only what
 * reaches its edges, for a picture with white in it that is meant to stay, such as a white shirt.
 */
export function cutOut(path: string, most?: number, mode: 'gaps' | 'edge' = 'gaps'): { path: string; note: string } {
  const outcome = keyBackground(decodePng(readFileSync(join(PACK, path))), { mode })
  if (!outcome.ok) return { path, note: `left on its card: ${outcome.message}` }
  const cut = path.replace(/\.png$/i, '-cutout.png')
  writeFileSync(join(PACK, cut), encodePng(most ? shrink(outcome.image, most) : outcome.image))
  rmSync(join(PACK, path), { force: true })
  return { path: cut, note: '' }
}
