import { describe, expect, it } from 'vitest'
import { LlmProfileSchema } from '../../shared/settings'
import { afterTool, chatCompletion, isRefusalResponse, listModels, RefusalError, wroteBesideTool } from './openai'
import { excuseTool, moveTool, revealTool, type Revelation } from './tools'
import { createInitialState } from '../../shared/game/state'
import { fixture } from '../../shared/game/testFixture'
import { JobsConfigSchema, NpcSchema, type Scene } from '../../shared/model'
import { applyForJob } from '../../shared/game/jobs'

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

/** A scene with everything in it, for the tests to vary. */
const sceneOf = (patch: Partial<Scene> = {}): Scene => ({
  loveInterestId: 'ana',
  npc: false,
  companionIds: [],
  nsfw: false,
  beats: [],
  messages: [],
  gifts: [],
  departed: [],
  conceived: [],
  baseline: { stats: {}, energy: 0, money: 0, time: 0, relationship: { affection: 0, trust: 0, desire: 0 }, companions: {} },
  ...patch
})

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

  it('stops when the player cancels, failing with why and not as an endpoint that could not be reached', async () => {
    const stop = new AbortController()
    // An endpoint that answers only when the request is given up on, as fetch does.
    const hanging = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as typeof fetch
    const call = chatCompletion(profile, { ...input, signal: stop.signal }, hanging)
    stop.abort(new Error('The reply was cancelled.'))
    await expect(call).rejects.toThrow('The reply was cancelled.')
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

  it('knows a refusal by its code, whoever the provider is', async () => {
    // Forbidden is a refusal, unless it says the key, the account or the region is the trouble.
    expect(isRefusalResponse(403, '')).toBe(true)
    expect(isRefusalResponse(403, 'Forbidden')).toBe(true)
    expect(isRefusalResponse(451, '')).toBe(true)
    expect(isRefusalResponse(403, '{"error":{"message":"Invalid API key"}}')).toBe(false)
    expect(isRefusalResponse(403, 'This model is not available in your region')).toBe(false)
    expect(isRefusalResponse(403, 'Insufficient credits')).toBe(false)
    // What each provider calls it.
    expect(isRefusalResponse(400, '{"error":{"code":"content_policy_violation"}}')).toBe(true)
    expect(isRefusalResponse(400, '{"error":{"code":"content_filter","innererror":{"code":"ResponsibleAIPolicyViolation"}}}')).toBe(true)
    expect(isRefusalResponse(400, '{"error":{"code":"1301","message":"系统检测到输入或生成内容可能包含不安全或敏感内容"}}')).toBe(true)
    expect(isRefusalResponse(400, '{"code":"data_inspection_failed"}')).toBe(true)
    expect(isRefusalResponse(403, '{"error":{"message":"Input flagged","metadata":{"reasons":["sexual"]}}}')).toBe(true)
    // An ordinary failure is not one, and neither is a server that is down.
    expect(isRefusalResponse(400, 'max_tokens is too large')).toBe(false)
    expect(isRefusalResponse(401, 'bad key')).toBe(false)
    expect(isRefusalResponse(429, 'slow down')).toBe(false)
    expect(isRefusalResponse(503, 'content filter unavailable')).toBe(false)

    const forbidden = fakeFetch(403, 'Forbidden')
    await expect(chatCompletion(profile, input, forbidden.impl)).rejects.toBeInstanceOf(RefusalError)
    for (const finish_reason of ['sensitive', 'SAFETY', 'PROHIBITED_CONTENT', 'refusal']) {
      const stopped = fakeFetch(200, { choices: [{ finish_reason, message: { content: 'She' } }] })
      await expect(chatCompletion(profile, input, stopped.impl)).rejects.toBeInstanceOf(RefusalError)
    }
    // Behind a router, what the provider itself said is looked at too.
    const routed = fakeFetch(200, { choices: [{ finish_reason: 'stop', native_finish_reason: 'SAFETY', message: { content: 'She' } }] })
    await expect(chatCompletion(profile, input, routed.impl)).rejects.toBeInstanceOf(RefusalError)
    // Nothing at all is a refusal too, unless it only ran out of room.
    for (const body of [{ choices: [] }, { choices: [{ finish_reason: 'stop', message: { content: '' } }] }, { choices: [{ message: { content: null } }] }]) {
      await expect(chatCompletion(profile, input, fakeFetch(200, body).impl)).rejects.toBeInstanceOf(RefusalError)
    }
    const short = chatCompletion(profile, input, fakeFetch(200, { choices: [{ finish_reason: 'length', message: { content: '' } }] }).impl)
    await expect(short).rejects.not.toBeInstanceOf(RefusalError)
    await expect(short).rejects.toThrow(/ran out of room/)
    const whole = fakeFetch(200, { choices: [{ finish_reason: 'stop', message: { content: 'She smiles.' } }] })
    expect(await chatCompletion(profile, input, whole.impl)).toBe('She smiles.')
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
        { role: 'tool', tool_call_id: 'c1', content: `Free on Twoday at 08:00.

${afterTool()}` }
      ])
    })

    it('tells the model that what it wrote beside a tool call was not shown, so that it writes the reply and not a remark on it', async () => {
      const beside = call('{"place":"home"}') as { choices: { message: { content: string | null } }[] }
      beside.choices[0].message.content = 'She waves and goes.'
      const { impl, bodies } = scripted({ body: beside }, { body: { choices: [{ message: { content: 'She waves and goes. "Well," says Ana.' } }] } })
      expect(await chatCompletion(profile, { ...input, tools: [tool] }, impl)).toBe('She waves and goes. "Well," says Ana.')
      expect(bodies[1].messages.at(-1)?.content).toBe(`Free on Twoday at 08:00.

${wroteBesideTool()}`)
      expect(wroteBesideTool()).toContain('was not shown to anyone')
    })

    it('tells the model when a call fails, names no tool, or has broken arguments', async () => {
      const { impl, bodies } = scripted(
        { body: call('{"place":"moon"}') },
        { body: call('not json', 'fly') },
        { body: { choices: [{ message: { content: 'Never mind.' } }] } }
      )
      expect(await chatCompletion(profile, { ...input, tools: [tool] }, impl)).toBe('Never mind.')
      expect(bodies[1].messages.at(-1)?.content).toBe(`The tool could not be used: no such place

${afterTool()}`)
      expect(bodies[2].messages.at(-1)?.content).toBe(`There is no tool called "fly".

${afterTool()}`)
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

describe('moveTool', () => {
  const content = fixture()
  const state = createInitialState(content)
  const scene = sceneOf({ beats: [{ activityName: 'Tea' }] })

  it('offers only where the scene can go, and reports the move it made', () => {
    const moves: string[] = []
    const tool = moveTool(content, state, scene, (d) => moves.push(d.id))!
    expect(tool.name).toBe('move_scene')
    expect((tool.parameters['properties'] as { place: { enum: string[] } }).place.enum).toEqual(['shop'])
    expect(tool.description).toContain('It ends "Tea" here')

    expect(tool.run({ place: 'the moon' })).toMatch(/^You cannot go to "the moon"\. Stay where you are/)
    expect(moves).toEqual([])
    // Going there takes no time: it is still 06:00.
    expect(tool.run({ place: 'shop' })).toMatch(/^You and Pat go to the Shop\. It is 06:00 when you get there\./)
    expect(moves).toEqual(['shop'])
  })

  it('is the only way time passes: the hours stayed on before going', () => {
    const moves: [string, number][] = []
    const tool = moveTool(content, state, scene, (d, hours) => moves.push([d.id, hours]))!
    expect(tool.description).toContain('the only way time passes')
    // Three hours more here from 06:00.
    expect(tool.run({ place: 'shop', hours: 3 })).toMatch(/^3 more hours pass here first\. You and Pat go to the Shop\. It is 09:00 when you get there\./)
    // Nonsense for the hours is no hours, and the move is still made.
    expect(tool.run({ place: 'shop', hours: 'soon' })).toMatch(/^You and Pat go to the Shop\./)
    // Never more than twelve at once.
    expect(tool.run({ place: 'shop', hours: 500 })).toMatch(/^12 more hours pass here first\./)
    expect(moves).toEqual([['shop', 3], ['shop', 0], ['shop', 12]])
  })

  it('is not offered when there is nowhere to go, or to an NPC', () => {
    expect(moveTool(content, { ...state, time: 9 }, scene, () => undefined)).toBeUndefined()
    expect(moveTool(content, state, { ...scene, npc: true }, () => undefined)).toBeUndefined()
  })
})

describe('revealTool', () => {
  const base = fixture()
  const content = { ...base, loveInterests: [{ ...base.loveInterests[0], likes: ['tea'], dislikes: ['cards'] }] }
  const state = createInitialState(content)

  it('offers what the player does not yet know, and records only what is on that list', () => {
    const told: Revelation[] = []
    const tool = revealTool(content, state, ['ana'], (revelation) => told.push(revelation))!
    const offered = (tool.parameters['properties'] as { facts: { items: { enum: string[] } } }).facts.items.enum
    expect(offered).toEqual(['ana/like:tea', 'ana/dislike:cards', 'ana/trait:shy', 'ana/age'])
    // What she likes is in the prompt already, and the name on the list says what it is: it is not spelled out again.
    expect(tool.description).not.toContain('Ana likes tea')
    // Her secret is not yet hers to share, so it is not on offer.
    expect(tool.description).not.toContain('dragon')

    expect(tool.run({ facts: ['ana/like:coffee'] })).toMatch(/^None of those is on the list/)
    expect(tool.run({ facts: ['ANA/dislike:cards', 'ana/like:coffee'] })).toMatch(/^Recorded: Ana dislikes cards\./)
    expect(told).toEqual([{ loveInterestId: 'ana', factId: 'dislike:cards' }])
  })

  it('is not offered once everything is known', () => {
    const known = { ...state, revealed: { ana: ['like:tea', 'dislike:cards', 'trait:shy', 'age'] } }
    expect(revealTool(content, known, ['ana'], () => undefined)).toBeUndefined()
  })
})

describe('excuseTool', () => {
  const smith = NpcSchema.parse({ id: 'bryn', name: 'Bryn', role: 'the shopkeeper', age: 34, outfits: [{ id: 'default', name: 'Apron' }], defaultOutfitId: 'default' })
  const jobs = JobsConfigSchema.parse({
    jobs: [{ id: 'clerk', title: 'Shop clerk', locationId: 'shop', bossId: 'bryn', hourlyRate: 4, shifts: [{ weekday: 'Two', startHour: 8, hours: 3 }] }]
  })
  const content = { ...fixture(), npcs: [smith], jobs }
  const hired = applyForJob(content, createInitialState(content), 'clerk')

  it('lets his boss record a shift he says he will miss, while it has not started', () => {
    const told: string[] = []
    const tool = excuseTool(content, hired, 'bryn', (key) => told.push(key))!
    expect(tool.name).toBe('excuse_shift')
    expect(tool.description).toContain('his shift today at 08:00')
    expect(tool.run({ reason: 'ill' })).toMatch(/^Recorded: Pat will miss today's 08:00 shift/)
    expect(told).toEqual(['0:8'])
  })

  it('is offered to nobody else, and not once the shift is under way', () => {
    expect(excuseTool(content, hired, 'ana', () => undefined)).toBeUndefined()
    expect(excuseTool(content, { ...hired, time: 2 }, 'bryn', () => undefined)).toBeUndefined()
    expect(excuseTool(content, createInitialState(content), 'bryn', () => undefined)).toBeUndefined()
  })
})

describe('moving on without everyone', () => {
  const base = fixture()
  const [ana] = base.loveInterests
  const content = { ...base, loveInterests: [ana, { ...ana, id: 'bea', name: 'Bea Stone' }, { ...ana, id: 'cy', name: 'Cy' }] }
  const state = createInitialState(content)
  const group = sceneOf({ companionIds: ['bea', 'cy'], beats: [{ activityName: 'Tea' }] })

  it('lets the scene move while some of them stay behind, and never all of them', () => {
    const moves: [string, string[]][] = []
    const tool = moveTool(content, state, group, (d, _hours, staying) => moves.push([d.id, staying]))!
    // Whoever goes off her own way is named as well as whoever stays put.
    expect(tool.description).toContain('she stays here, or goes her own way')
    expect((tool.parameters['properties'] as { staying: { items: { enum: string[] } } }).staying.items.enum).toEqual(['ana', 'bea', 'cy'])

    expect(tool.run({ place: 'shop', staying: ['Bea', 'nobody'] })).toContain('Bea does not come along and is out of the scene')
    expect(tool.run({ place: 'shop' })).not.toContain('out of the scene')
    // Someone has to come along.
    expect(tool.run({ place: 'shop', staying: ['ana', 'bea', 'cy'] })).not.toContain('out of the scene')
    expect(moves).toEqual([['shop', ['bea']], ['shop', []], ['shop', []]])
  })

  it('has nobody to leave behind when she is alone with him', () => {
    const tool = moveTool(content, state, sceneOf({ beats: [{ activityName: 'Tea' }] }), () => undefined)!
    expect(tool.parameters['properties']).not.toHaveProperty('staying')
    expect(tool.description).not.toContain('stays behind')
  })
})
