import type { ContentPack, GameState, LoveInterest, Post } from '../model'
import { formatDate, toDate } from './calendar'
import { eventsOn } from './events'
import { locationOf } from './map'
import { weatherOn } from './weather'

// Nobody posts before breakfast.
const FIRST_POST_HOUR = 8
// The chance each love interest posts on a given day, and the most who do.
const POST_CHANCE = 0.3
const MAX_POSTS_PER_DAY = 3
// Older posts fall off the end of the feed.
const MAX_FEED_POSTS = 200
const MAX_POST_CHARS = 280

const YEAR_NAMES = ['First-year', 'Second-year', 'Third-year', 'Fourth-year', 'Graduate']

/** Her name on Bloomr and Chats: the one written for her, or one made from her name. */
export function handleOf(li: LoveInterest): string {
  return `@${li.handle?.replace(/^@/, '') || li.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`
}

/** What she is at the University, in a line: "Second-year · Economics". Undefined for an outsider. */
export function describeStudies(li: LoveInterest): string | undefined {
  if (li.studies) return `${YEAR_NAMES[li.studies.level - 1] ?? 'Student'} · ${li.studies.subject}`
  if (li.teaching) return `${li.teaching.title} · ${li.teaching.department}`
  return undefined
}

/** The feed, newest first. */
export function feedOf(state: GameState): Post[] {
  return [...state.feed].reverse()
}

/** Her latest posts, newest first. */
export function recentPostsBy(state: GameState, authorId: string, count = 2): Post[] {
  return feedOf(state)
    .filter((post) => post.authorId === authorId)
    .slice(0, count)
}

/** Puts new posts on the feed at the current game time. One with no text is left out. */
export function addPosts(state: GameState, posts: { authorId: string; text: string; image?: string }[]): GameState {
  const added: Post[] = posts
    .filter((post) => post.text.trim() !== '')
    .map((post) => ({ ...post, text: post.text.trim(), id: `post-${state.time}-${post.authorId}`, time: state.time, liked: false }))
    .filter((post) => !state.feed.some((old) => old.id === post.id))
  if (added.length === 0) return state
  return { ...state, feed: [...state.feed, ...added].slice(-MAX_FEED_POSTS) }
}

/** Likes a post, or takes the like back. */
export function toggleLike(state: GameState, postId: string): GameState {
  return { ...state, feed: state.feed.map((post) => (post.id === postId ? { ...post, liked: !post.liked } : post)) }
}

/** A repeatable number in [0, 1) for one love interest on one day of one game. */
function roll(seed: number, dayIndex: number, index: number): number {
  let x = (seed ^ Math.imul(dayIndex + 1, 0x51ed270b) ^ Math.imul(index + 1, 0x2545f491)) >>> 0
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39) >>> 0
  return ((x ^ (x >>> 15)) >>> 0) / 0x100000000
}

/** Whether today's posts are still to be written. */
export function feedRoundDue(content: ContentPack, state: GameState): boolean {
  const date = toDate(content.calendar, state.time)
  return date.dayIndex > state.feedDay && date.hour >= FIRST_POST_HOUR
}

/**
 * Today's round: marks it made, and names the love interests who post today. A few at
 * most, and always someone, so the feed is never dead.
 */
export function feedRound(content: ContentPack, state: GameState): { state: GameState; authorIds: string[] } {
  const { dayIndex } = toDate(content.calendar, state.time)
  const rolled = content.loveInterests
    .map((li, index) => ({ id: li.id, luck: roll(state.weatherSeed, dayIndex, index) }))
    .sort((a, b) => a.luck - b.luck)
  const keen = rolled.filter(({ luck }) => luck < POST_CHANCE).slice(0, MAX_POSTS_PER_DAY)
  const authors = keen.length > 0 ? keen : rolled.slice(0, 1)
  return { state: { ...state, feedDay: dayIndex }, authorIds: authors.map(({ id }) => id) }
}

/** A plain post made without the LLM: where she is. */
export function fallbackPost(content: ContentPack, state: GameState, authorId: string): string {
  const li = content.loveInterests.find((c) => c.id === authorId)
  const where = li && content.locations.find((l) => l.id === locationOf(content, state, li))
  return where ? `At ${where.name} today.` : 'Quiet day.'
}

/** The prompt asking the LLM to write today's posts for the given love interests, as a JSON array. */
export function buildFeedPrompt(content: ContentPack, state: GameState, authorIds: string[]): { system: string; user: string } {
  const player = state.player.name
  const system = [
    'You write social media posts for the characters of a dating sim set at a modern university in a ' +
      'magitech fantasy city, where everyday magic and modern technology exist side by side. Bloomr is the ' +
      'feed app every student has on their phone; these are public posts anyone at the University can read.',
    'Reply with only a JSON array and nothing else, with one object per character, in the order given. Each object has:',
    '- "id": the character id given',
    '- "text": the post',
    'Rules:',
    '- One or two short sentences, under 40 words, in that character\'s own voice, typed the way she would type on her phone.',
    '- About her own day: where she is, what she is doing, studying, eating, complaining about or looking forward to. ' +
      'Use the place, the weather and the events given where they fit.',
    `- Public: nothing private, nothing intimate, and never name ${player} or hint at what the two of them have done.`,
    '- No hashtags or emoji unless they suit her, and then one at most. Do not repeat her last post.'
  ].join('\n')

  const weather = weatherOn(content, state)
  const events = eventsOn(content, state)
  const user = [
    `Today is ${formatDate(toDate(content.calendar, state.time))}.`,
    weather && `Weather: ${weather.name}. ${weather.description}`,
    ...events.map((e) => `Today is ${e.name}. ${e.description}`.trim()),
    '',
    `Write ${authorIds.length} posts:`,
    ...authorIds.flatMap((id, i) => {
      const li = content.loveInterests.find((c) => c.id === id)
      if (!li) return []
      const where = content.locations.find((l) => l.id === locationOf(content, state, li))
      const last = recentPostsBy(state, id, 1)[0]
      return [
        `${i + 1}. id "${li.id}": ${li.name}, ${li.age}. ${li.bio}`,
        `   Personality: ${li.personality}`,
        li.ai.speechPattern && `   Voice: ${li.ai.speechPattern}`,
        `   Right now: ${where ? `at ${where.name}. ${where.description}` : 'at home.'}`,
        last && `   Her last post: ${last.text}`
      ]
    })
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n')
  return { system, user }
}

/**
 * Reads the LLM's reply into posts for the authors asked for. Anything malformed, empty
 * or for someone else is dropped; a reply with no JSON array gives none.
 */
export function parseFeedReply(reply: string, authorIds: string[]): { authorId: string; text: string }[] {
  const start = reply.indexOf('[')
  const end = reply.lastIndexOf(']')
  if (start < 0 || end < start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(reply.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const posts: { authorId: string; text: string }[] = []
  for (const entry of parsed) {
    const { id, text } = (entry ?? {}) as { id?: unknown; text?: unknown }
    if (typeof id !== 'string' || typeof text !== 'string') continue
    const wording = text.trim().replace(/^["“]|["”]$/g, '').slice(0, MAX_POST_CHARS)
    if (wording && authorIds.includes(id) && !posts.some((post) => post.authorId === id)) {
      posts.push({ authorId: id, text: wording })
    }
  }
  return posts
}
