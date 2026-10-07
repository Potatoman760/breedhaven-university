import { useState } from 'react'
import { canEnrol, describeMeetings, toDate } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { Backdrop } from './Backdrop'
import { Portrait } from './MapPanel'
import { WeekPlanner } from './WeekPlanner'

interface Props {
  content: ContentPack
  state: GameState
  /** Called with the chosen course ids. */
  onEnrol: (courseIds: string[]) => void
}

/**
 * The start of term: the catalogue this game began with, laid out as a week planner, a
 * column per day and a row per hour, for the player to pick from.
 */
export function CoursesView({ content, state, onEnrol }: Props) {
  const config = content.coursework
  const [selected, setSelected] = useState<string[]>([])
  // The course whose details are shown beside the planner.
  const [focusId, setFocusId] = useState<string | null>(null)

  const location = content.locations.find((l) => l.id === config?.locationId)
  const date = toDate(content.calendar, state.time)
  const focus = state.courses.find((c) => c.id === focusId)
  const focusCheck = focus && canEnrol(content, state, selected, focus.id)
  const classmates = content.loveInterests.filter((li) => focus?.studentIds.includes(li.id))
  const teacher = content.loveInterests.find((li) => li.id === focus?.teacherId)

  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])

  return (
    <main className="stage">
      <Backdrop screen="courses" location={location} periodId={date.period.id} light={date.period.light} />
      <div className="planner-panel glass framed">
        <div className="market-head">
          <div>
            <span className="caps">Start of term</span>
            <h1>Plan your week</h1>
          </div>
          <span className="hint">
            {selected.length} of {config?.maxCourses} courses chosen
          </span>
          <button disabled={selected.length === 0} onClick={() => onEnrol(selected)}>
            Begin term
          </button>
        </div>

        {state.courses.length === 0 || !config ? (
          <p className="hint center">There is no course catalogue in this game. Build one under Edit game content, Courses, and start a new game.</p>
        ) : (
          <div className="planner-body">
            <WeekPlanner
              content={content}
              courses={state.courses}
              focusId={focusId}
              mark={(course) => (selected.includes(course.id) ? 'on' : canEnrol(content, state, selected, course.id).ok ? '' : 'blocked')}
              onFocus={(course) => setFocusId(course.id)}
              onPick={(course) => {
                setFocusId(course.id)
                if (selected.includes(course.id) || canEnrol(content, state, selected, course.id).ok) toggle(course.id)
              }}
            />

            <aside className="course-detail">
              {focus ? (
                <>
                  <div className="chips">
                    <span className="chip dark">{focus.number}</span>
                    {focus.general && <span className="chip">General education</span>}
                    {focus.meetings.some((m) => m.kind === 'lab') && <span className="chip">Has a lab</span>}
                  </div>
                  <h2>{focus.title}</h2>
                  <span className="hint">{focus.professor}</span>
                  <span className="hint">{describeMeetings(focus)}</span>
                  <p>{focus.description}</p>
                  <span className="caps">In this class</span>
                  {classmates.length === 0 && !teacher && <span className="hint">No one you know.</span>}
                  <div className="portraits">
                    {teacher && <Portrait li={teacher} />}
                    {classmates.map((li) => (
                      <Portrait key={li.id} li={li} />
                    ))}
                  </div>
                  <button
                    className={selected.includes(focus.id) ? 'secondary' : ''}
                    disabled={!selected.includes(focus.id) && !focusCheck?.ok}
                    onClick={() => toggle(focus.id)}
                  >
                    {selected.includes(focus.id) ? 'Drop' : 'Enroll'}
                  </button>
                  {!selected.includes(focus.id) && !focusCheck?.ok && <span className="pin-note">{focusCheck?.reasons.join(' · ')}</span>}
                </>
              ) : (
                <p className="hint">
                  Each course has {config.lecturesPerWeek} lectures a week of {config.lectureHours} hour{config.lectureHours === 1 ? '' : 's'}, and a practical
                  one a {config.labHours}-hour lab as well. Point at a class to read about it and see who else is taking it; click it to enroll. You can take
                  up to {config.maxCourses}, and no two that meet at the same time.
                </p>
              )}
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}
