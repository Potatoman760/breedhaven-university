import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  LLM_PROFILE_IDS,
  SettingsSchema,
  type LlmProfile,
  type Settings,
  type SettingsUpdate
} from '../../shared/settings'

/** Encrypts API keys at rest. Backed by Electron's safeStorage in the app. */
export interface KeyCipher {
  encrypt(plain: string): string
  decrypt(stored: string): string
}

type StoredProfile = Omit<LlmProfile, 'apiKey'> & { apiKey: string; apiKeyEncrypted: boolean }

/** Persists settings as JSON. Without a cipher, API keys are written in plain text. */
export class SettingsStore {
  private settings: Settings

  constructor(
    private readonly path: string,
    private readonly cipher?: KeyCipher
  ) {
    this.settings = this.read()
  }

  get(): Settings {
    return this.settings
  }

  update(update: SettingsUpdate): Settings {
    const next = {} as Settings
    for (const id of LLM_PROFILE_IDS) {
      const { apiKey, ...rest } = update[id]
      next[id] = { ...rest, apiKey: apiKey ?? this.settings[id].apiKey }
    }
    this.settings = SettingsSchema.parse(next)
    this.write()
    return this.settings
  }

  private read(): Settings {
    let raw: Record<string, Partial<StoredProfile> | undefined>
    try {
      raw = JSON.parse(readFileSync(this.path, 'utf8'))
    } catch {
      // Missing or unreadable file: start from defaults.
      return SettingsSchema.parse({})
    }
    const profiles: Record<string, unknown> = {}
    for (const id of LLM_PROFILE_IDS) {
      const { apiKeyEncrypted, ...profile } = raw[id] ?? {}
      if (apiKeyEncrypted) profile.apiKey = this.decrypt(profile.apiKey ?? '')
      profiles[id] = profile
    }
    const parsed = SettingsSchema.safeParse(profiles)
    return parsed.success ? parsed.data : SettingsSchema.parse({})
  }

  private decrypt(stored: string): string {
    try {
      return this.cipher ? this.cipher.decrypt(stored) : ''
    } catch {
      // Key was encrypted on another machine or user account; it has to be re-entered.
      return ''
    }
  }

  private write(): void {
    const stored: Record<string, StoredProfile> = {}
    for (const id of LLM_PROFILE_IDS) {
      const profile = this.settings[id]
      const encrypt = this.cipher !== undefined && profile.apiKey.length > 0
      stored[id] = {
        ...profile,
        apiKey: encrypt ? this.cipher!.encrypt(profile.apiKey) : profile.apiKey,
        apiKeyEncrypted: encrypt
      }
    }
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify(stored, null, 2))
  }
}
