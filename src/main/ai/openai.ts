import type { ChatMessage } from '../../shared/model'
import type { LlmProfile } from '../../shared/settings'

const REQUEST_TIMEOUT_MS = 120_000

export interface CompletionInput {
  system: string
  messages: ChatMessage[]
  /** Overrides the profile's temperature for this call. */
  temperature?: number
  /** Overrides the profile's max reply tokens for this call. */
  maxTokens?: number
  /** Gives up on a request after this long, instead of the usual two minutes. */
  timeoutMs?: number
  /** Things the model may do before it answers. */
  tools?: LlmTool[]
}

/** A function the model can call mid-reply. Its result goes back to the model, which then answers. */
export interface LlmTool {
  name: string
  /** Tells the model what the tool does and when to use it. */
  description: string
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>
  /** Does the work and returns what to tell the model. */
  run(args: Record<string, unknown>): string | Promise<string>
}

// How many times in one reply the model may call tools before it must answer in words.
const MAX_TOOL_ROUNDS = 2

const LIST_TIMEOUT_MS = 15_000

/** Asks an OpenAI-compatible endpoint which models it offers, via `GET /models`. */
export async function listModels(
  connection: Pick<LlmProfile, 'baseUrl' | 'apiKey'>,
  fetchImpl: typeof fetch = fetch
): Promise<string[]> {
  const url = `${connection.baseUrl.trim().replace(/\/+$/, '')}/models`
  let response: Response
  try {
    response = await fetchImpl(url, {
      headers: connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {},
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS)
    })
  } catch (error) {
    const cause = (error as { cause?: Error }).cause
    throw new Error(`Could not reach ${url}: ${cause?.message ?? (error as Error).message}`)
  }
  if (!response.ok) {
    const body = (await response.text()).slice(0, 200)
    throw new Error(`Could not list models (${response.status} ${response.statusText}): ${body}`)
  }

  // OpenAI answers { data: [{ id }] }; some servers answer { models: [...] } or a bare list.
  const body = (await response.json()) as unknown
  const list = Array.isArray(body)
    ? body
    : ((body as { data?: unknown; models?: unknown }).data ?? (body as { models?: unknown }).models)
  if (!Array.isArray(list)) throw new Error('The endpoint did not return a list of models')
  const ids = list
    .map((m) => (typeof m === 'string' ? m : (m as { id?: unknown; name?: unknown }).id ?? (m as { name?: unknown }).name))
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}

/** The endpoint declined to produce the reply: a content filter, moderation block or refusal. */
export class RefusalError extends Error {
  constructor(detail: string) {
    super(`The LLM declined to reply: ${detail}`)
    this.name = 'RefusalError'
  }
}

/** Calls an OpenAI-compatible `/chat/completions` endpoint and returns the reply text. */
export async function chatCompletion(
  profile: LlmProfile,
  input: CompletionInput,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const url = `${profile.baseUrl.trim().replace(/\/+$/, '')}/chat/completions`
  const system = [input.system, profile.instructions].filter((s) => s.length > 0).join('\n\n')
  // Grows as tools are called: the model's requests and their results are appended.
  const messages: unknown[] = [{ role: 'system', content: system }, ...input.messages]
  let tools = input.tools && input.tools.length > 0 ? input.tools : undefined

  /** One round trip. Returns the model's message, which may ask for tools instead of holding text. */
  async function request(): Promise<AssistantMessage> {
    let response: Response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(profile.apiKey && { Authorization: `Bearer ${profile.apiKey}` })
        },
        body: JSON.stringify({
          model: profile.model,
          messages,
          temperature: input.temperature ?? profile.temperature,
          max_tokens: input.maxTokens ?? profile.maxTokens,
          ...(tools && {
            tools: tools.map((t) => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.parameters }
            }))
          })
        }),
        signal: AbortSignal.timeout(input.timeoutMs ?? REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
      if ((error as Error).name === 'TimeoutError') throw new Error('The LLM took too long to answer')
      const cause = (error as { cause?: Error }).cause
      throw new Error(`Could not reach ${url}: ${cause?.message ?? (error as Error).message}`)
    }

    if (!response.ok) {
      const body = (await response.text()).slice(0, 300)
      // Providers that block a request outright answer 4xx and name the reason.
      if (response.status < 500 && /moderation|content[ _-]?(policy|filter)|safety|flagged/i.test(body)) {
        throw new RefusalError(body)
      }
      // Not every endpoint or model accepts tools. Carry on without them rather than fail.
      if (tools && response.status < 500 && /tool|function/i.test(body)) {
        tools = undefined
        return request()
      }
      throw new Error(`LLM request failed (${response.status} ${response.statusText}): ${body}`)
    }

    const data = (await response.json()) as { choices?: { finish_reason?: string; message?: AssistantMessage }[] }
    const choice = data.choices?.[0]
    if (choice?.finish_reason === 'content_filter') throw new RefusalError('content filter')
    if (typeof choice?.message?.refusal === 'string' && choice.message.refusal.length > 0) {
      throw new RefusalError(choice.message.refusal)
    }
    return choice?.message ?? {}
  }

  for (let round = 0; ; round++) {
    const message = await request()
    const calls = message.tool_calls ?? []
    if (!tools || calls.length === 0) {
      if (typeof message.content !== 'string' || message.content.trim().length === 0) {
        throw new Error('The LLM returned an empty reply')
      }
      return message.content.trim()
    }

    messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: calls })
    for (const call of calls) {
      messages.push({ role: 'tool', tool_call_id: call.id, content: await runTool(tools, call) })
    }
    // After the last allowed round the model has to answer in words.
    if (round + 1 >= MAX_TOOL_ROUNDS) tools = undefined
  }
}

interface ToolCall {
  id: string
  function: { name: string; arguments?: string }
}

interface AssistantMessage {
  content?: unknown
  refusal?: unknown
  tool_calls?: ToolCall[]
}

/** Runs the tool a call names. Problems are reported back to the model, not thrown. */
async function runTool(tools: LlmTool[], call: ToolCall): Promise<string> {
  const tool = tools.find((t) => t.name === call.function.name)
  if (!tool) return `There is no tool called "${call.function.name}".`
  try {
    const args: unknown = JSON.parse(call.function.arguments || '{}')
    return await tool.run(typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {})
  } catch (error) {
    return `The tool could not be used: ${(error as Error).message}`
  }
}
