import { useState, type ReactNode } from 'react'
import { isSafeId, slugify, type EditorResult } from '../../../../shared/editor'
import { STAT_LABELS, STATS, type ContentPack, type Job, type Shift, type Stat } from '../../../../shared/model'
import { describeShift } from '../../../../shared/game'
import { errorMessage } from '../../errors'
import { Button } from '../Button'
import { useConfirm } from '../Confirm'
import { JOB_ICON_PATHS, JobIcon } from '../icons'
import { EditorFoot, Group, Text } from './fields'

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
  const mayLeave = () => !dirty || window.confirm('Discard the changes you have not saved?')
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
          New job
        </Button>
        <div className="editor-people">
          {listed.map((job) => (
            <button key={job.id} className={!isNew && job.id === original?.id ? 'courier-person selected' : 'courier-person'} onClick={() => open(job)}>
              <JobIcon name={job.icon} image={job.iconImage} size={22} />
              <span>
                <strong>{job.title}</strong>
                <span className="hint">
                  {placeName(job.locationId)} · ${job.hourlyRate} an hour
                </span>
              </span>
            </button>
          ))}
          {listed.length === 0 && <p className="hint">No jobs yet.</p>}
        </div>
      </aside>

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>{draft.title || (isNew ? 'New job' : draft.id)}</h1>
            <span className="hint">{isNew ? 'Not saved yet.' : `${placeName(draft.locationId)} · ${draft.shifts.map(describeShift).join(', ')}`}</span>
          </div>
        </div>

        <div className="editor-body">
          <Group title="What it is">
            <div className="row">
              <Text label="Title" llm value={draft.title} onChange={(title) => set(isNew ? { title, id: slugify(title) } : { title })} />
              <Text label="Id" value={draft.id} disabled={!isNew} onChange={(id) => set({ id: slugify(id) })} hint={isNew ? 'It cannot be changed later.' : undefined} />
            </div>
            <Text label="Description" llm value={draft.description} rows={2} onChange={(description) => set({ description })} hint="A line or two for the job board: what the work is." />
            <div className="row">
              <label>
                Where
                <select value={draft.locationId} onChange={(e) => set({ locationId: e.target.value })}>
                  {content.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Boss
                <select value={draft.bossId} onChange={(e) => set({ bossId: e.target.value })}>
                  {bosses.map((who) => (
                    <option key={who.id} value={who.id}>
                      {who.name}
                    </option>
                  ))}
                </select>
                <span className="hint">She is at work for every shift, and in his DMs from the day he is taken on.</span>
              </label>
              <label>
                Icon
                <span className="row checks">
                  <JobIcon name={draft.icon} image={draft.iconImage} size={26} />
                  <select value={draft.icon ?? ''} onChange={(e) => set({ icon: e.target.value || undefined })}>
                    <option value="">Briefcase</option>
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

          <Group title="Pay and what it asks">
            <div className="row">
              <label>
                Pay ($ an hour)
                <input type="number" min={0} value={draft.hourlyRate} onChange={(e) => set({ hourlyRate: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
              <label>
                The work builds
                <select value={draft.trains ?? ''} onChange={(e) => set({ trains: (e.target.value || undefined) as Stat | undefined })}>
                  <option value="">Nothing</option>
                  {STATS.map((stat) => (
                    <option key={stat} value={stat}>
                      {stat}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <span className="field-label">The least he must have to be taken on</span>
            <div className="row">
              {STATS.map((stat) => (
                <label key={stat}>
                  {STAT_LABELS[stat]}
                  <input
                    type="number"
                    min={0}
                    value={draft.requirements[stat] ?? ''}
                    placeholder="any"
                    onChange={(e) => {
                      const { [stat]: _gone, ...rest } = draft.requirements
                      set({ requirements: e.target.value === '' || Number(e.target.value) <= 0 ? rest : { ...rest, [stat]: whole(e.target.value, 1) } })
                    }}
                  />
                </label>
              ))}
            </div>
          </Group>

          <Group title="Shifts" hint="The shifts he is expected at each week. They are the same in every game.">
            {draft.shifts.map((shift, index) => (
              <div key={index} className="row checks">
                <label>
                  Day
                  <select value={shift.weekday} onChange={(e) => setShift(index, { weekday: e.target.value })}>
                    {weekdays.map((day) => (
                      <option key={day} value={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Starts at (hour)
                  <input type="number" min={0} max={content.calendar.hoursPerDay - 1} value={shift.startHour} onChange={(e) => setShift(index, { startHour: Math.min(content.calendar.hoursPerDay - 1, whole(e.target.value, 0)) })} />
                </label>
                <label>
                  Hours
                  <input type="number" min={1} max={12} value={shift.hours} onChange={(e) => setShift(index, { hours: Math.min(12, whole(e.target.value, 1)) })} />
                </label>
                <Button variant="quiet" disabled={draft.shifts.length <= 1} onClick={() => set({ shifts: draft.shifts.filter((_, i) => i !== index) })}>
                  Remove
                </Button>
              </div>
            ))}
            <Button onClick={() => set({ shifts: [...draft.shifts, { weekday: weekdays[0], startHour: 9, hours: 4 }] })}>Add a shift</Button>
          </Group>
        </div>

        <EditorFoot
          issues={issues}
          status={status}
          busy={busy}
          dirty={dirty}
          canSave={isSafeId(draft.id) && draft.title.trim() !== ''}
          onUndo={() => (setDraft(original ?? blank()), setIssues([]))}
          onSave={() => apply(window.api.editor.saveJob(draft), 'Saved.', draft.id)}
          remove={
            !isNew
              ? {
                  label: 'Delete',
                  onClick: async () =>
                    (await ask({ title: `Delete ${draft.title}?`, detail: 'It is taken off the job board. Anyone holding it in a running game is simply out of work.', confirm: 'Delete', grave: true })) &&
                    apply(window.api.editor.deleteJob(draft.id), 'Deleted.', '')
                }
              : undefined
          }
        />
      </section>
    </main>
  )
}
