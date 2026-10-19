import { describe, expect, it } from 'vitest'
import { CourseSchema, CourseworkConfigSchema, ItemSchema, OrientationSchema, type ContentPack } from '../model'
import { dayAgenda, timeOn } from './agenda'
import { acceptProposal } from './appointments'
import { describeLearned, factsFromGift, factsOf, hiddenFacts, revealedIds, revealFacts } from './facts'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Ana as the fixture has her (shy, with a secret she shares only with a friend), given
// tastes, a subject and a room.
const base = fixture()
const content: ContentPack = {
  ...base,
  loveInterests: [
    {
      ...base.loveInterests[0],
      likes: ['tea', 'Old Maps'],
      dislikes: ['cards'],
      admires: ['wisdom'],
      studies: { subject: 'Riddles', code: 'RID', level: 2, stats: ['wisdom'], practical: false },
      room: { name: 'a loft over the shop', description: 'Books everywhere.', locationId: 'shop' }
    }
  ]
}
const [ana] = content.loveInterests
const state = createInitialState(content)

describe('what there is to know about a love interest', () => {
  it('is drawn from her file, a fact for each thing', () => {
    expect(factsOf(content, ana).map((fact) => [fact.id, fact.group, fact.label])).toEqual([
      ['like:tea', 'likes', 'tea'],
      ['like:old-maps', 'likes', 'Old Maps'],
      ['dislike:cards', 'dislikes', 'cards'],
      ['trait:shy', 'traits', 'Shy'],
      ['admires:wisdom', 'admires', 'wisdom'],
      ['studies', 'life', 'Riddles major, sophomore'],
      ['age', 'life', '25 years old'],
      ['room', 'life', 'Lives in a loft over the shop, at the Shop'],
      ['secret:0', 'secrets', 'Is secretly a dragon.']
    ])
    expect(factsOf(content, ana).find((fact) => fact.id === 'like:tea')?.telling).toBe('Ana likes tea')
  })

  it('starts unknown, and a secret cannot come out until she is ready to share it', () => {
    expect(revealedIds(state, 'ana')).toEqual([])
    expect(hiddenFacts(content, state, ana).map((fact) => fact.id)).not.toContain('secret:0')
    const friends = { ...state, relationships: { ana: { affection: 40, trust: 0, desire: 0 } } }
    expect(hiddenFacts(content, friends, ana).map((fact) => fact.id)).toContain('secret:0')
  })

  it('is revealed fact by fact, once each, and only if it is really hers', () => {
    const told = revealFacts(content, state, 'ana', ['like:tea', 'like:tea', 'like:coffee', 'trait:shy'])
    expect(revealedIds(told, 'ana')).toEqual(['like:tea', 'trait:shy'])
    expect(hiddenFacts(content, told, ana).map((fact) => fact.id)).not.toContain('like:tea')
    expect(revealFacts(content, told, 'ana', ['like:tea'])).toBe(told)
    expect(revealFacts(content, state, 'nobody', ['like:tea'])).toBe(state)
    expect(describeLearned(content, 'ana', 'like:tea')).toBe('Ana likes tea')
    expect(describeLearned(content, 'ana', 'dislike:cards')).toBe('Ana dislikes cards')
    expect(describeLearned(content, 'ana', 'trait:shy')).toBe('Ana is shy')
    expect(describeLearned(content, 'ana', 'nothing')).toBeUndefined()
  })

  it('is given away by how a gift lands', () => {
    const item = (tags: string[]) => ItemSchema.parse({ id: 'x', name: 'X', price: 1, tags })
    expect(factsFromGift(ana, item(['Tea']))).toEqual(['like:tea'])
    expect(factsFromGift(ana, item(['cards']))).toEqual(['dislike:cards'])
    expect(factsFromGift(ana, item(['soap']))).toEqual([])
    // Something she both likes and dislikes about is merely accepted, and tells nothing.
    expect(factsFromGift(ana, item(['tea', 'cards']))).toEqual([])
  })
})

describe('the day\'s agenda', () => {
  // The fixture's week is One, Two, Three on a 20-hour day; the game starts on a Two at 06:00.
  const term: ContentPack = {
    ...content,
    coursework: CourseworkConfigSchema.parse({ weekdays: ['Two', 'Three'], locationId: 'shop' }),
    orientation: OrientationSchema.parse({ steps: [{ id: 'assembly', name: 'the Assembly', locationId: 'shop', startHour: 9, hours: 2 }] })
  }
  const course = CourseSchema.parse({
    id: 'c1',
    number: 'RID 101',
    title: 'Riddles',
    professor: 'Prof. Q',
    subject: 'Riddles',
    code: 'RID',
    level: 1,
    locationId: 'shop',
    meetings: [{ weekday: 'Three', startHour: 8, hours: 3, kind: 'lecture' }]
  })
  const enrolled = { ...createInitialState(term), courses: [course], enrolment: ['c1'] }

  it('counts the hours of a day from the hour the game began', () => {
    expect(timeOn(term, 0, 6)).toBe(0)
    expect(timeOn(term, 1, 8)).toBe(22)
  })

  it('lists whole-day things first, then what falls at an hour, in order', () => {
    // Day 1 is a Three: the class meets. A plan is made for later that day.
    const planned = acceptProposal(enrolled, { loveInterestId: 'ana', companionIds: [], title: 'Tea', time: timeOn(term, 1, 14), hours: 2, locationId: 'home' })
    expect(dayAgenda(term, planned, 1).map((item) => [item.kind, item.title, item.startHour, item.hours])).toEqual([
      ['class', 'RID 101 Riddles', 8, 3],
      ['plan', 'Tea with Ana', 14, 2]
    ])
    // The fixture's feast is on the first of month B: day 2 of the game.
    expect(dayAgenda(term, enrolled, 2).map((item) => [item.kind, item.title, item.startHour])).toEqual([['event', 'the Feast', undefined]])
  })

  it('shows orientation on its day, and no class even if one would meet', () => {
    const onDayOne = { ...enrolled, courses: [{ ...course, meetings: [{ weekday: 'Two', startHour: 8, hours: 3, kind: 'lecture' as const }] }] }
    expect(dayAgenda(term, onDayOne, 0).map((item) => [item.kind, item.title, item.startHour])).toEqual([['orientation', 'the Assembly', 9]])
    // The next Two, a week of three days on, has the class.
    expect(dayAgenda(term, onDayOne, 3).map((item) => item.kind)).toEqual(['class'])
  })

  it('knows nothing of classes or plans outside the game', () => {
    expect(dayAgenda(term, enrolled, -2)).toEqual([])
    expect(dayAgenda(term, enrolled, term.calendar.lengthDays + 1).every((item) => item.kind === 'event')).toBe(true)
  })

  it('marks the day a child is due', () => {
    const expecting = { ...enrolled, pregnancies: { ana: { conceivedAt: 0, dueAt: timeOn(term, 4, 10) } } }
    expect(dayAgenda(term, expecting, 4).map((item) => [item.kind, item.title])).toContainEqual(['birth', 'Ana is due'])
  })
})
