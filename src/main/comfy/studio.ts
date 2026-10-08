import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  ComfySettingsSchema,
  normaliseComfyUrl,
  prependPrompt,
  type ArtKind,
  type ComfySettings,
  type GenerateArtResult
} from '../../shared/comfy'
import { ADDON_PREFIX, isSafeId, slugify } from '../../shared/editor'
import { generateImage } from './client'
import { applyBindings } from './graph'
import { loadWorkflows, resolveWorkflow } from './workflows'

/** Keeps the ComfyUI settings as a JSON file of their own. They hold no secrets: ComfyUI has no key. */
export class ComfyStore {
  private settings: ComfySettings

  constructor(private readonly path: string) {
    let raw: unknown = {}
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      // Missing or unreadable file: start from defaults.
    }
    const parsed = ComfySettingsSchema.safeParse(raw)
    this.settings = parsed.success ? parsed.data : ComfySettingsSchema.parse({})
  }

  get(): ComfySettings {
    return this.settings
  }

  /** Saves what the studio sent. An address that is not one is refused, with the reason. */
  update(raw: unknown): ComfySettings {
    const next = ComfySettingsSchema.parse(raw)
    const { url, problem } = normaliseComfyUrl(next.baseUrl)
    if (url === null) throw new Error(problem ?? 'That is not an address.')
    this.settings = { ...next, baseUrl: url }
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify(this.settings, null, 2))
    return this.settings
  }
}

// Where each kind of picture is filed in the add-on folder. Sprites sit with the ones imported by hand.
const FOLDERS: Record<ArtKind, string> = { sprite: 'sprites', background: 'generated/backgrounds', photo: 'generated/photos', nsfw: 'sprites' }

/** Writes a picture into the add-on folder under a name nothing else has, and returns its content path. */
export function fileArt(addonDir: string, kind: ArtKind, subjectId: string, name: string, bytes: Buffer, prefix: string = ADDON_PREFIX): string {
  const subject = isSafeId(subjectId) ? subjectId : 'misc'
  const folder = `${FOLDERS[kind]}/${subject}`
  mkdirSync(join(addonDir, folder), { recursive: true })
  const stem = slugify(name) || kind
  // Never overwrite: an earlier try may be the one that gets kept.
  let file = `${stem}.png`
  for (let n = 2; existsSync(join(addonDir, folder, file)); n++) file = `${stem}-${n}.png`
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

/** One picture: the prompt written into a workflow, run on ComfyUI, and filed in the add-on folder. Never throws. */
export async function generateArt(settings: ComfySettings, addonDir: string, request: StudioRequest, cancel?: AbortSignal, prefix: string = ADDON_PREFIX): Promise<GenerateArtResult> {
  const failed = (message: string): GenerateArtResult => ({ ok: false, message, path: null, seed: null, workflow: null, positive: null, skipped: [] })

  const { url, problem } = normaliseComfyUrl(settings.baseUrl)
  if (url === null) return failed(problem ?? 'The ComfyUI address is not set.')
  const folder = loadWorkflows(settings.workflowDir, settings.overrides)
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
