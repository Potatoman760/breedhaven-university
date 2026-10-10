import type { ReactNode } from 'react'
import { Button } from '../Button'

/** Beside a field's label: what is written there is given to the LLM. Said once, in a word, in place of a sentence under every field. */
export function LlmMark() {
  return <span className="llm-mark">(sent to LLM)</span>
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
export function PickList<T extends string>({ label, llm, addLabel = 'Add...', options, value, onChange, hint, max }: PickProps<T>) {
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
            <button type="button" aria-label={`Remove ${option.name}`} title={`Remove ${option.name}`} onClick={() => onChange(value.filter((id) => id !== option.id))}>
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
          <option value="">{full ? `No more than ${max}` : left.length === 0 ? 'Nothing left to add' : addLabel}</option>
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
        Undo changes
      </Button>
      <Button variant="primary" disabled={!dirty || busy || !canSave} onClick={onSave}>
        {busy ? 'Saving...' : 'Save'}
      </Button>
    </div>
  )
}
