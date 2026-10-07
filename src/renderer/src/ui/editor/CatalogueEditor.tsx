import { useRef, useState, type ReactNode } from 'react'
import { buildCatalogue, catalogueBasis, catalogueOf, describeMeetings, WORDING_BATCH } from '../../../../shared/game'
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
 * The course catalogue every new game starts with. The schedule is built by rule in an
 * instant, from the characters as they stand; the LLM is asked only for titles and
 * descriptions, and only when told to.
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
  const [writing, setWriting] = useState<{ done: number; total: number } | null>(null)
  const stopped = useRef(false)
  const latest = useRef(courses)
  latest.current = courses

  const config = content.coursework
  const stale = saved !== undefined && saved.basis !== catalogueBasis(content)
  const dirty = !same(courses, saved?.courses ?? [])
  const mayLeave = () => !dirty || window.confirm('Discard the catalogue you have not saved?')
  const focus = courses.find((c) => c.id === focusId)
  const majors = [...new Map(courses.map((c) => [c.code, c.subject])).entries()]
  const shown = only ? courses.filter((c) => c.code === only) : courses
  const nameOf = (id: string) => content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id

  function generate(withSeed: number) {
    setSeed(withSeed)
    setCourses(buildCatalogue(content, withSeed))
    setFocusId(null)
    setIssues([])
    setStatus('Schedule built. Titles are plain until you have them written. Save to use it in new games.')
  }

  /** Has the LLM title and describe every course, a batch at a time, putting each batch in as it arrives. */
  async function write() {
    if (writing || courses.length === 0) return
    stopped.current = false
    setIssues([])
    setStatus('')
    const ids = courses.map((c) => c.id)
    const failed: string[] = []
    try {
      for (let from = 0; from < ids.length; from += WORDING_BATCH) {
        if (stopped.current) break
        setWriting({ done: from, total: ids.length })
        const batch = ids.slice(from, from + WORDING_BATCH)
        const result = await window.api.editor.writeCourseWording(latest.current.filter((c) => batch.includes(c.id)))
        if (result.error) {
          failed.push(result.error)
          // Without a working LLM the rest would fail the same way.
          break
        }
        const written = new Map(result.courses.map((c) => [c.id, c]))
        setCourses(latest.current.map((c) => (written.has(c.id) ? { ...c, title: written.get(c.id)!.title, description: written.get(c.id)!.description } : c)))
      }
      setStatus(failed.length > 0 ? `Stopped: ${failed[0]}` : stopped.current ? 'Stopped. What was written is kept.' : 'Titles and descriptions written. Save to keep them.')
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setWriting(null)
    }
  }

  async function save() {
    try {
      const result = await window.api.editor.saveCatalogue(catalogueOf(content, seed, courses))
      setIssues(result.issues)
      if (result.issues.length > 0) return
      onContent(result.content)
      setStatus('Saved. Every new game starts with this catalogue.')
    } catch (error) {
      setStatus(errorMessage(error))
    }
  }

  const setCourse = (id: string, patch: Partial<Course>) => setCourses(courses.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  return (
    <main className="editor">
      {switcher(mayLeave)}
      <aside className="editor-list">
        <p className="hint">
          {!config
            ? 'This game has no coursework.'
            : saved === undefined
              ? 'No catalogue has been saved yet. A new game cannot start without one.'
              : stale
                ? 'The saved catalogue is out of date: the characters or the rules have changed since it was built. Build it again.'
                : `The saved catalogue has ${saved.courses.length} courses.`}
        </p>
        <label>
          Seed
          <input inputMode="numeric" value={seed} onChange={(e) => setSeed(Number(e.target.value.replace(/\D/g, '').slice(0, 9)) || 0)} />
          <span className="hint">The same seed and the same characters always give the same schedule.</span>
        </label>
        <Button variant="primary" disabled={!config || writing !== null} onClick={() => generate(seed)}>
          Generate schedule
        </Button>
        <Button disabled={!config || writing !== null} onClick={() => generate(Math.floor(Math.random() * 1_000_000))}>
          Generate with a new seed
        </Button>
        <Button disabled={courses.length === 0 || writing !== null} title="Asks the Main LLM for a title and a description for every course" onClick={write}>
          Write titles and descriptions
        </Button>
        {writing && (
          <div className="batch" role="status">
            <span>
              Writing {writing.done + 1} to {Math.min(writing.done + WORDING_BATCH, writing.total)} of {writing.total}
            </span>
            <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={writing.total} aria-valuenow={writing.done}>
              <div style={{ width: `${(writing.done / writing.total) * 100}%` }} />
            </div>
            <Button onClick={() => (stopped.current = true)}>Stop</Button>
          </div>
        )}
        <Button variant="primary" disabled={!dirty || courses.length === 0 || writing !== null} onClick={save}>
          Save catalogue
        </Button>
        {status && <p className="status">{status}</p>}
        {issues.map((issue) => (
          <p key={issue} className="notice">
            {issue}
          </p>
        ))}
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
                <label>
                  Title
                  <input value={focus.title} onChange={(e) => setCourse(focus.id, { title: e.target.value })} />
                </label>
                <label>
                  Description
                  <textarea rows={2} value={focus.description} onChange={(e) => setCourse(focus.id, { description: e.target.value })} />
                </label>
                <span className="hint">
                  {focus.professor} · {describeMeetings(focus)}
                  {focus.studentIds.length > 0 && ` · taken by ${focus.studentIds.map(nameOf).join(', ')}`}
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
