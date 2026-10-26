import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultsFor, type ComfySettings, type WorkflowAnalysis, type WorkflowBindings, type WorkflowKind, type WorkflowListResult, type WorkflowSummary } from '../../shared/comfy'
import { t } from '../../shared/i18n'
import { isWorkflow } from './bundle'
import { analyse, effectiveBindings, noBindings, parseGraph, type ComfyGraph } from './graph'

/**
 * Reading a folder of workflows: the game's own, in its content. A workflow arrives there as
 * a file, as ComfyUI's Export (API) writes one. A file that will not parse stays in the list
 * with its problem attached.
 */

// Enough for any workflow; past this something else is in the folder.
const MAX_WORKFLOW_BYTES = 4 * 1024 * 1024

/** A workflow read, understood, and ready to run. */
export interface LoadedWorkflow {
  file: string
  name: string
  graph: ComfyGraph
  analysis: WorkflowAnalysis
  bindings: WorkflowBindings
  problems: string[]
}

export interface LoadResult {
  ok: boolean
  message: string
  loaded: LoadedWorkflow[]
  broken: { file: string; name: string; problem: string }[]
}

export function loadWorkflows(dir: string, overrides: ComfySettings['overrides']): LoadResult {
  const none = (message: string): LoadResult => ({ ok: false, message, loaded: [], broken: [] })

  let names: string[]
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isWorkflow(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
  } catch (cause) {
    return none((cause as NodeJS.ErrnoException).code === 'ENOENT' ? t('comfy.workflows.noFolder', { dir }) : t('comfy.workflows.unreadableFolder', { dir, reason: (cause as Error).message }))
  }
  if (names.length === 0) return none(t('comfy.workflows.emptyFolder', { dir }))

  const result: LoadResult = { ok: false, message: '', loaded: [], broken: [] }
  for (const file of names) {
    const name = file.replace(/\.json$/i, '')
    let text: string
    try {
      text = readFileSync(join(dir, file), 'utf8')
    } catch (cause) {
      result.broken.push({ file, name, problem: t('comfy.workflows.unreadableFile', { reason: (cause as Error).message }) })
      continue
    }
    if (text.length > MAX_WORKFLOW_BYTES) {
      result.broken.push({ file, name, problem: t('comfy.workflows.tooLarge') })
      continue
    }
    const { graph, problem } = parseGraph(text)
    if (!graph) {
      result.broken.push({ file, name, problem: problem ?? t('comfy.workflows.notWorkflow') })
      continue
    }
    const analysis = analyse(graph)
    const effective = effectiveBindings(graph, analysis, overrides[file])
    result.loaded.push({ file, name, graph, analysis, bindings: effective.bindings, problems: [...analysis.problems, ...effective.problems] })
  }
  result.ok = result.loaded.length > 0
  return result
}

/**
 * The video workflows that are not the one clips are made with. The game ships one for each kind of graphics card, and
 * a computer runs only its own: what the others call for is not needed on it.
 */
export function unusedVideoWorkflows(dir: string, settings: Pick<ComfySettings, 'overrides' | 'defaults' | 'videoWorkflow'>): string[] {
  const { loaded } = loadWorkflows(dir, settings.overrides)
  const used = resolveWorkflow(loaded, '', 'video', defaultsFor(settings)).workflow?.file
  return loaded.filter((one) => one.bindings.firstFrame !== null && one.file !== used).map((one) => one.file)
}

/** The same reading, flattened for the renderer: no graphs, no Maps. */
export function listWorkflows(dir: string, overrides: ComfySettings['overrides']): WorkflowListResult {
  const result = loadWorkflows(dir, overrides)
  const workflows: WorkflowSummary[] = [
    ...result.loaded.map((one) => ({
      file: one.file,
      name: one.name,
      analysis: { ...one.analysis, problems: one.problems },
      problem: null,
      bindings: one.bindings
    })),
    ...result.broken.map((one) => ({ file: one.file, name: one.name, analysis: null, problem: one.problem, bindings: noBindings() }))
  ].sort((a, b) => a.file.localeCompare(b.file))
  return { ok: result.ok, message: result.message, workflows }
}

/**
 * Which workflow a request runs: the one named; else the kind's default, if it is still
 * there; else the first that has somewhere to put a prompt. Falling back matters because a
 * default is kept by file name, and the file may since have been renamed or taken out. A workflow
 * that takes a first frame makes clips: it is never fallen back on for a picture, nor one
 * that takes none for a clip.
 */
export function resolveWorkflow(
  loaded: LoadedWorkflow[],
  asked: string,
  kind: WorkflowKind,
  defaults: ComfySettings['defaults']
): { workflow: LoadedWorkflow | null; problem: string | null } {
  if (loaded.length === 0) return { workflow: null, problem: t('comfy.workflows.noneReadable') }
  const wanted = asked.trim()
  if (wanted !== '') {
    const named = loaded.find((one) => one.file === wanted || one.name === wanted.replace(/\.json$/i, ''))
    return named
      ? { workflow: named, problem: null }
      : { workflow: null, problem: t('comfy.workflows.unknown', { asked, available: loaded.map((one) => one.name).join(', ') }) }
  }
  const fitting = loaded.filter((one) => (one.bindings.firstFrame !== null) === (kind === 'video'))
  const chosen = fitting.find((one) => one.file === defaults[kind]) ?? fitting.find((one) => one.bindings.positive !== null) ?? fitting[0]
  if (chosen) return { workflow: chosen, problem: null }
  return {
    workflow: null,
    problem:
      kind === 'video'
        ? t('comfy.workflows.noVideo')
        : t('comfy.workflows.noPicture')
  }
}
