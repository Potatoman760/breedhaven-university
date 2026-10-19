import { describe, expect, it } from 'vitest'
import { validateContentPack, type ContentPack, type GameState } from '../model'
import { dayAgenda } from './agenda'
import { locationOf } from './map'
import { attendSociety, canAttendSociety, canJoinSociety, eventGate, joinSociety, leaveSociety, meetingsAttended, nextMeeting, societiesOpen, societyMeetingNow } from './societies'
import { createInitialState } from './state'
import { rawFixture } from './testFixture'
import { nextUp } from './upcoming'

// The fixture's week is One, Two, Three on a 20-hour day that starts at 06:00, and the game begins on a Two: day 1 is a
// Three. The societies' fair opens at 10:00 that day. The chess club meets at home on Threes at noon, with Ana in it;
// the choir meets at the same hour, and the walkers an hour later.
const raw = rawFixture()
const content: ContentPack = validateContentPack({
  ...raw,
  calendar: { ...raw.calendar, events: [...raw.calendar.events, { id: 'fair', name: 'the Fair', month: 'a', day: 3, startHour: 10, hours: 4 }] },
  loveInterests: raw.loveInterests.map((li) => ({ ...li, studies: { subject: 'Riddles', code: 'RID', level: 1, stats: ['wisdom'], practical: false } })),
  societies: {
    fairId: 'fair',
    maxJoined: 2,
    energy: 5,
    societies: [
      {
        id: 'chess',
        name: 'the Chess Club',
        description: 'Chess.',
        locationId: 'home',
        weekday: 'Three',
        startHour: 12,
        stats: ['intelligence'],
        memberIds: ['ana'],
        syllabus: ['Openings.', 'Endgames.'],
        adultEvents: [{ meeting: 2, name: 'strip chess', intro: { speakerId: 'ana', scenes: [{ locationId: 'home', lines: ['Ana: Check.'] }] }, direction: 'Every piece taken costs a garment.' }]
      },
      { id: 'choir', name: 'the Choir', description: 'Singing.', locationId: 'shop', weekday: 'Three', startHour: 12, stats: ['charisma'] },
      { id: 'walkers', name: 'the Walkers', description: 'Walking.', locationId: 'shop', weekday: 'Three', startHour: 13, stats: ['endurance', 'wisdom'] }
    ]
  }
})
const at = (state: GameState, day: number, hour: number, locationId = state.locationId): GameState => ({ ...state, time: day * 20 + hour - 6, locationId })
const start = createInitialState(content)
const ana = content.loveInterests[0]

describe('joining a society', () => {
  it('opens at the fair, and not before', () => {
    expect(societiesOpen(content, at(start, 1, 9))).toBe(false)
    expect(canJoinSociety(content, at(start, 1, 9), 'chess').reasons).toEqual(['The societies sign up new members at their fair'])
    expect(canJoinSociety(content, at(start, 1, 10), 'chess').ok).toBe(true)
    // After the fair, as well.
    expect(canJoinSociety(content, at(start, 4, 8), 'chess').ok).toBe(true)
  })

  it('takes no more societies than he may belong to, and none that meets when one of his does', () => {
    const open = at(start, 1, 10)
    const one = joinSociety(content, open, 'chess')
    expect(one.societies).toEqual(['chess'])
    expect(canJoinSociety(content, one, 'choir').reasons).toEqual(['It meets when the Chess Club does'])
    const two = joinSociety(content, one, 'walkers')
    expect(two.societies).toEqual(['chess', 'walkers'])
    expect(canJoinSociety(content, leaveSociety(two, 'walkers'), 'walkers').ok).toBe(true)
    expect(canJoinSociety(content, { ...two, societies: ['walkers', 'x'] }, 'chess').reasons).toEqual(['You can belong to 2 societies at most'])
  })
})

describe('a meeting', () => {
  const member = joinSociety(content, at(start, 1, 10), 'chess')

  it('is on its day at its hour, once the societies are open, and has its members there', () => {
    expect(societyMeetingNow(content, at(member, 1, 12), content.societies!.societies[0])).toBe(true)
    expect(societyMeetingNow(content, at(member, 1, 13), content.societies!.societies[0])).toBe(false)
    // The same hour of the week before the fair is not a meeting.
    expect(societyMeetingNow(content, at(member, -2, 12), content.societies!.societies[0])).toBe(false)
    expect(locationOf(content, at(member, 1, 12), ana)).toBe('home')
    expect(locationOf(content, at(member, 1, 11), ana)).toBe('shop')
  })

  it('is on his calendar and next on his day', () => {
    expect(dayAgenda(content, member, 1).find((item) => item.kind === 'society')).toMatchObject({ title: 'the Chess Club', startHour: 12, hours: 1 })
    expect(nextUp(content, at(member, 1, 11))).toMatchObject({ kind: 'society', id: 'chess', locationId: 'home' })
  })

  it('is been to once, there, for its hour and its energy', () => {
    expect(canAttendSociety(content, at(member, 1, 12, 'shop'), 'chess').reasons).toEqual(['the Chess Club meets at Home'])
    const there = at(member, 1, 12, 'home')
    const after = attendSociety(content, there, 'chess')
    expect(after.time).toBe(there.time + 1)
    expect(after.player.energy).toBe(there.player.energy - 5)
    expect(canAttendSociety(content, { ...after, time: there.time }, 'chess').reasons).toEqual(['You have been to this meeting'])
    expect(canAttendSociety(content, at(start, 1, 12, 'home'), 'chess').reasons).toEqual(['You do not belong to the Chess Club'])
  })
})

describe('what a meeting is about', () => {
  it('follows the syllabus by his own meetings, so that he misses nothing by missing a week, and is a night of its own where one is set', () => {
    expect(nextMeeting(content, start, 'chess')).toMatchObject({ number: 1, topic: 'Openings.' })
    expect(nextMeeting(content, start, 'chess').event).toBeUndefined()
    const once = { ...start, societyMeetings: ['chess:3', 'choir:3'] }
    expect(meetingsAttended(once, 'chess')).toBe(1)
    expect(nextMeeting(content, once, 'chess')).toMatchObject({ number: 2, topic: 'Endgames.', event: { name: 'strip chess' } })
    // Past the end of it, a meeting is about nothing in particular.
    expect(nextMeeting(content, { ...start, societyMeetings: ['chess:3', 'chess:10'] }, 'chess')).toEqual({ number: 3, topic: undefined, event: undefined })
  })
})

describe('who a night frees', () => {
  const night = {
    meeting: 3,
    name: 'the confession',
    intro: { speakerId: 'ana', scenes: [{ locationId: 'home', lines: ['Ana: I want this.'] }] },
    direction: 'Ana wants him; Bea is not ready.',
    reserved: [{ loveInterestId: 'bea', ifIntimate: { intro: { speakerId: 'ana', scenes: [{ locationId: 'home', lines: ['Bea: Me too.'] }] }, direction: 'Both want him.' } }]
  }

  it('frees everyone but whoever it holds to her own wishes, until he has been to bed with her, when it is told her way', () => {
    expect(eventGate(start, night, ['ana', 'bea'])).toMatchObject({ direction: 'Ana wants him; Bea is not ready.', free: ['ana'] })
    const been = { ...start, timesIntimate: { bea: 1 } }
    expect(eventGate(been, night, ['ana', 'bea'])).toMatchObject({ direction: 'Both want him.', free: ['ana', 'bea'] })
    expect(eventGate(been, night, ['ana', 'bea']).intro.scenes[0].lines).toEqual(['Bea: Me too.'])
    // Without her there, it is the night as written, and everyone there is free.
    expect(eventGate(start, night, ['ana'])).toMatchObject({ direction: 'Ana wants him; Bea is not ready.', free: ['ana'] })
  })
})

