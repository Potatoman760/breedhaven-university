import { useState } from 'react'
import { canBeginTerm, canEnrol, courseLabel, courseMatches, describeMeetings, toDate, skillFor } from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { Backdrop } from './Backdrop'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { Portrait } from './Portrait'
import { Tour, type TourStep } from './Tour'
import { WeekPlanner } from './WeekPlanner'
import { t } from '../../../shared/i18n'

interface Props {
  content: ContentPack
  state: GameState
  /** Called with the chosen course ids. */
  onEnrol: (courseIds: string[]) => void
  /** Whether he has been shown round the screen already. */
  toured: boolean
  onToured: () => void
}

// Who shows him round the screen at the start of his first term.
const GUIDE_ID = 'tamsin'

/**
 * The start of term: the catalogue this game began with, laid out as a week planner, a
 * column per day and a row per hour, for the player to pick from.
 */
export function CoursesView({ content, state, onEnrol, toured, onToured }: Props) {
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

  // The tour of the screen, the first time it is seen: what each part is for, said by someone he knows.
  const guide = content.loveInterests.find((li) => li.id === GUIDE_ID)
  const taught = state.courses.find((course) => skillFor(content, course) && course.studentIds.includes(GUIDE_ID)) ?? state.courses.find((course) => skillFor(content, course))
  const tour: TourStep[] = config
    ? [
        {
          target: '.planner',
          expression: 'happy',
          text: t('screens.courses.tourWeek', { player: state.player.name, lectures: config.lecturesPerWeek, labHours: config.labHours, max: config.maxCourses })
        },
        ...(taught
          ? [
              {
                target: '.course-skill',
                before: () => setFocusId(taught.id),
                text: t('screens.courses.tourSkill')
              }
            ]
          : []),
        {
          target: '.planner-search',
          expression: 'embarrassed',
          before: () => setFocusId(null),
          text: t('screens.courses.tourSearch')
        },
        {
          target: '[data-tour="help"]',
          text: t('screens.courses.tourHelp')
        },
        { expression: 'happy', text: t('screens.courses.tourDone', { player: state.player.name }) }
      ]
    : []

  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id])

  return (
    <main className="stage">
      {helping && (
        <Dialog title={t('screens.courses.helpMePick')} onClose={() => setHelping(false)} narrow noClose>
          <label>
            {t('screens.courses.wishLabel')}
            <textarea value={wish} rows={3} maxLength={500} autoFocus disabled={asking} placeholder={t('screens.courses.wishPlaceholder')} onChange={(e) => setWish(e.target.value)} />
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
                      <strong>{courseLabel(course)}</strong> {course.title}
                    </li>
                  ) : null
                })}
              </ul>
              {advice.dropped.length > 0 && <p className="hint">{t('screens.courses.leftOut', { courses: advice.dropped.join(', ') })}</p>}
            </>
          )}
          <div className="actions end">
            <Button variant="quiet" onClick={() => setHelping(false)}>
              {advice && 'why' in advice ? t('screens.courses.done') : t('screens.courses.cancel')}
            </Button>
            <Button variant="primary" disabled={asking || wish.trim() === ''} onClick={ask}>
              {asking ? t('screens.courses.choosing') : advice && 'why' in advice ? t('screens.courses.chooseAgain') : t('screens.courses.chooseForMe')}
            </Button>
          </div>
        </Dialog>
      )}
      {!toured && guide && tour.length > 0 && state.courses.length > 0 && <Tour guide={guide} steps={tour} onDone={onToured} />}
      <Backdrop screen="courses" location={location} periodId={date.period.id} light={date.period.light} />
      <div className="planner-panel glass framed">
        <div className="market-head">
          <div>
            <span className="caps">{t('screens.courses.startOfTerm')}</span>
            <h1>{t('screens.courses.planYourWeek')}</h1>
          </div>
          <label className="planner-search">
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('screens.courses.searchPlaceholder')} aria-label={t('screens.courses.searchLabel')} />
            {searching && (
              <span className="hint">
                {found.length === 0 ? t('screens.courses.noMatch') : t('screens.dayView.courses', { n: found.length })}
              </span>
            )}
          </label>
          <span className="hint">
            {t('screens.courses.chosen', { n: selected.length, max: config?.maxCourses ?? '' })}
          </span>
          <Button variant="secondary" data-tour="help" onClick={() => setHelping(true)}>
            {t('screens.courses.helpMePick')}
          </Button>
          <Button variant="primary" disabled={!canBeginTerm(content, selected).ok} title={canBeginTerm(content, selected).reasons.join(' · ') || undefined} onClick={() => onEnrol(selected)}>
            {t('screens.courses.beginTerm')}
          </Button>
        </div>

        {state.courses.length === 0 || !config ? (
          <p className="hint center">{t('screens.courses.catalogueMissing')}</p>
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
                    <span className="chip dark">{courseLabel(focus)}</span>
                    {focus.general && <span className="chip">{t('screens.courses.generalEducation')}</span>}
                    {focus.meetings.some((m) => m.kind === 'lab') && <span className="chip">{t('screens.courses.hasLab')}</span>}
                  </div>
                  <h2>{focus.title}</h2>
                  <span className="hint">{focus.professor}</span>
                  <span className="hint">{describeMeetings(focus)}</span>
                  <p>{focus.description}</p>
                  {skillFor(content, focus) && (
                    <p className="course-skill">
                      <span className="caps">{t('screens.courses.teachesAt', { at: skillFor(content, focus)!.at })}</span>
                      <strong>{skillFor(content, focus)!.name}</strong> {skillFor(content, focus)!.description}
                    </p>
                  )}
                  <span className="caps">{t('screens.calendar.inThisClass')}</span>
                  {classmates.length === 0 && !teacher && <span className="hint">{t('screens.calendar.noOneYouKnow')}</span>}
                  <div className="portraits">
                    {teacher && <Portrait who={teacher} caption />}
                    {classmates.map((li) => (
                      <Portrait key={li.id} who={li} caption />
                    ))}
                  </div>
                  <button
                    className={selected.includes(focus.id) ? 'secondary' : ''}
                    disabled={!selected.includes(focus.id) && !focusCheck?.ok}
                    onClick={() => toggle(focus.id)}
                  >
                    {selected.includes(focus.id) ? t('screens.courses.drop') : t('screens.courses.enroll')}
                  </button>
                  {!selected.includes(focus.id) && !focusCheck?.ok && <span className="pin-note">{focusCheck?.reasons.join(' · ')}</span>}
                </>
              ) : (
                <p className="hint">
                  {t('screens.courses.planHint', { lectures: config.lecturesPerWeek, hours: config.lectureHours, labHours: config.labHours, max: config.maxCourses })}
                </p>
              )}
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}
