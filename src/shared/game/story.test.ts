import { describe, expect, it } from 'vitest'
import { StoryBeatSchema, type ContentPack, type GameState } from '../model'
import { answerInvite, courierThread } from './courier'
import { toDate } from './calendar'
import { attendStory, sendStoryInvitation, storyFlag } from './story'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Ana has a beat at Friend and one at Lover, each with a cutscene of one line; the Lover beat has all three tellings.
// Her thanks for their child are about the child, by the words put in for it.
const telling = (line: string, direction: string) => ({ cutscene: { speakerId: 'ana', scenes: [{ locationId: 'home', lines: [line] }] }, direction })
const base = fixture()
const content: ContentPack = {
  ...base,
  loveInterests: base.loveInterests.map((li) => ({ ...li, birthControl: true })),
  story: {
    ana: [
      StoryBeatSchema.parse({ stage: 'friend', invitation: 'Come to the shop.', locationId: 'shop', startHour: 10, hours: 2, ...telling('A friend.', 'As friends.'), effects: [{ type: 'meter', meter: 'trust', amount: 10 }] }),
      StoryBeatSchema.parse({
        stage: 'lover',
        invitation: 'Come home.',
        locationId: 'home',
        inHerRoom: true,
        startHour: 12,
        hours: 2,
        ...telling('A lover.', 'First time.'),
        ifIntimate: telling('Again.', 'Lovers already.'),
        ifUnprotected: telling('Only love.', 'A confession.'),
        stopsBirthControl: true
      }),
      StoryBeatSchema.parse({ stage: 'thriving', invitation: 'Come and see {child}.', locationId: 'home', startHour: 18, hours: 1, ...telling('Look at {child}: {they} smiled. Look at {them}, and {their} cheeks.', 'About {child}.'), effects: [] })
    ]
  }
}

/** The game at the given affection with Ana, her Bloomr his, at 09:00 of the first day. */
function at(affection: number): GameState {
  const start = createInitialState(content)
  const nine = 9 - toDate(content.calendar, start.time).hour
  return { ...start, time: start.time + nine, contacts: ['ana'], relationships: { ...start.relationships, ana: { affection, trust: 20, desire: 20 } } }
}

/** Accepts her invitation and goes to it, at its hour and place. */
function keep(state: GameState): ReturnType<typeof attendStory> {
  const thread = courierThread(state, 'ana')
  const accepted = answerInvite(content, state, 'ana', thread.length - 1, true)
  const plan = accepted.appointments.find((a) => a.story !== undefined)!
  return attendStory(content, { ...accepted, time: plan.time, locationId: plan.locationId }, plan.id)
}

describe('story beats', () => {
  it('are asked for once her stage is reached and he has her Bloomr, by a note from her that is a beat and not an ordinary plan', () => {
    expect(sendStoryInvitation(content, at(10))).toBeUndefined()
    expect(sendStoryInvitation(content, { ...at(40), contacts: [] })).toBeUndefined()
    const asked = sendStoryInvitation(content, at(40))!
    const note = courierThread(asked, 'ana').at(-1)!
    expect(note).toMatchObject({ from: 'them', text: 'Come to the shop.', read: false, proposal: { story: 'friend', locationId: 'shop', hours: 2 } })
    expect(toDate(content.calendar, note.proposal!.time).hour).toBe(10)
    expect(asked.flags[storyFlag('ana', 'friend')]).toBe(true)
  })

  it('are asked one at a time, in her order, and never twice, whatever he did with the last', () => {
    const asked = sendStoryInvitation(content, at(90))!
    // Lover is reached, but Friend comes first.
    expect(courierThread(asked, 'ana').at(-1)!.proposal!.story).toBe('friend')
    expect(sendStoryInvitation(content, asked)).toBeUndefined()
    const declined = answerInvite(content, asked, 'ana', courierThread(asked, 'ana').length - 1, false)
    expect(courierThread(sendStoryInvitation(content, declined)!, 'ana').at(-1)!.proposal!.story).toBe('lover')
  })

  it('read the cutscene and open her scene on the beat, doing what it does', () => {
    const told = keep(sendStoryInvitation(content, at(40))!)
    expect(told.cutscene.scenes[0].lines).toEqual(['A friend.'])
    expect(told.scene).toMatchObject({ loveInterestId: 'ana', companionIds: [], beats: [{ direction: 'As friends.' }] })
    expect(told.scene.roomOf).toBeUndefined()
    expect(told.state.relationships.ana.trust).toBe(30)
    expect(told.state.appointments).toEqual([])
  })

  it('ask her thanks for their child kept thriving a month ahead of any stage, once, with the child named in them', () => {
    const child = { motherId: 'ana', bornAt: 0, daughter: true, name: 'Ada', health: 3, thrivingWeeks: 4 }
    expect(sendStoryInvitation(content, { ...at(10), children: [{ ...child, thrivingWeeks: 3 }] })).toBeUndefined()
    const asked = sendStoryInvitation(content, { ...at(10), children: [child] })!
    expect(courierThread(asked, 'ana').at(-1)!.proposal!.story).toBe('thriving')
    const told = keep(asked)
    expect(told.cutscene.scenes[0].lines).toEqual(['Look at Ada: she smiled. Look at her, and her cheeks.'])
    expect(told.scene.beats[0].direction).toBe('About Ada.')
    expect(sendStoryInvitation(content, told.state)).toBeUndefined()
    // A stage reached meanwhile is asked after, in her order.
    expect(courierThread(sendStoryInvitation(content, { ...told.state, relationships: { ...told.state.relationships, ana: { affection: 40, trust: 20, desire: 20 } } })!, 'ana').at(-1)!.proposal!.story).toBe('friend')
  })

  it('tell the Lover beat as it is for them: first time, lovers already, or one already unprotected', () => {
    const due = (state: GameState) => sendStoryInvitation(content, { ...state, flags: { [storyFlag('ana', 'friend')]: true } })!
    const first = keep(due(at(90)))
    expect(first.scene.beats[0].direction).toBe('First time.')
    expect(first.scene.roomOf).toBe('ana')
    expect(first.state.offBirthControl).toEqual(['ana'])
    expect(keep(due({ ...at(90), timesIntimate: { ana: 2 } })).scene.beats[0].direction).toBe('Lovers already.')
    const off = keep(due({ ...at(90), timesIntimate: { ana: 2 }, offBirthControl: ['ana'] }))
    expect(off.scene.beats[0].direction).toBe('A confession.')
    expect(off.cutscene.scenes[0].lines).toEqual(['Only love.'])
    expect(keep(due({ ...at(90), pregnancies: { ana: { conceivedAt: 0, dueAt: 500 } } })).scene.beats[0].direction).toBe('A confession.')
  })
})
