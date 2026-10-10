import { useEffect, useState } from 'react'
import { formatDate, toDate } from '../../shared/game'
import type { ContentPack } from '../../shared/model'
import {
  AUTO_SLOT_ID,
  MANUAL_SLOT_IDS,
  SAVE_NAME_CHARS,
  SLOT_IDS,
  saveLabel,
  slotLabel,
  type SaveData,
  type SaveSummary,
  type SlotId
} from '../../shared/saves'
import { errorMessage } from './errors'
import { useConfirm } from './ui/Confirm'
import { Overlay } from './ui/Dialog'

export function describeSave(content: ContentPack, save: SaveSummary): string {
  if (save.unreadable) return 'Unreadable save (damaged, or from a different version)'
  const date = toDate(content.calendar, save.time)
  return (
    `${save.playerName} · Day ${date.dayIndex + 1} · ${formatDate(date)}` +
    (save.inScene ? ' · mid-scene' : '')
  )
}

interface Props {
  content: ContentPack
  /** In save mode, the game to write; the autosave slot is not offered. */
  mode: 'save' | 'load'
  current?: SaveData
  onLoad: (data: SaveData) => void
  onClose: () => void
}

export function SavesPanel({ content, mode, current, onLoad, onClose }: Props) {
  const [saves, setSaves] = useState<SaveSummary[] | null>(null)
  const [notice, setNotice] = useState('')
  // The names as they are being typed, by slot: one for an empty slot is what the save made there will be called.
  const [names, setNames] = useState<Partial<Record<SlotId, string>>>({})

  const refresh = () => window.api.listSaves().then(setSaves)
  useEffect(() => {
    refresh()
  }, [])

  // Overwriting and deleting are asked about first, in the game's own dialog.
  const { ask, dialog } = useConfirm()

  if (!saves) return null

  async function run(action: () => Promise<void>) {
    try {
      setNotice('')
      await action()
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  const summaryOf = (slotId: SlotId) => saves.find((s) => s.slotId === slotId)
  /** The name a slot is shown with: what is being typed, or failing that what its save is called. */
  const nameOf = (slotId: SlotId): string => {
    const summary = summaryOf(slotId)
    return names[slotId] ?? (summary && !summary.unreadable ? (summary.name ?? '') : '')
  }

  const save = (slotId: SlotId, occupied: boolean) =>
    run(async () => {
      if (!current) return
      if (occupied && !(await ask({ title: `Overwrite ${saveLabel(slotId, summaryOf(slotId))}?`, detail: 'The game saved there is replaced by this one.', confirm: 'Overwrite' }))) return
      // Whatever is in the name box goes with it: typed afresh, or the name the slot already had.
      const saved = await window.api.saveGame({ slotId, name: nameOf(slotId), ...current })
      setNames(({ [slotId]: _typed, ...rest }) => rest)
      await refresh()
      setNotice(`Saved to ${saveLabel(slotId, saved)}.`)
    })

  /** Keeps a name typed for a save that is already there. For an empty slot it waits for the save. */
  const rename = (slotId: SlotId) =>
    run(async () => {
      const summary = summaryOf(slotId)
      const typed = names[slotId]
      if (typed === undefined || !summary || summary.unreadable) return
      if (typed.trim() !== (summary.name ?? '')) await window.api.renameSave({ slotId, name: typed })
      setNames(({ [slotId]: _typed, ...rest }) => rest)
      await refresh()
    })

  const load = (slotId: SlotId) => run(async () => onLoad(await window.api.loadGame(slotId)))

  const remove = (slotId: SlotId) =>
    run(async () => {
      if (!(await ask({ title: `Delete ${saveLabel(slotId, summaryOf(slotId))}?`, detail: 'This cannot be undone.', confirm: 'Delete', grave: true }))) return
      await window.api.deleteSave(slotId)
      setNames(({ [slotId]: _typed, ...rest }) => rest)
      await refresh()
    })

  return (
    <Overlay onClose={onClose}>
      <div className="settings">
        <h1>{mode === 'save' ? 'Save game' : 'Load game'}</h1>
        {(mode === 'save' ? MANUAL_SLOT_IDS : SLOT_IDS).map((slotId) => {
          const summary = saves.find((s) => s.slotId === slotId)
          return (
            <div key={slotId} className="slot">
              <div>
                {/* A save can be given a name of its own, and called something else at any time. The autosave is the game's, and keeps its own. */}
                {slotId === AUTO_SLOT_ID || summary?.unreadable || (mode === 'load' && !summary) ? (
                  <strong>{slotLabel(slotId)}</strong>
                ) : (
                  <input
                    className="slot-name"
                    value={nameOf(slotId)}
                    maxLength={SAVE_NAME_CHARS}
                    placeholder={slotLabel(slotId)}
                    aria-label={`Name of ${slotLabel(slotId)}`}
                    onChange={(e) => setNames({ ...names, [slotId]: e.target.value })}
                    onBlur={() => rename(slotId)}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                )}
                <span>{summary ? describeSave(content, summary) : 'Empty'}</span>
                {summary && <span>Saved {new Date(summary.savedAt).toLocaleString()}</span>}
              </div>
              {mode === 'save' ? (
                <button onClick={() => save(slotId, summary !== undefined)}>Save here</button>
              ) : (
                <button disabled={!summary || summary.unreadable} onClick={() => load(slotId)}>
                  Load
                </button>
              )}
              <button className="secondary" disabled={!summary} onClick={() => remove(slotId)}>
                Delete
              </button>
            </div>
          )
        })}
        {notice && <p className="notice">{notice}</p>}
        <div className="actions">
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {dialog}
    </Overlay>
  )
}
