import { useEffect, useState, type ReactNode } from 'react'
import { slugify, type EditorResult } from '../../../../shared/editor'
import { MAJOR_COURSES, STAT_LABELS, STATS, TOPICS_PER_COURSE, type ContentPack, type Major, type ModifierKind, type Stat, type WrittenCourse } from '../../../../shared/model'
import { COURSE_SKILL_KINDS } from '../../../../shared/game/draftMajor'
import { errorMessage } from '../../errors'
import { Button } from '../Button'
import { useConfirm } from '../Confirm'
import { CheckPills, EditorFoot, Group, Text } from './fields'
import { t } from '../../../../shared/i18n'

interface Props {
  content: ContentPack
  /** Called whenever a change has been written and the game's content reloaded. */
  onContent: (content: ContentPack) => void
  /** The switch between the sides of the editor, given a check to make before leaving this one. */
  switcher: (mayLeave: () => boolean) => ReactNode
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
// Choosing "a new college" in the college list.
const NEW_COLLEGE = '+new'
type Topic = WrittenCourse['topics'][number]
type Skill = NonNullable<WrittenCourse['skill']>

const blankTopic = (n: number): Topic => ({ title: `Class ${n + 1}`, content: '', question: { ask: '', answer: '', wrong: ['', '', ''] } })
const blankSkill = (): Skill => ({ id: '', name: '', description: '', at: 30, passive: { kind: 'training', amount: 1.5, stats: ['intelligence'] }, upgrade: { at: 70, description: '', passive: { kind: 'training', amount: 2, stats: ['intelligence'] } } })
const blankCourse = (number: string): WrittenCourse => ({ number, title: '', description: '', general: false, topics: Array.from({ length: TOPICS_PER_COURSE }, (_, n) => blankTopic(n)), skill: blankSkill() })

/**
 * The University's subjects: the game's own, to look at, and those made here, which a student can read as her own and
 * a teacher give. A new one can be drafted whole by the Main LLM and then read over and changed; nothing is written for
 * it when a game starts.
 */
export function MajorsEditor({ content, onContent, switcher }: Props) {
  const curriculum = content.curriculum
  const colleges = curriculum?.colleges ?? []
  const blank = (): Major => ({ code: '', subject: '', college: colleges[0]?.id ?? '', general: false, stats: ['intelligence'], practical: false, courses: [blankCourse('101'), blankCourse('120')] })
  const [origins, setOrigins] = useState<Record<string, string>>({})
  useEffect(() => {
    window.api.editor.info().then((info) => setOrigins(info.majors), () => undefined)
  }, [content])
  const own = (major: Major) => origins[major.code] === 'addon'
  const majors = curriculum?.majors.filter((major) => !major.general) ?? []
  const [original, setOriginal] = useState<Major | null>(null)
  const [draft, setDraft] = useState<Major>(blank())
  const [newCollege, setNewCollege] = useState('')
  const [idea, setIdea] = useState({ notes: '' })
  const [issues, setIssues] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const { ask, dialog } = useConfirm()

  const isNew = original === null
  const editable = isNew || own(original)
  const dirty = !same(draft, original ?? blank()) || newCollege !== ''
  const mayLeave = () => !dirty || window.confirm(t('editor.common.discard'))
  const set = (patch: Partial<Major>) => {
    setIssues([])
    setDraft((current) => ({ ...current, ...patch }))
  }
  const setCourse = (index: number, patch: Partial<WrittenCourse>) => set({ courses: draft.courses.map((course, i) => (i === index ? { ...course, ...patch } : course)) })
  const setTopic = (index: number, at: number, patch: Partial<Topic>) => setCourse(index, { topics: draft.courses[index].topics.map((topic, i) => (i === at ? { ...topic, ...patch } : topic)) })
  const setSkill = (index: number, patch: Partial<Skill>) => setCourse(index, { skill: { ...(draft.courses[index].skill ?? blankSkill()), ...patch } })

  function open(next: Major | null) {
    if (!mayLeave()) return
    setOriginal(next)
    setDraft(next ?? blank())
    setNewCollege('')
    setIssues([])
    setStatus('')
  }

  /** Makes a change, and afterwards shows the subject of the given code, or a new one. */
  async function apply(change: Promise<EditorResult>, done: string, showCode: string) {
    setBusy(true)
    try {
      const result = await change
      setIssues(result.issues)
      if (result.issues.length > 0) return
      onContent(result.content)
      const next = result.content.curriculum?.majors.find((major) => major.code === showCode) ?? null
      setOriginal(next)
      setDraft(next ?? blank())
      setNewCollege('')
      setStatus(t('editor.common.doneRebuilt', { done, rebuilt: !!result.catalogueRebuilt }))
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function draftWithAi() {
    setBusy(true)
    setStatus(t('editor.majors.drafting'))
    try {
      const college = draft.college === NEW_COLLEGE ? slugify(newCollege) : draft.college
      const result = await window.api.editor.draftMajor({ subject: draft.subject, college, notes: idea.notes })
      if (result.error || !result.major) return setStatus(result.error ?? t('editor.common.nothingBack'))
      setDraft({ ...result.major, college: draft.college })
      setStatus(t('editor.majors.drafted'))
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function save() {
    // Each skill is known by its name until it has an id of its own.
    const major: Major = { ...draft, courses: draft.courses.map((course) => (course.skill && !course.skill.id ? { ...course, skill: { ...course.skill, id: slugify(course.skill.name) } } : course)) }
    const college = draft.college === NEW_COLLEGE ? { id: slugify(newCollege), name: newCollege.trim() } : undefined
    return apply(window.api.editor.saveMajor({ major: college ? { ...major, college: college.id } : major, college }), t('editor.common.saved'), major.code)
  }

  const collegeName = (id: string) => colleges.find((one) => one.id === id)?.name ?? id
  const numbers = (text: string) => Number(text) || 0

  return (
    <main className="editor">
      {switcher(mayLeave)}
      {dialog}
      <aside className="editor-list">
        <Button variant="primary" onClick={() => open(null)}>
          {t('editor.majors.new')}
        </Button>
        <div className="editor-people">
          {majors.map((major) => (
            <button key={major.code} className={!isNew && major.code === original?.code ? 'courier-person selected' : 'courier-person'} onClick={() => open(major)}>
              <span>
                <strong>
                  {major.code} {major.subject}
                </strong>
                <span className="hint">
                  {t('editor.majors.listed', { own: own(major), count: major.courses.length })}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>{draft.subject || (isNew ? t('editor.majors.new') : draft.code)}</h1>
            <span className="hint">{isNew ? t('editor.common.notSaved') : t('editor.majors.head', { code: draft.code, college: collegeName(draft.college), editable })}</span>
          </div>
        </div>

        <div className="editor-body">
          {isNew && (
            <Group title={t('editor.majors.draftWithAi')} llm>
              <Text label={t('editor.majors.notes')} value={idea.notes} rows={2} onChange={(notes) => setIdea({ notes })} placeholder={t('editor.majors.notesPlaceholder')} />
              <Button disabled={busy || draft.subject.trim() === '' || draft.college === '' || (draft.college === NEW_COLLEGE && newCollege.trim() === '')} onClick={draftWithAi}>
                {busy ? t('editor.majors.draftingButton') : t('editor.majors.draft')}
              </Button>
            </Group>
          )}

          <fieldset className="plain" disabled={!editable}>
            <Group title={t('editor.majors.theSubject')}>
              <div className="row">
                <Text label={t('editor.majors.subject')} llm value={draft.subject} onChange={(subject) => set({ subject })} />
                <Text label={t('editor.majors.code')} value={draft.code} disabled={!isNew} onChange={(code) => set({ code: code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) })} />
                <label>
                  {t('editor.majors.college')}
                  <select value={draft.college} onChange={(e) => set({ college: e.target.value })}>
                    {colleges.map((one) => (
                      <option key={one.id} value={one.id}>
                        {one.name}
                      </option>
                    ))}
                    <option value={NEW_COLLEGE}>{t('editor.majors.newCollege')}</option>
                  </select>
                </label>
                {draft.college === NEW_COLLEGE && <Text label={t('editor.majors.collegeName')} value={newCollege} onChange={setNewCollege} placeholder={t('editor.majors.collegePlaceholder')} />}
              </div>
              <CheckPills<Stat>
                label={t('editor.majors.trains')}
                options={STATS.map((stat) => ({ id: stat, name: STAT_LABELS[stat] }))}
                value={draft.stats}
                onChange={(stats) => stats.length >= 1 && stats.length <= 2 && set({ stats })}
              />
              <label className="row checks">
                <input type="checkbox" checked={draft.practical} onChange={(e) => set({ practical: e.target.checked })} />
                {t('editor.majors.lab')}
              </label>
            </Group>

            {draft.courses.map((course, index) => {
              const skill = course.skill ?? blankSkill()
              const kind = skill.passive?.kind ?? 'training'
              const setPassive = (patch: { kind?: ModifierKind; amount?: number; up?: number; stats?: Stat[] }) => {
                const nextKind = patch.kind ?? kind
                const stats = nextKind === 'training' ? (patch.stats ?? skill.passive?.stats ?? ['intelligence']) : undefined
                setSkill(index, {
                  passive: { kind: nextKind, amount: patch.amount ?? skill.passive?.amount ?? 1.5, ...(stats && { stats }) },
                  upgrade: { at: 70, description: skill.upgrade?.description ?? '', passive: { kind: nextKind, amount: patch.up ?? skill.upgrade?.passive?.amount ?? 2, ...(stats && { stats }) } }
                })
              }
              return (
                <Group key={index} title={`${draft.code || 'XXX'} ${course.number}${course.title ? `: ${course.title}` : ''}`}>
                  <div className="row">
                    <Text label={t('editor.majors.number')} value={course.number} onChange={(number) => setCourse(index, { number: number.replace(/\D/g, '').slice(0, 3) })} />
                    <Text label={t('editor.common.title')} llm value={course.title} onChange={(title) => setCourse(index, { title })} />
                  </div>
                  <Text label={t('editor.common.description')} llm value={course.description} rows={2} onChange={(description) => setCourse(index, { description })} />
                  <details>
                    <summary>{t('editor.majors.classes')}</summary>
                    {course.topics.map((topic, n) => (
                      <div key={n} className="editor-group">
                        <Text label={t('editor.majors.class', { n: n + 1 })} llm value={topic.title} onChange={(title) => setTopic(index, n, { title })} />
                        <Text label={t('editor.majors.teaches')} llm value={topic.content} rows={4} onChange={(content) => setTopic(index, n, { content })} />
                        <div className="row">
                          <Text label={t('editor.majors.ask')} value={topic.question?.ask ?? ''} onChange={(ask) => setTopic(index, n, { question: { ...(topic.question ?? blankTopic(n).question!), ask } })} />
                          <Text label={t('editor.majors.answer')} value={topic.question?.answer ?? ''} onChange={(answer) => setTopic(index, n, { question: { ...(topic.question ?? blankTopic(n).question!), answer } })} />
                        </div>
                        <div className="row">
                          {[0, 1, 2].map((w) => (
                            <Text
                              key={w}
                              label={t('editor.majors.wrong', { n: w + 1 })}
                              value={topic.question?.wrong[w] ?? ''}
                              onChange={(wrong) => {
                                const question = topic.question ?? blankTopic(n).question!
                                setTopic(index, n, { question: { ...question, wrong: question.wrong.map((one, i) => (i === w ? wrong : one)) } })
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </details>
                  <div className="row">
                    <Text label={t('editor.majors.skill')} value={skill.name} onChange={(name) => setSkill(index, { name })} />
                    <label>
                      {t('editor.majors.changes')}
                      <select value={kind} onChange={(e) => setPassive({ kind: e.target.value as ModifierKind })}>
                        {COURSE_SKILL_KINDS.map((one) => (
                          <option key={one.kind} value={one.kind} title={one.does}>
                            {one.kind}: {one.does}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t('editor.majors.at30')}
                      <input type="number" step={0.05} value={skill.passive?.amount ?? 1.5} onChange={(e) => setPassive({ amount: numbers(e.target.value) })} />
                    </label>
                    <label>
                      {t('editor.majors.at70')}
                      <input type="number" step={0.05} value={skill.upgrade?.passive?.amount ?? 2} onChange={(e) => setPassive({ up: numbers(e.target.value) })} />
                    </label>
                  </div>
                  {kind === 'training' && (
                    <CheckPills<Stat>
                      label={t('editor.majors.trainingIn')}
                      options={STATS.map((stat) => ({ id: stat, name: STAT_LABELS[stat] }))}
                      value={skill.passive?.stats ?? []}
                      onChange={(stats) => stats.length >= 1 && stats.length <= 2 && setPassive({ stats })}
                    />
                  )}
                  <div className="row">
                    <Text label={t('editor.majors.told')} value={skill.description} onChange={(description) => setSkill(index, { description })} placeholder={t('editor.majors.toldPlaceholder')} />
                    <Text label={t('editor.majors.at70')} value={skill.upgrade?.description ?? ''} onChange={(description) => setSkill(index, { upgrade: { ...(skill.upgrade ?? blankSkill().upgrade!), description } })} />
                  </div>
                  <Button variant="quiet" disabled={draft.courses.length <= MAJOR_COURSES} onClick={() => set({ courses: draft.courses.filter((_, i) => i !== index) })}>
                    {t('editor.majors.removeCourse')}
                  </Button>
                </Group>
              )
            })}
            <Button onClick={() => set({ courses: [...draft.courses, blankCourse(String(101 + draft.courses.length * 20))] })}>{t('editor.majors.addCourse')}</Button>
          </fieldset>
        </div>

        <EditorFoot
          issues={issues}
          status={status}
          busy={busy}
          dirty={dirty && editable}
          canSave={editable && draft.code.length >= 2 && draft.subject.trim() !== ''}
          onUndo={() => (setDraft(original ?? blank()), setNewCollege(''), setIssues([]))}
          onSave={save}
          remove={
            !isNew && editable
              ? {
                  label: t('editor.common.delete'),
                  onClick: async () =>
                    (await ask({ title: t('editor.common.deleteNamed', { name: draft.subject }), detail: t('editor.majors.deleteDetail'), confirm: t('editor.common.delete'), grave: true })) &&
                    apply(window.api.editor.deleteMajor(draft.code), t('editor.common.deleted'), '')
                }
              : undefined
          }
        />
      </section>
    </main>
  )
}
