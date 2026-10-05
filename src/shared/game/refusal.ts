// Only the opening of a reply is checked, so a character saying "I can't" mid-scene
// isn't mistaken for the model declining to write.
const OPENING_CHARS = 200

const REFUSAL_PATTERNS = [
  /\bI(?:'m| am) sorry,? but\b/i,
  /\bI apologi[sz]e,? but\b/i,
  /\bI (?:can(?:'|no)t|cannot|won't|will not) (?:continue|assist|help with|write|create|generate|produce|provide|engage|participate|comply|fulfil)/i,
  /\bI(?:'m| am) (?:unable|not able) to\b/i,
  /\bas an AI\b/i,
  /\b(?:content|usage) polic(?:y|ies)\b/i,
  /\bagainst my guidelines\b/i
]

/** Whether a reply reads as the model declining to write, rather than as the character speaking. */
export function looksLikeRefusal(reply: string): boolean {
  const opening = reply.slice(0, OPENING_CHARS)
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(opening))
}
