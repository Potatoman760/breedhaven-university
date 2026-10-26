import { t } from '../../../../shared/i18n'

/**
 * Making the content's pictures smaller: a PNG turned into a WebP of the same picture, a fraction of the size. The
 * encoding is the browser's own (a canvas writes WebP), so nothing needs installing; the files are read and written
 * by the main process, which keeps them inside the content.
 */

// As the game's own pictures were converted: no difference to be seen, about an eighth of the size.
const QUALITY = 0.9

/** Whether a picture is one that can be made smaller this way. */
export const isPng = (path: string): boolean => /\.png$/i.test(path)

/** The file's name, for a progress bar. */
export const fileName = (path: string): string => path.split('/').pop() ?? path

/** Encodes one of the content's pictures as WebP, files it beside the original, and returns its path. The original is left as it is. */
export async function toWebp(path: string): Promise<string> {
  const bytes = await window.api.editor.readPicture(path)
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  bitmap.close()
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: QUALITY })
  // A browser that cannot write WebP hands back a PNG instead, which would be no smaller.
  if (blob.type !== 'image/webp') throw new Error(t('comfy.optimize.noWebp'))
  return window.api.editor.saveOptimized({ path, bytes: new Uint8Array(await blob.arrayBuffer()) })
}

/** The same value with every string that names one picture naming another: wherever in it that picture was used. */
export function renamed<T>(value: T, from: string, to: string): T {
  if (value === from) return to as T
  if (Array.isArray(value)) return value.map((item) => renamed(item, from, to)) as T
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renamed(item, from, to)])) as T
  return value
}

/** Every picture a value names that is a PNG, once each, in the order they come. */
export function pngsIn(value: unknown): string[] {
  const found = new Set<string>()
  const walk = (item: unknown): void => {
    if (typeof item === 'string') {
      if (isPng(item)) found.add(item)
    } else if (Array.isArray(item)) item.forEach(walk)
    else if (typeof item === 'object' && item !== null) Object.values(item).forEach(walk)
  }
  walk(value)
  return [...found]
}
