import { useEffect, useRef, useState } from 'react'
import { canEnrol, describeMeetings, draftCourses, fallbackTimetable, toDate } from '../../../shared/game'
import type { ContentPack, Course, GameState } from '../../../shared/model'
import { Backdrop } from './Backdrop'
import { Portrait } from './MapPanel'

const clock = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

interface Props {
  content: ContentPack
  state: GameState
  /** Called with the catalogue once it has been drawn up. */
  onCatalogue: (courses: Course[]) => void
  /** Called with the chosen course ids. */
  onEnrol: (courseIds: string[]) => void
}

/**
 * The start of term: the catalogue is drawn up for this game and laid out as a week
 * planner, a column per day and a row per time slot, for the player to pick from.
 */
export function CoursesView({ content, state, onCatalogue, onEnrol }: Props) {
  const config = content.coursework
  const [selected, setSelected] = useState<string[]>([])
  // The course whose details are shown beside the planner.
  const [focusId, setFocusId] = useState<string | null>(null)
  const [fallback, setFallback] = useState('')
  const requested = useRef(false)
  // Set once a catalogue is in place, so an answer that arrives after the player skipped is dropped.
  const settled = useRef(state.courses.length > 0)
  const [waited, setWaited] = useState(0)
  const waiting = state.courses.length === 0 && config !== undefined

  /** Puts a plain catalogue in place without the LLM: draft titles, timetables dealt out by rote. */
  const usePlain = (why: string) => {
    if (settled.current) return
    settled.current = true
    setFallback(why)
    onCatalogue(fallbackTimetable(content, draftCourses(content)))
  }

  // Draw up the catalogue once per game. The ref keeps a re-mount from asking the LLM twice.
  useEffect(() => {
    if (state.courses.length > 0 || requested.current) return
    requested.current = true
    window.api.generateCourses().then(
      (result) => {
        if (settled.current) return
        settled.current = true
        setFallback(result.error ?? '')
        onCatalogue(result.courses)
      },
      (error: unknown) => usePlain(error instanceof Error ? error.message : String(error))
    )
  }, [state.courses.length, onCatalogue])

  // Count the seconds while the LLM is writing, so the screen is plainly still alive.
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => setWaited((seconds) => seconds + 1), 1000)
    return () => clearInterval(timer)
  }, [waiting])

  const location = content.locations.find((l) => l.id === config?.locationId)
  const date = toDate(content.calendar, state.time)
  const { weekdays } = content.calendar
  const focus = state.courses.find((c) => c.id === focusId)
  const focusCheck = focus && canEnrol(content, state, selected, focus.id)
  const classmates = content.loveInterests.filter((li) => focus?.studentIds.includes(li.id))

  const toggle = (id: string) =>
    setSelected(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])

  return (
    <main className="stage">
      <Backdrop location={location} periodId={date.period.id} />
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
          <div className="registrar-wait">
            <p className="hint center">
              The registrar is drawing up this term's catalogue, and everyone is choosing their
              courses... {waited > 2 && `${waited}s`}
            </p>
            {config && (
              <>
                <p className="hint center">
                  This asks the Main LLM twice and can take a minute or more with a slow model.
                </p>
                <button className="secondary" onClick={() => usePlain('you skipped the wait.')}>
                  Skip: use a plain catalogue
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="planner-body">
            <div
              className="planner"
              style={{ gridTemplateColumns: `64px repeat(${weekdays.length}, minmax(0, 1fr))` }}
            >
              <span />
              {weekdays.map((day) => (
                <span key={day} className="caps planner-day">
                  {day}
                </span>
              ))}
              {config.startHours.map((hour) => [
                <span key={`time-${hour}`} className="planner-time">
                  {clock(hour)}
                  <span>to {clock(hour + config.hours)}</span>
                </span>,
                ...weekdays.map((day) => {
                  const here = state.courses.filter((c) =>
                    c.meetings.some((m) => m.weekday === day && m.startHour === hour)
                  )
                  const teaching = config.weekdays.includes(day)
                  return (
                    <div key={`${day}-${hour}`} className={teaching ? 'cell' : 'cell free'}>
                      {here.map((course) => {
                        const on = selected.includes(course.id)
                        const ok = on || canEnrol(content, state, selected, course.id).ok
                        return (
                          <button
                            key={course.id}
                            className={['block', on && 'on', !ok && 'blocked', course.id === focusId && 'focus']
                              .filter(Boolean)
                              .join(' ')}
                            aria-pressed={on}
                            onMouseEnter={() => setFocusId(course.id)}
                            onFocus={() => setFocusId(course.id)}
                            onClick={() => {
                              setFocusId(course.id)
                              if (ok) toggle(course.id)
                            }}
                          >
                            <strong>{course.number}</strong>
                            <span>{course.title}</span>
                            {course.studentIds.length > 0 && (
                              <span className="block-who">
                                {content.loveInterests
                                  .filter((li) => course.studentIds.includes(li.id))
                                  .map((li) => li.name.split(' ')[0])
                                  .join(', ')}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })
              ])}
            </div>

            <aside className="course-detail">
              {focus ? (
                <>
                  <div className="chips">
                    <span className="chip dark">{focus.number}</span>
                    {focus.general && <span className="chip">General education</span>}
                  </div>
                  <h2>{focus.title}</h2>
                  <span className="hint">{focus.professor}</span>
                  <span className="hint">
                    {describeMeetings(focus)}, {config.hours} hours
                  </span>
                  <p>{focus.description}</p>
                  <span className="caps">In this class</span>
                  {classmates.length === 0 && <span className="hint">No one you know.</span>}
                  <div className="portraits">
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
                  {!selected.includes(focus.id) && !focusCheck?.ok && (
                    <span className="pin-note">{focusCheck?.reasons.join(' · ')}</span>
                  )}
                </>
              ) : (
                <p className="hint">
                  Each course meets once a week for {config.hours} hours. Point at a class to read
                  about it and see who else is taking it; click it to enroll. You can take up to{' '}
                  {config.maxCourses}.
                </p>
              )}
              {fallback && (
                <span className="hint">Course names are plain placeholders this game: {fallback}</span>
              )}
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}
