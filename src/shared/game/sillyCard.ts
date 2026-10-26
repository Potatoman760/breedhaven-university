import { z } from 'zod'
import { slugify } from '../editor'
import { DEFAULT_IMAGE_SEED, LoveInterestSchema, STANDARD_OUTFITS, type ContentPack, type LoveInterest } from '../model'
import { t } from '../i18n'

/**
 * A SillyTavern character card: the JSON a card holds, either a file of its own or written into a PNG (the `chara`
 * text chunk for a V1 or V2 card, `ccv3` for a V3 one, base64 of the JSON either way). Only what the game can use is
 * read; the rest of a card is the chat program's.
 */
const CardDataSchema = z.object({
  name: z.string().default(''),
  description: z.string().default(''),
  personality: z.string().default(''),
  scenario: z.string().default(''),
  first_mes: z.string().default(''),
  mes_example: z.string().default(''),
  tags: z.array(z.string()).default([]),
  character_book: z
    .object({ entries: z.array(z.object({ content: z.string().default(''), enabled: z.boolean().default(true) }).passthrough()).default([]) })
    .passthrough()
    .optional()
})
export type Card = z.infer<typeof CardDataSchema>

// As much of a card as is sent to the LLM: some run to tens of thousands of characters of lore.
export const CARD_MAX_CHARS = 12000

/** The card in a file's JSON: a V2 or V3 card keeps it under `data`, a V1 card is it. Throws, saying why, when it is not a card. */
export function cardFromJson(text: string): Card {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(t('llm.sillyCard.notJson'))
  }
  const data = typeof json === 'object' && json !== null && 'data' in json ? (json as { data: unknown }).data : json
  const card = CardDataSchema.safeParse(data)
  if (!card.success || card.data.name.trim() === '') throw new Error(t('llm.sillyCard.noName'))
  return card.data
}

/** The card written into a PNG, the V3 one when it has both. Throws when the picture holds none. */
export function cardFromPng(bytes: Uint8Array): Card {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 8 || signature.some((byte, i) => bytes[i] !== byte)) throw new Error(t('llm.sillyCard.notPng'))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const latin1 = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))
  const found: Record<string, string> = {}
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at)
    const type = latin1(at + 4, at + 8)
    const start = at + 8
    if (start + length > bytes.length) break
    if (type === 'tEXt') {
      const data = bytes.subarray(start, start + length)
      const nul = data.indexOf(0)
      if (nul > 0) found[latin1(start, start + nul).toLowerCase()] = new TextDecoder('latin1').decode(data.subarray(nul + 1))
    }
    if (type === 'IEND') break
    at = start + length + 4
  }
  const encoded = found['ccv3'] ?? found['chara']
  if (!encoded) throw new Error(t('llm.sillyCard.noCard'))
  const binary = atob(encoded.trim())
  return cardFromJson(new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0))))
}

/** A card's text as the game writes it: her name for `{{char}}`, `{player}` for `{{user}}`, and no carriage returns. */
export function cardText(card: Card, text: string): string {
  return text
    .replace(/\{\{char\}\}|<BOT>/gi, card.name)
    .replace(/\{\{user\}\}|<USER>/gi, '{player}')
    .replace(/\r\n?/g, '\n')
    .trim()
}

/**
 * The card's example chats as the game keeps them: a line of his and her answer to it. Each `<START>` begins a
 * chat; a line that names no speaker carries on the one before it, and an answer with nothing of his before it is left out.
 */
export function cardExamples(card: Card): { user: string; reply: string }[] {
  const pairs: { user: string; reply: string }[] = []
  for (const chat of cardText(card, card.mes_example).split(/<START>/i)) {
    let user = ''
    let reply = ''
    let speaking: 'user' | 'char' | null = null
    const close = () => {
      if (user.trim() && reply.trim()) pairs.push({ user: user.trim(), reply: reply.trim() })
      user = ''
      reply = ''
    }
    for (const line of chat.split('\n')) {
      const his = line.match(/^\s*\{player\}\s*:\s*(.*)$/)
      const hers = line.match(new RegExp(`^\\s*${card.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*(.*)$`))
      if (his) {
        if (speaking === 'char') close()
        user += (user ? '\n' : '') + his[1]
        speaking = 'user'
      } else if (hers) {
        reply += (reply ? '\n' : '') + hers[1]
        speaking = 'char'
      } else if (speaking === 'user') user += `\n${line}`
      else if (speaking === 'char') reply += `\n${line}`
    }
    close()
  }
  return pairs
}

/** What the card says of her, laid out for the LLM to adapt, held to `CARD_MAX_CHARS`. */
export function cardBrief(card: Card): string {
  const lore = (card.character_book?.entries ?? []).filter((entry) => entry.enabled && entry.content.trim())
  const parts = [
    t('llm.sillyCard.name', { text: card.name }),
    card.description && t('llm.sillyCard.description', { text: cardText(card, card.description) }),
    card.personality && t('llm.sillyCard.personality', { text: cardText(card, card.personality) }),
    card.scenario && t('llm.sillyCard.scenario', { text: cardText(card, card.scenario) }),
    card.first_mes && t('llm.sillyCard.firstMessage', { text: cardText(card, card.first_mes) }),
    card.tags.length > 0 && t('llm.sillyCard.tags', { text: card.tags.join(', ') }),
    lore.length > 0 && t('llm.sillyCard.lore', { text: lore.map((entry) => `- ${cardText(card, entry.content)}`).join('\n') })
  ].filter((part): part is string => typeof part === 'string' && part !== '')
  const brief = parts.join('\n\n')
  return brief.length > CARD_MAX_CHARS ? `${brief.slice(0, CARD_MAX_CHARS)}...` : brief
}

/** An id nobody has, from a name: her first name, numbered when it is taken. */
export function freshId(content: ContentPack, name: string): string {
  const taken = new Set([...content.loveInterests, ...content.npcs].map((c) => c.id))
  const base = slugify(name.split(' ')[0]) || 'new-character'
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

/**
 * What of a card goes into her file as it is: her name, her example chats, and her lorebook as what she knows. On a
 * character the LLM has written from the card these are put over what it wrote.
 */
export function withCard(who: LoveInterest, card: Card): LoveInterest {
  const examples = cardExamples(card)
  const lore = (card.character_book?.entries ?? []).filter((entry) => entry.enabled && entry.content.trim()).map((entry) => cardText(card, entry.content))
  return {
    ...who,
    name: card.name.trim(),
    ai: {
      ...who.ai,
      exampleDialogue: examples.length > 0 ? examples : who.ai.exampleDialogue,
      knowledge: lore.length > 0 ? lore : who.ai.knowledge
    }
  }
}

/**
 * A character from a card alone, with nothing written by the LLM: the card's description as her backstory and its
 * personality as hers, an age if the card says one of 18 or over, and the rest blank to fill in.
 */
export function characterFromCard(content: ContentPack, card: Card): LoveInterest {
  const said = cardText(card, `${card.description}\n${card.personality}`).match(/\b(\d{2})[- ]?(?:years?[- ]old|y\/?o)\b/i)
  const age = said && Number(said[1]) >= 18 ? Number(said[1]) : 18
  const backstory = [card.description, card.scenario].map((text) => cardText(card, text)).filter(Boolean).join('\n\n')
  return withCard(
    LoveInterestSchema.parse({
      id: freshId(content, card.name),
      name: card.name,
      age,
      personality: cardText(card, card.personality),
      outfits: STANDARD_OUTFITS,
      defaultOutfitId: 'default',
      imageSeed: DEFAULT_IMAGE_SEED,
      ai: { backstory }
    }),
    card
  )
}
