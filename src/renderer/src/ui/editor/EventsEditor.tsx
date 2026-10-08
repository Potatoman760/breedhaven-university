import { useEffect, useState, type ReactNode } from 'react'
import { isSafeId, slugify, type EditorInfo, type EditorResult } from '../../../../shared/editor'
import type { CalendarEvent, ContentPack } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { Button } from '../Button'
import { useConfirm } from '../Confirm'
import { EditorFoot, Group, LlmMark, Text } from './fields'

interface Props {
  content: ContentPack
  /** Called whenever a change has been written and the game's content reloaded. */
  onContent: (content: ContentPack) => void
  /** The switch between the sides of the editor, given a check to make before leaving this one. */
  switcher: (mayLeave: () => boolean) => ReactNode
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** An id not already taken among the events, made from the wanted one: "harvest-fair", "harvest-fair-2"... */
function freeId(wanted: string, events: CalendarEvent[]): string {
  const base = slugify(wanted) || 'event'
  let id = base
  for (let n = 2; events.some((event) => event.id === id); n++) id = `${base}-${n}`
  return id
}

/**
 * The events and holidays of the calendar: what each is, when it falls and for how long,
 * where it is, and whether classes stop for it. The LLM can be asked to think of some.
 * Run from source, they are the game's own; in a game as a player has it, what is added
 * here is an add-on laid over them.
 */
export function EventsEditor({ content, onContent, switcher }: Props) {
  const { calendar } = content
  const blank = (): CalendarEvent => ({ id: '', name: '', description: '', month: calendar.start.month, day: 1, durationDays: 1, noClasses: false, generated: false })
  const [info, setInfo] = useState<EditorInfo | null>(null)
  const [original, setOriginal] = useState<CalendarEvent | null>(calendar.events[0] ?? null)
  const [draft, setDraft] = useState<CalendarEvent>(calendar.events[0] ?? blank())
  const [issues, setIssues] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const { ask, dialog } = useConfirm()

  useEffect(() => {
    window.api.editor.info().then(setInfo, (error) => setStatus(errorMessage(error)))
  }, [])

  const isNew = original === null
  const dirty = !same(draft, original ?? blank())
  const mayLeave = () => !dirty || window.confirm('Discard the changes you have not saved?')
  const set = (patch: Partial<CalendarEvent>) => {
    // What was wrong with the last save may no longer be.
    setIssues([])
    setDraft((current) => ({ ...current, ...patch }))
  }
  const origin = info?.events[draft.id]
  const month = calendar.months.find((m) => m.id === draft.month)
  // In the order they fall through the year.
  const monthAt = (id: string) => calendar.months.findIndex((m) => m.id === id)
  const listed = [...calendar.events].sort((a, b) => monthAt(a.month) - monthAt(b.month) || a.day - b.day)
  const when = (event: CalendarEvent) =>
    `${event.day} ${calendar.months.find((m) => m.id === event.month)?.name ?? event.month}${event.durationDays > 1 ? `, ${event.durationDays} days` : ''}`

  function open(next: CalendarEvent | null) {
    if (!mayLeave()) return
    setOriginal(next)
    setDraft(next ?? blank())
    setIssues([])
    setStatus('')
  }

  /** Makes a change, and afterwards shows the event of the given id, or the first one. */
  async function apply(change: Promise<EditorResult>, done: string, showId: string) {
    setBusy(true)
    try {
      const result = await change
      setIssues(result.issues)
      if (result.issues.length > 0) return
      setInfo(result.info)
      onContent(result.content)
      const next = result.content.calendar.events.find((event) => event.id === showId) ?? result.content.calendar.events[0] ?? null
      setOriginal(next)
      setDraft(next ?? blank())
      setStatus(done)
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  /** Has the LLM think of some events for the year, and adds each of them. They can be changed or deleted like any other. */
  async function askForEvents() {
    if (!mayLeave()) return
    setAsking(true)
    setStatus('')
    setIssues([])
    try {
      const drafted = await window.api.editor.draftEvents()
      if (drafted.error) return setStatus(drafted.error)
      let events = calendar.events
      let last: EditorResult | undefined
      let added = 0
      for (const event of drafted.events ?? []) {
        const id = freeId(event.name, events)
        const result = await window.api.editor.saveEvent({ ...event, id })
        if (result.issues.length > 0) continue
        events = result.content.calendar.events
        last = result
        added++
      }
      if (last) {
        setInfo(last.info)
        onContent(last.content)
        const first = last.content.calendar.events.at(-1) ?? null
        setOriginal(first)
        setDraft(first ?? blank())
      }
      setStatus(added === 0 ? 'The AI did not come up with any usable events.' : `Added ${added} event${added === 1 ? '' : 's'} from the AI. Read them over.`)
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setAsking(false)
    }
  }

  return (
    <main className="editor">
      {switcher(mayLeave)}
      {dialog}
      <aside className="editor-list">
        <Button variant="primary" onClick={() => open(null)}>
          New event
        </Button>
        <Button disabled={asking || busy} title="Has the Main LLM think of events that suit the setting, and adds them" onClick={askForEvents}>
          {asking ? 'Asking...' : 'Ask the AI for events'}
        </Button>
        <div className="editor-people">
          {listed.map((event) => (
            <button key={event.id} className={!isNew && event.id === original?.id ? 'courier-person selected' : 'courier-person'} onClick={() => open(event)}>
              <span>
                <strong>{event.name}</strong>
                <span className="hint">
                  {when(event)}
                  {event.noClasses ? ' · no classes' : ''}
                </span>
              </span>
            </button>
          ))}
          {listed.length === 0 && <p className="hint">No events yet.</p>}
        </div>
      </aside>

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>{draft.name || (isNew ? 'New event' : draft.id)}</h1>
            <span className="hint">{isNew ? 'Not saved yet.' : when(draft)}</span>
          </div>
        </div>

        <div className="editor-body">
          <Group title="What it is">
            <div className="row">
              <Text label="Name" llm value={draft.name} onChange={(name) => set(isNew ? { name, id: slugify(name) } : { name })} />
              <Text label="Id" value={draft.id} disabled={!isNew} onChange={(id) => set({ id: slugify(id) })} hint={isNew ? 'It cannot be changed later.' : undefined} />
            </div>
            <Text label="Description" llm value={draft.description} rows={3} onChange={(description) => set({ description })} />
          </Group>

          <Group title="When and where">
            <div className="row">
              <label>
                <span className="field-name">
                  Month
                  <LlmMark />
                </span>
                <select value={draft.month} onChange={(e) => set({ month: e.target.value })}>
                  {calendar.months.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Day
                <input type="number" min={1} max={month?.days ?? 31} value={draft.day} onChange={(e) => set({ day: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} />
              </label>
              <label>
                Lasts (days)
                <input type="number" min={1} value={draft.durationDays} onChange={(e) => set({ durationDays: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} />
              </label>
              <label>
                Where
                <select value={draft.locationId ?? ''} onChange={(e) => set({ locationId: e.target.value || undefined })}>
                  <option value="">Nowhere in particular</option>
                  {content.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="row checks">
              <label className="inline">
                <input type="checkbox" checked={draft.noClasses} onChange={(e) => set({ noClasses: e.target.checked })} />
                No classes meet while it lasts
              </label>
            </div>
            <span className="hint">It comes round every year on that date. A view of a place named exactly as the event is shown there while it lasts.</span>
          </Group>
        </div>

        <EditorFoot
          issues={issues}
          status={status}
          busy={busy}
          dirty={dirty}
          canSave={isSafeId(draft.id) && draft.name.trim() !== ''}
          onUndo={() => (setDraft(original ?? blank()), setIssues([]))}
          onSave={() => apply(window.api.editor.saveEvent(draft), 'Saved.', draft.id)}
          remove={
            !isNew && origin === 'addon'
              ? {
                  label: 'Delete',
                  onClick: async () =>
                    (await ask({ title: `Delete ${draft.name}?`, detail: 'It is taken off the calendar of every new and running game.', confirm: 'Delete', grave: true })) &&
                    apply(window.api.editor.deleteEvent(draft.id), 'Deleted.', '')
                }
              : undefined
          }
        />
      </section>
    </main>
  )
}
