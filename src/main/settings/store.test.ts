import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SettingsStore, type KeyCipher } from './store'
import { LlmProfileSchema } from '../../shared/settings'

const tempFile = () => join(mkdtempSync(join(tmpdir(), 'bh-settings-')), 'nested', 'settings.json')
const cipher: KeyCipher = {
  encrypt: (plain) => `enc(${plain})`,
  decrypt: (stored) => stored.slice(4, -1)
}
const profile = LlmProfileSchema.omit({ apiKey: true }).parse({ baseUrl: 'http://x/v1', model: 'm', temperature: 1, maxTokens: 100, timeoutSeconds: 300, instructions: '' })

describe('SettingsStore', () => {
  it('starts from defaults when there is no file', () => {
    expect(new SettingsStore(tempFile()).get().main.baseUrl).toBe('')
    expect(new SettingsStore(tempFile()).get().main.timeoutSeconds).toBe(120)
  })

  it('persists updates and encrypts the key on disk', () => {
    const path = tempFile()
    new SettingsStore(path, cipher).update({ main: { ...profile, apiKey: 'sk-1' }, nsfw: profile })

    expect(readFileSync(path, 'utf8')).not.toContain('"sk-1"')
    expect(readFileSync(path, 'utf8')).toContain('enc(sk-1)')
    const reloaded = new SettingsStore(path, cipher).get()
    expect(reloaded.main).toMatchObject({ baseUrl: 'http://x/v1', apiKey: 'sk-1', maxTokens: 100, timeoutSeconds: 300 })
    expect(reloaded.nsfw.apiKey).toBe('')
  })

  it('keeps the saved key when an update omits it, and clears it on an empty string', () => {
    const store = new SettingsStore(tempFile(), cipher)
    store.update({ main: { ...profile, apiKey: 'sk-1' }, nsfw: profile })
    expect(store.update({ main: { ...profile, model: 'm2' }, nsfw: profile }).main).toMatchObject({
      apiKey: 'sk-1',
      model: 'm2'
    })
    expect(store.update({ main: { ...profile, apiKey: '' }, nsfw: profile }).main.apiKey).toBe('')
  })

  it('keeps how many memories she recalls, and keeps it when an update leaves it out', () => {
    const path = tempFile()
    expect(new SettingsStore(path).get().memoryRecall).toBe(8)
    new SettingsStore(path).update({ main: profile, nsfw: profile, memoryRecall: 20 })
    const store = new SettingsStore(path)
    expect(store.get().memoryRecall).toBe(20)
    expect(store.update({ main: profile, nsfw: profile }).memoryRecall).toBe(20)
  })

  it('stores the key in plain text when no cipher is available', () => {
    const path = tempFile()
    new SettingsStore(path).update({ main: { ...profile, apiKey: 'sk-1' }, nsfw: profile })
    expect(new SettingsStore(path).get().main.apiKey).toBe('sk-1')
  })

  it('drops a key it cannot decrypt and survives a corrupt file', () => {
    const path = tempFile()
    new SettingsStore(path, cipher).update({ main: { ...profile, apiKey: 'sk-1' }, nsfw: profile })
    const reloaded = new SettingsStore(path).get()
    expect(reloaded.main).toMatchObject({ apiKey: '', model: 'm' })

    writeFileSync(path, '{not json')
    expect(new SettingsStore(path, cipher).get().main.model).toBe('')
  })
})
