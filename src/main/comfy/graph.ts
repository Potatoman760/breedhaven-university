import {
  BINDING_SLOTS,
  type BindingOverride,
  type BindingSlot,
  type NodeField,
  type WorkflowAnalysis,
  type WorkflowBindings,
  type WorkflowNodeSummary
} from '../../shared/comfy'

/**
 * Reading a ComfyUI workflow well enough to put someone else's words in it.
 *
 * An API-format export is a flat map of node id to node, where every input is either a
 * literal or a `[nodeId, outputIndex]` tuple naming what feeds it. So "where does the
 * prompt go" is answered by walking the wiring, not by matching class names: a sampler is
 * whatever takes a positive, a negative and a latent, whatever a custom node pack calls it.
 *
 * Nothing here touches the filesystem or the network.
 */

export type ComfyInput = { kind: 'link'; node: string; slot: number } | { kind: 'value'; value: string | number | boolean }

export interface ComfyNode {
  id: string
  classType: string
  /** `_meta.title`: what the user renamed it to in ComfyUI, when they did. */
  title: string | null
  inputs: Map<string, ComfyInput>
}

export interface ComfyGraph {
  nodes: Map<string, ComfyNode>
  /** Node ids in file order. */
  order: string[]
  /**
   * The parsed JSON, untouched. Values are written into a clone of this, so anything this
   * file does not model reaches ComfyUI exactly as it was exported.
   */
  source: Record<string, unknown>
}

// Deep enough for any real chain of conditioning; short enough to stay quick.
const MAX_DEPTH = 12
const SAMPLER_SHAPE = ['positive', 'negative', 'latent_image'] as const
// Where prompt text sits, best first. `text_g` before `text_l`: of an SDXL encode's two streams, it carries the sense.
const TEXT_FIELDS = ['text', 'text_g', 'text_l', 'prompt', 'string', 'value'] as const
const SEED_FIELDS = ['seed', 'noise_seed'] as const
// Nodes that pictures come out of, best first: one that saves is preferred to one that previews.
const OUTPUT_CLASSES = ['SaveImage', 'SaveImageWebsocket', 'PreviewImage']

function isLink(value: unknown): value is [string | number, number] {
  return Array.isArray(value) && value.length === 2 && (typeof value[0] === 'string' || typeof value[0] === 'number') && typeof value[1] === 'number'
}

function readInput(value: unknown): ComfyInput | null {
  // A link is often exported with a numeric node id; it is the same node either way.
  if (isLink(value)) return { kind: 'link', node: String(value[0]), slot: value[1] }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return { kind: 'value', value }
  // Anything else is not modelled. It still travels in `source`; it just can't be bound to.
  return null
}

/** Reads an export, or says why it is not one. */
export function parseGraph(json: string): { graph: ComfyGraph | null; problem: string | null } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json.replace(/^﻿/, ''))
  } catch (cause) {
    return { graph: null, problem: `This file is not readable JSON: ${cause instanceof Error ? cause.message : String(cause)}` }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { graph: null, problem: 'This file is not a ComfyUI workflow.' }
  }
  const source = parsed as Record<string, unknown>

  // What Save writes, rather than Export (API): nodes in a list, links kept apart. It can't be run over the API.
  if (Array.isArray(source['nodes'])) {
    return {
      graph: null,
      problem:
        'This is a workflow saved from the ComfyUI canvas, which cannot be run over the API. In ComfyUI use Workflow → Export (API) and save that file here instead.'
    }
  }

  const nodes = new Map<string, ComfyNode>()
  const order: string[] = []
  for (const [id, raw] of Object.entries(source)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue
    const record = raw as Record<string, unknown>
    if (typeof record['class_type'] !== 'string') continue

    const inputs = new Map<string, ComfyInput>()
    const rawInputs = record['inputs']
    if (typeof rawInputs === 'object' && rawInputs !== null && !Array.isArray(rawInputs)) {
      for (const [name, value] of Object.entries(rawInputs as Record<string, unknown>)) {
        const input = readInput(value)
        if (input) inputs.set(name, input)
      }
    }
    const meta = record['_meta'] as Record<string, unknown> | null | undefined
    const title = typeof meta === 'object' && meta !== null && typeof meta['title'] === 'string' ? meta['title'] : null
    nodes.set(id, { id, classType: record['class_type'], title, inputs })
    order.push(id)
  }

  if (nodes.size === 0) {
    return {
      graph: null,
      problem: 'Nothing in this file looks like a ComfyUI node. Export it again with Workflow → Export (API).'
    }
  }
  return { graph: { nodes, order, source }, problem: null }
}

/** "KSampler #3", or with its title when it was renamed. */
function label(graph: ComfyGraph, id: string): string {
  const node = graph.nodes.get(id)
  if (!node) return `#${id}`
  return node.title ? `${node.classType} #${id} ("${node.title}")` : `${node.classType} #${id}`
}

function linkInputs(node: ComfyNode): { name: string; node: string }[] {
  const found: { name: string; node: string }[] = []
  for (const [name, input] of node.inputs) {
    if (input.kind === 'link') found.push({ name, node: input.node })
  }
  return found
}

function valueOf(graph: ComfyGraph, id: string, field: string): string | number | boolean | undefined {
  const input = graph.nodes.get(id)?.inputs.get(field)
  return input?.kind === 'value' ? input.value : undefined
}

/** Every node reachable from `start` by following what feeds it. */
function ancestors(graph: ComfyGraph, start: string): Set<string> {
  const seen = new Set<string>()
  const queue = [start]
  while (queue.length > 0) {
    const node = graph.nodes.get(queue.shift()!)
    if (!node) continue
    for (const link of linkInputs(node)) {
      if (seen.has(link.node)) continue
      seen.add(link.node)
      queue.push(link.node)
    }
  }
  return seen
}

function samplerCandidates(graph: ComfyGraph): string[] {
  const linked = (id: string, name: string) => graph.nodes.get(id)?.inputs.get(name)?.kind === 'link'
  const strict = graph.order.filter((id) => SAMPLER_SHAPE.every((name) => linked(id, name)))
  if (strict.length > 0) return strict
  // A sampler that takes its latent by another name is still a sampler.
  return graph.order.filter((id) => /sampler/i.test(graph.nodes.get(id)!.classType) && linked(id, 'positive') && linked(id, 'negative'))
}

/**
 * Which sampler the graph is about. With a base and a refiner, the refiner can reach the
 * base by walking its inputs and not the other way round, so the one nothing else can
 * reach is the last stage: the one whose output is the picture.
 */
function pickSampler(graph: ComfyGraph, candidates: string[], problems: string[]): string | null {
  if (candidates.length === 0) {
    problems.push('No sampler here: nothing in this workflow takes a positive and a negative conditioning, so there is nowhere to put a prompt.')
    return null
  }
  if (candidates.length === 1) return candidates[0]

  const reach = new Map(candidates.map((id) => [id, ancestors(graph, id)]))
  const downstream = candidates.filter((id) => !candidates.some((other) => other !== id && reach.get(other)?.has(id)))
  if (downstream.length === 1) return downstream[0]

  const pool = downstream.length > 0 ? downstream : candidates
  const chosen = [...pool].sort((a, b) => Number(b) - Number(a) || b.localeCompare(a))[0]
  problems.push(
    `There are ${pool.length} samplers with no link between them (${pool.map((id) => label(graph, id)).join(', ')}). ` +
      `The prompt was bound to ${label(graph, chosen)}; the others keep whatever text was saved in them. Repoint it if that is the wrong one.`
  )
  return chosen
}

/**
 * Walks from a conditioning input to the text nodes behind it, through whatever sits in
 * between: a combine, a ControlNet apply, a LoRA stack. Bounded and guarded against loops.
 */
function followToText(graph: ComfyGraph, id: string, found: NodeField[], seen: Set<string>, depth: number): void {
  if (depth > MAX_DEPTH || seen.has(id)) return
  seen.add(id)
  const node = graph.nodes.get(id)
  if (!node) return

  for (const field of TEXT_FIELDS) {
    const input = node.inputs.get(field)
    if (input?.kind === 'value' && typeof input.value === 'string') {
      // A node that holds the text is the end of this branch.
      found.push({ node: id, field })
      return
    }
  }
  // Conditioning first, so a combine's own inputs are preferred to the model or clip hanging off the same node.
  const links = linkInputs(node)
  const ordered = [...links.filter((l) => l.name.startsWith('conditioning')), ...links.filter((l) => !l.name.startsWith('conditioning'))]
  for (const link of ordered) followToText(graph, link.node, found, seen, depth + 1)
}

/**
 * The node that decides how big the picture is. Deepest wins: an upscale in the middle of
 * a chain also has a width and a height, and writing the size there would leave the
 * generation at whatever it was.
 */
function followToSize(graph: ComfyGraph, id: string, seen: Set<string>, depth: number): { width: NodeField; height: NodeField } | null {
  if (depth > MAX_DEPTH || seen.has(id)) return null
  seen.add(id)
  const node = graph.nodes.get(id)
  if (!node) return null

  for (const link of linkInputs(node)) {
    const deeper = followToSize(graph, link.node, seen, depth + 1)
    if (deeper) return deeper
  }
  if (typeof valueOf(graph, id, 'width') === 'number' && typeof valueOf(graph, id, 'height') === 'number') {
    return { width: { node: id, field: 'width' }, height: { node: id, field: 'height' } }
  }
  return null
}

/** Breadth-first from a node, for a literal input with one of these names. */
function findNearby(graph: ComfyGraph, start: string, fields: readonly string[], maxDepth: number): NodeField | null {
  const seen = new Set<string>([start])
  let level = [start]
  for (let depth = 0; depth <= maxDepth && level.length > 0; depth++) {
    for (const id of level) {
      for (const field of fields) {
        if (valueOf(graph, id, field) !== undefined) return { node: id, field }
      }
    }
    const next: string[] = []
    for (const id of level) {
      for (const link of linkInputs(graph.nodes.get(id) ?? { id, classType: '', title: null, inputs: new Map() })) {
        if (seen.has(link.node)) continue
        seen.add(link.node)
        next.push(link.node)
      }
    }
    level = next
  }
  return null
}

function findOutput(graph: ComfyGraph): string | null {
  const named = graph.order
    .filter((id) => OUTPUT_CLASSES.includes(graph.nodes.get(id)!.classType))
    .sort((a, b) => OUTPUT_CLASSES.indexOf(graph.nodes.get(a)!.classType) - OUTPUT_CLASSES.indexOf(graph.nodes.get(b)!.classType))
  if (named.length > 0) return named[0]

  // No node with a name we know: anything that takes images and feeds nothing else is where they come out.
  const fedFrom = new Set<string>()
  for (const id of graph.order) for (const link of linkInputs(graph.nodes.get(id)!)) fedFrom.add(link.node)
  return graph.order.find((id) => !fedFrom.has(id) && graph.nodes.get(id)?.inputs.get('images')?.kind === 'link') ?? null
}

function summarise(graph: ComfyGraph): WorkflowNodeSummary[] {
  return graph.order.map((id) => {
    const node = graph.nodes.get(id)!
    const fields: { name: string; value: string | number | boolean }[] = []
    for (const [name, input] of node.inputs) if (input.kind === 'value') fields.push({ name, value: input.value })
    return { id, classType: node.classType, title: node.title, fields }
  })
}

export function noBindings(): WorkflowBindings {
  return { positive: null, negative: null, width: null, height: null, seed: null, output: null }
}

/** Reads a graph and works out where everything goes. */
export function analyse(graph: ComfyGraph): WorkflowAnalysis {
  const problems: string[] = []
  const detected = noBindings()
  const notes: Partial<Record<BindingSlot, string>> = {}
  const sampler = pickSampler(graph, samplerCandidates(graph), problems)

  if (sampler) {
    const node = graph.nodes.get(sampler)!
    for (const slot of ['positive', 'negative'] as const) {
      const input = node.inputs.get(slot)
      if (input?.kind !== 'link') continue
      const found: NodeField[] = []
      followToText(graph, input.node, found, new Set(), 0)
      if (found.length === 0) continue
      detected[slot] = found[0]
      notes[slot] = `followed ${label(graph, sampler)} ${slot} → ${label(graph, found[0].node)} ${found[0].field}`
      if (found.length > 1) {
        problems.push(
          `${found.length} text nodes lead to ${slot} (${found.map((one) => label(graph, one.node)).join(', ')}). ${label(graph, found[0].node)} was chosen; pick another if that is wrong.`
        )
      }
    }

    // Both arriving at one node would make the prompt its own negative.
    if (detected.positive && detected.negative && detected.positive.node === detected.negative.node && detected.positive.field === detected.negative.field) {
      problems.push(`Positive and negative both lead to ${label(graph, detected.positive.node)}, so the negative is left unbound.`)
      detected.negative = null
      delete notes.negative
    }

    const latent = node.inputs.get('latent_image')
    const size = latent?.kind === 'link' ? followToSize(graph, latent.node, new Set(), 0) : null
    if (size) {
      detected.width = size.width
      detected.height = size.height
      notes.width = `${label(graph, size.width.node)} width`
      notes.height = `${label(graph, size.height.node)} height`
    }

    // On the sampler itself nearly always; a custom sampler keeps its noise in a node a little way back.
    const seed = findNearby(graph, sampler, SEED_FIELDS, 4)
    if (seed) {
      detected.seed = seed
      notes.seed = `${label(graph, seed.node)} ${seed.field}`
    }
  }

  if (detected.positive === null) {
    problems.push('No prompt node is bound, so there is nowhere to put what is asked for. Point "Prompt" at the text node this workflow uses.')
  }
  if (detected.seed === null) {
    problems.push('No seed was found. ComfyUI caches by workflow, so the same prompt will return the same picture every time.')
  }

  const output = findOutput(graph)
  if (output) {
    detected.output = { node: output, field: 'images' }
    notes.output = label(graph, output)
  } else {
    problems.push('No node saves an image, so this workflow would run and produce nothing to keep.')
  }

  return { nodes: summarise(graph), sampler, detected, notes, problems }
}

/** What a bound field holds right now, when it holds a number. */
export function boundNumber(graph: ComfyGraph, at: NodeField | null): number | null {
  const value = at ? valueOf(graph, at.node, at.field) : undefined
  return typeof value === 'number' ? value : null
}

/** Whether a binding still names something that exists and can be written to. */
function stillValid(graph: ComfyGraph, slot: BindingSlot, at: NodeField): boolean {
  const node = graph.nodes.get(at.node)
  if (!node) return false
  // Nothing is written to the output node; only its identity is used.
  return slot === 'output' || node.inputs.get(at.field)?.kind === 'value'
}

/**
 * What was detected, corrected by what the user said, checked against the graph. An
 * override outlives the export it was made against: exporting again renumbers the nodes,
 * and a stale one then falls back to what was detected, and says so.
 */
export function effectiveBindings(
  graph: ComfyGraph,
  analysis: WorkflowAnalysis,
  override: BindingOverride | undefined
): { bindings: WorkflowBindings; problems: string[] } {
  const bindings = noBindings()
  const problems: string[] = []
  for (const slot of BINDING_SLOTS) {
    const overridden = override !== undefined && slot in override
    const chosen = overridden ? (override[slot] ?? null) : analysis.detected[slot]
    if (chosen === null) continue
    if (stillValid(graph, slot, chosen)) {
      bindings[slot] = chosen
      continue
    }
    if (!overridden) continue
    const detected = analysis.detected[slot]
    const usable = detected !== null && stillValid(graph, slot, detected)
    if (usable) bindings[slot] = detected
    problems.push(
      `The saved binding for "${slot}" points at node #${chosen.node} ${chosen.field}, which this workflow no longer has.` +
        (usable ? ` Using ${label(graph, detected.node)} ${detected.field} instead.` : '')
    )
  }
  return { bindings, problems }
}

/** What to change. Anything left out stays as the workflow saved it. */
export interface GenerationValues {
  positive?: string
  negative?: string
  width?: number
  height?: number
  seed?: number
}

const WRITABLE = ['positive', 'negative', 'width', 'height', 'seed'] as const

/**
 * The graph as it will be sent: the user's own export with our values written into a
 * clone of it. Asked for nothing, the result is equal to what was exported.
 */
export function applyBindings(
  graph: ComfyGraph,
  bindings: WorkflowBindings,
  values: GenerationValues
): { prompt: Record<string, unknown>; applied: BindingSlot[]; skipped: BindingSlot[] } {
  const prompt = structuredClone(graph.source)
  const applied: BindingSlot[] = []
  const skipped: BindingSlot[] = []
  for (const slot of WRITABLE) {
    const value = values[slot]
    if (value === undefined) continue
    const at = bindings[slot]
    const inputs = at ? (prompt[at.node] as { inputs?: Record<string, unknown> } | undefined)?.inputs : undefined
    if (!at || typeof inputs !== 'object' || inputs === null) {
      skipped.push(slot)
      continue
    }
    inputs[at.field] = value
    applied.push(slot)
  }
  return { prompt, applied, skipped }
}
