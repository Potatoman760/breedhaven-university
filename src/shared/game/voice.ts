/**
 * Lines written ahead, voiced ahead: a tour's steps and a cutscene's lines are known before the game is played, so each
 * can be recorded once in its speaker's voice and played as it is read. A recording is found by its line: the speaker
 * and the words as shown, with the player's name put back as the token it was written as, so that one recording serves
 * every player and a line that is rewritten is simply silent until it is recorded again.
 */
import type { Intro } from '../model'
import { cutsceneBeats } from './cutscene'
import { PLAYER_TOKEN } from './personalise'

/** The key a voiced line is recorded under: FNV-1a of who says it and the words, in hex. */
export function lineKey(speakerId: string, text: string, playerName: string): string {
  const written = playerName && playerName !== PLAYER_TOKEN ? text.split(playerName).join(PLAYER_TOKEN) : text
  let hash = 0x811c9dc5
  for (const char of `${speakerId}|${written.trim()}`) {
    hash ^= char.codePointAt(0)!
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * A cutscene filled in as it is read (a child's name put in) beside the same as written: each line as shown, to the
 * line as written, so that its recording, made of the words as written, is found. Lines that are the same are left out.
 */
export function writtenLines(written: Intro, shown: Intro, people: { id: string; name: string }[]): Record<string, string> {
  const before = cutsceneBeats(written, people)
  const after = cutsceneBeats(shown, people)
  return Object.fromEntries(after.flatMap(({ line }, i) => (before[i] && before[i].line.text !== line.text ? [[line.text, before[i].line.text]] : [])))
}

/** The child, as a recording made ahead says it: not by name, which it cannot know. */
export function childSpoken(text: string): string {
  return text.replace(/\{child\}/g, 'our baby').replace(/\{(they|them|their)\}/g, '$1')
}

/**
 * What of a line is said aloud: the words, without what is between asterisks (what she does) and without the player's
 * name, which no recording can say, taken out with the comma or question it sat in. Empty when nothing is said.
 */
export function spokenOf(text: string): string {
  const token = PLAYER_TOKEN.replace(/[{}]/g, '\\$&')
  return text
    .replace(/\*[^*]*\*/g, ' ')
    .replace(new RegExp(`^\\s*${token}[?!.,]*\\s*`), '')
    .replace(new RegExp(`,\\s*${token}(?=[\\s.!?,]|$)`, 'g'), '')
    .replace(new RegExp(`\\s*${token}`, 'g'), ' you')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
