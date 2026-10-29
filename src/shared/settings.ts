import { z } from 'zod'

export const LLM_PROFILE_IDS = ['main', 'nsfw'] as const
export type LlmProfileId = (typeof LLM_PROFILE_IDS)[number]

export const LLM_DEFAULT_TIMEOUT_SECONDS = 120
export const LLM_MIN_TIMEOUT_SECONDS = 10
export const LLM_MAX_TIMEOUT_SECONDS = 1800

/** How many of her memories a character is told in a scene, unless the player has set otherwise. */
export const DEFAULT_MEMORY_RECALL = 8

export const REASONING_LEVELS = ['default', 'off', 'minimal', 'low', 'medium', 'high'] as const
export type ReasoningLevel = (typeof REASONING_LEVELS)[number]
/**
 * `effort` is OpenAI's `reasoning_effort`, which most hosted endpoints copy; `openrouter` is OpenRouter's `reasoning`;
 * `template` switches thinking on or off in a local model's chat template (`enable_thinking`, as Qwen's has). `auto`
 * goes by the address.
 */
export const REASONING_STYLES = ['auto', 'effort', 'openrouter', 'template'] as const
export type ReasoningStyle = (typeof REASONING_STYLES)[number]

/** Connection to one OpenAI-compatible chat completions endpoint. */
export const LlmProfileSchema = z.object({
  /** Up to but not including `/chat/completions`, e.g. `https://api.openai.com/v1`. */
  baseUrl: z.string().default(''),
  apiKey: z.string().default(''),
  model: z.string().default(''),
  temperature: z.number().min(0).max(2).default(0.8),
  // Only a ceiling: what a reply costs is what it says. Its hidden tags, a tool call and a thinking model's reasoning all
  // come out of it, and a reply cut short loses them.
  maxTokens: z.number().int().min(1).default(1024),
  /** How long a reply may take before it is given up on. A slow local model, or a thinking one, may want longer. */
  timeoutSeconds: z.number().int().min(LLM_MIN_TIMEOUT_SECONDS).max(LLM_MAX_TIMEOUT_SECONDS).default(LLM_DEFAULT_TIMEOUT_SECONDS),
  /** Appended to every system prompt sent through this profile. */
  instructions: z.string().default(''),
  /**
   * How hard a thinking model thinks before it answers. Its thinking comes out of the reply's tokens and its time, and a
   * reply cut short loses its hidden tags, so less is often better here. `default` sends nothing.
   */
  reasoning: z.enum(REASONING_LEVELS).default('default'),
  /** How the endpoint is told it: endpoints each take it their own way, and refuse a way they do not know. */
  reasoningStyle: z.enum(REASONING_STYLES).default('auto'),
  // Samplers. One left out is not sent, and the model's own is used: not every endpoint takes every one.
  topP: z.number().min(0).max(1).optional(),
  minP: z.number().min(0).max(1).optional(),
  topK: z.number().int().min(0).optional(),
  repetitionPenalty: z.number().min(0).max(3).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  /** OpenRouter: the providers to try first, in order, comma-separated. */
  providerOrder: z.string().default(''),
  /** OpenRouter: providers never to use, comma-separated. One that refuses what the game writes, say. */
  providerIgnore: z.string().default(''),
  /** OpenRouter: whether another provider may answer when those named cannot. */
  allowFallbacks: z.boolean().default(true),
  /**
   * The most requests sent to its address at once; the rest wait their turn. Left out, there is no limit. For a provider
   * that takes one request at a time, 1.
   */
  maxConcurrent: z.number().int().min(1).optional()
})
export type LlmProfile = z.infer<typeof LlmProfileSchema>

export const SettingsSchema = z.object({
  main: LlmProfileSchema.prefault({}),
  nsfw: LlmProfileSchema.prefault({}),
  /** What the game is played in: its interface, its content and what the LLM is told and writes. */
  language: z.string().default('en'),
  /**
   * How many of her memories a character is told in a scene. More keeps her truer to the past and costs a longer prompt.
   * One setting for both LLMs: the prompt is written before it is known which of them will answer.
   */
  memoryRecall: z.number().int().min(1).default(DEFAULT_MEMORY_RECALL)
})
export type Settings = z.infer<typeof SettingsSchema>

// API keys never leave the main process. The renderer sees only whether one is saved,
// and sends a key back only when the user types a new one.

export type LlmProfileView = Omit<LlmProfile, 'apiKey'> & { hasApiKey: boolean }
export type SettingsView = Record<LlmProfileId, LlmProfileView> & Pick<Settings, 'memoryRecall'>

export const LlmProfileUpdateSchema = LlmProfileSchema.omit({ apiKey: true }).extend({
  /** Omitted keeps the saved key; an empty string clears it. */
  apiKey: z.string().optional()
})
export const SettingsUpdateSchema = z.object({
  main: LlmProfileUpdateSchema,
  nsfw: LlmProfileUpdateSchema,
  /** Omitted keeps what is saved. */
  memoryRecall: z.number().int().min(1).optional()
})
export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>

/** A request for the models an endpoint offers, using what is in the settings form right now. */
export const ListModelsRequestSchema = z.object({
  profileId: z.enum(LLM_PROFILE_IDS),
  baseUrl: z.string(),
  /** A key just typed into the form. Omitted means use the saved one. */
  apiKey: z.string().optional()
})
export type ListModelsRequest = z.infer<typeof ListModelsRequestSchema>

export interface ListModelsResponse {
  models: string[]
  /** Why the list could not be loaded, if it couldn't. */
  error?: string
}

export function toView(settings: Settings): SettingsView {
  const view = ({ apiKey, ...rest }: LlmProfile): LlmProfileView => ({
    ...rest,
    hasApiKey: apiKey.length > 0
  })
  return { main: view(settings.main), nsfw: view(settings.nsfw), memoryRecall: settings.memoryRecall }
}

/** A key is not required: local servers such as LM Studio and Ollama don't use one. */
export function isConfigured(profile: { baseUrl: string; model: string }): boolean {
  return profile.baseUrl.trim().length > 0 && profile.model.trim().length > 0
}

/** NSFW scenes use the NSFW LLM when it is set up, and fall back to the main one otherwise. */
export function pickProfileId(
  settings: Record<LlmProfileId, { baseUrl: string; model: string }>,
  nsfw: boolean
): LlmProfileId {
  return nsfw && isConfigured(settings.nsfw) ? 'nsfw' : 'main'
}
