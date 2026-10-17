import { SHOTS, postPrompt, type Shot } from '../comfy'
import { outfitDescription, type ContentPack, type GameState, type LoveInterest, type Post, type PostPlan } from '../model'
import { formatDate, formatTime, periodAt, toDate } from './calendar'
import { describeEvent, eventsOn } from './events'
import { locationOf, loveInterestsAt } from './map'
import { wornOutfit } from './pregnancy'
import { weatherOn } from './weather'
import { seedOf } from './seed'

// Nobody posts before breakfast, or once the evening is over.
const POST_HOURS = { from: 8, until: 22 } as const
// The most who post on a given day, and the most each of them does.
const MAX_AUTHORS = 3
const MAX_POSTS_EACH = 2
// How often someone who is there with her is in the selfie too.
const FRIEND_CHANCE = 0.4
// How many posts the feed shows at a time: more are brought in as the reader scrolls down.
export const FEED_PAGE = 5
// Older posts fall off the end of the feed.
const MAX_FEED_POSTS = 200
const MAX_POST_CHARS = 280
// Room for the reply that writes a day's posts: some to think in, and a caption and a picture for each. The profile's own limit is set
// for a line of dialogue, and a day of five posts does not fit in it.
const FEED_TOKENS = { base: 600, each: 250 } as const

/** How many tokens the reply writing these posts is given. */
export function feedReplyTokens(plans: PostPlan[]): number {
  return FEED_TOKENS.base + FEED_TOKENS.each * plans.length
}

const YEAR_NAMES = ['First-year', 'Second-year', 'Third-year', 'Fourth-year', 'Graduate']

/** Her name on Bloomr: the one written for her, or one made from her name. */
export function handleOf(li: LoveInterest): string {
  return `@${li.handle?.replace(/^@/, '') || li.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`
}

/** What she is at the University, in a line: "Second-year · Economics". Undefined for an outsider. */
export function describeStudies(li: LoveInterest): string | undefined {
  if (li.studies) return `${YEAR_NAMES[li.studies.level - 1] ?? 'Student'} · ${li.studies.subject}`
  if (li.teaching) return `${li.teaching.title} · ${li.teaching.department}`
  return undefined
}

/** The feed, newest first: what has gone up so far. A post made ahead of its hour is not on it yet. */
export function feedOf(state: GameState): Post[] {
  return state.feed.filter((post) => post.time <= state.time).reverse()
}

/** How many posts have gone up since he last looked at the feed. */
export function unreadPosts(state: GameState): number {
  return state.feed.filter((post) => post.time <= state.time && post.time > state.feedSeen).length
}

/** Records that he has looked at the feed: everything up so far has been seen. */
export function markFeedSeen(state: GameState): GameState {
  return unreadPosts(state) === 0 ? state : { ...state, feedSeen: state.time }
}

/** Her latest posts, newest first. */
export function recentPostsBy(state: GameState, authorId: string, count = 2): Post[] {
  return feedOf(state)
    .filter((post) => post.authorId === authorId)
    .slice(0, count)
}

/** Files posts on the feed, each to go up at its own time. One with no text is left out, and so is one already there. */
export function addPosts(state: GameState, posts: { authorId: string; time: number; text: string; image?: string; withId?: string }[]): GameState {
  const added: Post[] = posts
    .filter((post) => post.text.trim() !== '')
    .map(({ authorId, time, text, image, withId }) => ({ id: `post-${time}-${authorId}`, authorId, time, text: text.trim(), image, withId, liked: false }))
    .filter((post, i, all) => !state.feed.some((old) => old.id === post.id) && all.findIndex((other) => other.id === post.id) === i)
  if (added.length === 0) return state
  return { ...state, feed: [...state.feed, ...added].sort((a, b) => a.time - b.time).slice(-MAX_FEED_POSTS) }
}

/** One planned post, told from every other: nobody posts twice in an hour. */
export function planKey(plan: { authorId: string; time: number }): string {
  return `${plan.time}:${plan.authorId}`
}

/**
 * Files a planned post now that it has been written and drawn, and takes it off the list of
 * those still to make. One that is no longer planned in this game, because a different one
 * has been loaded since or a new day's round has taken its place, is not filed.
 */
export function postMade(state: GameState, post: { authorId: string; time: number; text: string; image?: string; withId?: string }): GameState {
  if (!state.feedPlans.some((plan) => planKey(plan) === planKey(post))) return state
  return { ...addPosts(state, [post]), feedPlans: state.feedPlans.filter((plan) => planKey(plan) !== planKey(post)) }
}

/** Likes a post, or takes the like back. */
export function toggleLike(state: GameState, postId: string): GameState {
  return { ...state, feed: state.feed.map((post) => (post.id === postId ? { ...post, liked: !post.liked } : post)) }
}

/** A repeatable number in [0, 1) for one draw on one day of one game. */
function roll(seed: number, dayIndex: number, index: number): number {
  let x = (seed ^ Math.imul(dayIndex + 1, 0x51ed270b) ^ Math.imul(index + 1, 0x2545f491)) >>> 0
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39) >>> 0
  return ((x ^ (x >>> 15)) >>> 0) / 0x100000000
}

/** Whether today's posts are still to be planned: once a day, as soon as the day begins. */
export function feedRoundDue(content: ContentPack, state: GameState): boolean {
  return toDate(content.calendar, state.time).dayIndex > state.feedDay
}

/**
 * Today's round: marks it made, and plans the day's posts. One to three of the love
 * interests whose contact he has post, once or twice each, at hours of their own still to
 * come. Where each will be at that hour is worked out now, and now and then someone who
 * will be there with her is in the picture too. With nobody's contact there are none.
 * The plans are kept in the game until each is made; any left over from the day before are let go.
 */
export function feedRound(content: ContentPack, state: GameState): { state: GameState; plans: PostPlan[] } {
  const date = toDate(content.calendar, state.time)
  const seed = state.weatherSeed
  const draw = (index: number) => roll(seed, date.dayIndex, index)
  const known = content.loveInterests
    .map((li) => ({ li, luck: draw(seedOf(li.id)) }))
    .filter(({ li }) => state.contacts.includes(li.id))
    .sort((a, b) => a.luck - b.luck)
  const authors = known.slice(0, 1 + Math.floor(draw(1000) * MAX_AUTHORS)).map(({ li }) => li)

  const hours: number[] = []
  for (let hour = Math.max(POST_HOURS.from, date.hour + 1); hour < Math.min(POST_HOURS.until, content.calendar.hoursPerDay); hour++) hours.push(hour)

  const plans: PostPlan[] = []
  authors.forEach((li, a) => {
    const count = 1 + Math.floor(draw(2000 + a) * MAX_POSTS_EACH)
    const mine = hours
      .map((hour) => ({ hour, luck: draw(3000 + a * 100 + hour) }))
      .sort((x, y) => x.luck - y.luck)
      .slice(0, count)
    for (const { hour } of mine) {
      const time = state.time - date.hour + hour
      const then = { ...state, time }
      const locationId = locationOf(content, then, li)
      const there = locationId ? loveInterestsAt(content, then, locationId).filter((other) => other.id !== li.id) : []
      const friend = draw(4000 + a * 100 + hour) < FRIEND_CHANCE ? there[Math.floor(draw(5000 + a * 100 + hour) * there.length)] : undefined
      plans.push({ authorId: li.id, time, locationId, withId: friend?.id })
    }
  })
  plans.sort((x, y) => x.time - y.time)
  return { state: { ...state, feedDay: date.dayIndex, feedPlans: plans }, plans }
}

/** The prompt asking the LLM to write the day's planned posts: a caption, what kind of picture it is and what it shows, as a JSON array. */
export function buildFeedPrompt(content: ContentPack, state: GameState, plans: PostPlan[]): { system: string; user: string } {
  const player = state.player.name
  const system = [
    'You write social media posts for the characters of a dating sim set at a modern university in a ' +
      'magitech fantasy city, where everyday magic and modern technology exist side by side. Bloomr is the ' +
      'photo feed app every student has on their phone; these are public posts anyone at the University can see. ' +
      'Every post is a picture with a caption: of the character alone, or with the friend named.',
    'Reply with only a JSON array and nothing else, with one object per post, in the order given. Each object has:',
    '- "n": the number of the post',
    '- "text": the caption',
    '- "shot": "selfie" or "candid"',
    '- "picture": what the picture shows',
    'Rules for the caption:',
    "- One or two short sentences, under 40 words, in that character's own voice, typed the way they would type on their phone.",
    '- About that moment of their own day: where they are, what they are doing, eating, complaining about or looking forward to. ' +
      'Use the place, the hour, the weather and the events given where they fit. When a friend is in the picture, say so in passing.',
    `- Public: nothing private, nothing intimate, and never name ${player} or hint at what the two of them have done.`,
    '- No hashtags or emoji unless they suit the character, and then one at most. Do not repeat a last post, and when one character posts twice make the two different.',
    'Rules for the shot:',
    '- "selfie": she holds the phone up and looks into it. Her face and shoulders, and nothing she is doing with her hands.',
    '- "candid": a picture of her doing something, taken by someone out of the frame. She does not hold a phone or look at one.',
    '- Choose whichever suits the caption, and vary them.',
    'Rules for the picture:',
    '- One whole sentence, under 30 words, for an image model, beginning "She is", "He is" or "They are", and with a friend "She and her friend are".',
    '- A selfie: the look on her face. A candid: what she is doing, and the look on her face.',
    '- Nobody else is in it, whatever the caption says of company: alone, only her; with a friend, only the two.',
    '- Only what can be seen. Name nobody: write "she", "he" or "they", and "her friend" for the friend.',
    '- Do not describe bodies, hair, clothes, phones or the place itself: those are added for you.'
  ].join('\n')

  const weather = weatherOn(content, state)
  const events = eventsOn(content, state).filter((event) => !event.secret)
  const everyone = [...content.loveInterests, ...content.npcs]
  const user = [
    `Today is ${formatDate(toDate(content.calendar, state.time))}.`,
    weather && `Weather: ${weather.name}. ${weather.description}`,
    ...events.map((e) => `Today is ${e.name}. ${describeEvent(content, e)}`.trim()),
    '',
    `Write ${plans.length} posts:`,
    ...plans.flatMap((plan, i) => {
      const li = everyone.find((c) => c.id === plan.authorId)
      if (!li) return []
      const where = content.locations.find((l) => l.id === plan.locationId)
      const friend = everyone.find((c) => c.id === plan.withId)
      const last = recentPostsBy(state, li.id, 1)[0]
      return [
        `${i + 1}. ${li.name}, ${li.age}, at ${formatTime(toDate(content.calendar, plan.time))}. ${li.bio}`,
        `   Personality: ${li.personality}`,
        li.ai.speechPattern && `   Voice: ${li.ai.speechPattern}`,
        `   Where: ${where ? `${where.name}. ${where.description}` : 'at home.'}`,
        friend ? `   With a friend: ${friend.name}. ${friend.bio}` : '   Alone.',
        last && `   Last post: ${last.text}`
      ]
    })
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n')
  return { system, user }
}

/** What the LLM wrote for one planned post. */
export interface WrittenPost {
  /** Which of the plans it is for, counting from 0. */
  index: number
  text: string
  /** How the picture was taken. A candid when the reply did not say. */
  shot: Shot
  /** What the picture shows, in words for an image model. */
  picture: string
}

/**
 * Reads the LLM's reply into what it wrote for each plan. Anything malformed, without a
 * caption, numbered for no plan or written twice is dropped; a reply with no JSON array gives none.
 * A reply cut off part-way still gives the posts it finished.
 */
export function parseFeedReply(reply: string, plans: PostPlan[]): WrittenPost[] {
  const start = reply.indexOf('[')
  if (start < 0) return []
  const end = reply.lastIndexOf(']')
  let parsed: unknown
  try {
    parsed = JSON.parse(reply.slice(start, end + 1))
  } catch {
    // Not a whole array: it ran out of room, or has something stray in it. Each object that is whole is still read.
    parsed = (reply.slice(start).match(/{[^{}]*}/g) ?? []).flatMap((object) => {
      try {
        return [JSON.parse(object) as unknown]
      } catch {
        return []
      }
    })
  }
  if (!Array.isArray(parsed)) return []
  const written: WrittenPost[] = []
  for (const entry of parsed) {
    const { n, text, picture, shot } = (entry ?? {}) as { n?: unknown; text?: unknown; picture?: unknown; shot?: unknown }
    const index = Number(n) - 1
    if (!Number.isInteger(index) || index < 0 || index >= plans.length || typeof text !== 'string') continue
    const wording = text.trim().replace(/^["“]|["”]$/g, '').slice(0, MAX_POST_CHARS)
    if (wording && !written.some((post) => post.index === index)) {
      const taken = SHOTS.find((one) => one === (typeof shot === 'string' ? shot.trim().toLowerCase() : ''))
      written.push({ index, text: wording, shot: taken ?? 'candid', picture: typeof picture === 'string' ? picture.trim().slice(0, MAX_POST_CHARS) : '' })
    }
  }
  return written
}

/**
 * When the reply wrote fewer posts than were asked for, what to tell the player: how many, whose are missing, and
 * what seems to have happened to them. Nothing when it wrote them all.
 */
export function feedShortfall(content: ContentPack, reply: string, plans: PostPlan[], written: WrittenPost[]): string | undefined {
  if (written.length >= plans.length) return undefined
  const everyone = [...content.loveInterests, ...content.npcs]
  const missing = plans.filter((_, index) => !written.some((post) => post.index === index)).map((plan) => everyone.find((c) => c.id === plan.authorId)?.name.split(' ')[0] ?? plan.authorId)
  const start = reply.indexOf('[')
  const why =
    start < 0
      ? 'its reply had no list of posts in it'
      : !/\]\s*$/.test(reply.trim())
        ? 'its reply stopped before the end, most likely out of room'
        : 'it left some out, or wrote them in a shape that could not be read'
  return `The LLM wrote ${written.length} of ${plans.length} posts (missing: ${missing.join(', ')}): ${why}.`
}

/** A planned post with its caption written and the prompt its picture is drawn from: all but the picture. */
export interface PostDraft extends PostPlan {
  text: string
  prompt: string
}

/**
 * The posts ready to be drawn, earliest first: each written plan with the prompt for its
 * picture, made from how she and her friend look, what they will be wearing, what the LLM
 * said the picture shows, and the place and the light at that hour.
 */
export function draftPosts(content: ContentPack, state: GameState, plans: PostPlan[], written: WrittenPost[], framing: string): PostDraft[] {
  const everyone = [...content.loveInterests, ...content.npcs]
  const sitter = (id: string | undefined, then: GameState) => {
    const who = everyone.find((c) => c.id === id)
    return who && { appearance: who.appearance, pronouns: who.pronouns, wears: outfitDescription(who.outfits, wornOutfit(content, then, who)) }
  }
  return written
    .flatMap(({ index, text, shot, picture }) => {
      const plan = plans[index]
      const then = { ...state, time: plan.time }
      const author = sitter(plan.authorId, then)
      if (!author) return []
      const place = content.locations.find((l) => l.id === plan.locationId)
      const light = periodAt(content.calendar, toDate(content.calendar, plan.time).hour).light
      return [{ ...plan, text, prompt: postPrompt(author, sitter(plan.withId, then), shot, picture, place, light, framing) }]
    })
    .sort((a, b) => a.time - b.time)
}
