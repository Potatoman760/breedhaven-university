import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ArtKind, ComfySettings, WorkflowAnalysis, WorkflowBindings, WorkflowListResult, WorkflowSummary } from '../../shared/comfy'
import { analyse, effectiveBindings, noBindings, parseGraph, type ComfyGraph } from './graph'

/**
 * The folder of workflows the user exported. A folder, because that is how people already
 * keep them: ComfyUI's Export (API) writes a file, and dropping another in is how a new
 * one arrives. A file that will not parse stays in the list with its problem attached.
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

export function loadWorkflows(dir: string | null, overrides: ComfySettings['overrides']): LoadResult {
  const none = (message: string): LoadResult => ({ ok: false, message, loaded: [], broken: [] })
  if (dir === null || dir.trim().length === 0) return none('No workflow folder is chosen yet.')

  let names: string[]
  try {
    names = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
  } catch (cause) {
    return none((cause as NodeJS.ErrnoException).code === 'ENOENT' ? `There is no folder at ${dir}.` : `Could not read ${dir}: ${(cause as Error).message}`)
  }
  if (names.length === 0) return none(`No .json files in ${dir}. In ComfyUI use Workflow → Export (API) and save into this folder.`)

  const result: LoadResult = { ok: false, message: '', loaded: [], broken: [] }
  for (const file of names) {
    const name = file.replace(/\.json$/i, '')
    let text: string
    try {
      text = readFileSync(join(dir, file), 'utf8')
    } catch (cause) {
      result.broken.push({ file, name, problem: `Could not read it: ${(cause as Error).message}` })
      continue
    }
    if (text.length > MAX_WORKFLOW_BYTES) {
      result.broken.push({ file, name, problem: 'This file is far too large to be a workflow.' })
      continue
    }
    const { graph, problem } = parseGraph(text)
    if (!graph) {
      result.broken.push({ file, name, problem: problem ?? 'This is not a workflow.' })
      continue
    }
    const analysis = analyse(graph)
    const effective = effectiveBindings(graph, analysis, overrides[file])
    result.loaded.push({ file, name, graph, analysis, bindings: effective.bindings, problems: [...analysis.problems, ...effective.problems] })
  }
  result.ok = result.loaded.length > 0
  return result
}

/** The same reading, flattened for the renderer: no graphs, no Maps. */
export function listWorkflows(dir: string | null, overrides: ComfySettings['overrides']): WorkflowListResult {
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
 * in the folder; else the first that has somewhere to put a prompt. Falling back matters
 * because the folder is a folder, and a file can be renamed with the app shut.
 */
export function resolveWorkflow(
  loaded: LoadedWorkflow[],
  asked: string,
  kind: ArtKind,
  defaults: ComfySettings['defaults']
): { workflow: LoadedWorkflow | null; problem: string | null } {
  if (loaded.length === 0) return { workflow: null, problem: 'No workflow in that folder could be read.' }
  const wanted = asked.trim()
  if (wanted !== '') {
    const named = loaded.find((one) => one.file === wanted || one.name === wanted.replace(/\.json$/i, ''))
    return named
      ? { workflow: named, problem: null }
      : { workflow: null, problem: `There is no workflow called "${asked}". These are available: ${loaded.map((one) => one.name).join(', ')}.` }
  }
  const chosen = loaded.find((one) => one.file === defaults[kind]) ?? loaded.find((one) => one.bindings.positive !== null) ?? loaded[0]
  return { workflow: chosen, problem: null }
}
