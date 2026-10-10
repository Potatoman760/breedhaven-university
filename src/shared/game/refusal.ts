// Only the opening of a reply is checked, so a character saying "I can't" mid-scene
// isn't mistaken for the model declining to write.
const OPENING_CHARS = 200

// How the frontier models word it when they decline in plain text, with nothing in the reply's
// envelope to say so: Claude and GPT mostly refuse this way, as an ordinary finished reply.
const REFUSAL_PATTERNS = [
  /\bI(?:'m| am) sorry,? but\b/i,
  /\bI apologi[sz]e,? but\b/i,
  /\bI (?:can't|cannot|can not|won't|will not) (?:continue|assist|help with|write|create|generate|produce|provide|engage|participate|comply|fulfil|depict|describe|role-?play|go (?:any )?further|do that|keep going)/i,
  /\bI(?:'m| am) (?:unable|not able|not going|not willing) to\b/i,
  /\bI(?:'m| am) not comfortable\b/i,
  /\bI (?:don't|do not) feel comfortable\b/i,
  /\bI (?:need|have|want) to (?:pause|stop|decline|step (?:out|back)|break character)\b/i,
  /\b(?:step|stepping|break|breaking) out of (?:the |this |our )?(?:role-?play|scene|story|character)\b/i,
  /\b(?:sexually explicit|explicit sexual) (?:content|material|scenes?)\b/i,
  /\bas an AI\b/i,
  /\b(?:content|usage) polic(?:y|ies)\b/i,
  /\bagainst my guidelines\b/i
]

// What a character says aloud. A model declining speaks in its own voice, outside any quotation marks.
const SPOKEN = /"[^"]*"|“[^”]*”/g

/** Whether a reply reads as the model declining to write, rather than as the character speaking. */
export function looksLikeRefusal(reply: string): boolean {
  const opening = reply.slice(0, OPENING_CHARS).replace(/[’‘]/g, "'").replace(SPOKEN, ' ')
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(opening))
}
