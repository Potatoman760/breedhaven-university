import { useEffect, useState } from 'react'
import type { LlmProfileId } from '../../shared/settings'

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

  if (load.state === 'loaded' && load.models.length > 0) {
    // Keep a saved model selectable even if the endpoint no longer lists it.
    const options = value && !load.models.includes(value) ? [value, ...load.models] : load.models
    return (
      <label>
        Model
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose a model ({load.models.length} available)</option>
          {options.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label>
      Model
      <input value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="hint">
        {load.state === 'idle' && 'Fill in the base URL to load the available models.'}
        {load.state === 'loading' && 'Loading models...'}
        {load.state === 'loaded' && 'The endpoint lists no models. Type the name.'}
        {load.state === 'failed' && `Could not load models; type the name. ${load.error}`}
      </span>
    </label>
  )
}
