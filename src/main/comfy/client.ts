import { randomUUID } from 'node:crypto'
import type { ComfyTestResult } from '../../shared/comfy'

/**
 * Talking to ComfyUI: one function per endpoint, then one generation from queueing it to
 * holding the bytes. Nothing here throws for an ordinary failure. A refused connection is
 * a fact about the user's machine, and comes back as a sentence they can act on.
 */

// One id for the life of the app. ComfyUI files each job under whoever queued it.
const CLIENT_ID = randomUUID()
// Bigger than any picture a workflow should produce.
const MAX_IMAGE_BYTES = 32 * 1024 * 1024
// And than any clip: a few seconds of video, not a film.
const MAX_VIDEO_BYTES = 512 * 1024 * 1024
// What a clip's file is called. A video node hands back its preview picture as well, which is not the clip.
const VIDEO_FILE = /\.(mp4|webm)$/i
// Where a run's files are listed, by what made them: pictures under `images`, and a video node's clip under one of the others.
const IMAGE_LISTS = ['images'] as const
const VIDEO_LISTS = ['gifs', 'videos', 'video', 'images'] as const
// A mistyped host must cost ten seconds, not the whole timeout.
const FIRST_CALL_MS = 10_000
const POLL_RUNNING_MS = 500
const POLL_QUEUED_MS = 1_500

/** A picture ComfyUI has made and is holding. Used only as query parameters, never as a local path. */
interface ComfyImageRef {
  filename: string
  subfolder: string
  type: string
}

function describe(cause: unknown, baseUrl: string): string {
  if (cause instanceof Error && (cause.name === 'AbortError' || cause.name === 'TimeoutError')) return `${baseUrl} did not answer in time.`
  const raw = cause instanceof Error ? cause.message : String(cause)
  // Node buries the useful part: "fetch failed", with the cause underneath.
  const inner = cause instanceof Error && cause.cause instanceof Error ? cause.cause.message : ''
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT/.test(`${raw} ${inner}`)) return `Nothing is answering at ${baseUrl}. Is ComfyUI running?`
  return `${baseUrl}: ${inner || raw}`
}

/** Whether ComfyUI is there, and enough about it to show it is the right one. */
export async function testComfy(baseUrl: string): Promise<ComfyTestResult> {
  try {
    const response = await fetch(`${baseUrl}/system_stats`, { signal: AbortSignal.timeout(8_000) })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200).trim()
      return { ok: false, message: detail || `${response.status} ${response.statusText}`, device: null }
    }
    const body = (await response.json()) as { system?: { comfyui_version?: unknown }; devices?: { name?: unknown; vram_total?: unknown }[] }
    const parts: string[] = []
    if (typeof body.system?.comfyui_version === 'string') parts.push(`ComfyUI ${body.system.comfyui_version}`)
    const device = body.devices?.[0]
    // "cuda:0 NVIDIA GeForce RTX 4090 : cudaMallocAsync": the index and the allocator are noise here.
    if (typeof device?.name === 'string') parts.push(device.name.replace(/^\w+:\d+\s+/, '').replace(/\s*:\s*\w*[Mm]alloc\w*$/, ''))
    if (typeof device?.vram_total === 'number' && device.vram_total > 0) parts.push(`${(device.vram_total / 1024 ** 3).toFixed(1)} GB`)
    return { ok: true, message: 'ComfyUI answered.', device: parts.length > 0 ? parts.join(' · ') : null }
  } catch (cause) {
    return { ok: false, message: describe(cause, baseUrl), device: null }
  }
}

/** ComfyUI checks a graph before queueing it and says which node and input it did not like. */
function describeRefusal(body: unknown, status: number): string {
  const record = body as { error?: unknown; node_errors?: unknown } | null
  const reasons: string[] = []
  if (typeof record?.node_errors === 'object' && record.node_errors !== null) {
    for (const [id, value] of Object.entries(record.node_errors as Record<string, unknown>)) {
      const detail = value as { class_type?: unknown; errors?: { message?: unknown; details?: unknown }[] }
      const type = typeof detail.class_type === 'string' ? detail.class_type : 'node'
      for (const one of detail.errors ?? []) {
        const extra = typeof one.details === 'string' && one.details.length > 0 ? ` (${one.details})` : ''
        reasons.push(`${type} #${id}: ${typeof one.message === 'string' ? one.message : 'was refused'}${extra}`)
      }
    }
  }
  if (reasons.length > 0) return `ComfyUI refused the workflow: ${reasons.slice(0, 4).join('; ')}.`
  const error = record?.error
  const message = typeof error === 'string' ? error : (error as { message?: unknown } | null)?.message
  return typeof message === 'string' ? `ComfyUI refused the workflow: ${message}` : `ComfyUI refused the workflow (${status}).`
}

async function submitPrompt(baseUrl: string, prompt: Record<string, unknown>, signal: AbortSignal): Promise<{ promptId: string | null; message: string }> {
  try {
    const response = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, client_id: CLIENT_ID }),
      signal
    })
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) return { promptId: null, message: describeRefusal(body, response.status) }
    const promptId = (body as { prompt_id?: unknown } | null)?.prompt_id
    if (typeof promptId !== 'string' || promptId.length === 0) {
      return { promptId: null, message: 'ComfyUI accepted the workflow but did not say which job it is.' }
    }
    return { promptId, message: '' }
  } catch (cause) {
    return { promptId: null, message: describe(cause, baseUrl) }
  }
}

/** Prefers the bound node's pictures, but takes any the run made rather than none. Asked for a clip, only files that are one. */
function collectImages(outputs: unknown, outputNode: string | null, video: boolean): ComfyImageRef[] {
  if (typeof outputs !== 'object' || outputs === null) return []
  const record = outputs as Record<string, unknown>
  const from = (value: unknown): ComfyImageRef[] =>
    (video ? VIDEO_LISTS : IMAGE_LISTS)
      .flatMap((list) => {
        const files = (value as Record<string, unknown> | null)?.[list]
        return Array.isArray(files) ? files : []
      })
      .filter((one): one is Record<string, unknown> => typeof one === 'object' && one !== null && typeof one['filename'] === 'string')
      .filter((one) => !video || VIDEO_FILE.test(one['filename'] as string))
      .map((one) => ({
        filename: one['filename'] as string,
        subfolder: typeof one['subfolder'] === 'string' ? one['subfolder'] : '',
        type: typeof one['type'] === 'string' ? one['type'] : 'output'
      }))
  const preferred = outputNode !== null ? from(record[outputNode]) : []
  return preferred.length > 0 ? preferred : Object.values(record).flatMap(from)
}

function executionError(messages: unknown): string {
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!Array.isArray(message) || message[0] !== 'execution_error') continue
    const detail = message[1] as { exception_message?: unknown; node_type?: unknown } | undefined
    if (typeof detail?.exception_message === 'string') {
      return `ComfyUI failed to run the workflow${typeof detail.node_type === 'string' ? ` in ${detail.node_type}` : ''}: ${detail.exception_message}`
    }
  }
  return 'ComfyUI failed to run the workflow.'
}

/** How a job went, or `done: false` while it is still going. The only thing that decides a run is over. */
async function readHistory(
  baseUrl: string,
  promptId: string,
  outputNode: string | null,
  video: boolean,
  signal: AbortSignal
): Promise<{ done: boolean; images: ComfyImageRef[]; error: string | null }> {
  const idle = { done: false, images: [], error: null }
  let body: unknown
  try {
    const response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`, { signal })
    if (!response.ok) return idle
    body = await response.json()
  } catch {
    // A dropped poll is not a failed job; the deadline ends a run that never comes back.
    return idle
  }
  const entry = (body as Record<string, unknown> | null)?.[promptId] as { outputs?: unknown; status?: { status_str?: unknown; completed?: unknown; messages?: unknown } } | undefined
  if (typeof entry !== 'object' || entry === null) return idle
  const images = collectImages(entry.outputs, outputNode, video)
  const failed = entry.status?.status_str === 'error'
  if (!failed && images.length === 0 && entry.status?.completed !== true) return idle
  return { done: true, images, error: failed ? executionError(entry.status?.messages) : null }
}

/** Whether our job is behind others, so a long wait can be told from a slow picture. */
async function isQueued(baseUrl: string, promptId: string, signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/queue`, { signal })
    if (!response.ok) return false
    const body = (await response.json()) as { queue_pending?: unknown[] }
    return (body.queue_pending ?? []).some((item) => Array.isArray(item) && item[1] === promptId)
  } catch {
    return false
  }
}

/** Fetches one picture or clip, giving up past a size no workflow should reach. */
async function fetchImage(baseUrl: string, ref: ComfyImageRef, limit: number, signal: AbortSignal): Promise<{ bytes: Buffer | null; message: string }> {
  const query = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder, type: ref.type })
  try {
    const response = await fetch(`${baseUrl}/view?${query.toString()}`, { signal })
    if (!response.ok || !response.body) return { bytes: null, message: `Could not fetch what ComfyUI made (${response.status}).` }
    // Read in pieces: a wrong port pointed at something that never stops sending must not take the app's memory with it.
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel().catch(() => {})
        return { bytes: null, message: 'That file is larger than the app will accept.' }
      }
      chunks.push(value)
    }
    return { bytes: Buffer.concat(chunks), message: '' }
  } catch (cause) {
    return { bytes: null, message: describe(cause, baseUrl) }
  }
}

/**
 * Hands ComfyUI a picture to load, as a workflow's Load Image node would be given one, and says what it is filed
 * under there. One of the same name is replaced, so that the pictures clips are made from do not pile up.
 */
export async function uploadImage(baseUrl: string, bytes: Buffer, filename: string, signal?: AbortSignal): Promise<{ name: string | null; message: string }> {
  const form = new FormData()
  form.append('image', new Blob([new Uint8Array(bytes)]), filename)
  form.append('overwrite', 'true')
  const deadline = AbortSignal.timeout(FIRST_CALL_MS * 3)
  try {
    const response = await fetch(`${baseUrl}/upload/image`, { method: 'POST', body: form, signal: signal ? AbortSignal.any([signal, deadline]) : deadline })
    if (!response.ok) return { name: null, message: `ComfyUI would not take the picture (${response.status} ${response.statusText}).` }
    const body = (await response.json().catch(() => null)) as { name?: unknown; subfolder?: unknown } | null
    if (typeof body?.name !== 'string' || body.name === '') return { name: null, message: 'ComfyUI took the picture but did not say what it called it.' }
    return { name: typeof body.subfolder === 'string' && body.subfolder !== '' ? `${body.subfolder}/${body.name}` : body.name, message: '' }
  } catch (cause) {
    return { name: null, message: signal?.aborted ? 'Cancelled.' : describe(cause, baseUrl) }
  }
}

/** Best-effort tidying up after a run that was given up on. Silent: it must never replace the reason for giving up. */
async function abandon(baseUrl: string, promptId: string): Promise<void> {
  const signal = AbortSignal.timeout(3_000)
  await fetch(`${baseUrl}/interrupt`, { method: 'POST', signal }).catch(() => {})
  await fetch(`${baseUrl}/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delete: [promptId] }),
    signal
  }).catch(() => {})
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

export interface GenerateRequest {
  baseUrl: string
  /** The workflow, with the values already written into it. */
  prompt: Record<string, unknown>
  /** Whose pictures to collect. Null takes any the run produced. */
  outputNode: string | null
  /** What the run is for. A clip is looked for where a video node lists what it saved, and only an .mp4 or .webm is taken. */
  wants?: 'image' | 'video'
  timeoutMs: number
  /** Aborted when the user cancels. */
  cancel?: AbortSignal
}

export interface GenerateResult {
  ok: boolean
  message: string
  bytes: Buffer | null
  /** What kind of file it is, by its ending: `png`, `mp4`. */
  extension: string | null
}

/** One generation: queue the workflow, wait until `/history` says it is over, fetch the first picture or clip. */
export async function generateImage(request: GenerateRequest): Promise<GenerateResult> {
  const { baseUrl } = request
  const failed = (message: string): GenerateResult => ({ ok: false, message, bytes: null, extension: null })
  const video = request.wants === 'video'
  const deadline = AbortSignal.timeout(request.timeoutMs)
  const signal = request.cancel ? AbortSignal.any([deadline, request.cancel]) : deadline

  const submitted = await submitPrompt(baseUrl, request.prompt, AbortSignal.any([signal, AbortSignal.timeout(FIRST_CALL_MS)]))
  if (submitted.promptId === null) return failed(request.cancel?.aborted ? 'Cancelled.' : submitted.message)

  for (;;) {
    if (signal.aborted) {
      await abandon(baseUrl, submitted.promptId)
      return failed(
        request.cancel?.aborted
          ? 'Cancelled. Nothing was saved.'
          : `ComfyUI did not finish within ${Math.round(request.timeoutMs / 1000)} seconds, so the job was cancelled. Nothing was saved.`
      )
    }
    const history = await readHistory(baseUrl, submitted.promptId, request.outputNode, video, signal)
    if (history.done) {
      if (history.error) return failed(history.error)
      if (history.images.length === 0) {
        return failed(
          video
            ? 'The workflow ran but saved no .mp4 or .webm clip. It needs a node that saves the video in one of those formats: add one in ComfyUI and export it again.'
            : 'The workflow ran but saved no picture. It probably has no SaveImage node: add one in ComfyUI and export it again.'
        )
      }
      const made = history.images[0]
      const image = await fetchImage(baseUrl, made, video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES, signal)
      return image.bytes ? { ok: true, message: '', bytes: image.bytes, extension: /\.([a-z0-9]+)$/i.exec(made.filename)?.[1].toLowerCase() ?? null } : failed(image.message)
    }
    await delay((await isQueued(baseUrl, submitted.promptId, signal)) ? POLL_QUEUED_MS : POLL_RUNNING_MS, signal)
  }
}
