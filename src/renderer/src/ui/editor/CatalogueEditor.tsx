import { useState, type ReactNode } from 'react'
import { buildCatalogue, catalogueBasis, catalogueOf, courseLabel, describeMeetings, dormantCourses, skillFor, topicsOf } from '../../../../shared/game'
import { courseOf, type ContentPack, type Course } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { Button } from '../Button'
import { WeekPlanner } from '../WeekPlanner'
import { t } from '../../../../shared/i18n'

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
 * added or changes what she studies.
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
  const mayLeave = () => !dirty || window.confirm(t('editor.catalogue.discard'))
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
    setStatus(t('editor.catalogue.built'))
  }

  async function save() {
    try {
      const result = await window.api.editor.saveCatalogue(catalogueOf(content, seed, courses))
      setIssues(result.issues)
      if (result.issues.length > 0) return
      onContent(result.content)
      setStatus(t('editor.catalogue.saved'))
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
            ? t('editor.catalogue.noCoursework')
            : saved === undefined
              ? t('editor.catalogue.noneSaved')
              : stale
                ? t('editor.catalogue.stale')
                : t('editor.catalogue.savedCount', { count: saved.courses.length })}
        </p>
        <label>
          {t('editor.catalogue.seed')}
          <input inputMode="numeric" value={seed} onChange={(e) => setSeed(Number(e.target.value.replace(/\D/g, '').slice(0, 9)) || 0)} />
          <span className="hint">{t('editor.catalogue.seedHint')}</span>
        </label>
        <Button variant="primary" disabled={!config} onClick={() => generate(seed)}>
          {t('editor.catalogue.generate')}
        </Button>
        <Button disabled={!config} onClick={() => generate(Math.floor(Math.random() * 1_000_000))}>
          {t('editor.catalogue.generateNewSeed')}
        </Button>
        <Button variant="primary" disabled={!dirty || courses.length === 0} onClick={save}>
          {t('editor.catalogue.save')}
        </Button>
        {status && <p className="status">{status}</p>}
        {issues.map((issue) => (
          <p key={issue} className="notice">
            {issue}
          </p>
        ))}
        {dormant.length > 0 && (
          <p className="hint">
            {t('editor.catalogue.dormant', { courses: dormant.map((course) => `${course.number} ${course.title}`).join('; ') })}
          </p>
        )}
      </aside>

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>{t('editor.sides.courses')}</h1>
            <span className="hint">
              {courses.length === 0
                ? t('editor.catalogue.nothingBuilt')
                : t('editor.catalogue.summary', { courses: courses.length, subjects: majors.length, meetings: courses.reduce((sum, c) => sum + c.meetings.length, 0), dirty })}
            </span>
          </div>
          {courses.length > 0 && (
            <label className="catalogue-filter">
              {t('editor.catalogue.show')}
              <select value={only} onChange={(e) => setOnly(e.target.value)}>
                <option value="">{t('editor.catalogue.everySubject')}</option>
                {majors.map(([code, subject]) => (
                  <option key={code} value={code}>
                    {t('editor.catalogue.subjectOption', { code, subject })}
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
                  {focus.general && <span className="chip">{t('editor.catalogue.general')}</span>}
                </div>
                {/* What it is and what it teaches is the curriculum's: shown, and changed there. */}
                <strong>{focus.title}</strong>
                <p>{focus.description}</p>
                <span className="hint">
                  {focus.professor} · {describeMeetings(focus)}
                  {focus.studentIds.length > 0 && t('editor.catalogue.takenBy', { names: focus.studentIds.map(nameOf).join(', ') })}
                </span>
                {skillFor(content, focus) && (
                  <span className="hint">
                    {t('editor.catalogue.teaches', { at: skillFor(content, focus)!.at, name: skillFor(content, focus)!.name, description: skillFor(content, focus)!.description })}
                  </span>
                )}
                <span className="hint">
                  {t('editor.catalogue.classes', { classes: topicsOf(content, courseOf(focus)).map((topic) => topic.title).join(' · ') || t('editor.catalogue.noClasses') })}
                </span>
              </div>
            )}
            <div className="catalogue-list">
              {shown.map((course) => (
                <button key={course.id} type="button" className={course.id === focusId ? 'trait-row picked' : 'trait-row'} onClick={() => setFocusId(course.id)}>
                  <strong>{courseLabel(course)}</strong>
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
