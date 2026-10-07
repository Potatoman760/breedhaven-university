import type { ContentPack, Course } from '../../../shared/model'

const clock = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

interface Props {
  content: ContentPack
  courses: Course[]
  /** The course whose meetings are picked out wherever they fall. */
  focusId?: string | null
  /** Extra class names for a course's blocks: "on" for one that is taken, "blocked" for one that can't be. */
  mark?: (course: Course) => string
  onFocus?: (course: Course) => void
  onPick?: (course: Course) => void
}

/**
 * The teaching week as a grid: a column for each day and a row for each hour, with every
 * course that is meeting in an hour shown there by its number. A lab fills each of its hours.
 */
export function WeekPlanner({ content, courses, focusId, mark, onFocus, onPick }: Props) {
  const config = content.coursework
  if (!config) return null
  const { weekdays } = content.calendar
  const hours = Array.from({ length: config.dayEnd - config.dayStart }, (_, i) => config.dayStart + i)
  return (
    <div className="planner" style={{ gridTemplateColumns: `52px repeat(${weekdays.length}, minmax(0, 1fr))` }}>
      <span />
      {weekdays.map((day) => (
        <span key={day} className="caps planner-day">
          {day}
        </span>
      ))}
      {hours.map((hour) => [
        <span key={`time-${hour}`} className="planner-time">
          {clock(hour)}
        </span>,
        ...weekdays.map((day) => {
          const here = courses.flatMap((course) =>
            course.meetings.filter((m) => m.weekday === day && hour >= m.startHour && hour < m.startHour + m.hours).map((meeting) => ({ course, meeting }))
          )
          return (
            <div key={`${day}-${hour}`} className={config.weekdays.includes(day) ? 'cell' : 'cell free'}>
              {here.map(({ course, meeting }) => (
                <button
                  key={course.id}
                  type="button"
                  className={['block', meeting.kind, mark?.(course), course.id === focusId && 'focus'].filter(Boolean).join(' ')}
                  title={`${course.number} ${course.title}: ${meeting.kind}, ${clock(meeting.startHour)} to ${clock(meeting.startHour + meeting.hours)}`}
                  onMouseEnter={() => onFocus?.(course)}
                  onFocus={() => onFocus?.(course)}
                  onClick={() => (onPick ?? onFocus)?.(course)}
                >
                  {course.number}
                  {meeting.kind === 'lab' && <span>lab</span>}
                </button>
              ))}
            </div>
          )
        })
      ])}
    </div>
  )
}
