import { describe, expect, it } from 'vitest'
import { LlmProfileSchema } from '../../shared/settings'
import { chatCompletion, listModels, RefusalError } from './openai'

const profile = LlmProfileSchema.parse({
  baseUrl: 'http://host/v1/',
  apiKey: 'sk-1',
  model: 'test-model',
  maxTokens: 50,
  instructions: 'Be brief.'
})
const input = { system: 'You are Ana.', messages: [{ role: 'user' as const, content: 'Hi' }] }

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  }) as typeof fetch
  return { impl, calls }
}

describe('listModels', () => {
  it('asks the endpoint for its models and returns their ids, sorted', async () => {
    const { impl, calls } = fakeFetch(200, { data: [{ id: 'zeta' }, { id: 'alpha' }, { id: 'zeta' }] })
    expect(await listModels({ baseUrl: 'http://host/v1/', apiKey: 'sk-1' }, impl)).toEqual(['alpha', 'zeta'])
    expect(calls[0].url).toBe('http://host/v1/models')
    expect(calls[0].init.headers).toEqual({ Authorization: 'Bearer sk-1' })
  })

  it('understands the other shapes servers use, and works without a key', async () => {
    const named = fakeFetch(200, { models: [{ name: 'local-a' }, 'local-b'] })
    expect(await listModels({ baseUrl: 'http://host/v1', apiKey: '' }, named.impl)).toEqual(['local-a', 'local-b'])
    expect(named.calls[0].init.headers).toEqual({})
  })

  it('reports a rejected key or an unexpected answer', async () => {
    const denied = fakeFetch(401, 'invalid api key')
    await expect(listModels({ baseUrl: 'http://host/v1', apiKey: 'x' }, denied.impl)).rejects.toThrow(
      /Could not list models \(401.*\): invalid api key/
    )
    const odd = fakeFetch(200, { hello: 'world' })
    await expect(listModels({ baseUrl: 'http://host/v1', apiKey: '' }, odd.impl)).rejects.toThrow(
      /did not return a list of models/
    )
  })
})

describe('chatCompletion', () => {
  it('posts an OpenAI-style request and returns the reply text', async () => {
    const { impl, calls } = fakeFetch(200, { choices: [{ message: { content: '  Hello.  ' } }] })
    expect(await chatCompletion(profile, input, impl)).toBe('Hello.')

    expect(calls[0].url).toBe('http://host/v1/chat/completions')
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer sk-1' })
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      model: 'test-model',
      messages: [
        { role: 'system', content: 'You are Ana.\n\nBe brief.' },
        { role: 'user', content: 'Hi' }
      ],
      temperature: 0.8,
      max_tokens: 50
    })
  })

  it('omits the Authorization header when there is no key, and honours a temperature override', async () => {
    const { impl, calls } = fakeFetch(200, { choices: [{ message: { content: 'ok' } }] })
    await chatCompletion({ ...profile, apiKey: '' }, { ...input, temperature: 0.3 }, impl)
    expect(calls[0].init.headers).not.toHaveProperty('Authorization')
    expect(JSON.parse(calls[0].init.body as string).temperature).toBe(0.3)
  })

  it('reports HTTP errors with the response body', async () => {
    const { impl } = fakeFetch(401, 'bad key')
    await expect(chatCompletion(profile, input, impl)).rejects.toThrow(
      /LLM request failed \(401.*\): bad key/
    )
  })

  it('raises a RefusalError when the endpoint blocks or declines the request', async () => {
    const filtered = fakeFetch(200, { choices: [{ finish_reason: 'content_filter', message: { content: '' } }] })
    await expect(chatCompletion(profile, input, filtered.impl)).rejects.toBeInstanceOf(RefusalError)

    const declined = fakeFetch(200, { choices: [{ message: { content: null, refusal: 'No.' } }] })
    await expect(chatCompletion(profile, input, declined.impl)).rejects.toBeInstanceOf(RefusalError)

    const blocked = fakeFetch(400, 'Request flagged by moderation')
    await expect(chatCompletion(profile, input, blocked.impl)).rejects.toBeInstanceOf(RefusalError)

    const broken = fakeFetch(500, 'moderation service unavailable')
    await expect(chatCompletion(profile, input, broken.impl)).rejects.not.toBeInstanceOf(RefusalError)
  })

  describe('with tools', () => {
    const ran: Record<string, unknown>[] = []
    const tool = {
      name: 'propose_meeting',
      description: 'Find a time.',
      parameters: { type: 'object', properties: {} },
      run(args: Record<string, unknown>) {
        ran.push(args)
        if (args['place'] === 'moon') throw new Error('no such place')
        return 'Free on Twoday at 08:00.'
      }
    }
    const call = (args: string, name = 'propose_meeting') => ({
      choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: args } }] } }]
    })

    /** Answers each request with the next response in the list. */
    function scripted(...responses: { status?: number; body: unknown }[]) {
      const bodies: { messages: { role: string; content: unknown }[]; tools?: unknown[] }[] = []
      const impl = (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string))
        const next = responses[bodies.length - 1]
        const text = typeof next.body === 'string' ? next.body : JSON.stringify(next.body)
        return new Response(text, { status: next.status ?? 200 })
      }) as typeof fetch
      return { impl, bodies }
    }

    it('runs the tool the model calls and sends back the result for it to answer with', async () => {
      ran.length = 0
      const { impl, bodies } = scripted(
        { body: call('{"place":"home"}') },
        { body: { choices: [{ message: { content: 'Twoday at eight?' } }] } }
      )
      expect(await chatCompletion(profile, { ...input, tools: [tool] }, impl)).toBe('Twoday at eight?')
      expect(ran).toEqual([{ place: 'home' }])
      expect(bodies[0].tools).toEqual([
        { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }
      ])
      expect(bodies[1].messages.slice(-2)).toMatchObject([
        { role: 'assistant', tool_calls: [{ id: 'c1' }] },
        { role: 'tool', tool_call_id: 'c1', content: 'Free on Twoday at 08:00.' }
      ])
    })

    it('tells the model when a call fails, names no tool, or has broken arguments', async () => {
      const { impl, bodies } = scripted(
        { body: call('{"place":"moon"}') },
        { body: call('not json', 'fly') },
        { body: { choices: [{ message: { content: 'Never mind.' } }] } }
      )
      expect(await chatCompletion(profile, { ...input, tools: [tool] }, impl)).toBe('Never mind.')
      expect(bodies[1].messages.at(-1)?.content).toBe('The tool could not be used: no such place')
      expect(bodies[2].messages.at(-1)?.content).toBe('There is no tool called "fly".')
      // Two rounds of tools are the limit; after that the model has to answer in words.
      expect(bodies[2].tools).toBeUndefined()
    })

    it('carries on without tools when the endpoint does not accept them', async () => {
      const { impl, bodies } = scripted(
        { status: 400, body: 'tools is not supported by this model' },
        { body: { choices: [{ message: { content: 'Hello.' } }] } }
      )
      expect(await chatCompletion(profile, { ...input, tools: [tool] }, impl)).toBe('Hello.')
      expect(bodies[1].tools).toBeUndefined()
    })
  })

  it('reports empty replies and unreachable servers', async () => {
    const { impl } = fakeFetch(200, { choices: [] })
    await expect(chatCompletion(profile, input, impl)).rejects.toThrow(/empty reply/)

    const down = (async () => {
      throw new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') })
    }) as typeof fetch
    await expect(chatCompletion(profile, input, down)).rejects.toThrow(
      'Could not reach http://host/v1/chat/completions: ECONNREFUSED'
    )
  })
})
