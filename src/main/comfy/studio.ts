import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import {
  ComfyBundleSettingsSchema,
  ComfySettingsSchema,
  normaliseComfyUrl,
  prependPrompt,
  type ArtKind,
  type ComfyBundleSettings,
  type ComfySettings,
  type GenerateArtResult,
  type GenerateVideoRequest
} from '../../shared/comfy'
import { ADDON_PREFIX, isSafeId, slugify } from '../../shared/editor'
import { bundleDir, readBundleSettings, writeBundleSettings } from './bundle'
import { generateImage, uploadImage } from './client'
import { applyBindings, unplugLastFrame } from './graph'
import { loadWorkflows, resolveWorkflow } from './workflows'

// The settings the game itself has a say in: each is a list by workflow, by kind of picture or by pose.
const SHARED = Object.keys(ComfyBundleSettingsSchema.shape) as (keyof ComfyBundleSettings)[]
/** One of those lists, of either's settings, read without regard to what it is a list of. */
const listOf = (settings: ComfyBundleSettings, key: keyof ComfyBundleSettings): Record<string, unknown> => settings[key]

/**
 * Keeps the ComfyUI settings. They hold no secrets: ComfyUI has no key. What is about this computer (the address,
 * where the models are, how long to wait) is a JSON file of the player's own. What is about a workflow or a kind of
 * picture is said by the game, in its content, and the player's file holds only what they changed from that: so a
 * prefix or a prompt the game changes later still reaches a player who never touched it.
 */
export class ComfyStore {
  /** What this computer's file says: its own settings, and only its differences from the game's. */
  private own: ComfySettings
  /** What the game says. */
  private shipped: ComfyBundleSettings

  constructor(
    private readonly path: string,
    /** The content the game's workflows are in. Left out, the game says nothing. */
    private readonly packDir: string | null = null
  ) {
    let raw: unknown = {}
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      // Missing or unreadable file: start from defaults.
    }
    const parsed = ComfySettingsSchema.safeParse(raw)
    this.own = parsed.success ? parsed.data : ComfySettingsSchema.parse({})
    this.shipped = packDir === null ? ComfyBundleSettingsSchema.parse({}) : readBundleSettings(packDir)
  }

  /** The settings in force: the game's, with the player's own over them. */
  get(): ComfySettings {
    const merged: Record<string, unknown> = { ...this.own }
    for (const key of SHARED) merged[key] = { ...listOf(this.shipped, key), ...listOf(this.own, key) }
    return merged as ComfySettings
  }

  /**
   * Saves what the studio sent. An address that is not one is refused, with the reason. With `toGame`, what is said
   * of the workflows is written into the game's own content, for an author whose editor is changing the game itself;
   * otherwise it is kept on this computer, as far as it differs from the game's.
   */
  update(raw: unknown, toGame = false): ComfySettings {
    const next = ComfySettingsSchema.parse(raw)
    const { url, problem } = normaliseComfyUrl(next.baseUrl)
    if (url === null) throw new Error(problem ?? 'That is not an address.')
    const own: Record<string, unknown> = { ...next, baseUrl: url }
    if (toGame && this.packDir !== null) {
      this.shipped = ComfyBundleSettingsSchema.parse(next)
      writeBundleSettings(this.packDir, this.shipped)
    }
    // Whatever is the same as the game says is not kept twice.
    for (const key of SHARED) {
      const said = listOf(this.shipped, key)
      own[key] = Object.fromEntries(Object.entries(listOf(next, key)).filter(([name, value]) => JSON.stringify(value) !== JSON.stringify(said[name])))
    }
    this.own = own as ComfySettings
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify(this.own, null, 2))
    return this.get()
  }
}

// Where each kind of picture is filed in the add-on folder. Sprites sit with the ones imported by hand.
const FOLDERS: Record<ArtKind, string> = { sprite: 'sprites', background: 'generated/backgrounds', photo: 'generated/photos', nsfw: 'sprites', birth: 'sprites' }

/** Writes a picture into the add-on folder under a name nothing else has, and returns its content path. A clip is filed the same way, under its own ending. */
export function fileArt(addonDir: string, kind: ArtKind, subjectId: string, name: string, bytes: Buffer, prefix: string = ADDON_PREFIX, extension = 'png'): string {
  const subject = isSafeId(subjectId) ? subjectId : 'misc'
  const folder = `${FOLDERS[kind]}/${subject}`
  mkdirSync(join(addonDir, folder), { recursive: true })
  const stem = slugify(name) || kind
  // Never overwrite: an earlier try may be the one that gets kept.
  let file = `${stem}.${extension}`
  for (let n = 2; existsSync(join(addonDir, folder, file)); n++) file = `${stem}-${n}.${extension}`
  writeFileSync(join(addonDir, folder, file), bytes)
  return `${prefix}${folder}/${file}`
}

export interface StudioRequest {
  kind: ArtKind
  subjectId: string
  name: string
  workflow: string
  positive: string
  negative: string
  width: number
  height: number
  seed?: number
}

/** One picture: the prompt written into one of the game's workflows, run on ComfyUI, and filed in the add-on folder. Never throws. */
export async function generateArt(settings: ComfySettings, packDir: string, addonDir: string, request: StudioRequest, cancel?: AbortSignal, prefix: string = ADDON_PREFIX): Promise<GenerateArtResult> {
  const failed = (message: string): GenerateArtResult => ({ ok: false, message, path: null, seed: null, workflow: null, positive: null, skipped: [] })

  const { url, problem } = normaliseComfyUrl(settings.baseUrl)
  if (url === null) return failed(problem ?? 'The ComfyUI address is not set.')
  const folder = loadWorkflows(bundleDir(packDir), settings.overrides)
  if (!folder.ok) return failed(folder.message || folder.broken[0]?.problem || 'No workflow could be read.')
  const resolved = resolveWorkflow(folder.loaded, request.workflow, request.kind, settings.defaults)
  if (!resolved.workflow) return failed(resolved.problem ?? 'No workflow could be chosen.')
  const workflow = resolved.workflow
  if (workflow.bindings.positive === null) {
    return failed(`"${workflow.name}" has nowhere to put a prompt. Point its Prompt binding at a text node in the ComfyUI settings.`)
  }

  const seed = request.seed ?? Math.floor(Math.random() * 0xffffffff)
  const positive = prependPrompt(settings.promptPrefixes[workflow.file], request.positive)
  const negative = prependPrompt(settings.negativePrefixes[workflow.file], request.negative)
  const { prompt, skipped } = applyBindings(workflow.graph, workflow.bindings, {
    positive,
    // An empty negative leaves whatever the workflow saved.
    negative: negative.trim() === '' ? undefined : negative,
    width: request.width,
    height: request.height,
    seed
  })

  const made = await generateImage({
    baseUrl: url,
    prompt,
    outputNode: workflow.bindings.output?.node ?? null,
    timeoutMs: settings.timeoutSeconds * 1000,
    cancel
  })
  if (!made.ok || !made.bytes) return failed(made.message)

  try {
    const path = fileArt(addonDir, request.kind, request.subjectId, request.name, made.bytes, prefix)
    return { ok: true, message: '', path, seed, workflow: workflow.file, positive, skipped }
  } catch (cause) {
    return failed(`The picture was made but could not be saved: ${(cause as Error).message}`)
  }
}

/** Where a picture of the content is on disk: in the add-on folder when its path says so, and in the game's own otherwise. Null for a path that leads out of both. */
function contentFile(packDir: string, addonDir: string, path: string): string | null {
  const addon = path.startsWith(ADDON_PREFIX)
  const root = resolve(addon ? addonDir : packDir)
  const file = resolve(root, addon ? path.slice(ADDON_PREFIX.length) : path)
  return file.startsWith(root + sep) ? file : null
}

/**
 * One clip: a picture of the content handed to ComfyUI as the first frame of a video workflow, and when asked another
 * (or the same) as its last, what moves written into it, run, and filed beside the picture it was made from. Never throws.
 */
export async function generateClip(
  settings: ComfySettings,
  packDir: string,
  addonDir: string,
  request: Required<Omit<GenerateVideoRequest, 'seed' | 'lastImage' | 'seconds'>> & Pick<GenerateVideoRequest, 'seed' | 'lastImage' | 'seconds'>,
  cancel?: AbortSignal,
  prefix: string = ADDON_PREFIX
): Promise<GenerateArtResult> {
  const failed = (message: string): GenerateArtResult => ({ ok: false, message, path: null, seed: null, workflow: null, positive: null, skipped: [] })

  const { url, problem } = normaliseComfyUrl(settings.baseUrl)
  if (url === null) return failed(problem ?? 'The ComfyUI address is not set.')
  const folder = loadWorkflows(bundleDir(packDir), settings.overrides)
  if (!folder.ok) return failed(folder.message || folder.broken[0]?.problem || 'No workflow could be read.')
  const resolved = resolveWorkflow(folder.loaded, request.workflow, 'video', settings.defaults)
  if (!resolved.workflow) return failed(resolved.problem ?? 'No workflow could be chosen.')
  const workflow = resolved.workflow
  if (workflow.bindings.firstFrame === null) {
    return failed(`"${workflow.name}" has nowhere to put a first frame, so it cannot make a clip from a picture. Point its First frame binding at the node that loads the picture in the ComfyUI settings.`)
  }
  if (workflow.bindings.positive === null) {
    return failed(`"${workflow.name}" has nowhere to put a prompt. Point its Prompt binding at a text node in the ComfyUI settings.`)
  }

  if (request.lastImage !== undefined && workflow.bindings.lastFrame === null) {
    return failed(`"${workflow.name}" has nowhere to put a last frame, so it cannot be told where the clip ends.`)
  }

  /** Hands one of the content's pictures to ComfyUI under one name, replaced each time: ComfyUI tells a new picture from the last by what is in it, not by what it is called. */
  const upload = async (path: string, as: string, what: string): Promise<{ name: string | null; message: string }> => {
    const source = contentFile(packDir, addonDir, path)
    let picture: Buffer
    try {
      if (source === null) throw new Error('it is not in the content')
      picture = readFileSync(source)
    } catch (cause) {
      return { name: null, message: `The picture the clip ${what} could not be read: ${(cause as Error).message}` }
    }
    return uploadImage(url, picture, `${as}${extname(source).toLowerCase() || '.png'}`, cancel)
  }
  const first = await upload(request.image, 'breedhaven-first-frame', 'starts from')
  if (first.name === null) return failed(first.message)
  const last = request.lastImage === undefined ? null : request.lastImage === request.image ? first : await upload(request.lastImage, 'breedhaven-last-frame', 'ends on')
  if (last !== null && last.name === null) return failed(last.message)

  const seed = request.seed ?? Math.floor(Math.random() * 0xffffffff)
  const positive = prependPrompt(settings.promptPrefixes[workflow.file], request.prompt)
  const { prompt, skipped } = applyBindings(workflow.graph, workflow.bindings, {
    positive,
    seed,
    firstFrame: first.name,
    lastFrame: last?.name ?? undefined,
    length: request.seconds
  })
  // Not asked to end anywhere, the clip must not end on whatever picture the workflow was saved with either.
  if (last === null) unplugLastFrame(prompt)

  const made = await generateImage({
    baseUrl: url,
    prompt,
    outputNode: workflow.bindings.output?.node ?? null,
    wants: 'video',
    timeoutMs: settings.videoTimeoutSeconds * 1000,
    cancel
  })
  if (!made.ok || !made.bytes) return failed(made.message)

  try {
    const path = fileArt(addonDir, 'nsfw', request.subjectId, request.name, made.bytes, prefix, made.extension ?? 'mp4')
    return { ok: true, message: '', path, seed, workflow: workflow.file, positive, skipped }
  } catch (cause) {
    return failed(`The clip was made but could not be saved: ${(cause as Error).message}`)
  }
}
