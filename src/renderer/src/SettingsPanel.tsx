import { useEffect, useState, type FormEvent } from 'react'
import { LLM_PROFILE_IDS, type LlmProfileId, type LlmProfileView } from '../../shared/settings'
import { errorMessage } from './errors'
import { Overlay } from './ui/Dialog'
import { ModelField } from './ModelField'
import { ComfySetupPanel } from './ui/art/ComfySetup'

// What the settings are for, a tab each.
const TABS = ['LLMs', 'ComfyUI'] as const
type Tab = (typeof TABS)[number]

const LABELS: Record<LlmProfileId, { title: string; hint: string }> = {
  main: { title: 'Main LLM', hint: 'Used for all scenes and memory summaries by default.' },
  nsfw: {
    title: 'NSFW LLM',
    hint: 'Used for scenes marked NSFW. Leave blank to use the Main LLM for those too.'
  }
}

// What the form holds per profile: the saved view plus the key being typed.
interface ProfileForm extends LlmProfileView {
  apiKeyInput: string
  clearKey: boolean
}

type Form = Record<LlmProfileId, ProfileForm>

function toForm(view: Record<LlmProfileId, LlmProfileView>): Form {
  return {
    main: { ...view.main, apiKeyInput: '', clearKey: false },
    nsfw: { ...view.nsfw, apiKeyInput: '', clearKey: false }
  }
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<Form | null>(null)
  const [status, setStatus] = useState<Partial<Record<LlmProfileId, string>>>({})
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('LLMs')

  useEffect(() => {
    window.api.getSettings().then((view) => setForm(toForm(view)))
  }, [])

  if (!form) return null

  const set = (id: LlmProfileId, patch: Partial<ProfileForm>) =>
    setForm({ ...form, [id]: { ...form[id], ...patch } })

  async function save(): Promise<void> {
    if (!form) return
    const update = (p: ProfileForm) => {
      const { hasApiKey: _hasApiKey, apiKeyInput, clearKey, ...rest } = p
      // Leaving the field blank keeps the saved key.
      return { ...rest, apiKey: clearKey ? '' : apiKeyInput || undefined }
    }
    const view = await window.api.saveSettings({ main: update(form.main), nsfw: update(form.nsfw) })
    setForm(toForm(view))
  }

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      setStatus({ main: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  const onSave = (event: FormEvent) => {
    event.preventDefault()
    run(async () => {
      await save()
      setStatus({ main: 'Saved.', nsfw: 'Saved.' })
    })
  }

  const onTest = (id: LlmProfileId) =>
    run(async () => {
      setStatus({ ...status, [id]: 'Testing...' })
      await save()
      const result = await window.api.testConnection(id)
      setStatus({ ...status, [id]: result.message })
    })

  return (
    <Overlay onClose={onClose}>
      <div className="settings wide">
        <h1>Settings</h1>
        <div className="tabs" role="tablist">
          {TABS.map((name) => (
            <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? 'tab selected' : 'tab'} onClick={() => setTab(name)}>
              {name}
            </button>
          ))}
        </div>
        {/* ComfyUI draws the pictures: Bloomr's selfies in play, and everything made in the editor's art tool. Each change there is saved as it is made. */}
        {tab === 'ComfyUI' && (
          <>
            <ComfySetupPanel />
            <div className="actions">
              <button type="button" className="secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
        {tab === 'LLMs' && (
      <form className="settings-form" onSubmit={onSave}>
        <p className="hint">
          Each LLM is an OpenAI-compatible endpoint. The base URL is everything before
          /chat/completions, for example https://api.openai.com/v1.
        </p>
        <div className="profiles">
          {LLM_PROFILE_IDS.map((id) => {
            const p = form[id]
            return (
              <fieldset key={id}>
                <legend>{LABELS[id].title}</legend>
                <p className="hint">{LABELS[id].hint}</p>
                <label>
                  Base URL
                  <input
                    value={p.baseUrl}
                    onChange={(e) => set(id, { baseUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
                <label>
                  API key
                  <input
                    type="password"
                    value={p.apiKeyInput}
                    disabled={p.clearKey}
                    onChange={(e) => set(id, { apiKeyInput: e.target.value })}
                    placeholder={p.hasApiKey ? 'Saved. Leave blank to keep it.' : 'Optional for local servers'}
                  />
                </label>
                {p.hasApiKey && (
                  <label className="inline">
                    <input
                      type="checkbox"
                      checked={p.clearKey}
                      onChange={(e) => set(id, { clearKey: e.target.checked })}
                    />
                    Remove the saved key
                  </label>
                )}
                <ModelField
                  profileId={id}
                  baseUrl={p.baseUrl}
                  apiKey={p.clearKey ? '' : p.apiKeyInput || undefined}
                  value={p.model}
                  onChange={(model) => set(id, { model })}
                />
                <label>
                  Temperature
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.05}
                    value={p.temperature}
                    onChange={(e) => set(id, { temperature: e.target.valueAsNumber || 0 })}
                  />
                </label>
                <label>
                  Max reply tokens
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={p.maxTokens}
                    onChange={(e) => set(id, { maxTokens: Math.max(1, Math.round(e.target.valueAsNumber || 1)) })}
                  />
                </label>
                <label>
                  Extra instructions
                  <textarea
                    rows={3}
                    value={p.instructions}
                    onChange={(e) => set(id, { instructions: e.target.value })}
                    placeholder="Appended to every system prompt sent to this LLM"
                  />
                </label>
                <button type="button" disabled={busy} onClick={() => onTest(id)}>
                  Save and test
                </button>
                {status[id] && <p className="status">{status[id]}</p>}
              </fieldset>
            )
          })}
        </div>
        <div className="actions">
          <button type="submit" disabled={busy}>
            Save
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </form>
        )}
      </div>
    </Overlay>
  )
}
