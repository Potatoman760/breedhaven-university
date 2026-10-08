import { describe, expect, it } from 'vitest'
import { CourseSchema, CourseworkConfigSchema, JobsConfigSchema, type ContentPack } from '../model'
import { weekAgainst } from './jobs'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// One class he takes, Two at 09:00 for two hours, and two jobs: one whose shift falls on it and one that is clear of it.
const base = fixture()
const jobs = JobsConfigSchema.parse({
  jobs: [
    { id: 'clerk', title: 'Shop clerk', locationId: 'shop', bossId: 'ana', hourlyRate: 4, shifts: [{ weekday: 'Two', startHour: 10, hours: 3 }, { weekday: 'Three', startHour: 7, hours: 2 }] },
    { id: 'porter', title: 'Porter', locationId: 'home', bossId: 'ana', hourlyRate: 3, shifts: [{ weekday: 'Three', startHour: 12, hours: 2 }] }
  ]
})
const content: ContentPack = { ...base, jobs, coursework: CourseworkConfigSchema.parse({ weekdays: ['Two'], locationId: 'shop', dayStart: 8, dayEnd: 12 }) }
const course = CourseSchema.parse({ id: 'c1', number: 'RID 101', title: 'Riddles', professor: 'Prof. Q', subject: 'Riddles', code: 'RID', level: 1, studentIds: [], locationId: 'shop', meetings: [{ weekday: 'Two', startHour: 9, hours: 2, kind: 'lecture' }] })
const state = { ...createInitialState(content), courses: [course], enrolment: ['c1'] }
const [clerk, porter] = jobs.jobs

describe('a job laid over his week', () => {
  it('shows what he has on, where the job falls, and where the two clash', () => {
    const week = weekAgainst(content, state, clerk)
    expect(week.days).toEqual(content.calendar.weekdays)
    // From the first thing in the week to the last: the 07:00 shift to the one that ends at 13:00.
    expect(week.hours).toEqual([7, 8, 9, 10, 11, 12])
    expect(week.at('Two', 9)).toEqual({ mine: 'RID 101', shift: false })
    expect(week.at('Two', 10)).toEqual({ mine: 'RID 101', shift: true })
    expect(week.at('Two', 11)).toEqual({ mine: undefined, shift: true })
    expect(week.at('Three', 7)).toEqual({ mine: undefined, shift: true })
    expect(week.at('One', 9)).toEqual({ mine: undefined, shift: false })
    expect(week.clashes).toBe(1)
  })

  it('is clear when nothing of his is in the way, and counts a job he already holds', () => {
    expect(weekAgainst(content, state, porter).clashes).toBe(0)
    expect(weekAgainst(content, { ...state, enrolment: [] }, clerk).clashes).toBe(0)
    // Holding the clerk job, the porter's shifts are set against the clerk's too.
    const working = { ...state, job: { jobId: 'clerk', hiredAt: 0, strikes: 0, settledTo: 0, worked: [], excused: [] } }
    expect(weekAgainst(content, working, porter).at('Three', 7)).toEqual({ mine: 'Shop clerk', shift: false })
    // His own job is not set against itself.
    expect(weekAgainst(content, working, clerk).at('Three', 7)).toEqual({ mine: undefined, shift: true })
  })
})
