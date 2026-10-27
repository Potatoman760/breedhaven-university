import { SCENE_SHOTS, SHOTS, postPrompt, scenePhotoPrompt, type SceneShot, type Shot } from '../comfy'
import { classYear, outfitDescription, type ContentPack, type GameState, type LoveInterest, type Post, type PostPlan, type Scene } from '../model'
import { formatDate, formatTime, periodAt, toDate } from './calendar'
import { applyEffect } from './conditions'
import { describeEvent, eventsOn } from './events'
import { locationOf, loveInterestsAt } from './map'
import { wornOutfit } from './pregnancy'
import { weatherOn } from './weather'
import { seedOf } from './seed'
import { namesHer } from './scene'
import { t } from '../i18n'

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

/** Who a post by the player is filed under: he is no love interest, and has no id of his own. */
export const PLAYER_POSTER = 'player'
/** The player's name on Bloomr. */
export const PLAYER_HANDLE = '@2Sire2Serious'
// How much of a scene a picture taken in it is written from: its last lines.
const PHOTO_LINES = 10

/** Her name on Bloomr: the one written for her, or one made from her name. */
export function handleOf(li: LoveInterest): string {
  return `@${li.handle?.replace(/^@/, '') || li.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`
}

/** What she is at the University, in a line: "Second-year · Economics". Undefined for an outsider. */
export function describeStudies(li: LoveInterest): string | undefined {
  if (li.studies) {
    const year = classYear(li.studies.level)
    return `${year[0].toUpperCase()}${year.slice(1)} · ${li.studies.subject}`
  }
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
    .map(({ authorId, time, text, image, withId }) => ({ id: `post-${time}-${authorId}`, authorId, time, text: text.trim(), image, withId, liked: false, likeCounted: false, comments: [] }))
    .filter((post, i, all) => !state.feed.some((old) => old.id === post.id) && all.findIndex((other) => other.id === post.id) === i)
  if (added.length === 0) return state
  return { ...state, feed: [...state.feed, ...added].sort((a, b) => a.time - b.time).slice(-MAX_FEED_POSTS) }
}

/**
 * Puts a picture the player took on the feed, as his post, at once, with what those in it said under it. He may take
 * more than one in an hour, so each has an id of its own.
 */
export function addPlayerPost(state: GameState, post: { time: number; text: string; image: string; comments?: Post['comments'] }): GameState {
  let n = 1
  while (state.feed.some((old) => old.id === `post-${post.time}-${PLAYER_POSTER}-${n}`)) n++
  const made: Post = { id: `post-${post.time}-${PLAYER_POSTER}-${n}`, authorId: PLAYER_POSTER, time: post.time, text: post.text.trim(), image: post.image, liked: false, likeCounted: false, comments: post.comments ?? [] }
  return { ...state, feed: [...state.feed, made].sort((a, b) => a.time - b.time).slice(-MAX_FEED_POSTS) }
}

/** Who is in a picture the player takes in a scene: everyone in it with him, and never himself. */
function photographed(content: ContentPack, scene: Pick<Scene, 'loveInterestId' | 'companionIds'>): LoveInterest[] {
  const everyone = [...content.loveInterests, ...content.npcs]
  return [scene.loveInterestId, ...scene.companionIds].flatMap((id) => everyone.find((c) => c.id === id) ?? [])
}

/** The prompt asking the LLM for a picture the player takes in a scene: its caption, how it was taken and what it shows, as a JSON object. */
export function buildScenePhotoPrompt(content: ContentPack, state: GameState, scene: Scene): { system: string; user: string } {
  const player = state.player.name
  const people = photographed(content, scene)
  const names = people.map((li) => li.name.split(' ')[0]).join(', ')
  const system = [
    t('llm.scenePhoto.systemRole', { player }),
    t('llm.scenePhoto.systemReply', { text: '"text"', shot: '"shot"', picture: '"picture"', posed: '"posed"', candid: '"candid"', comments: '"comments"', name: '"name"', player }),
    t('llm.scenePhoto.caption', { player }),
    t('llm.scenePhoto.picture', { names, player, count: people.length }),
    t('llm.scenePhoto.comments', { names, player, count: people.length })
  ].join('\n')
  const place = content.locations.find((l) => l.id === state.locationId)
  const user = [
    t('llm.feed.today', { date: formatDate(toDate(content.calendar, state.time)) }),
    place && t('llm.scenePhoto.place', { name: place.name, description: place.description }),
    ...people.flatMap((li) => [t('llm.scenePhoto.who', { name: li.name, bio: li.bio }), li.ai.speechPattern && t('llm.feed.voice', { text: li.ai.speechPattern })]),
    '',
    t('llm.scenePhoto.lately'),
    ...scene.messages.slice(-PHOTO_LINES).map((m) => (m.role === 'user' ? `${player}: ${m.content}` : m.content))
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n')
  return { system, user }
}

/**
 * What the LLM wrote for the picture: undefined when its reply holds no caption. A comment is kept only from someone in
 * the scene, named as the reply named her, once each and in the order written; one by anybody else is dropped.
 */
export function parseScenePhoto(content: ContentPack, scene: Pick<Scene, 'loveInterestId' | 'companionIds'>, reply: string): { text: string; shot: SceneShot; picture: string; comments: Post['comments'] } | undefined {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end < start) return undefined
  let read: { text?: unknown; shot?: unknown; picture?: unknown; comments?: unknown }
  try {
    read = JSON.parse(reply.slice(start, end + 1)) as typeof read
  } catch {
    return undefined
  }
  const text = typeof read.text === 'string' ? read.text.trim().replace(/^["“]|["”]$/g, '').slice(0, MAX_POST_CHARS) : ''
  if (text === '') return undefined
  const shot = SCENE_SHOTS.find((one) => one === (typeof read.shot === 'string' ? read.shot.trim().toLowerCase() : '')) ?? 'candid'
  const people = photographed(content, scene)
  const comments: Post['comments'] = []
  for (const entry of Array.isArray(read.comments) ? read.comments : []) {
    const { name, text: said } = (entry ?? {}) as { name?: unknown; text?: unknown }
    const who = typeof name === 'string' ? people.find((li) => namesHer(name, li)) : undefined
    const wording = typeof said === 'string' ? said.trim().replace(/^["“]|["”]$/g, '').slice(0, MAX_POST_CHARS) : ''
    if (who && wording && !comments.some((one) => one.authorId === who.id)) comments.push({ authorId: who.id, text: wording })
  }
  return { text, shot, picture: typeof read.picture === 'string' ? read.picture.trim().slice(0, MAX_POST_CHARS) : '', comments }
}

/**
 * The prompt a picture taken in a scene is drawn from: everyone in it as they are dressed in the scene, what the LLM said
 * they are doing, and the place and the light now.
 */
export function scenePhotoDraft(content: ContentPack, state: GameState, scene: Scene, written: { shot: SceneShot; picture: string }, framing: string): string {
  const people = photographed(content, scene)
  const chosen = (id: string) => (id === scene.loveInterestId ? scene.outfitId : scene.looks?.[id]?.outfitId)
  const sitters = people.map((li) => ({ appearance: li.appearance, pronouns: li.pronouns, wears: outfitDescription(li.outfits, wornOutfit(content, state, li, chosen(li.id))) }))
  const place = content.locations.find((l) => l.id === state.locationId)
  const light = periodAt(content.calendar, toDate(content.calendar, state.time).hour).light
  return scenePhotoPrompt(sitters, written.shot, written.picture, place, light, framing)
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
export function toggleLike(content: ContentPack, state: GameState, postId: string): GameState {
  const post = state.feed.find((one) => one.id === postId)
  if (!post) return state
  const counts = !post.liked && !post.likeCounted
  const toggled = { ...state, feed: state.feed.map((one) => (one.id === postId ? { ...one, liked: !one.liked, likeCounted: one.likeCounted || counts } : one)) }
  // Her first like on it warms her to him; taking it back and giving it again does no more.
  return counts ? applyEffect(toggled, { type: 'meter', meter: 'affection', amount: content.relationships.postLike }, { content, loveInterestId: post.authorId }) : toggled
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
    t('llm.feed.systemRole'),
    t('llm.feed.systemReply'),
    t('llm.feed.fieldN', { field: '"n"' }),
    t('llm.feed.fieldText', { field: '"text"' }),
    t('llm.feed.fieldShot', { field: '"shot"', selfie: '"selfie"', candid: '"candid"' }),
    t('llm.feed.fieldPicture', { field: '"picture"' }),
    t('llm.feed.captionRules'),
    t('llm.feed.captionShort'),
    t('llm.feed.captionMoment'),
    t('llm.feed.captionPublic', { player }),
    t('llm.feed.captionNoTags'),
    t('llm.feed.shotRules'),
    t('llm.feed.shotSelfie', { selfie: '"selfie"' }),
    t('llm.feed.shotCandid', { candid: '"candid"' }),
    t('llm.feed.shotVary'),
    t('llm.feed.pictureRules'),
    t('llm.feed.pictureSentence'),
    t('llm.feed.pictureLook'),
    t('llm.feed.pictureNobody'),
    t('llm.feed.pictureVisible'),
    t('llm.feed.pictureNoBodies')
  ].join('\n')

  const weather = weatherOn(content, state)
  const events = eventsOn(content, state).filter((event) => !event.secret)
  const everyone = [...content.loveInterests, ...content.npcs]
  const user = [
    t('llm.feed.today', { date: formatDate(toDate(content.calendar, state.time)) }),
    weather && t('llm.feed.weather', { name: weather.name, description: weather.description }),
    ...events.map((e) => t('llm.feed.event', { name: e.name, description: describeEvent(content, e) }).trim()),
    '',
    t('llm.feed.write', { count: plans.length }),
    ...plans.flatMap((plan, i) => {
      const li = everyone.find((c) => c.id === plan.authorId)
      if (!li) return []
      const where = content.locations.find((l) => l.id === plan.locationId)
      const friend = everyone.find((c) => c.id === plan.withId)
      const last = recentPostsBy(state, li.id, 1)[0]
      return [
        t('llm.feed.post', { n: i + 1, name: li.name, age: li.age, time: formatTime(toDate(content.calendar, plan.time)), bio: li.bio }),
        t('llm.feed.personality', { text: li.personality }),
        li.ai.speechPattern && t('llm.feed.voice', { text: li.ai.speechPattern }),
        t('llm.feed.where', { where: where ? `${where.name}. ${where.description}` : t('llm.feed.atHome') }),
        friend ? t('llm.feed.withFriend', { name: friend.name, bio: friend.bio }) : t('llm.feed.alone'),
        last && t('llm.feed.lastPost', { text: last.text })
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
      ? t('llm.feed.noList')
      : !/\]\s*$/.test(reply.trim())
        ? t('llm.feed.stopped')
        : t('llm.feed.leftOut')
  return t('llm.feed.shortfall', { written: written.length, planned: plans.length, missing: missing.join(', '), why })
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
