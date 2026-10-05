import { describe, expect, it } from 'vitest'
import { looksLikeRefusal } from './refusal'

describe('looksLikeRefusal', () => {
  it('recognises a model declining to write', () => {
    for (const reply of [
      "I'm sorry, but I can't continue with this scene.",
      'I cannot write explicit content.',
      "I can't help with that request.",
      'I apologize, but this goes beyond what I am able to produce.',
      'As an AI, I have to stay within certain limits.',
      'This request violates the content policy.',
      "I won't generate that."
    ]) {
      expect(looksLikeRefusal(reply), reply).toBe(true)
    }
  })

  it('does not mistake in-character speech for a refusal', () => {
    for (const reply of [
      "I can't help it. You make me laugh.",
      "I'm sorry I was late; the gate was a mess.",
      "I won't pretend I wasn't hoping you'd come.",
      'I cannot believe you cheated at cards again.',
      'Sit. Tell me what the Order wanted.'
    ]) {
      expect(looksLikeRefusal(reply), reply).toBe(false)
    }
  })

  it('only looks at the opening of the reply', () => {
    const long = `${'She smiles and pours the wine. '.repeat(10)}I'm sorry, but I can't continue.`
    expect(looksLikeRefusal(long)).toBe(false)
  })
})
