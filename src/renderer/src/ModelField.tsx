import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { LlmProfileId } from '../../shared/settings'
import { t } from '../../shared/i18n'

// Wait this long after the last keystroke before asking the endpoint for its models.
const LOAD_DELAY_MS = 600

interface Props {
  profileId: LlmProfileId
  baseUrl: string
  /** A key typed into the form, or undefined to use the saved one. */
  apiKey: string | undefined
  value: string
  onChange: (model: string) => void
}

type Load = { state: 'idle' | 'loading' } | { state: 'loaded'; models: string[] } | { state: 'failed'; error: string }

/**
 * The model picker. Once a base URL (and key, if needed) is filled in, it loads the
 * endpoint's models and offers them as a list; until then, or if that fails, the model
 * name can be typed by hand.
 */
export function ModelField({ profileId, baseUrl, apiKey, value, onChange }: Props) {
  const [load, setLoad] = useState<Load>({ state: 'idle' })

  useEffect(() => {
    if (baseUrl.trim() === '') {
      setLoad({ state: 'idle' })
      return
    }
    let cancelled = false
    setLoad({ state: 'loading' })
    const timer = setTimeout(async () => {
      const result = await window.api.listModels({ profileId, baseUrl, apiKey })
      if (cancelled) return
      setLoad(
        result.error !== undefined
          ? { state: 'failed', error: result.error }
          : { state: 'loaded', models: result.models }
      )
    }, LOAD_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [profileId, baseUrl, apiKey])

  if (load.state === 'loaded' && load.models.length > 0) return <ModelSearch profileId={profileId} models={load.models} value={value} onChange={onChange} />

  return (
    <label>
      {t('shell.modelField.model')}
      <input value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="hint">
        {load.state === 'idle' && t('shell.modelField.idle')}
        {load.state === 'loading' && t('shell.modelField.loading')}
        {load.state === 'loaded' && t('shell.modelField.none')}
        {load.state === 'failed' && t('shell.modelField.failed', { error: load.error })}
      </span>
    </label>
  )
}

/**
 * The endpoint's models, searched as the name is typed: whatever has what is typed in its name is offered, in a list of
 * its own that scrolls, since a browser's own suggestions cannot. A name it does not list can still be typed, as a saved
 * model it no longer lists is kept.
 */
function ModelSearch({ profileId, models, value, onChange }: { profileId: LlmProfileId; models: string[]; value: string; onChange: (model: string) => void }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // What was typed to search with: once a model is picked, the whole list is offered again.
  const [query, setQuery] = useState('')
  const list = useRef<HTMLUListElement>(null)
  const needle = query.trim().toLowerCase()
  const shown = needle === '' ? models : models.filter((model) => model.toLowerCase().includes(needle))

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const pick = (model: string) => {
    onChange(model)
    setQuery('')
    setOpen(false)
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActive((at) => Math.max(0, Math.min(shown.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1))))
    } else if (event.key === 'Enter' && open && shown[active]) {
      event.preventDefault()
      pick(shown[active])
    } else if (event.key === 'Escape') setOpen(false)
  }

  return (
    <label className="model-search">
      {t('shell.modelField.model')}
      <input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={`models-${profileId}`}
        value={value}
        placeholder={t('shell.modelField.search', { count: models.length })}
        onFocus={() => setOpen(true)}
        // Long enough for a click on the list to land first.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
        onChange={(e) => {
          onChange(e.target.value)
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
      />
      {open && shown.length > 0 && (
        <ul id={`models-${profileId}`} className="model-list" role="listbox" ref={list}>
          {shown.map((model, index) => (
            <li
              key={model}
              role="option"
              aria-selected={model === value}
              className={index === active ? 'active' : undefined}
              onMouseDown={(e) => (e.preventDefault(), pick(model))}
              onMouseEnter={() => setActive(index)}
            >
              {model}
            </li>
          ))}
        </ul>
      )}
    </label>
  )
}
