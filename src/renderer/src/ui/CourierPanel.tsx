import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  addNote,
  answerInvite,
  attendees,
  courierThread,
  describeWhen,
  firstNames,
  inviteStands,
  markRead,
  toDate,
  unreadNotes
} from '../../../shared/game'
import type { ContentPack, GameState } from '../../../shared/model'
import { errorMessage } from '../errors'
import { Dialog } from './Dialog'
import { ChevronIcon } from './icons'
import { Portrait } from './MapPanel'

interface Props {
  content: ContentPack
  state: GameState
  /** Applied to the newest state, since a reply can arrive after other things have changed. */
  onChange: (update: (state: GameState) => GameState) => void
  onClose: () => void
}

/** Notes to and from love interests, carried by the intercampus courier: one thread each. */
export function CourierPanel({ content, state, onChange, onClose }: Props) {
  const people = content.loveInterests
  const [selectedId, setSelectedId] = useState(
    () =>
      (people.find((li) => unreadNotes(state, li.id) > 0) ??
        people.find((li) => courierThread(state, li.id).length > 0) ??
        people[0])?.id
  )
  const [draft, setDraft] = useState('')
  const [waitingOn, setWaitingOn] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const end = useRef<HTMLDivElement>(null)

  const selected = people.find((li) => li.id === selectedId)
  const thread = selected ? courierThread(state, selected.id) : []
  const firstName = selected?.name.split(' ')[0] ?? ''

  // Opening a thread reads it, and keeps its newest note in view.
  useEffect(() => {
    if (selectedId && unreadNotes(state, selectedId) > 0) onChange((current) => markRead(current, selectedId))
    end.current?.scrollIntoView({ block: 'end' })
  }, [selectedId, thread.length, state, onChange])

  async function send(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!selected || !text || waitingOn) return
    const id = selected.id
    const sent = addNote(state, id, { from: 'player', text, read: true })
    onChange((current) => addNote(current, id, { from: 'player', text, read: true }))
    setDraft('')
    setNotice('')
    setWaitingOn(id)
    try {
      const reply = await window.api.courier({ state: sent, loveInterestId: id, invite: false })
      onChange((current) => addNote(current, id, { from: 'them', text: reply.text, proposal: reply.proposal, read: false }))
    } catch (error) {
      setNotice(`No answer came back: ${errorMessage(error)}`)
    } finally {
      setWaitingOn(null)
    }
  }

  return (
    <Dialog title="Courier" onClose={onClose} wide>
      <div className="courier">
        <div className="courier-people">
          {people.map((li) => {
            const last = courierThread(state, li.id).at(-1)
            const unread = unreadNotes(state, li.id)
            return (
              <button
                key={li.id}
                className={li.id === selectedId ? 'courier-person selected' : 'courier-person'}
                onClick={() => setSelectedId(li.id)}
              >
                <Portrait li={li} />
                <span>
                  <strong>{li.name.split(' ')[0]}</strong>
                  <span className="hint">{last ? last.text : 'No notes yet'}</span>
                </span>
                {unread > 0 && <span className="badge">{unread}</span>}
              </button>
            )
          })}
        </div>

        <div className="courier-thread">
          <div className="courier-notes">
            {thread.length === 0 && (
              <p className="hint center">
                Nothing between you and {firstName} yet. A runner will have your note there within minutes.
              </p>
            )}
            {thread.map((note, i) => {
              const sentOn = toDate(content.calendar, note.time)
              const plan = note.proposal
              return (
                <div key={i} className={note.from === 'player' ? 'note-card mine' : 'note-card'}>
                  <span className="caps">
                    {note.from === 'player' ? state.player.name : firstName} · {sentOn.weekday}{' '}
                    {String(sentOn.hour).padStart(2, '0')}:00
                  </span>
                  <p>{note.text}</p>
                  {plan && (
                    <div className="proposal">
                      <div>
                        <strong>
                          {plan.title} with {firstNames(content, attendees(plan))}
                        </strong>
                        <span>
                          {describeWhen(content, plan.time)} ·{' '}
                          {content.locations.find((l) => l.id === plan.locationId)?.name}
                        </span>
                      </div>
                      {note.answer ? (
                        <span className="chip">{note.answer}</span>
                      ) : inviteStands(content, state, plan) ? (
                        <>
                          <button onClick={() => onChange((s) => answerInvite(content, s, selected!.id, i, true))}>
                            Accept
                          </button>
                          <button
                            className="secondary"
                            onClick={() => onChange((s) => answerInvite(content, s, selected!.id, i, false))}
                          >
                            Decline
                          </button>
                        </>
                      ) : (
                        <span className="chip">no longer possible</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {waitingOn === selectedId && <p className="hint">The runner is on the way back...</p>}
            <div ref={end} />
          </div>

          {notice && <p className="notice">{notice}</p>}
          <form onSubmit={send}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={400}
              aria-label={`A note to ${firstName}`}
              placeholder={`Write ${firstName} a note`}
              autoFocus
            />
            <button type="submit" disabled={!draft.trim() || waitingOn !== null} aria-label="Send" className="icon">
              <ChevronIcon size={18} />
            </button>
          </form>
        </div>
      </div>
    </Dialog>
  )
}
