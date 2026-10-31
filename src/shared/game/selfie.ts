import { postPrompt } from '../comfy'
import { outfitDescription, type ContentPack, type GameState, type LoveInterest } from '../model'
import { formatDate, formatTime, periodAt, toDate } from './calendar'
import { courierExcerpt } from './courier'
import { locationOf } from './map'
import { wornOutfit } from './pregnancy'
import { stageFor } from './relationships'
import { weatherOn } from './weather'
import { t } from '../i18n'

const MAX_SELFIE_CHARS = 280

/** The prompt asking the LLM for a selfie he has asked her for in his DMs: what she sends with it and what it shows, as a JSON object. */
export function buildSelfiePrompt(content: ContentPack, state: GameState, li: LoveInterest): { system: string; user: string } {
  const player = state.player.name
  const first = li.name.split(' ')[0]
  const system = [
    t('llm.selfie.systemRole', { name: first, player }),
    t('llm.selfie.systemReply', { text: '"text"', picture: '"picture"' }),
    t('llm.selfie.message', { player }),
    t('llm.selfie.picture', { name: first })
  ].join('\n')
  const date = toDate(content.calendar, state.time)
  const weather = weatherOn(content, state)
  const where = content.locations.find((l) => l.id === locationOf(content, state, li))
  const stage = stageFor(content.relationships, state.relationships[li.id]?.affection ?? 0).name
  const user = [
    t('llm.feed.today', { date: formatDate(date) }),
    t('llm.selfie.time', { time: formatTime(date) }),
    weather && t('llm.feed.weather', { name: weather.name, description: weather.description }),
    t('llm.selfie.who', { name: li.name, age: li.age, bio: li.bio }),
    t('llm.feed.personality', { text: li.personality }),
    li.ai.speechPattern && t('llm.feed.voice', { text: li.ai.speechPattern }),
    t('llm.feed.where', { where: where ? `${where.name}. ${where.description}` : t('llm.feed.atHome') }),
    t('llm.selfie.stage', { player, stage }),
    '',
    t('llm.selfie.lately'),
    ...courierExcerpt(content, state, li.id)
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n')
  return { system, user }
}

/** What the LLM wrote for the selfie: undefined when its reply holds no message. */
export function parseSelfie(reply: string): { text: string; picture: string } | undefined {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end < start) return undefined
  let read: { text?: unknown; picture?: unknown }
  try {
    read = JSON.parse(reply.slice(start, end + 1)) as typeof read
  } catch {
    return undefined
  }
  const text = typeof read.text === 'string' ? read.text.trim().replace(/^["“]|["”]$/g, '').slice(0, MAX_SELFIE_CHARS) : ''
  if (text === '') return undefined
  return { text, picture: typeof read.picture === 'string' ? read.picture.trim().slice(0, MAX_SELFIE_CHARS) : '' }
}

/** The prompt a selfie is drawn from: how she looks, what she has on right now, what the LLM said it shows, and where she is at this hour, in its light. */
export function selfieDraft(content: ContentPack, state: GameState, li: LoveInterest, picture: string, framing: string): string {
  const sitter = { appearance: li.appearance, pronouns: li.pronouns, wears: outfitDescription(li.outfits, wornOutfit(content, state, li)) }
  const place = content.locations.find((l) => l.id === locationOf(content, state, li))
  const light = periodAt(content.calendar, toDate(content.calendar, state.time).hour).light
  return postPrompt(sitter, undefined, 'selfie', picture, place, light, framing)
}
