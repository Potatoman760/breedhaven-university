import { describe, expect, it } from 'vitest'
import {
  addPosts,
  buildFeedPrompt,
  describeStudies,
  draftPosts,
  feedOf,
  feedReplyTokens,
  feedRound,
  feedRoundDue,
  handleOf,
  markFeedSeen,
  unreadPosts,
  parseFeedReply,
  postMade,
  recentPostsBy,
  toggleLike
} from './feed'
import type { ContentPack } from '../model'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Ana keeps the shop by day; Bea is always at home.
const base = fixture()
const ana = { ...base.loveInterests[0], appearance: 'A tall woman with short black hair' }
const bea = { ...ana, id: 'bea', name: 'Bea Stone', appearance: 'A small woman with long red curls', schedule: [{ locationId: 'home' }] }
const content: ContentPack = { ...base, loveInterests: [ana, bea] }
const start = createInitialState(content)

describe('the feed', () => {
  it('names people by their handle, or one made from their name', () => {
    expect(handleOf({ ...ana, name: 'Ana Maria Vey' })).toBe('@ana_maria_vey')
    expect(handleOf({ ...ana, handle: '@ana.reads' })).toBe('@ana.reads')
    expect(describeStudies({ ...ana, studies: { subject: 'Law', code: 'LAW', level: 2, stats: ['charisma'], practical: false }, teaching: undefined })).toBe(
      'Second-year · Law'
    )
  })

  it('keeps posts newest first, once each, and remembers a like', () => {
    const first = addPosts(start, [
      { authorId: ana.id, time: 0, text: ' Rain again. ' },
      { authorId: ana.id, time: 1, text: '   ' }
    ])
    expect(first.feed).toHaveLength(1)
    expect(addPosts(first, [{ authorId: ana.id, time: 0, text: 'Rain again.' }])).toBe(first)
    const later = addPosts({ ...first, time: 30 }, [{ authorId: ana.id, time: 30, text: 'Sun.', image: 'addons/generated/photos/ana/a.png', withId: 'bea' }])
    expect(feedOf(later).map((post) => post.text)).toEqual(['Sun.', 'Rain again.'])
    expect(feedOf(later)[0]).toMatchObject({ image: 'addons/generated/photos/ana/a.png', withId: 'bea' })
    expect(recentPostsBy(later, ana.id, 1).map((post) => post.text)).toEqual(['Sun.'])

    const liked = toggleLike(later, later.feed[0].id)
    expect(liked.feed.map((post) => post.liked)).toEqual([true, false])
    expect(toggleLike(liked, later.feed[0].id).feed[0].liked).toBe(false)
    expect(buildCharacterPrompt({ content, state: liked, loveInterestId: ana.id })).toContain(`Rain again. (${start.player.name} liked this)`)
  })

  it('holds a post made ahead of its hour back until that hour has come', () => {
    const filed = addPosts(start, [
      { authorId: ana.id, time: 5, text: 'Later.' },
      { authorId: ana.id, time: 2, text: 'Sooner.' }
    ])
    expect(filed.feed.map((post) => post.text)).toEqual(['Sooner.', 'Later.'])
    expect(feedOf(filed)).toEqual([])
    expect(feedOf({ ...filed, time: 2 }).map((post) => post.text)).toEqual(['Sooner.'])
    expect(recentPostsBy({ ...filed, time: 2 }, ana.id).map((post) => post.text)).toEqual(['Sooner.'])
    expect(feedOf({ ...filed, time: 5 }).map((post) => post.text)).toEqual(['Later.', 'Sooner.'])
  })

  it('counts what has gone up since he last looked, and forgets the count once he has', () => {
    const filed = addPosts(start, [
      { authorId: ana.id, time: 2, text: 'Sooner.' },
      { authorId: ana.id, time: 5, text: 'Later.' }
    ])
    // Nothing is new until it is up.
    expect(unreadPosts(filed)).toBe(0)
    expect(unreadPosts({ ...filed, time: 2 })).toBe(1)
    expect(unreadPosts({ ...filed, time: 6 })).toBe(2)
    const seen = markFeedSeen({ ...filed, time: 2 })
    expect(seen.feedSeen).toBe(2)
    expect(unreadPosts(seen)).toBe(0)
    // The later one is new again when its hour comes.
    expect(unreadPosts({ ...seen, time: 6 })).toBe(1)
    expect(markFeedSeen(seen)).toBe(seen)
  })

  it('plans the day as it begins: one to three of those whose contact he has, at hours still to come', () => {
    const everyone = { ...start, feedDay: -1, contacts: content.loveInterests.map((li) => li.id) }
    expect(feedRoundDue(content, everyone)).toBe(true)
    const round = feedRound(content, everyone)
    expect(round.state.feedDay).toBe(0)
    expect(round.state.feedPlans).toEqual(round.plans)
    expect(feedRoundDue(content, round.state)).toBe(false)
    expect(feedRound(content, everyone).plans).toEqual(round.plans)

    for (let seed = 0; seed < 50; seed++) {
      const { plans } = feedRound(content, { ...everyone, weatherSeed: seed })
      const authors = new Set(plans.map((plan) => plan.authorId))
      expect(authors.size).toBeGreaterThanOrEqual(1)
      expect(authors.size).toBeLessThanOrEqual(3)
      expect(plans.length).toBeLessThanOrEqual(6)
      expect(new Set(plans.map((plan) => `${plan.authorId}@${plan.time}`)).size).toBe(plans.length)
      expect(plans.map((plan) => plan.time)).toEqual([...plans.map((plan) => plan.time)].sort((a, b) => a - b))
      for (const plan of plans) {
        // Today, later than now, and not before breakfast.
        expect(plan.time).toBeGreaterThan(everyone.time)
        expect(toHour(plan.time)).toBeGreaterThanOrEqual(8)
        expect(Math.floor((content.calendar.start.hour + plan.time) / content.calendar.hoursPerDay)).toBe(0)
        expect(plan.withId).not.toBe(plan.authorId)
      }
    }
  })

  it('keeps the plans with the game until each is made, and files only what is still planned', () => {
    const planned = feedRound(content, { ...start, feedDay: -1, contacts: [ana.id] }).state
    const [first, ...rest] = planned.feedPlans
    const made = postMade(planned, { ...first, text: 'Rain.', image: 'a.png' })
    expect(made.feed.map((post) => post.time)).toEqual([first.time])
    expect(made.feedPlans).toEqual(rest)
    // The same one again, or one from a game that never planned it, changes nothing.
    expect(postMade(made, { ...first, text: 'Rain.', image: 'a.png' })).toBe(made)
    expect(postMade({ ...start, feedPlans: [] }, { ...first, text: 'Rain.' })).toMatchObject({ feed: [] })
    // The next day's round lets go of what was never made.
    const next = feedRound(content, { ...planned, time: planned.time + content.calendar.hoursPerDay })
    expect(next.state.feedPlans).toEqual(next.plans)
    expect(next.plans.every((plan) => plan.time > planned.time + 1)).toBe(true)
  })

  it('has nobody post whose contact he does not have', () => {
    expect(feedRound(content, { ...start, contacts: [] }).plans).toEqual([])
    for (let seed = 0; seed < 20; seed++) {
      const { plans } = feedRound(content, { ...start, contacts: [ana.id], weatherSeed: seed })
      expect(plans.length).toBeGreaterThan(0)
      expect(plans.every((plan) => plan.authorId === ana.id)).toBe(true)
    }
  })

  it('asks for a caption and a picture for each plan, and reads back only those asked for', () => {
    const plans = [
      { authorId: ana.id, time: 3, locationId: 'shop' },
      { authorId: ana.id, time: 6, locationId: 'home', withId: bea.id }
    ]
    const { system, user } = buildFeedPrompt(content, start, plans)
    expect(system).toContain(`never name ${start.player.name}`)
    expect(user).toContain(`1. ${ana.name}`)
    expect(user).toContain('Where: the Shop')
    expect(user).toContain('A selfie alone.')
    expect(user).toContain(`A selfie with a friend: ${bea.name}`)

    const reply = `Here: [{"n":2,"text":"\\"Tea with B.\\"","picture":"they hold up two cups"},{"n":9,"text":"x"},{"n":2,"text":"again"},{"text":"no number"},{"n":1,"text":"Open late."}]`
    const written = parseFeedReply(reply, plans)
    expect(written).toEqual([
      { index: 1, text: 'Tea with B.', picture: 'they hold up two cups' },
      { index: 0, text: 'Open late.', picture: '' }
    ])
    expect(parseFeedReply('no json here', plans)).toEqual([])

    const drafts = draftPosts(content, start, plans, written, 'candid phone photo')
    expect(drafts.map((draft) => draft.text)).toEqual(['Open late.', 'Tea with B.'])
    expect(drafts[0].prompt).toContain("A selfie taken at arm's length")
    expect(drafts[0].prompt).toContain(ana.appearance)
    expect(drafts[0].prompt).toContain('a red dress')
    expect(drafts[0].prompt).toContain('candid phone photo')
    expect(drafts[1].prompt).toContain('A selfie of two friends')
    expect(drafts[1].prompt).toContain(bea.appearance)
    expect(drafts[1].prompt).toContain('What the two of them are doing in the picture: they hold up two cups.')
    // A selfie alone says so, so that what it shows is not drawn as somebody else; and one with nothing said of it says nothing.
    expect(drafts[0].prompt).toContain('One person only: she is alone in the picture, with nobody else anywhere in it.')
    expect(drafts[0].prompt).not.toContain('doing as she takes it')
    const alone = draftPosts(content, start, [plans[0]], [{ index: 0, text: 'x', picture: 'She is grinning at the rain' }], '')
    expect(alone[0].prompt).toContain('What she is doing as she takes it, the same person as above: She is grinning at the rain.')
    expect(drafts[1].prompt).toContain('Only the two of them are in the picture.')
    expect(drafts[1]).toMatchObject({ authorId: ana.id, time: 6, withId: bea.id })
  })
})

/** The hour of the day at the given game time. */
function toHour(time: number): number {
  return (content.calendar.start.hour + time) % content.calendar.hoursPerDay
}

describe('a reply that ran out of room', () => {
  const plans = [1, 2, 3, 4, 5].map((time) => ({ authorId: 'ana', time }))

  it('is given room for every post asked for, and still gives the posts it finished', () => {
    expect(feedReplyTokens(plans)).toBeGreaterThanOrEqual(1800)
    expect(feedReplyTokens(plans)).toBeGreaterThan(feedReplyTokens(plans.slice(0, 1)))
    const cut = '[{"n":1,"text":"Rain again.","picture":"she holds up a cup"}, {"n":2,"text":"Late.","picture":"she runs"}, {"n":3,"text":"Half a th'
    expect(parseFeedReply(cut, plans).map((post) => [post.index, post.text])).toEqual([[0, 'Rain again.'], [1, 'Late.']])
    expect(parseFeedReply('no posts today', plans)).toEqual([])
  })
})
