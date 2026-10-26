import { useState, type ReactNode } from 'react'
import { isSafeId, slugify, type EditorResult } from '../../../../shared/editor'
import { STAT_LABELS, STATS, type ContentPack, type Job, type Shift, type Stat } from '../../../../shared/model'
import { describeShift } from '../../../../shared/game'
import { errorMessage } from '../../errors'
import { Button } from '../Button'
import { useConfirm } from '../Confirm'
import { JOB_ICON_PATHS, JobIcon } from '../icons'
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
const whole = (value: string, least: number) => Math.max(least, Math.floor(Number(value)) || least)

/**
 * The jobs the player can hold: what each is and where, who he answers to, what it pays
 * and builds, what he has to be to get it, and the shifts he is expected at each week.
 * They are the game's own, so this side is there only when it is run from source.
 */
export function JobsEditor({ content, onContent, switcher }: Props) {
  const jobs = content.jobs?.jobs ?? []
  const weekdays = content.calendar.weekdays
  const blank = (): Job => ({
    id: '',
    title: '',
    description: '',
    locationId: content.locations[0]?.id ?? '',
    bossId: content.npcs[0]?.id ?? '',
    hourlyRate: 8,
    requirements: {},
    shifts: [{ weekday: weekdays[0], startHour: 9, hours: 4 }]
  })
  const [original, setOriginal] = useState<Job | null>(jobs[0] ?? null)
  const [draft, setDraft] = useState<Job>(jobs[0] ?? blank())
  const [issues, setIssues] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const { ask, dialog } = useConfirm()

  const isNew = original === null
  const dirty = !same(draft, original ?? blank())
  const mayLeave = () => !dirty || window.confirm(t('editor.common.discard'))
  const set = (patch: Partial<Job>) => {
    // What was wrong with the last save may no longer be.
    setIssues([])
    setDraft((current) => ({ ...current, ...patch }))
  }
  const setShift = (index: number, patch: Partial<Shift>) => set({ shifts: draft.shifts.map((shift, i) => (i === index ? { ...shift, ...patch } : shift)) })
  const placeName = (id: string) => content.locations.find((l) => l.id === id)?.name ?? id
  // Anyone he could answer to: the people who work at places, then the love interests.
  const bosses = [...content.npcs, ...content.loveInterests]
  // By place, then by what it pays.
  const listed = [...jobs].sort((a, b) => placeName(a.locationId).localeCompare(placeName(b.locationId)) || a.hourlyRate - b.hourlyRate)

  function open(next: Job | null) {
    if (!mayLeave()) return
    setOriginal(next)
    setDraft(next ?? blank())
    setIssues([])
    setStatus('')
  }

  /** Makes a change, and afterwards shows the job of the given id, or the first one. */
  async function apply(change: Promise<EditorResult>, done: string, showId: string) {
    setBusy(true)
    try {
      const result = await change
      setIssues(result.issues)
      if (result.issues.length > 0) return
      onContent(result.content)
      const all = result.content.jobs?.jobs ?? []
      const next = all.find((job) => job.id === showId) ?? all[0] ?? null
      setOriginal(next)
      setDraft(next ?? blank())
      setStatus(done)
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="editor">
      {switcher(mayLeave)}
      {dialog}
      <aside className="editor-list">
        <Button variant="primary" onClick={() => open(null)}>
          {t('editor.jobs.new')}
        </Button>
        <div className="editor-people">
          {listed.map((job) => (
            <button key={job.id} className={!isNew && job.id === original?.id ? 'courier-person selected' : 'courier-person'} onClick={() => open(job)}>
              <JobIcon name={job.icon} image={job.iconImage} size={22} />
              <span>
                <strong>{job.title}</strong>
                <span className="hint">
                  {t('editor.jobs.listed', { place: placeName(job.locationId), rate: job.hourlyRate })}
                </span>
              </span>
            </button>
          ))}
          {listed.length === 0 && <p className="hint">{t('editor.jobs.none')}</p>}
        </div>
      </aside>

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>{draft.title || (isNew ? t('editor.jobs.new') : draft.id)}</h1>
            <span className="hint">{isNew ? t('editor.common.notSaved') : `${placeName(draft.locationId)} · ${draft.shifts.map(describeShift).join(', ')}`}</span>
          </div>
        </div>

        <div className="editor-body">
          <Group title={t('editor.jobs.whatItIs')}>
            <div className="row">
              <Text label={t('editor.common.title')} llm value={draft.title} onChange={(title) => set(isNew ? { title, id: slugify(title) } : { title })} />
              <Text label={t('editor.common.id')} value={draft.id} disabled={!isNew} onChange={(id) => set({ id: slugify(id) })} hint={isNew ? t('editor.common.idFixed') : undefined} />
            </div>
            <Text label={t('editor.common.description')} llm value={draft.description} rows={2} onChange={(description) => set({ description })} hint={t('editor.jobs.descriptionHint')} />
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
                {t('editor.jobs.boss')}
                <select value={draft.bossId} onChange={(e) => set({ bossId: e.target.value })}>
                  {bosses.map((who) => (
                    <option key={who.id} value={who.id}>
                      {who.name}
                    </option>
                  ))}
                </select>
                <span className="hint">{t('editor.jobs.bossHint')}</span>
              </label>
              <label>
                {t('editor.common.icon')}
                <span className="row checks">
                  <JobIcon name={draft.icon} image={draft.iconImage} size={26} />
                  <select value={draft.icon ?? ''} onChange={(e) => set({ icon: e.target.value || undefined })}>
                    <option value="">{t('editor.jobs.briefcase')}</option>
                    {Object.keys(JOB_ICON_PATHS).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            </div>
          </Group>

          <Group title={t('editor.jobs.pay')}>
            <div className="row">
              <label>
                {t('editor.jobs.rate')}
                <input type="number" min={0} value={draft.hourlyRate} onChange={(e) => set({ hourlyRate: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
              <label>
                {t('editor.jobs.trains')}
                <select value={draft.trains ?? ''} onChange={(e) => set({ trains: (e.target.value || undefined) as Stat | undefined })}>
                  <option value="">{t('editor.common.nothing')}</option>
                  {STATS.map((stat) => (
                    <option key={stat} value={stat}>
                      {stat}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <span className="field-label">{t('editor.jobs.requirements')}</span>
            <div className="row">
              {STATS.map((stat) => (
                <label key={stat}>
                  {STAT_LABELS[stat]}
                  <input
                    type="number"
                    min={0}
                    value={draft.requirements[stat] ?? ''}
                    placeholder={t('editor.jobs.any')}
                    onChange={(e) => {
                      const { [stat]: _gone, ...rest } = draft.requirements
                      set({ requirements: e.target.value === '' || Number(e.target.value) <= 0 ? rest : { ...rest, [stat]: whole(e.target.value, 1) } })
                    }}
                  />
                </label>
              ))}
            </div>
          </Group>

          <Group title={t('editor.jobs.shifts')} hint={t('editor.jobs.shiftsHint')}>
            {draft.shifts.map((shift, index) => (
              <div key={index} className="row checks">
                <label>
                  {t('editor.jobs.day')}
                  <select value={shift.weekday} onChange={(e) => setShift(index, { weekday: e.target.value })}>
                    {weekdays.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('editor.jobs.startHour')}
                  <input type="number" min={0} max={content.calendar.hoursPerDay - 1} value={shift.startHour} onChange={(e) => setShift(index, { startHour: Math.min(content.calendar.hoursPerDay - 1, whole(e.target.value, 0)) })} />
                </label>
                <label>
                  {t('editor.jobs.hours')}
                  <input type="number" min={1} max={12} value={shift.hours} onChange={(e) => setShift(index, { hours: Math.min(12, whole(e.target.value, 1)) })} />
                </label>
                <Button variant="quiet" disabled={draft.shifts.length <= 1} onClick={() => set({ shifts: draft.shifts.filter((_, i) => i !== index) })}>
                  {t('editor.common.remove')}
                </Button>
              </div>
            ))}
            <Button onClick={() => set({ shifts: [...draft.shifts, { weekday: weekdays[0], startHour: 9, hours: 4 }] })}>{t('editor.jobs.addShift')}</Button>
          </Group>
        </div>

        <EditorFoot
          issues={issues}
          status={status}
          busy={busy}
          dirty={dirty}
          canSave={isSafeId(draft.id) && draft.title.trim() !== ''}
          onUndo={() => (setDraft(original ?? blank()), setIssues([]))}
          onSave={() => apply(window.api.editor.saveJob(draft), t('editor.common.saved'), draft.id)}
          remove={
            !isNew
              ? {
                  label: t('editor.common.delete'),
                  onClick: async () =>
                    (await ask({ title: t('editor.common.deleteNamed', { name: draft.title }), detail: t('editor.jobs.deleteDetail'), confirm: t('editor.common.delete'), grave: true })) &&
                    apply(window.api.editor.deleteJob(draft.id), t('editor.common.deleted'), '')
                }
              : undefined
          }
        />
      </section>
    </main>
  )
}
