import { z } from 'zod'

export const LLM_PROFILE_IDS = ['main', 'nsfw'] as const
export type LlmProfileId = (typeof LLM_PROFILE_IDS)[number]

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
  /** Appended to every system prompt sent through this profile. */
  instructions: z.string().default('')
})
export type LlmProfile = z.infer<typeof LlmProfileSchema>

export const SettingsSchema = z.object({
  main: LlmProfileSchema.prefault({}),
  nsfw: LlmProfileSchema.prefault({})
})
export type Settings = z.infer<typeof SettingsSchema>

// API keys never leave the main process. The renderer sees only whether one is saved,
// and sends a key back only when the user types a new one.

export type LlmProfileView = Omit<LlmProfile, 'apiKey'> & { hasApiKey: boolean }
export type SettingsView = Record<LlmProfileId, LlmProfileView>

export const LlmProfileUpdateSchema = LlmProfileSchema.omit({ apiKey: true }).extend({
  /** Omitted keeps the saved key; an empty string clears it. */
  apiKey: z.string().optional()
})
export const SettingsUpdateSchema = z.object({
  main: LlmProfileUpdateSchema,
  nsfw: LlmProfileUpdateSchema
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
  return { main: view(settings.main), nsfw: view(settings.nsfw) }
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
