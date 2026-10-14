import { useState } from 'react'
import { canEnrol, courseMatches, describeMeetings, toDate, skillFor } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { Backdrop } from './Backdrop'
import { Button } from './Button'
import { Dialog } from './Dialog'
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
  // What is being looked for: a person's name, a course code, a word of a title. Courses that answer it are picked out and the rest fade.
  const [search, setSearch] = useState('')
  const searching = search.trim() !== ''
  const found = searching ? state.courses.filter((course) => courseMatches(content, course, search)) : []

  const location = content.locations.find((l) => l.id === config?.locationId)
  const date = toDate(content.calendar, state.time)
  const focus = state.courses.find((c) => c.id === focusId)
  const focusCheck = focus && canEnrol(content, state, selected, focus.id)
  const classmates = content.loveInterests.filter((li) => focus?.studentIds.includes(li.id))
  const teacher = content.loveInterests.find((li) => li.id === focus?.teacherId)

  // Asking for his courses to be chosen for him: what he typed, whether it is being worked out, and what came back.
  const [helping, setHelping] = useState(false)
  const [wish, setWish] = useState('')
  const [asking, setAsking] = useState(false)
  const [advice, setAdvice] = useState<{ why: string; dropped: string[] } | { error: string } | null>(null)

  async function ask() {
    if (wish.trim() === '' || asking) return
    setAsking(true)
    setAdvice(null)
    try {
      const pick = await window.api.pickCourses({ state, text: wish.trim() })
      // What was chosen takes the place of whatever he had picked: he can still change any of it on the planner.
      setSelected(pick.courseIds)
      setFocusId(pick.courseIds[0] ?? null)
      setAdvice({ why: pick.why, dropped: pick.dropped })
    } catch (cause) {
      setAdvice({ error: (cause as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') })
    } finally {
      setAsking(false)
    }
  }

  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])

  return (
    <main className="stage">
      {helping && (
        <Dialog title="Help me pick" onClose={() => setHelping(false)} narrow noClose>
          <label>
            What do you want from this term?
            <textarea value={wish} rows={3} maxLength={500} autoFocus disabled={asking} placeholder="I want to major in biology" onChange={(e) => setWish(e.target.value)} />
          </label>
          {advice && 'error' in advice && <p className="notice">{advice.error}</p>}
          {advice && 'why' in advice && (
            <>
              <p>{advice.why}</p>
              <ul className="pick-list">
                {selected.map((id) => {
                  const course = state.courses.find((c) => c.id === id)
                  return course ? (
                    <li key={id}>
                      <strong>{course.number}</strong> {course.title}
                    </li>
                  ) : null
                })}
              </ul>
              {advice.dropped.length > 0 && <p className="hint">Left out, because they clash or are one too many: {advice.dropped.join(', ')}.</p>}
            </>
          )}
          <div className="actions end">
            <Button variant="quiet" onClick={() => setHelping(false)}>
              {advice && 'why' in advice ? 'Done' : 'Cancel'}
            </Button>
            <Button variant="primary" disabled={asking || wish.trim() === ''} onClick={ask}>
              {asking ? 'Choosing...' : advice && 'why' in advice ? 'Choose again' : 'Choose for me'}
            </Button>
          </div>
        </Dialog>
      )}
      <Backdrop screen="courses" location={location} periodId={date.period.id} light={date.period.light} />
      <div className="planner-panel glass framed">
        <div className="market-head">
          <div>
            <span className="caps">Start of term</span>
            <h1>Plan your week</h1>
          </div>
          <label className="planner-search">
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a name or a code: Tamsin, ADM" aria-label="Search courses" />
            {searching && (
              <span className="hint">
                {found.length === 0 ? 'No course matches' : `${found.length} course${found.length === 1 ? '' : 's'}`}
              </span>
            )}
          </label>
          <span className="hint">
            {selected.length} of {config?.maxCourses} courses chosen
          </span>
          <Button variant="secondary" onClick={() => setHelping(true)}>
            Help me pick
          </Button>
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
              mark={(course) =>
                [selected.includes(course.id) ? 'on' : canEnrol(content, state, selected, course.id).ok ? '' : 'blocked', searching && (found.includes(course) ? 'match' : 'dim')]
                  .filter(Boolean)
                  .join(' ')
              }
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
                  {skillFor(content, focus) && (
                    <p className="course-skill">
                      <span className="caps">Teaches at {skillFor(content, focus)!.at} marks</span>
                      <strong>{skillFor(content, focus)!.name}</strong> {skillFor(content, focus)!.description}
                    </p>
                  )}
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
