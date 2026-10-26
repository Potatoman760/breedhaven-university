/**
 * Fills in a message: `{name}` takes a value, `{n, plural, one {# day} other {# days}}` picks by count (`=0` and the
 * like match exactly, `#` is the count), and `{x, select, teacher {...} other {...}}` picks by value. A brace that
 * opens none of these is kept as written, so JSON shown to the LLM needs no escaping. A value that was not given
 * leaves its placeholder in the text, where a missing parameter is easy to see.
 */

export type Params = Record<string, string | number | boolean | undefined>

interface Cursor {
  text: string
  at: number
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*/

function readName(cursor: Cursor): string | undefined {
  const match = NAME.exec(cursor.text.slice(cursor.at))
  if (!match) return undefined
  cursor.at += match[0].length
  return match[0]
}

function skipSpace(cursor: Cursor): void {
  while (cursor.at < cursor.text.length && /\s/.test(cursor.text[cursor.at]!)) cursor.at++
}

/** The text of one case of a plural or select, braces and all balanced; the cursor is left after its closing brace. */
function readCase(cursor: Cursor): string | undefined {
  if (cursor.text[cursor.at] !== '{') return undefined
  let depth = 0
  const start = cursor.at
  for (; cursor.at < cursor.text.length; cursor.at++) {
    const c = cursor.text[cursor.at]
    if (c === '{') depth++
    else if (c === '}' && --depth === 0) {
      cursor.at++
      return cursor.text.slice(start + 1, cursor.at - 1)
    }
  }
  return undefined
}

/** The placeholder at the cursor, if it is one: what it comes to, with the cursor moved past it. */
function placeholder(cursor: Cursor, params: Params, plural: (n: number) => string, count?: number): string | undefined {
  const start = cursor.at
  cursor.at++
  const name = readName(cursor)
  if (name === undefined) return undefined
  skipSpace(cursor)
  if (cursor.text[cursor.at] === '}') {
    cursor.at++
    const value = params[name]
    return value === undefined ? cursor.text.slice(start, cursor.at) : String(value)
  }
  if (cursor.text[cursor.at] !== ',') return undefined
  cursor.at++
  skipSpace(cursor)
  const kind = readName(cursor)
  if (kind !== 'plural' && kind !== 'select') return undefined
  skipSpace(cursor)
  if (cursor.text[cursor.at] !== ',') return undefined
  cursor.at++
  const cases: Record<string, string> = {}
  for (;;) {
    skipSpace(cursor)
    if (cursor.text[cursor.at] === '}') {
      cursor.at++
      break
    }
    const exact = cursor.text[cursor.at] === '='
    if (exact) cursor.at++
    const label = exact ? /^-?\d+/.exec(cursor.text.slice(cursor.at))?.[0] : readName(cursor)
    if (label === undefined) return undefined
    if (exact) cursor.at += label.length
    skipSpace(cursor)
    const body = readCase(cursor)
    if (body === undefined) return undefined
    cases[exact ? `=${label}` : label] = body
  }
  const value = params[name]
  if (kind === 'plural') {
    const n = Number(value)
    const chosen = cases[`=${n}`] ?? cases[plural(n)] ?? cases['other'] ?? ''
    return render(chosen, params, plural, n)
  }
  const chosen = cases[String(value)] ?? cases['other'] ?? ''
  return render(chosen, params, plural, count)
}

function render(text: string, params: Params, plural: (n: number) => string, count?: number): string {
  let out = ''
  const cursor: Cursor = { text, at: 0 }
  while (cursor.at < text.length) {
    const c = text[cursor.at]!
    if (c === '#' && count !== undefined) {
      out += String(count)
      cursor.at++
      continue
    }
    if (c === '{') {
      const start = cursor.at
      const made = placeholder(cursor, params, plural, count)
      if (made !== undefined) {
        out += made
        continue
      }
      cursor.at = start + 1
      out += c
      continue
    }
    out += c
    cursor.at++
  }
  return out
}

const pluralRules = new Map<string, Intl.PluralRules>()

/** A message with its placeholders filled, by the plural rules of the language it is in. */
export function format(message: string, params: Params | undefined, language: string): string {
  if (!params && !message.includes('{')) return message
  let rules = pluralRules.get(language)
  if (!rules) {
    try {
      rules = new Intl.PluralRules(language)
    } catch {
      rules = new Intl.PluralRules('en')
    }
    pluralRules.set(language, rules)
  }
  const chosen = rules
  return render(message, params ?? {}, (n) => chosen.select(n))
}

/** The names of the values a message takes, so a translation can be checked against the English. */
export function placeholders(message: string): string[] {
  const found = new Set<string>()
  for (const match of message.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\s*[,}]/g)) found.add(match[1]!)
  return [...found].sort()
}
