import { useState, type ReactNode } from 'react'
import { isSafeId, slugify, type EditorResult } from '../../../../shared/editor'
import { kindOf, STAT_LABELS, STATS, type ContentPack, type Society, type Stat } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { Button } from '../Button'
import { useConfirm } from '../Confirm'
import { JobIcon } from '../icons'
import { Portrait } from '../Portrait'
import { EditorFoot, Group, Text } from './fields'
import { t } from '../../../../shared/i18n'

interface Props {
  content: ContentPack
  /** Called whenever a change has been written and the game's content reloaded. */
  onContent: (content: ContentPack) => void
  /** The switch between the sides of the editor, given a check to make before leaving this one. */
  switcher: (mayLeave: () => boolean) => ReactNode
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`

/**
 * The student societies: what each is, where and when it meets, what a meeting trains, and which students belong to it.
 * They are the game's own, so this side is there only when it is run from source.
 */
export function SocietiesEditor({ content, onContent, switcher }: Props) {
  const config = content.societies
  const societies = config?.societies ?? []
  const most = config?.maxMembers ?? 2
  const weekdays = content.coursework?.weekdays ?? content.calendar.weekdays
  const after = content.coursework?.dayEnd ?? 18
  const blank = (): Society => ({ id: '', name: '', description: '', locationId: content.locations[0]?.id ?? '', weekday: weekdays[0], startHour: after, stats: ['charisma'], memberIds: [], syllabus: [], adultEvents: [] })
  const [original, setOriginal] = useState<Society | null>(societies[0] ?? null)
  const [draft, setDraft] = useState<Society>(societies[0] ?? blank())
  const [issues, setIssues] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const { ask, dialog } = useConfirm()

  const isNew = original === null
  const dirty = !same(draft, original ?? blank())
  const mayLeave = () => !dirty || window.confirm(t('editor.common.discard'))
  const set = (patch: Partial<Society>) => {
    setIssues([])
    setDraft((current) => ({ ...current, ...patch }))
  }
  const placeName = (id: string) => content.locations.find((l) => l.id === id)?.name ?? id
  const students = content.loveInterests.filter((li) => kindOf(li) === 'student')
  const teachers = content.loveInterests.filter((li) => kindOf(li) === 'teacher')
  // Every student is meant to belong to one: those who do not, as the saved societies stand.
  const unplaced = students.filter((li) => !societies.some((society) => society.memberIds.includes(li.id)))
  // By the day and hour they meet.
  const listed = [...societies].sort((a, b) => weekdays.indexOf(a.weekday) - weekdays.indexOf(b.weekday) || a.startHour - b.startHour)

  function open(next: Society | null) {
    if (!mayLeave()) return
    setOriginal(next)
    setDraft(next ?? blank())
    setIssues([])
    setStatus('')
  }

  /** Makes a change, and afterwards shows the society of the given id, or the first one. */
  async function apply(change: Promise<EditorResult>, done: string, showId: string) {
    setBusy(true)
    try {
      const result = await change
      setIssues(result.issues)
      if (result.issues.length > 0) return
      onContent(result.content)
      const all = result.content.societies?.societies ?? []
      const next = all.find((society) => society.id === showId) ?? all[0] ?? null
      setOriginal(next)
      setDraft(next ?? blank())
      setStatus(done)
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const toggleStat = (stat: Stat) =>
    set({ stats: draft.stats.includes(stat) ? draft.stats.filter((one) => one !== stat) : [...draft.stats, stat].slice(-2) })
  const toggleMember = (id: string) => set({ memberIds: draft.memberIds.includes(id) ? draft.memberIds.filter((one) => one !== id) : [...draft.memberIds, id] })

  return (
    <main className="editor">
      {switcher(mayLeave)}
      {dialog}
      <aside className="editor-list">
        <Button variant="primary" onClick={() => open(null)}>
          {t('editor.societies.new')}
        </Button>
        <div className="editor-people">
          {listed.map((society) => (
            <button key={society.id} className={!isNew && society.id === original?.id ? 'courier-person selected' : 'courier-person'} onClick={() => open(society)}>
              <JobIcon name="columns" image={society.iconImage} size={22} />
              <span>
                <strong>{society.name}</strong>
                <span className="hint">
                  {t('editor.societies.listed', { weekday: society.weekday, time: clock(society.startHour), count: society.memberIds.length, most })}
                </span>
              </span>
            </button>
          ))}
          {listed.length === 0 && <p className="hint">{t('editor.societies.none')}</p>}
        </div>
        {unplaced.length > 0 && <p className="pin-note">{t('editor.societies.unplaced', { names: unplaced.map((li) => li.name.split(' ')[0]).join(', ') })}</p>}
      </aside>

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>{draft.name || (isNew ? t('editor.societies.new') : draft.id)}</h1>
            <span className="hint">{isNew ? t('editor.common.notSaved') : t('editor.societies.when', { place: placeName(draft.locationId), weekday: draft.weekday, time: clock(draft.startHour) })}</span>
          </div>
        </div>

        <div className="editor-body">
          <Group title={t('editor.jobs.whatItIs')}>
            <div className="row">
              <Text label={t('editor.common.name')} llm value={draft.name} onChange={(name) => set(isNew ? { name, id: slugify(name.replace(/^the /i, '')) } : { name })} />
              <Text label={t('editor.common.id')} value={draft.id} disabled={!isNew} onChange={(id) => set({ id: slugify(id) })} hint={isNew ? t('editor.common.idFixed') : undefined} />
            </div>
            <Text label={t('editor.common.description')} llm value={draft.description} rows={3} onChange={(description) => set({ description })} />
          </Group>

          <Group title={t('editor.societies.whenWhere')}>
            <div className="row">
              <label>
                {t('editor.jobs.where')}
                <select value={draft.locationId} onChange={(e) => set({ locationId: e.target.value })}>
                  {content.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('editor.jobs.day')}
                <select value={draft.weekday} onChange={(e) => set({ weekday: e.target.value })}>
                  {weekdays.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('editor.jobs.startHour')}
                <input
                  type="number"
                  min={0}
                  max={content.calendar.hoursPerDay - 1}
                  value={draft.startHour}
                  onChange={(e) => set({ startHour: Math.min(content.calendar.hoursPerDay - 1, Math.max(0, Math.floor(Number(e.target.value)) || 0)) })}
                />
              </label>
            </div>
          </Group>

          <Group title={t('editor.societies.trains')}>
            <div className="row checks">
              {STATS.map((stat) => (
                <label key={stat} className="inline">
                  <input type="checkbox" checked={draft.stats.includes(stat)} onChange={() => toggleStat(stat)} />
                  {STAT_LABELS[stat]}
                </label>
              ))}
            </div>
          </Group>

          <Group title={t('editor.societies.sponsor')}>
            <label>
              {t('editor.societies.sponsorLabel')}
              <select value={draft.sponsorId ?? ''} onChange={(e) => set({ sponsorId: e.target.value || undefined })}>
                <option value="">{t('editor.common.nobody')}</option>
                {teachers.map((li) => (
                  <option key={li.id} value={li.id}>
                    {li.name}
                  </option>
                ))}
              </select>
            </label>
          </Group>

          <Group title={t('editor.societies.members', { count: draft.memberIds.length, most })}>
            <div className="portraits society-members">
              {students.map((li) => {
                const member = draft.memberIds.includes(li.id)
                return (
                  <button
                    key={li.id}
                    type="button"
                    className={member ? 'society-member picked' : 'society-member'}
                    aria-pressed={member}
                    disabled={!member && draft.memberIds.length >= most}
                    onClick={() => toggleMember(li.id)}
                  >
                    <Portrait who={li} caption />
                  </button>
                )
              })}
            </div>
          </Group>
        </div>

        <EditorFoot
          issues={issues}
          status={status}
          busy={busy}
          dirty={dirty}
          canSave={isSafeId(draft.id) && draft.name.trim() !== '' && draft.stats.length > 0}
          onUndo={() => (setDraft(original ?? blank()), setIssues([]))}
          onSave={() => apply(window.api.editor.saveSociety(draft), t('editor.common.saved'), draft.id)}
          remove={
            !isNew
              ? {
                  label: t('editor.common.delete'),
                  onClick: async () =>
                    (await ask({ title: t('editor.common.deleteNamed', { name: draft.name }), detail: t('editor.societies.deleteDetail'), confirm: t('editor.common.delete'), grave: true })) &&
                    apply(window.api.editor.deleteSociety(draft.id), t('editor.common.deleted'), '')
                }
              : undefined
          }
        />
      </section>
    </main>
  )
}
