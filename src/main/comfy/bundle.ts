import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ComfyBundleSettingsSchema, type ComfyBundle, type ComfyBundleCheck, type ComfyBundleSettings } from '../../shared/comfy'

/**
 * The game's own workflows. They are part of the content, in a folder of their own beside a
 * file holding what the game says of each (its prompt prefix, its bindings, which kind of
 * picture it draws), and they are run from there: nobody points the game at a folder. The
 * models and the custom nodes the workflows call for are the player's to fetch, and are
 * listed so they know which.
 */

const FOLDER = 'comfy'
const SETTINGS_FILE = 'bundle.json'
// The other files kept in that folder, which are not workflows either.
const NOT_WORKFLOWS = [SETTINGS_FILE, 'downloads.json']
// What a model file's name ends in.
const MODEL_FILE = /\.(safetensors|ckpt|pt|pth|gguf|bin|sft)$/i

/** Where the game's workflows are. */
export const bundleDir = (packDir: string): string => join(packDir, FOLDER)
/** Whether a file of that folder is a workflow, going by its name. */
export const isWorkflow = (name: string): boolean => name.toLowerCase().endsWith('.json') && !NOT_WORKFLOWS.includes(name.toLowerCase())

/** The model files and the kinds of node a workflow calls for, read from the file itself. */
export function workflowNeeds(json: string): { models: string[]; nodes: string[] } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json.replace(/^﻿/, ''))
  } catch {
    return { models: [], nodes: [] }
  }
  const models = new Set<string>()
  const nodes = new Set<string>()
  // A model is named wherever a loader takes one, however deep: a LoRA stack keeps its files inside a value of its own.
  const scan = (value: unknown): void => {
    if (typeof value === 'string') {
      if (MODEL_FILE.test(value)) models.add(value)
    } else if (Array.isArray(value)) {
      value.forEach(scan)
    } else if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(scan)
    }
  }
  if (typeof parsed === 'object' && parsed !== null) {
    for (const node of Object.values(parsed as Record<string, unknown>)) {
      const { class_type: type, inputs } = (node ?? {}) as { class_type?: unknown; inputs?: unknown }
      if (typeof type !== 'string') continue
      nodes.add(type)
      scan(inputs)
    }
  }
  return { models: [...models].sort((a, b) => a.localeCompare(b)), nodes: [...nodes].sort((a, b) => a.localeCompare(b)) }
}

/** What the game says of its workflows. Nothing, when the content says nothing. */
export function readBundleSettings(packDir: string): ComfyBundleSettings {
  try {
    return ComfyBundleSettingsSchema.parse(JSON.parse(readFileSync(join(bundleDir(packDir), SETTINGS_FILE), 'utf8')))
  } catch {
    return ComfyBundleSettingsSchema.parse({})
  }
}

/** Writes what the game says of its workflows into the content. For the game's author, whose editor changes the game itself. */
export function writeBundleSettings(packDir: string, settings: ComfyBundleSettings): void {
  mkdirSync(bundleDir(packDir), { recursive: true })
  writeFileSync(join(bundleDir(packDir), SETTINGS_FILE), JSON.stringify(ComfyBundleSettingsSchema.parse(settings), null, 2) + '\n')
}

/** The game's workflows, and what each calls for. None when the pack has no such folder. */
export function readBundle(packDir: string): ComfyBundle {
  const dir = bundleDir(packDir)
  const files = existsSync(dir) ? readdirSync(dir).filter(isWorkflow).sort((a, b) => a.localeCompare(b)) : []
  return {
    workflows: files.map((file) => ({ file, name: file.replace(/\.json$/i, ''), ...workflowNeeds(readFileSync(join(dir, file), 'utf8')) }))
  }
}

/**
 * Asks a running ComfyUI what it has, and says which of the models and nodes the game's
 * workflows call for it lacks. Never throws: a ComfyUI that does not answer is said so.
 */
export async function checkBundle(baseUrl: string, bundle: ComfyBundle, fetchImpl: typeof fetch = fetch): Promise<ComfyBundleCheck> {
  const none = (message: string): ComfyBundleCheck => ({ ok: false, message, missingNodes: [], missingModels: [] })
  let known: Record<string, unknown>
  let text: string
  try {
    const response = await fetchImpl(`${baseUrl}/object_info`, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) return none(`ComfyUI answered ${response.status} ${response.statusText}.`)
    text = await response.text()
    known = JSON.parse(text) as Record<string, unknown>
  } catch (cause) {
    return none(`Could not ask ComfyUI at ${baseUrl}: ${(cause as Error).message}. Is it running?`)
  }
  // Every file a loader could be given is in what ComfyUI says of its nodes, with either kind of slash.
  const has = (file: string): boolean => text.includes(JSON.stringify(file).slice(1, -1)) || text.includes(JSON.stringify(file.replace(/\\/g, '/')).slice(1, -1))
  const all = <K extends 'nodes' | 'models'>(key: K): string[] => [...new Set(bundle.workflows.flatMap((w) => w[key]))].sort((a, b) => a.localeCompare(b))
  const missingNodes = all('nodes').filter((node) => !(node in known))
  const missingModels = all('models').filter((file) => !has(file))
  const ok = missingNodes.length === 0 && missingModels.length === 0
  return { ok, message: ok ? 'This ComfyUI has every model and node the workflows call for.' : 'This ComfyUI is missing some of what the workflows call for.', missingNodes, missingModels }
}
