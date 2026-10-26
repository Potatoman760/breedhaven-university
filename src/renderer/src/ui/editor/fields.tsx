import type { ReactNode } from 'react'
import { METERS, STAT_LABELS, STATS, type Condition, type ContentPack, type Meter } from '../../../../shared/model'
import { Button } from '../Button'
import { t, type MessageKey } from '../../../../shared/i18n'

/** Beside a field's label: what is written there is given to the LLM. Said once, in a word, in place of a sentence under every field. */
export function LlmMark() {
  return <span className="llm-mark">{t('editor.fields.llmMark')}</span>
}

interface TextProps {
  label: string
  /** What is written here is given to the LLM: marked beside the label. */
  llm?: boolean
  value: string
  onChange: (value: string) => void
  hint?: string
  placeholder?: string
  disabled?: boolean
  /** Rows of a multi-line box. Left out, the field is a single line. */
  rows?: number
}

/** A labelled line or box of text. */
export function Text({ label, llm, value, onChange, hint, placeholder, disabled, rows }: TextProps) {
  return (
    <label>
      <span className="field-name">
        {label}
        {llm && <LlmMark />}
      </span>
      {rows ? (
        <textarea rows={rows} value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}

interface ListProps {
  label: string
  llm?: boolean
  value: string[]
  onChange: (value: string[]) => void
  hint?: string
  /** One entry a line, for entries that are sentences. Otherwise entries are separated by commas. */
  lines?: boolean
}

/** A list of short strings, typed as one piece of text. Empty entries are dropped when the field is left. */
export function List({ label, llm, value, onChange, hint, lines }: ListProps) {
  const joined = value.join(lines ? '\n' : ', ')
  const split = (text: string) => text.split(lines ? '\n' : ',').map((entry) => entry.trimStart())
  const tidy = () => onChange(value.map((entry) => entry.trim()).filter((entry) => entry.length > 0))
  return (
    <label>
      <span className="field-name">
        {label}
        {llm && <LlmMark />}
      </span>
      {lines ? (
        <textarea rows={Math.max(2, value.length + 1)} value={joined} onChange={(e) => onChange(split(e.target.value))} onBlur={tidy} />
      ) : (
        <input value={joined} onChange={(e) => onChange(split(e.target.value))} onBlur={tidy} />
      )}
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}

/** A titled block of the form. */
export function Group({ title, children, hint, llm }: { title: string; children: ReactNode; hint?: string; llm?: boolean }) {
  return (
    <section className="editor-group">
      <h2>
        {title}
        {llm && <LlmMark />}
      </h2>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  )
}

interface PickProps<T extends string> {
  label: string
  llm?: boolean
  /** What the dropdown says before anything is picked from it: "Add friends". Left out, "Add...". */
  addLabel?: string
  options: { id: T; name: string; title?: string }[]
  value: T[]
  onChange: (value: T[]) => void
  hint?: string
  /** No more than this many may be picked. */
  max?: number
}

/**
 * Picks any number from a set, the one way everywhere in the editor: those picked are
 * pills, each with a cross to take it off again, and a dropdown adds another from the
 * ones that are left.
 */
export function PickList<T extends string>({ label, llm, addLabel = t('editor.fields.add'), options, value, onChange, hint, max }: PickProps<T>) {
  const full = max !== undefined && value.length >= max
  const picked = value.flatMap((id) => options.filter((option) => option.id === id))
  const left = options.filter((option) => !value.includes(option.id))
  return (
    <div className="field">
      <span className="field-label">
        {label}
        {llm && <LlmMark />}
      </span>
      <div className="pills">
        {picked.map((option) => (
          <span key={option.id} className="pill" title={option.title}>
            {option.name}
            <button type="button" aria-label={t('editor.common.removeNamed', { name: option.name })} title={t('editor.common.removeNamed', { name: option.name })} onClick={() => onChange(value.filter((id) => id !== option.id))}>
              ×
            </button>
          </span>
        ))}
        <select
          className="pill-add"
          aria-label={addLabel}
          value=""
          disabled={left.length === 0 || full}
          onChange={(e) => e.target.value && onChange([...value, e.target.value as T])}
        >
          <option value="">{full ? t('editor.fields.noMoreThan', { max }) : left.length === 0 ? t('editor.fields.nothingLeft') : addLabel}</option>
          {left.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

interface CheckPillsProps<T extends string> {
  label: string
  options: { id: T; name: string; title?: string }[]
  value: T[]
  onChange: (value: T[]) => void
  hint?: string
}

/**
 * Picks any number from a short, fixed set: every choice is a pill, lit when it is picked, and a press turns it on or off.
 * For a handful of things that never change, such as the days of the week, where a dropdown would only hide them.
 * What is picked is kept in the order the choices are listed in.
 */
export function CheckPills<T extends string>({ label, options, value, onChange, hint }: CheckPillsProps<T>) {
  const toggle = (id: T) => onChange(options.map((option) => option.id).filter((each) => (each === id ? !value.includes(id) : value.includes(each))))
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="pills" role="group" aria-label={label}>
        {options.map((option) => (
          <button key={option.id} type="button" className={value.includes(option.id) ? 'pill check on' : 'pill check'} aria-pressed={value.includes(option.id)} title={option.title} onClick={() => toggle(option.id)}>
            {option.name}
          </button>
        ))}
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

interface FootProps {
  /** Why the last save was refused. */
  issues: string[]
  status: string
  busy: boolean
  /** There is something to save or undo. */
  dirty: boolean
  /** The draft can be saved as it stands. Left out, it can. */
  canSave?: boolean
  onUndo: () => void
  onSave: () => void
  /** Deleting what is being edited, or putting it back as it shipped, where either can be done. */
  remove?: { label: string; onClick: () => void }
}

/**
 * The bar under every editor: what happened on the left, then the way to be rid of what is
 * being edited, to undo, and to save.
 */
export function EditorFoot({ issues, status, busy, dirty, canSave = true, onUndo, onSave, remove }: FootProps) {
  return (
    <div className="editor-foot">
      <div className="editor-status">
        {issues.map((issue) => (
          <p key={issue} className="notice">
            {issue}
          </p>
        ))}
        {status && <p className="hint">{status}</p>}
      </div>
      {remove && (
        <Button variant="quiet" disabled={busy} onClick={remove.onClick}>
          {remove.label}
        </Button>
      )}
      <Button disabled={!dirty || busy} onClick={onUndo}>
        {t('editor.fields.undo')}
      </Button>
      <Button variant="primary" disabled={!dirty || busy || !canSave} onClick={onSave}>
        {busy ? t('editor.common.saving') : t('editor.common.save')}
      </Button>
    </div>
  )
}

// The kinds of condition a secret can wait on, as the list offers them.
const CONDITION_KINDS: { type: Condition['type']; label: MessageKey }[] = [
  { type: 'stage', label: 'editor.fields.conditionStage' },
  { type: 'meter', label: 'editor.fields.conditionMeter' },
  { type: 'pregnant', label: 'editor.fields.conditionPregnant' },
  { type: 'event', label: 'editor.fields.conditionEvent' },
  { type: 'day', label: 'editor.fields.conditionDay' },
  { type: 'stat', label: 'editor.fields.conditionStat' },
  { type: 'flag', label: 'editor.fields.conditionFlag' }
]

/** A condition of a kind, as it starts when picked: the first of whatever it names. */
function startingCondition(content: ContentPack, type: Condition['type']): Condition {
  switch (type) {
    case 'stage':
      return { type, min: content.relationships.stages.at(-2)?.id ?? content.relationships.stages[0].id }
    case 'meter':
      return { type, meter: 'affection', min: 50 }
    case 'pregnant':
      return { type, value: true }
    case 'event':
      return { type, eventId: content.calendar.events[0]?.id ?? '' }
    case 'day':
      return { type, min: 1 }
    case 'stat':
      return { type, stat: STATS[0], min: 12 }
    case 'flag':
      return { type, flag: '', value: true }
    case 'money':
      return { type, min: 0 }
    case 'energy':
      return { type, min: 0 }
  }
}

interface ConditionsProps {
  content: ContentPack
  label: string
  value: Condition[]
  onChange: (value: Condition[]) => void
  hint?: string
}

/** What must be so before something happens: each condition a row, all of them needed. None, and it happens freely. */
export function ConditionsField({ content, label, value, onChange, hint }: ConditionsProps) {
  const setAt = (index: number, next: Condition) => onChange(value.map((one, i) => (i === index ? next : one)))
  const number = (text: string) => Math.floor(Number(text)) || 0
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {value.map((condition, index) => (
        <div key={index} className="row checks">
          <select value={condition.type} onChange={(e) => setAt(index, startingCondition(content, e.target.value as Condition['type']))}>
            {CONDITION_KINDS.map((kind) => (
              <option key={kind.type} value={kind.type}>
                {t(kind.label)}
              </option>
            ))}
          </select>
          {condition.type === 'stage' && (
            <select value={condition.min} onChange={(e) => setAt(index, { ...condition, min: e.target.value })}>
              {content.relationships.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          )}
          {condition.type === 'meter' && (
            <>
              <select value={condition.meter} onChange={(e) => setAt(index, { ...condition, meter: e.target.value as Meter })}>
                {METERS.map((meter) => (
                  <option key={meter} value={meter}>
                    {meter}
                  </option>
                ))}
              </select>
              <input type="number" min={0} max={content.relationships.meterMax} value={condition.min} onChange={(e) => setAt(index, { ...condition, min: number(e.target.value) })} />
            </>
          )}
          {condition.type === 'pregnant' && (
            <label className="row checks">
              <input type="checkbox" checked={condition.value} onChange={(e) => setAt(index, { ...condition, value: e.target.checked })} />
              {condition.value ? t('editor.fields.is') : t('editor.fields.isNot')}
            </label>
          )}
          {condition.type === 'event' && (
            <select value={condition.eventId} onChange={(e) => setAt(index, { ...condition, eventId: e.target.value })}>
              {content.calendar.events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          )}
          {condition.type === 'day' && <input type="number" min={1} value={condition.min ?? 1} onChange={(e) => setAt(index, { ...condition, min: Math.max(1, number(e.target.value)) })} />}
          {condition.type === 'stat' && (
            <>
              <select value={condition.stat} onChange={(e) => setAt(index, { ...condition, stat: e.target.value })}>
                {STATS.map((stat) => (
                  <option key={stat} value={stat}>
                    {STAT_LABELS[stat]}
                  </option>
                ))}
              </select>
              <input type="number" min={0} value={condition.min ?? 0} onChange={(e) => setAt(index, { ...condition, min: number(e.target.value) })} />
            </>
          )}
          {condition.type === 'flag' && <input value={condition.flag} placeholder={t('editor.fields.flag')} onChange={(e) => setAt(index, { ...condition, flag: e.target.value.trim() })} />}
          <Button variant="quiet" size="small" onClick={() => onChange(value.filter((_, i) => i !== index))}>
            {t('editor.common.remove')}
          </Button>
        </div>
      ))}
      <Button size="small" onClick={() => onChange([...value, startingCondition(content, 'stage')])}>
        {t('editor.fields.addCondition')}
      </Button>
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}
