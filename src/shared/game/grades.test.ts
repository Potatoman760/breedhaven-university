import { describe, expect, it } from 'vitest'
import { CourseworkConfigSchema, type ContentPack, type Course, type GameState } from '../model'
import { dayAgenda } from './agenda'
import { attend, canAttend, meetingNow } from './courses'
import { coursePoints, describeGrade, examNow, examSlot, examWeek, gradeFor, pointsPerClassHour, settleExams, studyOuting, studyPlaces, studyPoints } from './grades'
import { checkOuting, startOuting } from './outing'
import { meet } from './scene'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// The fixture's week of names is One, Two, Three on a 20-hour day, and the game starts on a
// Two at 06:00. A term here is four weeks of seven days: the midterm is in the second and
// the final in the fourth. The course has an hour's lecture on Twos at 06:00 and on Threes
// at 08:00, and two of the four weeks are examination weeks with no classes, so an hour of class is worth 60 / (2 x 2) = 15 of its hundred points.
const base = fixture()
const ana = base.loveInterests[0]
const content: ContentPack = {
  ...base,
  calendar: { ...base.calendar, lengthDays: 28 },
  loveInterests: [
    { ...ana, room: { name: 'a loft over the shop', description: '', locationId: 'shop' } },
    { ...ana, id: 'bea', name: 'Bea Stone', schedule: [{ locationId: 'home' }], room: { name: 'a back room', description: '', locationId: 'home' } }
  ],
  coursework: CourseworkConfigSchema.parse({
    weekdays: ['One', 'Two', 'Three'],
    dayStart: 6,
    dayEnd: 14,
    locationId: 'shop',
    grading: { midtermWeek: 2, finalWeek: 4, studyLocationIds: ['shop'] }
  })
}
const course: Course = {
  id: 'rid',
  number: 'RID 101',
  title: 'Riddles',
  professor: 'Prof. Q',
  description: '',
  subject: 'Riddles',
  code: 'RID',
  level: 1,
  general: false,
  stats: ['wisdom'],
  studentIds: ['ana', 'bea'],
  locationId: 'shop',
  meetings: [
    { weekday: 'Two', startHour: 6, hours: 1, kind: 'lecture' },
    { weekday: 'Three', startHour: 8, hours: 1, kind: 'lecture' }
  ]
}
const start: GameState = { ...createInitialState(content), courses: [course], enrolment: ['rid'], locationId: 'shop' }
const withPoints = (points: number, time: number): GameState => ({ ...start, time, coursePoints: { rid: points } })

describe("a course's points", () => {
  it('are earned by sitting its classes, so that the whole term of them comes to the share attendance carries', () => {
    expect(pointsPerClassHour(content, course)).toBe(15)
    expect(coursePoints(start, 'rid')).toBe(0)
    expect(coursePoints(attend(content, start, 'rid'), 'rid')).toBe(15)
    // A lab of three hours a week as well would make each hour worth less: the same marks for more hours.
    const withLab = { ...course, meetings: [...course.meetings, { weekday: 'One', startHour: 6, hours: 3, kind: 'lab' as const }] }
    expect(pointsPerClassHour(content, withLab)).toBe(6)
  })

  it('are earned by study, and a point more in his own room', () => {
    const places = studyPlaces(content, start, course)
    expect(places.map((p) => [p.name, p.locationId, p.own ?? false])).toEqual([
      ['the Shop', 'shop', false],
      ['My own room', 'home', true]
    ])
    // A place that is shut, or shuts before the two hours are up, is not offered.
    expect(studyPlaces(content, { ...start, time: start.time + 8 }, course).map((p) => p.locationId)).toEqual(['home'])
    const [shop, own] = places.map((place) => studyOuting(content, course, place))
    expect(shop).toMatchObject({ title: 'Study for RID 101', hours: 2, studyCourseId: 'rid', dropIn: true, withIds: [] })
    expect(own).toMatchObject({ locationId: 'home', ownRoom: true, dropIn: false })
    expect(studyPoints(content, shop)).toBe(4)
    expect(studyPoints(content, own)).toBe(5)

    const quiet = { ...start, locationId: 'home', time: 2 }
    const after = startOuting(content, quiet, own)
    expect(coursePoints(after.state, 'rid')).toBe(5)
    expect(after.scene).toBeNull()
    expect(after.state.player.energy).toBe(quiet.player.energy - 16)
    expect(after.state.time).toBe(4)
    // Too tired to work is too tired to study.
    expect(checkOuting(content, { ...quiet, player: { ...quiet.player, energy: 5 } }, own).blockers).toContain('You are too tired for that. Rest first')
    // Never past full marks.
    expect(coursePoints(startOuting(content, { ...quiet, coursePoints: { rid: 98 } }, own).state, 'rid')).toBe(100)
  })

  it('can be studied for in the room of a classmate he has met, which is a scene with her there', () => {
    const met = meet(content, start, ['bea'])
    const places = studyPlaces(content, met, course)
    expect(places.map((p) => p.name)).toEqual(['the Shop', 'My own room', "Bea's room"])
    const session = studyOuting(content, course, places[2])
    expect(session).toMatchObject({ withIds: ['bea'], roomOf: 'bea', locationId: 'home', dropIn: false })
    // After her class, when she is free.
    const { state, scene } = startOuting(content, { ...met, time: 2 }, session)
    expect(scene).toMatchObject({ loveInterestId: 'bea', roomOf: 'bea' })
    expect(coursePoints(state, 'rid')).toBe(4)
  })
})

describe('examinations', () => {
  it('take the place of the last class of their week', () => {
    // The second week is days 7 to 13; the last class in it is the Three of day 13, at 08:00.
    expect(examSlot(content, course, 'midterm')).toMatchObject({ kind: 'midterm', dayIndex: 13, begins: 13 * 20 + 2, ends: 13 * 20 + 3 })
    // The fourth is days 21 to 27, and ends on a Two.
    expect(examSlot(content, course, 'final')).toMatchObject({ dayIndex: 27, begins: 27 * 20, ends: 27 * 20 + 1 })
    expect(examSlot(base, course, 'final')).toBeUndefined()

    const during = withPoints(40, 13 * 20 + 2)
    expect(examNow(content, during, course)?.kind).toBe('midterm')
    expect(examNow(content, start, course)).toBeUndefined()
    // There is no class to sit in its place.
    expect(canAttend(content, during, 'rid').reasons).toEqual(['The midterm is being sat: your grade is given when it ends at 09:00'])
    expect(dayAgenda(content, during, 13).find((item) => item.kind === 'class')?.title).toBe('Midterm: RID 101 Riddles')
    expect(dayAgenda(content, start, 0).find((item) => item.kind === 'class')?.title).toBe('RID 101 Riddles')
  })

  it('mark him on the points he has when they are over, against what was to be had by then', () => {
    // Half the term has gone by at the midterm: it is out of fifty.
    const letters = [45, 40, 35, 30, 29].map((points) => gradeFor(content, 'midterm', points, 0))
    expect(letters.map((g) => g.letter)).toEqual(['A', 'B', 'C', 'D', 'F'])
    expect(letters.map((g) => g.passed)).toEqual([true, true, true, true, false])
    expect(letters[0]).toMatchObject({ points: 45, outOf: 50 })
    expect(gradeFor(content, 'final', 62, 0)).toMatchObject({ letter: 'D', outOf: 100, passed: true })
    expect(gradeFor(content, 'final', 59, 0)).toMatchObject({ letter: 'F', passed: false })
  })

  it('are marked once their hour has gone by, with nothing asked of him, and kept', () => {
    expect(settleExams(content, withPoints(40, 13 * 20 + 2)).graded).toEqual([])
    const marked = settleExams(content, withPoints(40, 13 * 20 + 3))
    expect(marked.graded.map(describeGrade)).toEqual(['Midterm in RID 101: B (40 of 50)'])
    expect(marked.state.grades).toEqual({ rid: { midterm: { letter: 'B', points: 40, outOf: 50, passed: true, time: 13 * 20 + 3 } } })
    // Only once, whatever he earns afterwards.
    expect(settleExams(content, { ...marked.state, coursePoints: { rid: 90 } }).graded).toEqual([])

    const done = settleExams(content, { ...marked.state, time: 27 * 20 + 1, coursePoints: { rid: 55 } })
    expect(done.graded.map(describeGrade)).toEqual(['Final in RID 101: F (55 of 100), not a pass'])
    expect(done.state.grades['rid']).toMatchObject({ midterm: { letter: 'B' }, final: { letter: 'F', passed: false } })
    // A course he is not taking is not marked.
    expect(settleExams(content, { ...withPoints(40, 600), enrolment: [] }).graded).toEqual([])
  })
})

describe('the weeks of the examinations', () => {
  // Week two is the midterms: days 7 to 13. The course meets on every Two at 06:00 and every Three at 08:00, and its midterm is the last of those, on day 13.
  const at = (dayIndex: number, hour: number): GameState => ({ ...start, time: dayIndex * 20 + (hour - 6) })

  it('have no lectures: a course meets only in the slot its examination is sat in', () => {
    expect(examWeek(content, 6)).toBeUndefined()
    expect(examWeek(content, 7)).toBe('midterm')
    expect(examWeek(content, 13)).toBe('midterm')
    expect(examWeek(content, 14)).toBeUndefined()
    expect(examWeek(content, 27)).toBe('final')
    expect(examWeek(base, 7)).toBeUndefined()

    // The week before, it meets as usual.
    expect(meetingNow(content, at(3, 6), course)).toBeDefined()
    expect(meetingNow(content, at(4, 8), course)).toBeDefined()
    // In the week of the midterms its lectures are off...
    expect(meetingNow(content, at(9, 6), course)).toBeUndefined()
    expect(meetingNow(content, at(10, 8), course)).toBeUndefined()
    expect(meetingNow(content, at(12, 6), course)).toBeUndefined()
    // ...and the examination is sat in its last slot.
    expect(meetingNow(content, at(13, 8), course)).toBeDefined()
    expect(examNow(content, at(13, 8), course)?.kind).toBe('midterm')
    // Nothing of it is on his calendar that week but the midterm.
    const classes = [7, 8, 9, 10, 11, 12, 13].flatMap((day) => dayAgenda(content, at(7, 6), day).filter((item) => item.kind === 'class').map((item) => item.title))
    expect(classes).toEqual(['Midterm: RID 101 Riddles'])
  })
})
