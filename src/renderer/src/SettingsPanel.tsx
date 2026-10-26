import { useEffect, useState, type FormEvent } from 'react'
import { LLM_PROFILE_IDS, type LlmProfileId, type LlmProfileView } from '../../shared/settings'
import { errorMessage } from './errors'
import { Overlay } from './ui/Dialog'
import { ModelField } from './ModelField'
import { ComfySetupPanel } from './ui/art/ComfySetup'
import { setVolume, useVolumes, VOLUME_KINDS, type VolumeKind } from './sound'
import { chooseLanguage, useLanguageView } from './language'
import { t, type MessageKey } from '../../shared/i18n'

// What the settings are for, a tab each.
const TABS = ['llms', 'comfy', 'sound'] as const
type Tab = (typeof TABS)[number]

const TAB_LABELS: Record<Tab, MessageKey> = { llms: 'shell.settings.tabLlms', comfy: 'shell.settings.tabComfy', sound: 'shell.settings.tabSound' }

const VOLUME_LABELS: Record<VolumeKind, MessageKey> = { effects: 'shell.settings.effects', ambience: 'shell.settings.ambience', music: 'shell.settings.music' }

const LABELS: Record<LlmProfileId, { title: MessageKey; hint: MessageKey }> = {
  main: { title: 'shell.settings.mainTitle', hint: 'shell.settings.mainHint' },
  nsfw: { title: 'shell.settings.nsfwTitle', hint: 'shell.settings.nsfwHint' }
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
  const [tab, setTab] = useState<Tab>('llms')
  const volumes = useVolumes()
  const languages = useLanguageView()

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
      setStatus({ main: t('shell.settings.saved'), nsfw: t('shell.settings.saved') })
    })
  }

  const onTest = (id: LlmProfileId) =>
    run(async () => {
      setStatus({ ...status, [id]: t('shell.settings.testing') })
      await save()
      const result = await window.api.testConnection(id)
      setStatus({ ...status, [id]: result.message })
    })

  return (
    <Overlay onClose={onClose}>
      <div className="settings wide">
        <h1>{t('shell.settings.title')}</h1>
        {/* Offered once there is a translation to choose; changed as soon as it is picked. */}
        {languages && languages.languages.length > 1 && (
          <label className="language">
            {t('core.settings.language')}
            <select value={languages.language} disabled={busy} onChange={(e) => run(() => chooseLanguage(e.target.value))}>
              {languages.languages.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="tabs" role="tablist">
          {TABS.map((name) => (
            <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? 'tab selected' : 'tab'} onClick={() => setTab(name)}>
              {t(TAB_LABELS[name])}
            </button>
          ))}
        </div>
        {/* ComfyUI draws the pictures: Bloomr's selfies in play. Here is only how it is reached. Each change is saved as it is made. */}
        {tab === 'comfy' && (
          <>
            <ComfySetupPanel connectionOnly />
            <div className="actions">
              <button type="button" className="secondary" onClick={onClose}>
                {t('shell.common.close')}
              </button>
            </div>
          </>
        )}
        {/* How loud each kind of sound is, kept on this computer and applied as the slider moves. */}
        {tab === 'sound' && (
          <>
            <div className="volumes">
              {VOLUME_KINDS.map((kind) => (
                <label key={kind}>
                  {t('shell.settings.volume', { kind: t(VOLUME_LABELS[kind]), percent: Math.round(volumes[kind] * 100) })}
                  <input type="range" min={0} max={100} value={Math.round(volumes[kind] * 100)} onChange={(e) => setVolume(kind, Number(e.target.value) / 100)} />
                </label>
              ))}
            </div>
            <div className="actions">
              <button type="button" className="secondary" onClick={onClose}>
                {t('shell.common.close')}
              </button>
            </div>
          </>
        )}
        {tab === 'llms' && (
      <form className="settings-form" onSubmit={onSave}>
        <p className="hint">{t('shell.settings.endpointHint', { path: '/chat/completions', example: 'https://api.openai.com/v1' })}</p>
        <div className="profiles">
          {LLM_PROFILE_IDS.map((id) => {
            const p = form[id]
            return (
              <fieldset key={id}>
                <legend>{t(LABELS[id].title)}</legend>
                <p className="hint">{t(LABELS[id].hint)}</p>
                <label>
                  {t('shell.settings.baseUrl')}
                  <input
                    value={p.baseUrl}
                    onChange={(e) => set(id, { baseUrl: e.target.value })}
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
                <label>
                  {t('shell.settings.apiKey')}
                  <input
                    type="password"
                    value={p.apiKeyInput}
                    disabled={p.clearKey}
                    onChange={(e) => set(id, { apiKeyInput: e.target.value })}
                    placeholder={p.hasApiKey ? t('shell.settings.keySaved') : t('shell.settings.keyOptional')}
                  />
                </label>
                {p.hasApiKey && (
                  <label className="inline">
                    <input
                      type="checkbox"
                      checked={p.clearKey}
                      onChange={(e) => set(id, { clearKey: e.target.checked })}
                    />
                    {t('shell.settings.removeKey')}
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
                  {t('shell.settings.temperature')}
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
                  {t('shell.settings.maxTokens')}
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={p.maxTokens}
                    onChange={(e) => set(id, { maxTokens: Math.max(1, Math.round(e.target.valueAsNumber || 1)) })}
                  />
                </label>
                <label>
                  {t('shell.settings.instructions')}
                  <textarea
                    rows={3}
                    value={p.instructions}
                    onChange={(e) => set(id, { instructions: e.target.value })}
                    placeholder={t('shell.settings.instructionsPlaceholder')}
                  />
                </label>
                <button type="button" disabled={busy} onClick={() => onTest(id)}>
                  {t('shell.settings.saveAndTest')}
                </button>
                {status[id] && <p className="status">{status[id]}</p>}
              </fieldset>
            )
          })}
        </div>
        <div className="actions">
          <button type="submit" disabled={busy}>
            {t('shell.settings.save')}
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            {t('shell.common.close')}
          </button>
        </div>
      </form>
        )}
      </div>
    </Overlay>
  )
}
