import { looksLikeRefusal } from '../../shared/game/refusal'
import { isConfigured, pickProfileId, type LlmProfileId, type Settings } from '../../shared/settings'
import { t } from '../../shared/i18n'
import { chatCompletion, RefusalError, type CompletionInput } from './openai'

/** What the player is told when there is no LLM to ask. */
export const notConfigured = (): string => t('llm.router.notConfigured')

export interface RoutedReply {
  reply: string
  /** Which LLM produced the reply. */
  profileId: LlmProfileId
}

// What a model thought to itself before answering is not the answer: a refusal is looked for in what comes after it.
const THINKING = /<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi

/** Returns the reply, or why there is none when the model or its endpoint declined to write one. */
async function attempt(
  complete: typeof chatCompletion,
  profile: Settings[LlmProfileId],
  input: CompletionInput
): Promise<{ reply: string } | { declined: string }> {
  try {
    const reply = await complete(profile, input)
    const said = reply.replace(THINKING, '').replace(/^[\s\S]*<\/think(?:ing)?>/i, '').trim()
    return looksLikeRefusal(said) ? { declined: t('llm.router.answered', { said: said.slice(0, 120) }) } : { reply }
  } catch (error) {
    if (error instanceof RefusalError) return { declined: error.message }
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
  if (!isConfigured(settings[first])) throw new Error(notConfigured())

  const tried = await attempt(complete, settings[first], input)
  if ('reply' in tried) return { reply: tried.reply, profileId: first }

  if (first === 'nsfw') throw new Error(t('llm.router.nsfwDeclined', { why: tried.declined }))
  if (!isConfigured(settings.nsfw)) {
    throw new Error(t('llm.router.noFallback', { why: tried.declined }))
  }
  const second = await attempt(complete, settings.nsfw, input)
  if ('declined' in second) {
    throw new Error(t('llm.router.bothDeclined', { main: tried.declined, nsfw: second.declined }))
  }
  return { reply: second.reply, profileId: 'nsfw' }
}
