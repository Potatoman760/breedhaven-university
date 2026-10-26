import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { allKeys, DEFAULT_LANGUAGE, english, NAMESPACES, placeholders, type Language, type MessageKey, type Messages, type Namespace } from '../../shared/i18n'

/**
 * A language other than English is a folder beside the game's own content, `content/<id>/`: `language.json` says what
 * it is called, `strings/<namespace>.json` translates what the game writes itself, and any file laid out as the content
 * is (`codex.json`, `love-interests/anwen.json`) translates the text in it. Only what is to be translated need be in
 * one: everything else is the English content's.
 */

const LANGUAGE_FILE = 'language.json'
const STRINGS = 'strings'

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** The languages there are, English first. */
export function languagesIn(contentRoot: string, englishName: string): Language[] {
  const found = existsSync(contentRoot)
    ? readdirSync(contentRoot, { withFileTypes: true }).flatMap((entry) => {
        const file = join(contentRoot, entry.name, LANGUAGE_FILE)
        if (!entry.isDirectory() || entry.name === 'default' || entry.name === DEFAULT_LANGUAGE || !existsSync(file)) return []
        try {
          const { name } = readJson(file) as { name?: unknown }
          return [{ id: entry.name, name: typeof name === 'string' && name.trim() !== '' ? name : entry.name }]
        } catch {
          return []
        }
      })
    : []
  return [{ id: DEFAULT_LANGUAGE, name: englishName }, ...found.sort((a, b) => a.name.localeCompare(b.name))]
}

/** A language's translation of the game's own text, with what is wrong with it: keys the game has no use for, and messages that take other values than the English. */
export function readStrings(languageDir: string): { messages: Messages; issues: string[] } {
  const dir = join(languageDir, STRINGS)
  const messages: Record<string, string> = {}
  const issues: string[] = []
  if (!existsSync(dir)) return { messages, issues }
  const known = new Set<string>(allKeys())
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.json')).sort()) {
    const ns = basename(file, '.json')
    if (!NAMESPACES.includes(ns as Namespace)) {
      issues.push(`${STRINGS}/${file}: there is no such namespace`)
      continue
    }
    let table: unknown
    try {
      table = readJson(join(dir, file))
    } catch (error) {
      issues.push(`${STRINGS}/${file}: ${(error as Error).message}`)
      continue
    }
    for (const [name, message] of Object.entries(table as Record<string, unknown>)) {
      const key = `${ns}.${name}`
      if (!known.has(key)) issues.push(`${STRINGS}/${file}: "${name}" is not a message the game has`)
      else if (typeof message !== 'string') issues.push(`${STRINGS}/${file}: "${name}" is not text`)
      else {
        const wanted = placeholders(english(key as MessageKey)).join(', ')
        if (placeholders(message).join(', ') !== wanted) issues.push(`${STRINGS}/${file}: "${name}" should take {${wanted}}`)
        messages[key] = message
      }
    }
  }
  return { messages: messages as Messages, issues }
}

// What tells apart the entries of a list in the content: a character, place or event by its id, a subject by its code, a course by its number.
const IDENTITIES = ['id', 'code', 'number']
// A field that holds another entry's id, or ids: `locationId`, `traitIds`.
const REFERENCE = /[a-z]Ids?$/

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The content with a translation laid over it. Text is replaced where the translation has some; an object is gone
 * through key by key; a list of entries is matched entry by entry, by id where they have one and by place where they
 * do not; a list of plain values (keywords, tips) is replaced whole. Nothing the English does not have is added, and a
 * value of another kind than the English is ignored, so a translation cannot change how the game works.
 */
export function translated(base: unknown, over: unknown): unknown {
  if (over === undefined) return base
  if (typeof base === 'string') return typeof over === 'string' ? over : base
  if (Array.isArray(base)) {
    if (!Array.isArray(over)) return base
    if (base.every((entry) => !isObject(entry))) return over.every((entry) => typeof entry === typeof base[0] || base.length === 0) ? over : base
    const identity = IDENTITIES.find((field) => base.every((entry) => isObject(entry) && entry[field] !== undefined))
    return base.map((entry, i) => {
      const match = identity ? over.find((one) => isObject(one) && one[identity] === (entry as Record<string, unknown>)[identity]) : over[i]
      return translated(entry, match)
    })
  }
  if (isObject(base)) {
    if (!isObject(over)) return base
    // What names something else in the content is a reference, not text: it stays as the English has it.
    return Object.fromEntries(Object.entries(base).map(([key, value]) => [key, IDENTITIES.includes(key) || REFERENCE.test(key) ? value : translated(value, over[key])]))
  }
  return base
}

/** A language's translation of the content, laid out as `readPack` reads a pack: whatever of it there is. */
export function readContentTranslation(languageDir: string, files: Record<string, string>): Record<string, unknown> {
  const pack: Record<string, unknown> = {}
  for (const [key, file] of Object.entries(files)) {
    const path = join(languageDir, file)
    if (existsSync(path)) pack[key] = readJson(path)
  }
  const characters = join(languageDir, 'love-interests')
  if (existsSync(characters)) {
    pack['loveInterests'] = readdirSync(characters)
      .filter((file) => file.endsWith('.json'))
      .map((file) => readJson(join(characters, file)))
  }
  return pack
}
