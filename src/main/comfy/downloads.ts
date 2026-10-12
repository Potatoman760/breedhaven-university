import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { dirname, join, resolve, sep } from 'node:path'
import { ComfyDownloadsSchema, type ComfyDownloads, type ModelDownload, type ModelDownloadResult } from '../../shared/comfy'

/**
 * Fetching the models the game's workflows call for. What there is to fetch is written
 * down in the content pack beside the workflows: each file, the folder of ComfyUI's
 * models it belongs in, and where it comes from. A file from Civitai needs the player's
 * own key for anything adult-rated; one from anywhere else is a plain address.
 */

const FOLDER = 'comfy'
const MANIFEST = 'downloads.json'
const MB = 1024 * 1024

/** What there is to download for the game's workflows. Nothing when the pack lists none. */
export function readDownloads(packDir: string): ComfyDownloads {
  try {
    return ComfyDownloadsSchema.parse(JSON.parse(readFileSync(join(packDir, FOLDER, MANIFEST), 'utf8')))
  } catch {
    return { models: [], nodes: [] }
  }
}

/**
 * The folder ComfyUI keeps its models in, found from a folder the player picked: that folder
 * itself, the `models` inside it, or the `ComfyUI/models` inside it as the portable build has it.
 */
export function findModelsDir(picked: string): string | null {
  const looksLikeModels = (dir: string) => ['checkpoints', 'loras', 'vae'].filter((name) => existsSync(join(dir, name))).length >= 2
  for (const dir of [picked, join(picked, 'models'), join(picked, 'ComfyUI', 'models')]) {
    if (existsSync(dir) && looksLikeModels(dir)) return dir
  }
  return null
}

/** Where a model goes, kept inside the models folder whatever its entry says. */
export function modelPath(modelsDir: string, model: Pick<ModelDownload, 'folder' | 'file'>): string {
  const root = resolve(modelsDir)
  const path = resolve(root, model.folder, model.file)
  if (!path.startsWith(root + sep)) throw new Error(`"${model.file}" would be written outside the models folder.`)
  return path
}

/** Whether a model is already there. A file of a very different size from what is expected is taken for a broken one. */
export function hasModel(modelsDir: string | null, model: ModelDownload): boolean {
  if (!modelsDir) return false
  try {
    const { size } = statSync(modelPath(modelsDir, model))
    return size > model.sizeMb * MB * 0.9
  } catch {
    return false
  }
}

/** The address a model is fetched from. One on Civitai carries the player's key, where he has given one. */
export function downloadUrl(model: ModelDownload, civitaiKey: string): string {
  if (model.civitaiVersionId === undefined) return model.url ?? ''
  // The same site the model's own page is on.
  const origin = (() => {
    try {
      return new URL(model.page).origin
    } catch {
      return 'https://civitai.com'
    }
  })()
  return `${origin}/api/download/models/${model.civitaiVersionId}${civitaiKey ? `?token=${encodeURIComponent(civitaiKey)}` : ''}`
}

export interface DownloadProgress {
  file: string
  received: number
  total: number
}

/**
 * Downloads one model into its place. It is written beside where it belongs and moved in
 * only once it is whole and is the file that was expected, so that a download that is cut
 * short or goes wrong leaves nothing ComfyUI could mistake for the model. Never throws:
 * what went wrong comes back in the message.
 */
export async function downloadModel(
  model: ModelDownload,
  modelsDir: string,
  civitaiKey: string,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch
): Promise<ModelDownloadResult> {
  const fail = (message: string): ModelDownloadResult => ({ ok: false, file: model.file, message })
  let target: string
  try {
    target = modelPath(modelsDir, model)
  } catch (cause) {
    return fail((cause as Error).message)
  }
  if (hasModel(modelsDir, model)) return { ok: true, file: model.file, message: 'Already there.' }
  const url = downloadUrl(model, civitaiKey)
  if (!url) return fail('There is no address to download it from.')

  const part = `${target}.part`
  try {
    mkdirSync(dirname(target), { recursive: true })
    // Room for it, with a little to spare, before anything is fetched.
    const disk = statfsSync(dirname(target))
    const free = Number(disk.bavail) * Number(disk.bsize)
    if (free < (model.sizeMb + 512) * MB) {
      return fail(`Not enough room on that drive: it needs ${(model.sizeMb / 1024).toFixed(1)} GB and there is ${(free / MB / 1024).toFixed(1)} GB free.`)
    }

    const response = await fetchImpl(url, { signal, redirect: 'follow' })
    if (response.status === 401 || response.status === 403) {
      return fail(
        model.civitaiVersionId !== undefined
          ? civitaiKey
            ? 'Civitai refused the key. Check it is typed in whole, and that your Civitai account is set to show this kind of model.'
            : 'Civitai wants you signed in for this one. Add your Civitai API key above and try again.'
          : `The server refused it (${response.status}).`
      )
    }
    if (!response.ok || !response.body) return fail(`The server answered ${response.status} ${response.statusText}.`)

    const total = Number(response.headers.get('content-length')) || model.sizeMb * MB
    const hash = createHash('sha256')
    const out = createWriteStream(part)
    let received = 0
    let told = 0
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        hash.update(chunk)
        if (!out.write(chunk)) await once(out, 'drain')
        received += chunk.length
        // Often enough to see it move, and no oftener.
        if (Date.now() - told > 250) {
          told = Date.now()
          onProgress({ file: model.file, received, total })
        }
      }
    } finally {
      out.end()
      await once(out, 'close')
    }
    onProgress({ file: model.file, received, total })

    if (model.sha256 && hash.digest('hex').toLowerCase() !== model.sha256.toLowerCase()) {
      rmSync(part, { force: true })
      return fail('What arrived is not the file that was expected, and has been thrown away. Try again, or fetch it from its page.')
    }
    renameSync(part, target)
    return { ok: true, file: model.file, message: `Saved to ${target}.` }
  } catch (cause) {
    rmSync(part, { force: true })
    if (signal.aborted) return fail('Stopped.')
    return fail(`The download failed: ${(cause as Error).message}`)
  }
}

/** A cipher for what is kept on disk, where the system has one. */
export interface SecretCipher {
  encrypt(plain: string): string
  decrypt(stored: string): string
}

/** Keeps the player's Civitai key: in one small file of its own, encrypted where the system can, and never sent to the window. */
export class CivitaiKeyStore {
  constructor(
    private readonly path: string,
    private readonly cipher?: SecretCipher
  ) {}

  get(): string {
    try {
      const { key, encrypted } = JSON.parse(readFileSync(this.path, 'utf8')) as { key?: unknown; encrypted?: unknown }
      if (typeof key !== 'string') return ''
      return encrypted === true ? (this.cipher ? this.cipher.decrypt(key) : '') : key
    } catch {
      return ''
    }
  }

  /** Keeps a key, or with an empty one, forgets it. */
  set(key: string): void {
    const trimmed = key.trim()
    if (!trimmed) {
      rmSync(this.path, { force: true })
      return
    }
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify(this.cipher ? { key: this.cipher.encrypt(trimmed), encrypted: true } : { key: trimmed, encrypted: false }))
  }
}
