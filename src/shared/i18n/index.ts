import { format, type Params } from './format'
import core from './en/core.json'
import scene from './en/scene.json'
import llm from './en/llm.json'
import game from './en/game.json'
import comfy from './en/comfy.json'
import editor from './en/editor.json'
import shell from './en/shell.json'
import screens from './en/screens.json'
import panels from './en/panels.json'

export { format, placeholders, type Params } from './format'

/**
 * Every piece of text the game writes itself, in English: what the interface says, and what the LLM is told. A key is
 * its namespace and its name within it, `scene.place.student`. Other languages are translations of these, read from
 * `content/<language>/strings/<namespace>.json` and falling back to the English for anything they leave out.
 */
export const ENGLISH = { core, scene, llm, game, comfy, editor, shell, screens, panels }

type English = typeof ENGLISH
export type Namespace = keyof English
export const NAMESPACES = Object.keys(ENGLISH) as Namespace[]
export type MessageKey = { [N in Namespace]: `${N}.${keyof English[N] & string}` }[Namespace]

/** A translation, flat: every key it gives a message for. */
export type Messages = Partial<Record<MessageKey, string>>

export const DEFAULT_LANGUAGE = 'en'

/** A language the game can be played in. */
export interface Language {
  id: string
  /** What the language calls itself, as it is offered in the settings. */
  name: string
}

let language = DEFAULT_LANGUAGE
let messages: Messages = {}

/**
 * Sets the language everything is written in from now on, with its translation. Each process keeps its own: the main
 * process for what the LLM is told, the window for what is shown.
 */
export function setLanguage(id: string, translation: Messages = {}): void {
  language = id
  messages = id === DEFAULT_LANGUAGE ? {} : translation
}

export function currentLanguage(): string {
  return language
}

/** The English for a key, as the game ships it. */
export function english(key: MessageKey): string {
  const dot = key.indexOf('.')
  const table = ENGLISH[key.slice(0, dot) as Namespace] as Record<string, string>
  return table[key.slice(dot + 1)] ?? key
}

/** A message in the current language, its placeholders filled. */
export function t(key: MessageKey, params?: Params): string {
  const translated = messages[key]
  return translated !== undefined ? format(translated, params, language) : format(english(key), params, DEFAULT_LANGUAGE)
}

/** Every key there is, for checking a translation. */
export function allKeys(): MessageKey[] {
  return NAMESPACES.flatMap((ns) => Object.keys(ENGLISH[ns]).map((name) => `${ns}.${name}` as MessageKey))
}
