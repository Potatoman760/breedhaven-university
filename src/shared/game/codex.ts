import type { CodexEntry, ContentPack, GameState } from '../model'
import { evaluateAll } from './conditions'

export function isCodexUnlocked(entry: CodexEntry, state: GameState, content: ContentPack): boolean {
  return (
    entry.startsUnlocked ||
    state.unlockedCodexIds.includes(entry.id) ||
    (entry.unlockWhen.length > 0 && evaluateAll(entry.unlockWhen, { state, content }))
  )
}

// Long entries are cut to this length when sent to the AI.
const MAX_ENTRY_CHARS = 1200

/** The entry's content, cut at a sentence end if it is longer than `maxChars`. */
export function codexExcerpt(entry: CodexEntry, maxChars = MAX_ENTRY_CHARS): string {
  if (entry.content.length <= maxChars) return entry.content
  const head = entry.content.slice(0, maxChars)
  const sentenceEnd = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'))
  return `${head.slice(0, sentenceEnd > 0 ? sentenceEnd + 1 : maxChars).trimEnd()} [...]`
}

function mentions(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Whole-word match, so "inn" doesn't fire on "beginning".
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(text)
}

export interface CodexQuery {
  content: ContentPack
  state: GameState
  /** The character being spoken to, if any. */
  loveInterestId?: string
  /** Recent conversation text to scan for keywords. */
  recentText?: string
  /** Upper bound on the combined length of the selected entries' excerpts. */
  budgetChars?: number
}

/**
 * Picks the lore worth sending to the AI for this turn: unlocked entries that are
 * always-on, tied to the current location or character, or mentioned in the recent
 * conversation, highest priority first, until the budget is spent.
 */
export function selectCodexEntries(query: CodexQuery): CodexEntry[] {
  const { content, state, loveInterestId, recentText = '', budgetChars = 5000 } = query

  const relevant = content.codex.filter(
    (entry) =>
      isCodexUnlocked(entry, state, content) &&
      (entry.alwaysInclude ||
        entry.relatedLocationIds.includes(state.locationId) ||
        (loveInterestId !== undefined && entry.relatedCharacterIds.includes(loveInterestId)) ||
        [entry.title, ...entry.keywords].some((term) => mentions(recentText, term)))
  )

  relevant.sort(
    (a, b) =>
      Number(b.alwaysInclude) - Number(a.alwaysInclude) ||
      b.priority - a.priority ||
      a.id.localeCompare(b.id)
  )

  const selected: CodexEntry[] = []
  let used = 0
  for (const entry of relevant) {
    const length = codexExcerpt(entry).length
    if (used + length > budgetChars) continue
    selected.push(entry)
    used += length
  }
  return selected
}
