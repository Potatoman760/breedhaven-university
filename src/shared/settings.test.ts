import { describe, expect, it } from 'vitest'
import { pickProfileId, SettingsSchema, toView } from './settings'

const settings = (nsfwModel: string) =>
  SettingsSchema.parse({
    main: { baseUrl: 'http://main/v1', model: 'm', apiKey: 'secret' },
    nsfw: { baseUrl: 'http://nsfw/v1', model: nsfwModel }
  })

describe('pickProfileId', () => {
  it('uses the NSFW LLM only for NSFW scenes', () => {
    expect(pickProfileId(settings('n'), false)).toBe('main')
    expect(pickProfileId(settings('n'), true)).toBe('nsfw')
  })

  it('falls back to the main LLM when the NSFW one is not set up', () => {
    expect(pickProfileId(settings(''), true)).toBe('main')
  })
})

describe('toView', () => {
  it('reports whether a key is saved without exposing it', () => {
    const view = toView(settings('n'))
    expect(view.main.hasApiKey).toBe(true)
    expect(view.nsfw.hasApiKey).toBe(false)
    expect(JSON.stringify(view)).not.toContain('secret')
  })
})

describe('SettingsSchema', () => {
  it('fills in defaults for an empty file', () => {
    expect(SettingsSchema.parse({}).main).toMatchObject({ baseUrl: '', temperature: 0.8 })
  })
})
