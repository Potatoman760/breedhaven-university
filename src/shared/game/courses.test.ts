import { describe, expect, it } from 'vitest'
import { CourseworkConfigSchema, type ContentPack, type Course, type CourseMeeting, type GameState } from '../model'
import { canPerform } from './activities'
import { attend, canAttend, canEnrol, classmates, classSoon, courseMatches, coursesClash, coursesInSession, describeMeetings, enrolledCourses } from './courses'
import { buildCharacterPrompt } from './prompt'
import { approachableAt, inClass, locationOf, loveInterestsAt } from './map'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Fixture calendar: weekdays One, Two, Three in a 20-hour day; the game starts on a Two at
// 06:00. Classes meet at the shop. An hour of class is worth one stat point and costs 5 energy.
const base = fixture()
const ana = base.loveInterests[0]
const student = (id: string, code: string, level: number) => ({
  ...ana,
  id,
  name: id[0].toUpperCase() + id.slice(1),
  schedule: [],
  likes: ['maps'],
  studies: { subject: `${code} studies`, code, level, stats: ['wisdom' as const, 'charisma' as const], practical: true }
})
const content: ContentPack = {
  ...base,
  loveInterests: [student('ana', 'POL', 1), student('bea', 'POL', 1), { ...ana, id: 'dee', schedule: [], studies: undefined }],
  coursework: CourseworkConfigSchema.parse({ weekdays: ['One', 'Two'], dayStart: 6, dayEnd: 14, locationId: 'shop', maxCourses: 2, statGain: 1, energy: 5 })
}
const lecture = (weekday: string, startHour: number): CourseMeeting => ({ weekday, startHour, hours: 1, kind: 'lecture' })
const lab = (weekday: string, startHour: number): CourseMeeting => ({ weekday, startHour, hours: 3, kind: 'lab' })
const course = (id: string, number: string, meetings: CourseMeeting[], studentIds: string[] = []): Course => ({
  id,
  number,
  title: number,
  professor: 'Doctor Reed',
  description: '',
  subject: number,
  code: number.split(' ')[0],
  level: 1,
  general: false,
  stats: ['wisdom', 'charisma'],
  studentIds,
  locationId: 'shop',
  meetings
})
// POL 101: lectures One and Two 06:00, and a lab Two 08:00 to 11:00. HIS 101's second lecture falls inside that lab.
const pol = course('pol', 'POL 101', [lecture('One', 6), lecture('Two', 6), lab('Two', 8)], ['bea'])
const his = course('his', 'HIS 101', [lecture('One', 7), lecture('Two', 10)])
const phy = course('phy', 'PHY 101', [lecture('One', 8), lecture('Two', 12)])
const start = (enrolment: string[] | null = ['pol']): GameState => ({
  ...createInitialState(content),
  locationId: 'shop',
  courses: [pol, his, phy],
  enrolment
})

describe('when a course meets', () => {
  it('is said in a line: lectures together when they share an hour, then the lab', () => {
    expect(describeMeetings(pol)).toBe('One and Two 06:00, lab Two 08:00-11:00')
    expect(describeMeetings(his)).toBe('One 07:00 and Two 10:00')
  })

  it('clashes with another whenever their hours overlap, not only when they start together', () => {
    expect(coursesClash(pol, his)).toBe(true)
    expect(coursesClash(pol, phy)).toBe(false)
    expect(coursesClash(his, phy)).toBe(false)
  })
})

describe('enrolment', () => {
  it('refuses a clash or more than the maximum', () => {
    const state = start(null)
    expect(canEnrol(content, state, [], 'pol').ok).toBe(true)
    expect(canEnrol(content, state, ['pol', 'phy'], 'his').reasons).toEqual(['You can take at most 2 courses', 'Meets at the same time as POL 101'])
    expect(canEnrol(content, state, ['pol'], 'his').reasons).toEqual(['Meets at the same time as POL 101'])
    expect(canEnrol(content, state, ['pol'], 'phy').ok).toBe(true)
  })

  it('lists what the player is taking', () => {
    expect(enrolledCourses(start()).map((c) => c.id)).toEqual(['pol'])
    expect(enrolledCourses(start(null))).toEqual([])
  })
})

describe('classes in session', () => {
  it('puts everyone taking a course in class while it meets, for as long as that meeting runs', () => {
    // Day 0 is a Two at 06:00: the POL lecture is the only class on.
    expect(coursesInSession(content, start()).map((c) => c.number)).toEqual(['POL 101'])
    expect(loveInterestsAt(content, start(), 'shop').map((li) => li.id)).toEqual(['bea'])
    expect(locationOf(content, start(), content.loveInterests[1])).toBe('shop')
    // 07:00: the lecture is over, and these students have no other schedule.
    expect(loveInterestsAt(content, { ...start(), time: 1 }, 'shop')).toEqual([])
    // 08:00 to 11:00 is the lab: she is there through every hour of it, and gone after.
    for (const time of [2, 3, 4]) expect(coursesInSession(content, { ...start(), time }).map((c) => c.number)).toContain('POL 101')
    expect(coursesInSession(content, { ...start(), time: 5 }).map((c) => c.number)).toEqual([])
  })

  it('keeps shared activities from happening with someone who is in class, even a classmate', () => {
    const friends = { ...start(), relationships: { ...start().relationships, bea: { affection: 30, trust: 0, desire: 0 } } }
    const date = content.activities.find((a) => a.id === 'date')!
    expect(canPerform(date, friends, content, 'bea').reasons).toEqual([`${content.loveInterests[1].name} is in class`])
    // Already in a scene with her, as when he sits the class, nothing stands in the way.
    expect(canPerform(date, friends, content, 'bea', true).ok).toBe(true)
  })
})

describe('attending', () => {
  const energy = start().player.energy

  it('works on what the course teaches, for energy and time, and leaves what his classmates think of him to the scene', () => {
    const state = { ...start(), courses: [{ ...pol, studentIds: ['bea', 'dee'] }, his, phy] }
    const after = attend(content, state, 'pol')
    // An hour's lecture is an hour of work, shared between the two stats it teaches: half a training point each.
    expect(after.training).toEqual({ wisdom: 0.5, charisma: 0.5 })
    expect(after.player.stats).toMatchObject({ wisdom: 0, charisma: 0 })
    expect(after.player.energy).toBe(energy - 5)
    expect(after.relationships).toEqual(state.relationships)
    expect(after.time).toBe(1)
    expect(after.attendance['pol']).toEqual({ count: 1, last: '0:6' })
  })

  it('makes a lab worth, and cost, its three hours', () => {
    const after = attend(content, { ...start(), time: 2 }, 'pol')
    // Three hours shared between two stats: a point and a half of training each, which at a score of nothing is a point of the score.
    expect(after.training).toEqual({ wisdom: 0.5, charisma: 0.5 })
    expect(after.player.stats).toMatchObject({ wisdom: 1, charisma: 1 })
    expect(after.player.energy).toBe(energy - 15)
    expect(after.time).toBe(5)
    expect(after.attendance['pol']).toEqual({ count: 1, last: '0:8' })
  })

  it('keeps a latecomer only until the class ends', () => {
    expect(attend(content, { ...start(), time: 3 }, 'pol').time).toBe(5)
    expect(canAttend(content, { ...start(), time: 5 }, 'pol').reasons).toEqual(['It is not meeting now'])
  })

  it('counts each meeting once', () => {
    const once = attend(content, start(), 'pol')
    expect(canAttend(content, { ...once, time: 0 }, 'pol').reasons).toEqual(['You have already sat this class'])
    // The lab later the same day is another meeting.
    expect(attend(content, { ...once, time: 2 }, 'pol').attendance['pol'].count).toBe(2)
    // Day 3 is the next Two.
    expect(attend(content, { ...once, time: 3 * 20 }, 'pol').attendance['pol'].count).toBe(2)
  })

  it('refuses when not enrolled, elsewhere or too tired', () => {
    expect(canAttend(content, start(['his']), 'pol').reasons).toEqual(['You are not taking this course'])
    expect(canAttend(content, { ...start(), locationId: 'home' }, 'pol').reasons).toEqual(['Go to the Shop first'])
    const tired = { ...start(), player: { ...start().player, energy: 3 } }
    expect(canAttend(content, tired, 'pol').reasons).toEqual(['Requires 5 energy'])
    // The lab asks for three hours' worth.
    expect(canAttend(content, { ...tired, time: 2, player: { ...tired.player, energy: 10 } }, 'pol').reasons).toEqual(['Requires 15 energy'])
    expect(() => attend(content, tired, 'pol')).toThrow(/Cannot attend/)
  })
})

describe('classmates', () => {
  const state = createInitialState(fixture())
  const rel = (affection: number) => ({ affection, trust: 0, desire: 0 })
  // Draws that run through every choice in turn, so each outcome is seen.
  const cycling = (n: number) => () => (n++ % 10) / 10

  it('is everyone when no more than two love interests are in the class', () => {
    const known = { ...state, relationships: { a: rel(1), b: rel(9) } }
    expect(classmates(known, { studentIds: ['a', 'b', 'stranger'] } as Course)).toEqual(['b', 'a'])
    expect(classmates(known, { studentIds: ['a'], teacherId: 'b' } as Course)).toEqual(['b', 'a'])
    expect(classmates(known, { studentIds: [] } as unknown as Course)).toEqual([])
  })

  it('seats him by the one who likes him most and one other at random when there are more', () => {
    const known = { ...state, relationships: { a: rel(1), b: rel(9), c: rel(5), d: rel(7) } }
    const course = { studentIds: ['a', 'b', 'c', 'd'] } as Course
    const seconds = new Set<string>()
    for (let n = 0; n < 20; n++) {
      const seated = classmates(known, course, cycling(n))
      expect(seated).toHaveLength(2)
      expect(seated[0]).toBe('b')
      expect(seated[1]).not.toBe('b')
      seconds.add(seated[1])
    }
    expect([...seconds].sort()).toEqual(['a', 'c', 'd'])
    // The same sitting of the same game seats the same two.
    expect(classmates(known, course)).toEqual(classmates(known, course))
  })

  it('always has a love interest who teaches the class, in front of whoever he sits by', () => {
    const known = { ...state, relationships: { a: rel(1), b: rel(9), c: rel(5), t: rel(0) } }
    const course = { studentIds: ['a', 'b', 'c'], teacherId: 't' } as Course
    for (let n = 0; n < 20; n++) {
      const there = classmates(known, course, cycling(n))
      // She leads, however little she thinks of him, and two of the three students sit by him.
      expect(there).toHaveLength(3)
      expect(there[0]).toBe('t')
      expect(there[1]).toBe('b')
      expect(['a', 'c']).toContain(there[2])
    }
    expect(classmates(known, { studentIds: [], teacherId: 't' } as unknown as Course)).toEqual(['t'])
    // A professor who is nobody he can know is not in the scene.
    expect(classmates(known, { studentIds: ['a'], teacherId: 'stranger' } as Course)).toEqual(['a'])
  })

  it('seats him by two at random when they all like him the same', () => {
    const known = { ...state, relationships: { a: rel(4), b: rel(4), c: rel(4) } }
    const firsts = new Set<string>()
    for (let n = 0; n < 20; n++) {
      const seated = classmates(known, { studentIds: ['a', 'b', 'c'] } as Course, cycling(n))
      expect(new Set(seated).size).toBe(2)
      firsts.add(seated[0])
    }
    expect([...firsts].sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('a love interest who teaches', () => {
  const cy = { ...ana, id: 'cy', name: 'Cy Vane', schedule: [{ locationId: 'home' }], studies: undefined }
  const school: ContentPack = { ...content, loveInterests: [...content.loveInterests, cy] }
  const hers: Course = { ...course('rid', 'RID 101', [lecture('Two', 6)], ['bea']), teacherId: 'cy' }

  it('is in the hall while her course meets, and at the head of the class', () => {
    const state: GameState = { ...createInitialState(school), courses: [hers], enrolment: ['rid'], locationId: 'shop' }
    const teacher = school.loveInterests.find((li) => li.id === 'cy')!
    expect(locationOf(school, { ...state, time: 1 }, teacher)).toBe('home')
    expect(locationOf(school, state, teacher)).toBe('shop')
    expect(classmates(state, hers)).toEqual(['cy', 'bea'])
    const after = attend(school, state, 'rid')
    expect(after.relationships).toEqual(state.relationships)
  })
})

describe('a class she will have to leave for', () => {
  it('is known a couple of hours ahead, and not while she is sitting in one', () => {
    // 07:00 on a Two: Bea's lab starts at 08:00.
    expect(classSoon(content, { ...start(), time: 1 }, 'bea', 2)).toMatchObject({ course: { number: 'POL 101' }, inHours: 1, startHour: 8 })
    // 06:00: she is in the lecture, so there is nothing to tell her.
    expect(classSoon(content, start(), 'bea', 2)).toBeUndefined()
    // 11:00: the lab is over and nothing follows today.
    expect(classSoon(content, { ...start(), time: 5 }, 'bea', 2)).toBeUndefined()
    // Ana takes nothing.
    expect(classSoon(content, { ...start(), time: 1 }, 'ana', 2)).toBeUndefined()
    const prompt = buildCharacterPrompt({ content, state: { ...start(), time: 1 }, loveInterestId: 'bea', sceneBeats: [{ activityName: 'Tea' }], look: {} })
    expect(prompt).toContain('You have POL 101 at 08:00, within the hour, and will have to go to it')
  })
})

describe('searching the catalogue', () => {
  it('finds a course by its code, its words, or someone in it, whatever the case', () => {
    const bea = content.loveInterests[1].name
    expect(courseMatches(content, pol, 'pol')).toBe(true)
    expect(courseMatches(content, pol, 'POL 101')).toBe(true)
    expect(courseMatches(content, his, 'pol')).toBe(false)
    expect(courseMatches(content, pol, bea.toUpperCase())).toBe(true)
    expect(courseMatches(content, his, bea)).toBe(false)
    expect(courseMatches(content, his, 'reed his')).toBe(true)
    expect(courseMatches(content, { ...his, teacherId: 'bea' }, bea)).toBe(true)
    expect(courseMatches(content, pol, '   ')).toBe(false)
  })
})

describe('someone in class', () => {
  it('is at the place but not to be gone up to, whether or not he takes it, unless she is waiting for him', () => {
    const bea = content.loveInterests[1]
    // POL 101 is on, and Bea is in it at the shop. Taking it too does not let him walk up to her: he has to sit it.
    expect(inClass(content, start(['pol']), bea)).toBe(true)
    expect(approachableAt(content, start(['pol']), 'shop')).toEqual([])
    expect(classmates({ ...start(['pol']), relationships: { bea: { affection: 0, trust: 0, desire: 0 } } }, pol)).toEqual(['bea'])

    const elsewhere = start(['his'])
    expect(loveInterestsAt(content, elsewhere, 'shop').map((li) => li.id)).toEqual(['bea'])
    expect(inClass(content, elsewhere, bea)).toBe(true)
    expect(approachableAt(content, elsewhere, 'shop')).toEqual([])
    expect(approachableAt(content, start([]), 'shop')).toEqual([])

    // A plan with him comes before her class: she is there for him.
    const waiting = { ...elsewhere, appointments: [{ id: 'plan-1', loveInterestId: 'bea', companionIds: [], title: 'Tea', time: 0, hours: 1, locationId: 'shop' }] }
    expect(approachableAt(content, waiting, 'shop').map((li) => li.id)).toEqual(['bea'])
    // Once the class is over she is like anyone else.
    expect(inClass(content, waiting, bea)).toBe(false)
    expect(inClass(content, { ...elsewhere, time: 1 }, bea)).toBe(false)
  })
})

describe('walking into class with someone', () => {
  it('seats her by him before anyone else', () => {
    const state = { relationships: { a: { affection: 1 }, b: { affection: 50 }, c: { affection: 30 }, t: { affection: 0 } }, weatherSeed: 1, time: 0 } as unknown as GameState
    const room = { studentIds: ['a', 'b', 'c'], teacherId: 't' } as Course
    // Left to the rule, the one who likes him most has the first seat.
    expect(classmates(state, room, () => 0)[1]).toBe('b')
    expect(classmates(state, room, () => 0, ['a'])).toEqual(['t', 'a', 'b'])
    expect(classmates(state, room, () => 0, ['a', 'c'])).toEqual(['t', 'a', 'c'])
    // Someone who is not in the class changes nothing.
    expect(classmates(state, room, () => 0, ['z'])).toEqual(classmates(state, room, () => 0))
  })
})
