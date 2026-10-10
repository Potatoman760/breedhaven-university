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

  it('knows how the frontier models word it, and does not take what a character says aloud for it', () => {
    for (const reply of [
      'I’m not comfortable writing this scene.',
      "I don't feel comfortable continuing this roleplay.",
      "I'm not able to write sexually explicit content.",
      'I need to step out of the roleplay here.',
      "I can't continue this roleplay in that direction.",
      "I'm going to break out of character for a moment.",
      "I won't depict that."
    ]) {
      expect(looksLikeRefusal(reply), reply).toBe(true)
    }
    for (const reply of [
      `She folds her arms. "I can't write that essay tonight, and I won't continue this argument."`,
      'Tamsin laughs. “I’m not comfortable up here, I am not able to look down.”',
      `She shakes her head. "I'm sorry, but no. As an AI of the Foundry, it cannot lie."`
    ]) {
      expect(looksLikeRefusal(reply), reply).toBe(false)
    }
  })

  it('only looks at the opening of the reply', () => {
    const long = `${'She smiles and pours the wine. '.repeat(10)}I'm sorry, but I can't continue.`
    expect(looksLikeRefusal(long)).toBe(false)
  })
})
