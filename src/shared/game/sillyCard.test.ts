import { describe, expect, it } from 'vitest'
import { buildDraftPrompt } from './draftCharacter'
import { cardBrief, cardExamples, cardFromJson, cardFromPng, characterFromCard, withCard } from './sillyCard'
import { fixture } from './testFixture'

const content = fixture()
const v2 = {
  spec: 'chara_card_v2',
  data: {
    name: 'Nyx Vale',
    description: '{{char}} is a 24-year-old night-shift librarian.\r\nShe keeps a raven.',
    personality: 'dry, watchful, kind under it',
    scenario: '{{user}} walks into the archive after closing.',
    first_mes: '*She looks up.* We are closed.',
    mes_example: '<START>\n{{user}}: Are you open?\n{{char}}: No.\nNot to you.\n<START>\n{{char}}: Nobody asked.\n{{user}}: Fine.\n{{char}}: Good.',
    tags: ['gothic', 'books'],
    character_book: { entries: [{ keys: ['raven'], content: 'The raven is called Ink.', enabled: true }, { keys: [], content: 'Hidden.', enabled: false }] }
  }
}

/** A PNG holding the given text chunks: no picture to speak of, and no CRCs, which the reader does not check. */
function png(chunks: Record<string, string>): Uint8Array {
  const parts: number[] = [137, 80, 78, 71, 13, 10, 26, 10]
  const chunk = (type: string, data: number[]) => {
    const length = data.length
    parts.push((length >>> 24) & 255, (length >>> 16) & 255, (length >>> 8) & 255, length & 255, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0)
  }
  chunk('IHDR', new Array(13).fill(0))
  for (const [key, text] of Object.entries(chunks)) chunk('tEXt', [...[...key].map((c) => c.charCodeAt(0)), 0, ...[...text].map((c) => c.charCodeAt(0))])
  chunk('IEND', [])
  return Uint8Array.from(parts)
}
const base64 = (json: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(json))))

describe('a SillyTavern card', () => {
  it('is read from its JSON, V1 or V2, and refused when it is not one', () => {
    expect(cardFromJson(JSON.stringify(v2)).name).toBe('Nyx Vale')
    expect(cardFromJson(JSON.stringify({ name: 'Old Style', description: 'x' })).description).toBe('x')
    expect(() => cardFromJson('not json')).toThrow(/not JSON/)
    expect(() => cardFromJson('{"spec":"x","data":{}}')).toThrow(/no name/)
  })

  it('is read from a PNG, the V3 card first, and refused when the picture has none', () => {
    expect(cardFromPng(png({ chara: base64(v2) })).name).toBe('Nyx Vale')
    expect(cardFromPng(png({ chara: base64(v2), ccv3: base64({ spec: 'chara_card_v3', data: { ...v2.data, name: 'Nyx Três' } }) })).name).toBe('Nyx Três')
    expect(() => cardFromPng(png({}))).toThrow(/no character card/)
    expect(() => cardFromPng(new Uint8Array([1, 2, 3]))).toThrow(/not a PNG/)
  })

  it('gives its example chats as his lines and her answers, a line that names nobody carrying on the one before', () => {
    expect(cardExamples(cardFromJson(JSON.stringify(v2)))).toEqual([
      { user: 'Are you open?', reply: 'No.\nNot to you.' },
      { user: 'Fine.', reply: 'Good.' }
    ])
  })

  it('becomes a character as it is: the player as {player}, the age it says, its lorebook as what she knows', () => {
    const card = cardFromJson(JSON.stringify(v2))
    const her = characterFromCard(content, card)
    expect(her).toMatchObject({ id: 'nyx', name: 'Nyx Vale', age: 24, personality: 'dry, watchful, kind under it' })
    expect(her.ai.backstory).toBe('Nyx Vale is a 24-year-old night-shift librarian.\nShe keeps a raven.\n\n{player} walks into the archive after closing.')
    expect(her.ai.knowledge).toEqual(['The raven is called Ink.'])
    expect(her.ai.exampleDialogue).toHaveLength(2)
    // A card that says nothing of her age, or an age under 18, leaves the youngest she can be.
    expect(characterFromCard(content, { ...card, description: 'A 16 year old.' }).age).toBe(18)
  })

  it('is what the LLM brings into the setting, and keeps her name and chats over what it wrote', () => {
    const card = cardFromJson(JSON.stringify(v2))
    const { user } = buildDraftPrompt(content, 'make her a student', card)
    expect(user).toContain('Bring this character from a SillyTavern card into the setting')
    expect(user).toContain('Notes on how: make her a student')
    expect(user).toContain(cardBrief(card))
    expect(cardBrief(card)).not.toContain('Hidden.')
    const written = characterFromCard(content, { ...card, name: 'Someone Else', mes_example: '' })
    expect(withCard(written, card)).toMatchObject({ name: 'Nyx Vale', ai: { exampleDialogue: cardExamples(card) } })
  })
})
