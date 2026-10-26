import { Button } from '../Button'
import { useState, type FormEvent } from 'react'
import type { LoveInterest } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { Overlay } from '../Dialog'
import { t } from '../../../../shared/i18n'

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
  // The name on the SillyTavern card picked, while one is: the card itself stays with the main process.
  const [card, setCard] = useState<string | null>(null)

  async function pickCard() {
    setNotice('')
    try {
      const read = await window.api.editor.readCard()
      if (!read) return
      if (read.card) setCard(read.card.name)
      else setNotice(read.error ?? t('editor.newCharacter.unreadableCard'))
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  /** Her from the card: as it has her, or with the rest written by the LLM, the idea box being notes on how. */
  async function fromCard(generate: boolean) {
    setBusy(true)
    setNotice('')
    try {
      const result = await window.api.editor.fromCard({ generate, notes: idea })
      if (result.loveInterest) onDraft(result.loveInterest)
      else setNotice(result.error ?? t('editor.common.nothingBack'))
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function generate(event: FormEvent) {
    event.preventDefault()
    if (!idea.trim() || busy) return
    setBusy(true)
    setNotice('')
    try {
      const result = await window.api.editor.draftLoveInterest(idea)
      if (result.loveInterest) onDraft(result.loveInterest)
      else setNotice(result.error ?? t('editor.common.nothingBack'))
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
          <h1>{t('editor.newCharacter.title')}</h1>
        </div>
        <div className="actions card-pick">
          <Button disabled={busy} title={t('editor.newCharacter.cardTitle')} onClick={pickCard}>
            {card ? t('editor.newCharacter.anotherCard') : t('editor.newCharacter.fromCard')}
          </Button>
          {card && (
            <>
              <span className="chip">{card}</span>
              <Button disabled={busy} title={t('editor.newCharacter.importAsIsTitle')} onClick={() => fromCard(false)}>
                {t('editor.newCharacter.importAsIs')}
              </Button>
              <Button variant="primary" disabled={busy} title={t('editor.newCharacter.importWriteTitle')} onClick={() => fromCard(true)}>
                {t('editor.newCharacter.importWrite')}
              </Button>
            </>
          )}
        </div>
        <label>
          {card ? t('editor.newCharacter.notes') : t('editor.newCharacter.who')}
          <textarea
            rows={5}
            value={idea}
            maxLength={2000}
            autoFocus
            disabled={busy}
            placeholder={t('editor.newCharacter.placeholder')}
            onChange={(e) => setIdea(e.target.value)}
          />
          <span className="hint">
            {t('editor.newCharacter.hint')}
          </span>
        </label>
        {busy && (
          <p className="hint" role="status">
            {t('editor.newCharacter.writing')}
          </p>
        )}
        {notice && <p className="notice">{notice}</p>}
        <div className="actions">
          <Button variant="primary" type="submit" disabled={busy || !idea.trim() || card !== null}>
            {busy ? t('editor.common.writing') : t('editor.newCharacter.generate')}
          </Button>
          <Button disabled={busy} onClick={onSkip}>
            {t('editor.newCharacter.skip')}
          </Button>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            {t('editor.common.cancel')}
          </Button>
        </div>
      </form>
    </Overlay>
  )
}
