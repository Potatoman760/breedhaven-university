import type { ContentPack } from '../model'

/**
 * How the content writes the player's name without knowing it: "{player}'s best friend".
 * The name is the player's to choose when a game starts, so nothing in the content may
 * spell one out.
 */
export const PLAYER_TOKEN = '{player}'

/** A value with the token replaced in every piece of text in it. Whatever holds none is returned as it was, not copied. */
function filled<T>(value: T, name: string): T {
  if (typeof value === 'string') return (value.includes(PLAYER_TOKEN) ? value.split(PLAYER_TOKEN).join(name) : value) as T
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const made = filled(item, name)
      if (made !== item) changed = true
      return made
    })
    return (changed ? next : value) as T
  }
  if (value !== null && typeof value === 'object') {
    let next: Record<string, unknown> | undefined
    for (const [key, item] of Object.entries(value)) {
      const made = filled(item, name)
      if (made !== item) (next ??= { ...(value as Record<string, unknown>) })[key] = made
    }
    return (next ?? value) as T
  }
  return value
}

// The content for each name it has been asked for with, so that the same game gets the same pack back every time.
const made = new WeakMap<ContentPack, Map<string, ContentPack>>()

/**
 * The content as one game reads it: with the player's name wherever the content wrote the
 * token. The game and every prompt are given this; the editor keeps the content as written.
 */
export function personalise(content: ContentPack, playerName: string): ContentPack {
  let byName = made.get(content)
  if (!byName) made.set(content, (byName = new Map()))
  let pack = byName.get(playerName)
  if (!pack) byName.set(playerName, (pack = filled(content, playerName)))
  return pack
}
