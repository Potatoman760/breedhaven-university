import { useState, type ReactNode } from 'react'
import { buildCatalogue, catalogueBasis, catalogueOf, describeMeetings, dormantCourses, skillFor, topicsOf } from '../../../../shared/game'
import type { ContentPack, Course } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { Button } from '../Button'
import { WeekPlanner } from '../WeekPlanner'

interface Props {
  content: ContentPack
  /** Called whenever a change has been written and the game's content reloaded. */
  onContent: (content: ContentPack) => void
  onClose: () => void
  /** The switch between the sides of the editor, given a check to make before leaving this one. */
  switcher: (mayLeave: () => boolean) => ReactNode
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The term's schedule every new game starts with. What the courses are, what they are called and what they teach
 * is written in the curriculum and only shown here. This lays them out: which are given, when each meets, and who
 * is in it. It is built by rule in an instant from the characters as they stand, and is built again when one is
 * added or changes what she reads.
 */
export function CatalogueEditor({ content, onContent, switcher }: Props) {
  const saved = content.catalogue
  const [seed, setSeed] = useState(saved?.seed ?? 1)
  const [courses, setCourses] = useState<Course[]>(saved?.courses ?? [])
  const [focusId, setFocusId] = useState<string | null>(null)
  // Which major's courses the grid shows; empty for all of them.
  const [only, setOnly] = useState('')
  const [status, setStatus] = useState('')
  const [issues, setIssues] = useState<string[]>([])

  const config = content.coursework
  const stale = saved !== undefined && saved.basis !== catalogueBasis(content)
  const dirty = !same(courses, saved?.courses ?? [])
  const mayLeave = () => !dirty || window.confirm('Discard the schedule you have not saved?')
  const focus = courses.find((c) => c.id === focusId)
  const majors = [...new Map(courses.map((c) => [c.code, c.subject])).entries()]
  const shown = only ? courses.filter((c) => c.code === only) : courses
  const nameOf = (id: string) => content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id
  const dormant = dormantCourses(content, courses)

  function generate(withSeed: number) {
    setSeed(withSeed)
    setCourses(buildCatalogue(content, withSeed))
    setFocusId(null)
    setIssues([])
    setStatus('Schedule built. Save to use it in new games.')
  }

  async function save() {
    try {
      const result = await window.api.editor.saveCatalogue(catalogueOf(content, seed, courses))
      setIssues(result.issues)
      if (result.issues.length > 0) return
      onContent(result.content)
      setStatus('Saved. Every new game starts with this schedule.')
    } catch (error) {
      setStatus(errorMessage(error))
    }
  }

  return (
    <main className="editor">
      {switcher(mayLeave)}
      <aside className="editor-list">
        <p className="hint">
          {!config || !content.curriculum
            ? 'This game has no coursework.'
            : saved === undefined
              ? 'No schedule has been saved yet. A new game cannot start without one.'
              : stale
                ? 'The saved schedule is out of date: a character was added or changed what she reads or teaches, or the curriculum has changed. Build it again.'
                : `The saved schedule has ${saved.courses.length} courses.`}
        </p>
        <label>
          Seed
          <input inputMode="numeric" value={seed} onChange={(e) => setSeed(Number(e.target.value.replace(/\D/g, '').slice(0, 9)) || 0)} />
          <span className="hint">The same seed and the same characters always give the same schedule.</span>
        </label>
        <Button variant="primary" disabled={!config} onClick={() => generate(seed)}>
          Generate schedule
        </Button>
        <Button disabled={!config} onClick={() => generate(Math.floor(Math.random() * 1_000_000))}>
          Generate with a new seed
        </Button>
        <Button variant="primary" disabled={!dirty || courses.length === 0} onClick={save}>
          Save schedule
        </Button>
        {status && <p className="status">{status}</p>}
        {issues.map((issue) => (
          <p key={issue} className="notice">
            {issue}
          </p>
        ))}
        {dormant.length > 0 && (
          <p className="hint">
            Written but not given this term, because no love interest reads or teaches them: {dormant.map((course) => `${course.number} ${course.title}`).join('; ')}.
          </p>
        )}
      </aside>

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>Courses</h1>
            <span className="hint">
              {courses.length === 0
                ? 'Nothing built yet.'
                : `${courses.length} courses in ${majors.length} subjects, ${courses.reduce((sum, c) => sum + c.meetings.length, 0)} meetings a week.${dirty ? ' Not saved.' : ''}`}
            </span>
          </div>
          {courses.length > 0 && (
            <label className="catalogue-filter">
              Show
              <select value={only} onChange={(e) => setOnly(e.target.value)}>
                <option value="">Every subject</option>
                {majors.map(([code, subject]) => (
                  <option key={code} value={code}>
                    {code}: {subject}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {courses.length > 0 && (
          <div className="editor-body catalogue">
            <WeekPlanner content={content} courses={shown} focusId={focusId} onFocus={(course) => setFocusId(course.id)} />
            {focus && (
              <div className="card">
                <div className="chips">
                  <span className="chip dark">{focus.number}</span>
                  <span className="chip">{focus.subject}</span>
                  {focus.general && <span className="chip">General education</span>}
                </div>
                {/* What it is and what it teaches is the curriculum's: shown, and changed there. */}
                <strong>{focus.title}</strong>
                <p>{focus.description}</p>
                <span className="hint">
                  {focus.professor} · {describeMeetings(focus)}
                  {focus.studentIds.length > 0 && ` · taken by ${focus.studentIds.map(nameOf).join(', ')}`}
                </span>
                {skillFor(content, focus) && (
                  <span className="hint">
                    Teaches at {skillFor(content, focus)!.at} marks: {skillFor(content, focus)!.name}. {skillFor(content, focus)!.description}
                  </span>
                )}
                <span className="hint">
                  Classes: {topicsOf(content, focus.id).map((topic) => topic.title).join(' · ') || 'none written'}
                </span>
              </div>
            )}
            <div className="catalogue-list">
              {shown.map((course) => (
                <button key={course.id} type="button" className={course.id === focusId ? 'trait-row picked' : 'trait-row'} onClick={() => setFocusId(course.id)}>
                  <strong>{course.number}</strong>
                  <span className="trait-text">
                    <span>{course.title}</span>
                    <span className="hint">
                      {course.professor} · {describeMeetings(course)}
                      {course.studentIds.length > 0 && ` · ${course.studentIds.map(nameOf).join(', ')}`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
