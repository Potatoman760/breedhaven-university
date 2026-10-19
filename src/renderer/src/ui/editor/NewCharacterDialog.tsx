import { Button } from '../Button'
import { useState, type FormEvent } from 'react'
import type { LoveInterest } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { Overlay } from '../Dialog'

interface Props {
  /** Open the profile the LLM wrote, unsaved. */
  onDraft: (loveInterest: LoveInterest) => void
  /** Start from an empty profile and fill it in by hand. */
  onSkip: () => void
  onClose: () => void
}

/**
 * How a new character begins: a few words about who she is, from which the Main LLM writes
 * a first profile to edit, or straight to an empty one. What kind she is (a student, a
 * teacher, another love interest or an NPC) is set on her profile afterwards.
 */
export function NewCharacterDialog({ onDraft, onSkip, onClose }: Props) {
  const [idea, setIdea] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function generate(event: FormEvent) {
    event.preventDefault()
    if (!idea.trim() || busy) return
    setBusy(true)
    setNotice('')
    try {
      const result = await window.api.editor.draftLoveInterest(idea)
      if (result.loveInterest) onDraft(result.loveInterest)
      else setNotice(result.error ?? 'Nothing came back.')
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    // While she is being written, a stray click outside should not throw the work away.
    <Overlay onClose={busy ? () => undefined : onClose}>
      <form className="dialog" onSubmit={generate}>
        <div className="dialog-head">
          <h1>New character</h1>
        </div>
        <label>
          Who is she?
          <textarea
            rows={5}
            value={idea}
            maxLength={2000}
            autoFocus
            disabled={busy}
            placeholder="A catkin exchange student from Veyra majoring in Journalism, who runs the student paper and is investigating who leaked the Sire Registry. Sharp, nosy, secretly lonely."
            onChange={(e) => setIdea(e.target.value)}
          />
          <span className="hint">
            A sentence or a paragraph. The Main LLM writes her whole profile from it, to fit the setting and the places in the game: appearance, clothes,
            personality, studies, room, schedule, voice and backstory. She is written as a love interest; to make her an NPC, change her Kind on the profile, which hides what an NPC does not need. Nothing is saved until you have read it over and pressed Save.
          </span>
        </label>
        {busy && (
          <p className="hint" role="status">
            Writing her profile. This can take a minute...
          </p>
        )}
        {notice && <p className="notice">{notice}</p>}
        <div className="actions">
          <Button variant="primary" type="submit" disabled={busy || !idea.trim()}>
            {busy ? 'Writing...' : 'Generate her profile'}
          </Button>
          <Button disabled={busy} onClick={onSkip}>
            Skip: fill it in myself
          </Button>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Overlay>
  )
}
