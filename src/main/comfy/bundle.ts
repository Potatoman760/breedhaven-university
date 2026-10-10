import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ComfyBundleSettingsSchema, type ComfyBundle, type ComfyBundleCheck, type ComfyBundleSettings, type ComfySettings } from '../../shared/comfy'

/**
 * The workflows that ship with the game. They are kept in the content pack, in a folder of
 * their own beside a file holding what the game needs to know to run each (its prompt
 * prefix, its bindings, which kind of picture it draws). A player has them written into a
 * folder of their own ComfyUI and the game pointed at it; the models and the custom nodes
 * the workflows call for are theirs to fetch, and are listed so they know which.
 */

const FOLDER = 'comfy'
const SETTINGS_FILE = 'bundle.json'
// The folder the workflows are written into, inside whichever folder the player picks.
export const INSTALL_FOLDER = 'breedhaven-workflows'
// What a model file's name ends in.
const MODEL_FILE = /\.(safetensors|ckpt|pt|pth|gguf|bin|sft)$/i

const bundleDir = (packDir: string): string => join(packDir, FOLDER)
const isWorkflow = (name: string): boolean => name.toLowerCase().endsWith('.json') && name !== SETTINGS_FILE

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

/** Only what is said of the given workflow files, so that nothing of a file that is not shipped goes with it. */
function settingsFor(settings: ComfyBundleSettings, files: string[]): ComfyBundleSettings {
  const kept = <T>(record: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(record).filter(([file]) => files.includes(file)))
  return {
    promptPrefixes: kept(settings.promptPrefixes),
    negativePrefixes: kept(settings.negativePrefixes),
    overrides: kept(settings.overrides),
    defaults: Object.fromEntries(Object.entries(settings.defaults).filter(([, file]) => file !== undefined && files.includes(file))),
    framing: settings.framing,
    sizes: settings.sizes
  }
}

function readSettings(packDir: string): ComfyBundleSettings {
  try {
    return ComfyBundleSettingsSchema.parse(JSON.parse(readFileSync(join(bundleDir(packDir), SETTINGS_FILE), 'utf8')))
  } catch {
    return ComfyBundleSettingsSchema.parse({})
  }
}

/** The workflows the game ships with, and what each calls for. None when the pack has no such folder. */
export function readBundle(packDir: string): ComfyBundle {
  const dir = bundleDir(packDir)
  const files = existsSync(dir) ? readdirSync(dir).filter(isWorkflow).sort((a, b) => a.localeCompare(b)) : []
  return {
    workflows: files.map((file) => ({ file, name: file.replace(/\.json$/i, ''), ...workflowNeeds(readFileSync(join(dir, file), 'utf8')) }))
  }
}

/**
 * Takes the workflows in the folder the game is using now into the game itself, with what
 * the settings say of each: the workflows the game ships with from then on. Whatever was
 * shipped before is replaced. For the game's author: nothing in the game itself calls it.
 */
export function saveBundle(packDir: string, settings: ComfySettings): ComfyBundle {
  const from = settings.workflowDir
  if (from === null || !existsSync(from)) throw new Error('Choose the folder your workflows are in first.')
  const files = readdirSync(from).filter(isWorkflow)
  if (files.length === 0) throw new Error(`There are no workflows in ${from}.`)
  const dir = bundleDir(packDir)
  mkdirSync(dir, { recursive: true })
  for (const old of readdirSync(dir).filter(isWorkflow)) rmSync(join(dir, old))
  for (const file of files) copyFileSync(join(from, file), join(dir, file))
  writeFileSync(join(dir, SETTINGS_FILE), JSON.stringify(settingsFor(settings, files), null, 2) + '\n')
  return readBundle(packDir)
}

/**
 * Writes the game's workflows into a folder of their own inside the one the player picked,
 * and gives back the settings that use them: that folder as the workflow folder, and what
 * the game says of each workflow in place of anything said of a file of the same name before.
 * The player's address, time limit and everything said of their own other workflows are kept.
 */
export function installBundle(packDir: string, intoDir: string, settings: ComfySettings): { settings: ComfySettings; dir: string; files: string[] } {
  const from = bundleDir(packDir)
  const files = existsSync(from) ? readdirSync(from).filter(isWorkflow) : []
  if (files.length === 0) throw new Error('This game has no workflows of its own to install.')
  const dir = join(intoDir, INSTALL_FOLDER)
  mkdirSync(dir, { recursive: true })
  for (const file of files) copyFileSync(join(from, file), join(dir, file))
  const shipped = settingsFor(readSettings(packDir), files)
  return {
    dir,
    files,
    settings: {
      ...settings,
      workflowDir: dir,
      promptPrefixes: { ...settings.promptPrefixes, ...shipped.promptPrefixes },
      negativePrefixes: { ...settings.negativePrefixes, ...shipped.negativePrefixes },
      overrides: { ...settings.overrides, ...shipped.overrides },
      defaults: { ...settings.defaults, ...shipped.defaults },
      framing: { ...settings.framing, ...shipped.framing },
      sizes: { ...settings.sizes, ...shipped.sizes }
    }
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
