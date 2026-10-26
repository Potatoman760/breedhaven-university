import { useSyncExternalStore } from 'react'
import { setLanguage } from '../../shared/i18n'
import type { ContentPack } from '../../shared/model'
import type { LanguageView } from '../../shared/types'

/**
 * The language the window is in. It is read before the content is, so that nothing is ever shown in the wrong one;
 * changing it brings the content again, translated, and everything showing it is drawn afresh.
 */

let view: LanguageView | null = null
const listeners = new Set<() => void>()
const contentListeners = new Set<(content: ContentPack) => void>()

function use(next: LanguageView): void {
  view = next
  setLanguage(next.language, next.messages)
  document.documentElement.lang = next.language
  for (const listener of listeners) listener()
}

export async function loadLanguage(): Promise<void> {
  use(await window.api.getLanguage())
}

export async function chooseLanguage(language: string): Promise<void> {
  const { content, ...next } = await window.api.setLanguage(language)
  use(next)
  for (const listener of contentListeners) listener(content)
}

/** Hears of the content each time a change of language brings it again. */
export function onLanguageContent(listener: (content: ContentPack) => void): () => void {
  contentListeners.add(listener)
  return () => contentListeners.delete(listener)
}

export function useLanguageView(): LanguageView | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => view
  )
}
