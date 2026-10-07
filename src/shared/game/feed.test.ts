import { describe, expect, it } from 'vitest'
import {
  addPosts,
  buildFeedPrompt,
  describeStudies,
  fallbackPost,
  feedOf,
  feedRound,
  feedRoundDue,
  handleOf,
  parseFeedReply,
  recentPostsBy,
  toggleLike
} from './feed'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { fixture } from './testFixture'

const content = fixture()
const start = createInitialState(content)
const ana = content.loveInterests[0]

describe('the feed', () => {
  it('names people by their handle, or one made from their name', () => {
    expect(handleOf({ ...ana, name: 'Ana Maria Vey' })).toBe('@ana_maria_vey')
    expect(handleOf({ ...ana, handle: '@ana.reads' })).toBe('@ana.reads')
    expect(describeStudies({ ...ana, studies: { subject: 'Law', code: 'LAW', level: 2, stats: ['charisma'], practical: false }, teaching: undefined })).toBe(
      'Second-year · Law'
    )
  })

  it('keeps posts newest first, once each, and remembers a like', () => {
    const first = addPosts(start, [{ authorId: ana.id, text: ' Rain again. ' }, { authorId: ana.id, text: '   ' }])
    expect(first.feed).toHaveLength(1)
    expect(addPosts(first, [{ authorId: ana.id, text: 'Rain again.' }])).toBe(first)
    const later = addPosts({ ...first, time: 30 }, [{ authorId: ana.id, text: 'Sun.' }])
    expect(feedOf(later).map((post) => post.text)).toEqual(['Sun.', 'Rain again.'])
    expect(recentPostsBy(later, ana.id, 1).map((post) => post.text)).toEqual(['Sun.'])

    const liked = toggleLike(later, later.feed[0].id)
    expect(liked.feed.map((post) => post.liked)).toEqual([true, false])
    expect(toggleLike(liked, later.feed[0].id).feed[0].liked).toBe(false)
    expect(buildCharacterPrompt({ content, state: liked, loveInterestId: ana.id })).toContain(`Rain again. (${start.player.name} liked this)`)
  })

  it('has a few people post once a day, and always someone', () => {
    const morning = { ...start, time: 3 }
    expect(feedRoundDue(content, { ...start, time: 0, feedDay: -1 })).toBe(toHour(0) >= 8)
    const round = feedRound(content, morning)
    expect(round.state.feedDay).toBe(0)
    expect(feedRoundDue(content, round.state)).toBe(false)
    expect(feedRound(content, morning).authorIds).toEqual(round.authorIds)
    for (let seed = 0; seed < 50; seed++) {
      const { authorIds } = feedRound(content, { ...morning, weatherSeed: seed })
      expect(authorIds.length).toBeGreaterThan(0)
      expect(authorIds.length).toBeLessThanOrEqual(3)
    }
  })

  it('asks for posts as JSON and reads back only those asked for', () => {
    const { system, user } = buildFeedPrompt(content, start, [ana.id])
    expect(system).toContain(`never name ${start.player.name}`)
    expect(user).toContain(`1. id "${ana.id}": ${ana.name}`)

    const reply = `Here you go: [{"id":"${ana.id}","text":"\\"Library till close.\\""},{"id":"nobody","text":"x"},{"id":"${ana.id}","text":"again"},{"text":"no id"}]`
    expect(parseFeedReply(reply, [ana.id])).toEqual([{ authorId: ana.id, text: 'Library till close.' }])
    expect(parseFeedReply('no json here', [ana.id])).toEqual([])
    expect(fallbackPost(content, start, ana.id)).toMatch(/^(At .+ today\.|Quiet day\.)$/)
  })
})

/** The hour of the day at the given game time. */
function toHour(time: number): number {
  return (content.calendar.start.hour + time) % content.calendar.hoursPerDay
}
