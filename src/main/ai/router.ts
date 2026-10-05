import { looksLikeRefusal } from '../../shared/game/refusal'
import { isConfigured, pickProfileId, type LlmProfileId, type Settings } from '../../shared/settings'
import { chatCompletion, RefusalError, type CompletionInput } from './openai'

export const NOT_CONFIGURED = 'No LLM is configured. Open Settings and fill in the Main LLM.'

export interface RoutedReply {
  reply: string
  /** Which LLM produced the reply. */
  profileId: LlmProfileId
}

/** Returns the reply, or undefined when the model declined to write one. */
async function attempt(
  complete: typeof chatCompletion,
  profile: Settings[LlmProfileId],
  input: CompletionInput
): Promise<string | undefined> {
  try {
    const reply = await complete(profile, input)
    return looksLikeRefusal(reply) ? undefined : reply
  } catch (error) {
    if (error instanceof RefusalError) return undefined
    throw error
  }
}

/**
 * Sends a request to the Main LLM, or straight to the NSFW LLM for a scene already
 * marked NSFW. If the Main LLM declines, the NSFW LLM takes over.
 */
export async function completeWithFallback(
  settings: Settings,
  nsfw: boolean,
  input: CompletionInput,
  complete: typeof chatCompletion = chatCompletion
): Promise<RoutedReply> {
  const first = pickProfileId(settings, nsfw)
  if (!isConfigured(settings[first])) throw new Error(NOT_CONFIGURED)

  const reply = await attempt(complete, settings[first], input)
  if (reply !== undefined) return { reply, profileId: first }

  if (first === 'nsfw') throw new Error('The NSFW LLM declined to continue this scene.')
  if (!isConfigured(settings.nsfw)) {
    throw new Error(
      'The Main LLM declined to continue this scene, and no NSFW LLM is set up to take over. Add one in Settings.'
    )
  }
  const second = await attempt(complete, settings.nsfw, input)
  if (second === undefined) {
    throw new Error('Both the Main LLM and the NSFW LLM declined to continue this scene.')
  }
  return { reply: second, profileId: 'nsfw' }
}
