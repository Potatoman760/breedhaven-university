import { useEffect, useState, type FormEvent } from 'react'
import {
  LLM_DEFAULT_TIMEOUT_SECONDS,
  LLM_MAX_TIMEOUT_SECONDS,
  LLM_MIN_TIMEOUT_SECONDS,
  LLM_PROFILE_IDS,
  REASONING_LEVELS,
  REASONING_STYLES,
  type LlmProfileId,
  type LlmProfileView,
  type ReasoningLevel,
  type ReasoningStyle,
  type SettingsView
} from '../../shared/settings'
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

type Form = Record<LlmProfileId, ProfileForm> & { memoryRecall: number }

function toForm(view: SettingsView): Form {
  return {
    main: { ...view.main, apiKeyInput: '', clearKey: false },
    nsfw: { ...view.nsfw, apiKeyInput: '', clearKey: false },
    memoryRecall: view.memoryRecall
  }
}

const SAMPLERS = [
  { field: 'topP', label: 'shell.settings.topP', min: 0, max: 1, step: 0.01 },
  { field: 'minP', label: 'shell.settings.minP', min: 0, max: 1, step: 0.01 },
  { field: 'topK', label: 'shell.settings.topK', min: 0, step: 1 },
  { field: 'repetitionPenalty', label: 'shell.settings.repetitionPenalty', min: 0, max: 3, step: 0.01 },
  { field: 'frequencyPenalty', label: 'shell.settings.frequencyPenalty', min: -2, max: 2, step: 0.05 },
  { field: 'presencePenalty', label: 'shell.settings.presencePenalty', min: -2, max: 2, step: 0.05 }
] as const satisfies readonly { field: keyof LlmProfileView; label: MessageKey; min: number; max?: number; step: number }[]

const REASONING_LABELS: Record<ReasoningLevel, MessageKey> = {
  default: 'shell.settings.reasoningDefault',
  off: 'shell.settings.reasoningOff',
  minimal: 'shell.settings.reasoningMinimal',
  low: 'shell.settings.reasoningLow',
  medium: 'shell.settings.reasoningMedium',
  high: 'shell.settings.reasoningHigh'
}
const STYLE_LABELS: Record<ReasoningStyle, MessageKey> = {
  auto: 'shell.settings.styleAuto',
  effort: 'shell.settings.styleEffort',
  openrouter: 'shell.settings.styleOpenRouter',
  template: 'shell.settings.styleTemplate'
}

/** A number that may be left blank, meaning the model's own. Held as typed, so that "0." is not lost on the way to "0.5". */
function OptionalNumber({ label, value, min, max, step, placeholder, title, onChange }: { label: string; value: number | undefined; min: number; max?: number; step: number; placeholder?: string; title?: string; onChange: (value: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  return (
    <label title={title}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={text}
        placeholder={placeholder ?? t('shell.settings.modelDefault')}
        onChange={(e) => {
          setText(e.target.value)
          const read = Number(e.target.value)
          if (e.target.value.trim() === '') onChange(undefined)
          else if (Number.isFinite(read)) onChange(Math.min(max ?? read, Math.max(min, step === 1 ? Math.round(read) : read)))
        }}
        // What was kept, once the field is left: a number out of range is shown as the nearest it can be.
        onBlur={() => setText(value === undefined ? '' : String(value))}
      />
    </label>
  )
}

/** What a power user tunes: thinking, the samplers, and OpenRouter's choice of provider. Shut until opened. */
function AdvancedFields({ profile, onChange }: { profile: LlmProfileView; onChange: (patch: Partial<LlmProfileView>) => void }) {
  return (
    <details className="advanced">
      <summary>{t('shell.settings.advanced')}</summary>
      <div className="row">
        <label>
          {t('shell.settings.reasoning')}
          <select value={profile.reasoning} onChange={(e) => onChange({ reasoning: e.target.value as ReasoningLevel })}>
            {REASONING_LEVELS.map((level) => (
              <option key={level} value={level}>
                {t(REASONING_LABELS[level])}
              </option>
            ))}
          </select>
        </label>
        <label title={t('shell.settings.reasoningStyleTitle')}>
          {t('shell.settings.reasoningStyle')}
          <select value={profile.reasoningStyle} disabled={profile.reasoning === 'default'} onChange={(e) => onChange({ reasoningStyle: e.target.value as ReasoningStyle })}>
            {REASONING_STYLES.map((style) => (
              <option key={style} value={style}>
                {t(STYLE_LABELS[style])}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="sampler-grid">
        {SAMPLERS.map((sampler) => (
          <OptionalNumber
            key={sampler.field}
            label={t(sampler.label)}
            value={profile[sampler.field]}
            min={sampler.min}
            max={'max' in sampler ? sampler.max : undefined}
            step={sampler.step}
            onChange={(value) => onChange({ [sampler.field]: value })}
          />
        ))}
      </div>
      <OptionalNumber
        label={t('shell.settings.maxConcurrent')}
        title={t('shell.settings.maxConcurrentTitle')}
        placeholder={t('shell.settings.noLimit')}
        value={profile.maxConcurrent}
        min={1}
        step={1}
        onChange={(value) => onChange({ maxConcurrent: value })}
      />
      <span className="field-label">{t('shell.settings.openRouter')}</span>
      <label>
        {t('shell.settings.providerOrder')}
        <input value={profile.providerOrder} placeholder="Anthropic, Together" onChange={(e) => onChange({ providerOrder: e.target.value })} />
      </label>
      <label>
        {t('shell.settings.providerIgnore')}
        <input value={profile.providerIgnore} onChange={(e) => onChange({ providerIgnore: e.target.value })} />
      </label>
      <label className="inline">
        <input type="checkbox" checked={profile.allowFallbacks} onChange={(e) => onChange({ allowFallbacks: e.target.checked })} />
        {t('shell.settings.allowFallbacks')}
      </label>
    </details>
  )
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
    const view = await window.api.saveSettings({ main: update(form.main), nsfw: update(form.nsfw), memoryRecall: form.memoryRecall })
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
                  {t('shell.settings.timeout')}
                  <input
                    type="number"
                    min={LLM_MIN_TIMEOUT_SECONDS}
                    max={LLM_MAX_TIMEOUT_SECONDS}
                    step={1}
                    value={p.timeoutSeconds}
                    onChange={(e) => set(id, { timeoutSeconds: Math.round(e.target.valueAsNumber || LLM_DEFAULT_TIMEOUT_SECONDS) })}
                    onBlur={() => set(id, { timeoutSeconds: Math.min(LLM_MAX_TIMEOUT_SECONDS, Math.max(LLM_MIN_TIMEOUT_SECONDS, p.timeoutSeconds)) })}
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
                <AdvancedFields profile={p} onChange={(patch) => set(id, patch)} />
                <button type="button" disabled={busy} onClick={() => onTest(id)}>
                  {t('shell.settings.saveAndTest')}
                </button>
                {status[id] && <p className="status">{status[id]}</p>}
              </fieldset>
            )
          })}
        </div>
        <label title={t('shell.settings.memoryRecallTitle')}>
          {t('shell.settings.memoryRecall')}
          <input
            type="number"
            min={1}
            step={1}
            value={form.memoryRecall}
            onChange={(e) => setForm({ ...form, memoryRecall: Math.max(1, Math.round(e.target.valueAsNumber || 1)) })}
          />
        </label>
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
