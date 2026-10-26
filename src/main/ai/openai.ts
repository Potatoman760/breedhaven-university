import type { ChatMessage } from '../../shared/model'
import type { LlmProfile } from '../../shared/settings'
import { t } from '../../shared/i18n'

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
  /** Stops the call when the player gives up on it. It then fails with this signal's reason. */
  signal?: AbortSignal
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
    throw new Error(t('llm.openai.unreachable', { url, cause: cause?.message ?? (error as Error).message }))
  }
  if (!response.ok) {
    const body = (await response.text()).slice(0, 200)
    throw new Error(t('llm.openai.listFailed', { status: response.status, statusText: response.statusText, body }))
  }

  // OpenAI answers { data: [{ id }] }; some servers answer { models: [...] } or a bare list.
  const body = (await response.json()) as unknown
  const list = Array.isArray(body)
    ? body
    : ((body as { data?: unknown; models?: unknown }).data ?? (body as { models?: unknown }).models)
  if (!Array.isArray(list)) throw new Error(t('llm.openai.noModelList'))
  const ids = list
    .map((m) => (typeof m === 'string' ? m : (m as { id?: unknown; name?: unknown }).id ?? (m as { name?: unknown }).name))
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}

// How an endpoint says it will not write what was asked. Each provider has its own way, so each is looked for by name.
// A request turned away outright: Forbidden, and Unavailable For Legal Reasons.
const REFUSAL_STATUSES = [403, 451]
// ...unless what it says is that the key, the account or the region is the trouble, which no other LLM's being asked would mend.
const NOT_A_REFUSAL = /api[ _-]?key|unauthori[sz]ed|authenticat|permission|not allowed to access|quota|billing|credit|balance|region|country|rate[ _-]?limit/i
// The codes and words the body of a failed request names the reason with: OpenAI and Azure (content_filter, content_policy_violation,
// ResponsibleAIPolicyViolation), OpenRouter (moderation, flagged), Zhipu's GLM (1301, sensitive), Alibaba (data_inspection_failed), Google (safety, prohibited).
const REFUSAL_CODES =
  /moderation|content[ _-]?(?:policy|filter|management)|policy[ _-]?violation|responsibleai|data_inspection_failed|sensitive|safety|unsafe|flagged|prohibited|blocklist|\b1301\b|敏感|不安全/i
// Why a reply that did come back stopped, when it stopped for what was in it.
const REFUSAL_FINISHES = ['content_filter', 'sensitive', 'safety', 'prohibited_content', 'blocklist', 'refusal', 'recitation', 'spii']

/** Whether a failed request was the endpoint declining what was asked, as against something being wrong with the request or the account. */
export function isRefusalResponse(status: number, body: string): boolean {
  if (status < 400 || status >= 500) return false
  if (REFUSAL_CODES.test(body)) return true
  return REFUSAL_STATUSES.includes(status) && !NOT_A_REFUSAL.test(body)
}

/** The endpoint declined to produce the reply: a content filter, moderation block or refusal. */
export class RefusalError extends Error {
  constructor(detail: string) {
    super(t('llm.openai.declined', { detail }))
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
  // In a language other than English, the last thing said is which one to write in. English needs no saying.
  const system = [input.system, t('core.llm.writeIn'), profile.instructions].filter((s) => s.length > 0).join('\n\n')
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
            tools: tools.map((tool) => ({
              type: 'function',
              function: { name: tool.name, description: tool.description, parameters: tool.parameters }
            }))
          })
        }),
        signal: AbortSignal.any([AbortSignal.timeout(input.timeoutMs ?? REQUEST_TIMEOUT_MS), ...(input.signal ? [input.signal] : [])])
      })
    } catch (error) {
      if (input.signal?.aborted) throw input.signal.reason
      if ((error as Error).name === 'TimeoutError') throw new Error(t('llm.openai.tooLong'))
      const cause = (error as { cause?: Error }).cause
      throw new Error(t('llm.openai.unreachable', { url, cause: cause?.message ?? (error as Error).message }))
    }

    if (!response.ok) {
      const body = (await response.text()).slice(0, 300)
      // Providers that block a request outright answer 4xx: with a code that says so, or by naming the reason.
      if (isRefusalResponse(response.status, body)) {
        throw new RefusalError(`${response.status} ${response.statusText}: ${body}`.trim())
      }
      // Not every endpoint or model accepts tools. Carry on without them rather than fail.
      if (tools && response.status < 500 && /tool|function/i.test(body)) {
        tools = undefined
        return request()
      }
      throw new Error(t('llm.openai.failed', { status: response.status, statusText: response.statusText, body }))
    }

    const data = (await response.json()) as { choices?: { finish_reason?: unknown; native_finish_reason?: unknown; message?: AssistantMessage }[] }
    const choice = data.choices?.[0]
    // Why it stopped, as the endpoint says it and, behind a router, as the provider itself said it.
    const finishes = [choice?.finish_reason, choice?.native_finish_reason].filter((reason): reason is string => typeof reason === 'string').map((reason) => reason.toLowerCase())
    const stopped = finishes.find((reason) => REFUSAL_FINISHES.includes(reason))
    if (stopped) throw new RefusalError(t('llm.openai.stopped', { reason: stopped }))
    if (typeof choice?.message?.refusal === 'string' && choice.message.refusal.length > 0) {
      throw new RefusalError(choice.message.refusal)
    }
    // Nothing at all, and not for want of room: that is how some providers answer what they will not write, Google's above all.
    const said = typeof choice?.message?.content === 'string' && choice.message.content.trim().length > 0
    if (!said && (choice?.message?.tool_calls ?? []).length === 0 && !finishes.includes('length')) {
      throw new RefusalError(t('llm.openai.emptyBlocked'))
    }
    return choice?.message ?? {}
  }

  for (let round = 0; ; round++) {
    // Stopped between rounds, while a tool was being run, it goes no further.
    input.signal?.throwIfAborted()
    const message = await request()
    const calls = message.tool_calls ?? []
    if (!tools || calls.length === 0) {
      if (typeof message.content !== 'string' || message.content.trim().length === 0) {
        throw new Error(t('llm.openai.emptyReply'))
      }
      return message.content.trim()
    }

    messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: calls })
    // Only the last message is the reply: whatever the model wrote beside a tool call is never shown. It is told so, or it takes
    // that writing as done and answers with a remark on it ("she has already been written leaving above") in place of the scene.
    const wrote = typeof message.content === 'string' && message.content.trim().length > 0
    for (const [n, call] of calls.entries()) {
      const result = await runTool(tools, call)
      messages.push({ role: 'tool', tool_call_id: call.id, content: n === calls.length - 1 ? `${result}

${wrote ? wroteBesideTool() : afterTool()}` : result })
    }
    // After the last allowed round the model has to answer in words.
    if (round + 1 >= MAX_TOOL_ROUNDS) tools = undefined
  }
}

// Said to the model after its tools have run, so that what comes next is the reply itself and nothing about how it was made.
export const afterTool = (): string => t('llm.openai.afterTool')
export const wroteBesideTool = (): string => t('llm.openai.wroteBesideTool')

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
  const tool = tools.find((one) => one.name === call.function.name)
  if (!tool) return t('llm.openai.noTool', { name: call.function.name })
  try {
    const args: unknown = JSON.parse(call.function.arguments || '{}')
    return await tool.run(typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {})
  } catch (error) {
    return t('llm.openai.toolFailed', { error: (error as Error).message })
  }
}
