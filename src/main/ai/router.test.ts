import { describe, expect, it } from 'vitest'
import { SettingsSchema, type LlmProfile } from '../../shared/settings'
import { RefusalError, type chatCompletion } from './openai'
import { completeWithFallback } from './router'

const settings = (nsfwModel = 'n') =>
  SettingsSchema.parse({
    main: { baseUrl: 'http://main/v1', model: 'm' },
    nsfw: { baseUrl: 'http://nsfw/v1', model: nsfwModel }
  })
const input = { system: 's', messages: [{ role: 'user' as const, content: 'hi' }] }

/** A stand-in for the LLM client that answers per model and records who was asked. */
function fake(answers: Record<string, string | Error>) {
  const asked: string[] = []
  const complete = (async (profile: LlmProfile) => {
    asked.push(profile.model)
    const answer = answers[profile.model]
    if (answer instanceof Error) throw answer
    return answer
  }) as typeof chatCompletion
  return { complete, asked }
}

describe('completeWithFallback', () => {
  it('uses the Main LLM when it answers', async () => {
    const { complete, asked } = fake({ m: 'Hello.' })
    expect(await completeWithFallback(settings(), false, input, complete)).toEqual({
      reply: 'Hello.',
      profileId: 'main'
    })
    expect(asked).toEqual(['m'])
  })

  it('goes straight to the NSFW LLM for a scene already marked NSFW', async () => {
    const { complete, asked } = fake({ n: 'Hello.' })
    expect((await completeWithFallback(settings(), true, input, complete)).profileId).toBe('nsfw')
    expect(asked).toEqual(['n'])
  })

  it('switches to the NSFW LLM when the Main LLM refuses in its reply', async () => {
    const { complete, asked } = fake({ m: "I'm sorry, but I can't continue.", n: 'Come here.' })
    expect(await completeWithFallback(settings(), false, input, complete)).toEqual({
      reply: 'Come here.',
      profileId: 'nsfw'
    })
    expect(asked).toEqual(['m', 'n'])
  })

  it('looks for a refusal after what the model thought to itself, and says why when nobody will write it', async () => {
    const thought = `<think>${'The user wants a love scene. '.repeat(12)}</think>I'm sorry, but I can't continue.`
    const { complete, asked } = fake({ m: thought, n: 'Come here.' })
    expect((await completeWithFallback(settings(), false, input, complete)).profileId).toBe('nsfw')
    expect(asked).toEqual(['m', 'n'])
    // A character who thinks about refusing and then plays the scene has not refused.
    const played = fake({ m: "<think>I'm sorry, but should I? Yes.</think>She laughs." })
    expect((await completeWithFallback(settings(), false, input, played.complete)).profileId).toBe('main')
    const both = fake({ m: new RefusalError('403 Forbidden'), n: 'I cannot write that.' })
    await expect(completeWithFallback(settings(), false, input, both.complete)).rejects.toThrow(/Main: The LLM declined to reply: 403 Forbidden\. NSFW: it answered "I cannot write that\."/)
  })

  it('switches when the endpoint itself blocks the request', async () => {
    const { complete } = fake({ m: new RefusalError('content filter'), n: 'Come here.' })
    expect((await completeWithFallback(settings(), false, input, complete)).profileId).toBe('nsfw')
  })

  it('explains when there is no NSFW LLM to fall back to', async () => {
    const { complete } = fake({ m: 'I cannot write that.' })
    await expect(completeWithFallback(settings(''), false, input, complete)).rejects.toThrow(
      /no NSFW LLM is set up/
    )
  })

  it('reports when both decline, and passes other errors through', async () => {
    const both = fake({ m: 'I cannot write that.', n: 'I cannot write that.' })
    await expect(completeWithFallback(settings(), false, input, both.complete)).rejects.toThrow(
      /Both the Main LLM and the NSFW LLM declined/
    )
    const down = fake({ m: new Error('Could not reach http://main') })
    await expect(completeWithFallback(settings(), false, input, down.complete)).rejects.toThrow(
      'Could not reach http://main'
    )
    expect(down.asked).toEqual(['m'])
  })

  it('refuses to run with nothing configured', async () => {
    const { complete } = fake({})
    await expect(
      completeWithFallback(SettingsSchema.parse({}), false, input, complete)
    ).rejects.toThrow(/No LLM is configured/)
  })
})
