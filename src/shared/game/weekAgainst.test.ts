import { describe, expect, it } from 'vitest'
import { CourseSchema, CourseworkConfigSchema, JobsConfigSchema, SocietiesConfigSchema, type ContentPack } from '../model'
import { weekAgainst } from './jobs'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// One society he belongs to, meeting Two at 10:00 for two hours, one class, and two jobs: one whose shift falls on the
// meeting and one that is clear of it.
const base = fixture()
const jobs = JobsConfigSchema.parse({
  jobs: [
    { id: 'clerk', title: 'Shop clerk', locationId: 'shop', bossId: 'ana', hourlyRate: 4, shifts: [{ weekday: 'Two', startHour: 11, hours: 3 }, { weekday: 'Three', startHour: 7, hours: 2 }] },
    { id: 'porter', title: 'Porter', locationId: 'home', bossId: 'ana', hourlyRate: 3, shifts: [{ weekday: 'Three', startHour: 12, hours: 2 }] }
  ]
})
const societies = SocietiesConfigSchema.parse({
  fairId: 'fair',
  hours: 2,
  societies: [{ id: 'chess', name: 'Chess Club', description: '', locationId: 'shop', weekday: 'Two', startHour: 10, stats: ['charisma'] }]
})
const content: ContentPack = { ...base, jobs, societies, coursework: CourseworkConfigSchema.parse({ weekdays: ['Two'], locationId: 'shop', dayStart: 8, dayEnd: 12 }) }
const course = CourseSchema.parse({ id: 'c1', number: 'RID 101', title: 'Riddles', professor: 'Prof. Q', subject: 'Riddles', code: 'RID', level: 1, studentIds: [], locationId: 'shop', meetings: [{ weekday: 'Three', startHour: 12, hours: 2, kind: 'lecture' }] })
const state = { ...createInitialState(content), courses: [course], enrolment: ['c1'], societies: ['chess'] }
const [clerk, porter] = jobs.jobs

describe('a job laid over his week', () => {
  it('shows the societies he belongs to, where the job falls, and where the two clash', () => {
    const week = weekAgainst(content, state, clerk)
    expect(week.days).toEqual(content.calendar.weekdays)
    // From the first thing in the week to the last: the 07:00 shift to the one that ends at 14:00.
    expect(week.hours).toEqual([7, 8, 9, 10, 11, 12, 13])
    expect(week.at('Two', 10)).toEqual({ mine: 'Chess Club', shift: false })
    expect(week.at('Two', 11)).toEqual({ mine: 'Chess Club', shift: true })
    expect(week.at('Two', 12)).toEqual({ mine: undefined, shift: true })
    expect(week.at('Three', 7)).toEqual({ mine: undefined, shift: true })
    expect(week.clashes).toBe(1)
  })

  it('sets neither his classes nor the job he holds against it, and is clear without a society in the way', () => {
    // The porter's shift falls on his class: that is no conflict.
    expect(weekAgainst(content, state, porter).clashes).toBe(0)
    expect(weekAgainst(content, state, porter).at('Three', 12)).toEqual({ mine: undefined, shift: true })
    expect(weekAgainst(content, { ...state, societies: [] }, clerk).clashes).toBe(0)
    // Holding the clerk job, the porter's shifts are not set against the clerk's: taking one gives up the other.
    const working = { ...state, job: { jobId: 'clerk', hiredAt: 0, strikes: 0, settledTo: 0, worked: [], excused: [] } }
    expect(weekAgainst(content, working, porter).at('Three', 7)).toEqual({ mine: undefined, shift: false })
  })
})
