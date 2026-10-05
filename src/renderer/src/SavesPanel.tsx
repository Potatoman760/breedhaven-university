import { useEffect, useState } from 'react'
import { formatDate, toDate } from '../../shared/game'
import type { ContentPack } from '../../shared/model'
import {
  MANUAL_SLOT_IDS,
  SLOT_IDS,
  slotLabel,
  type SaveData,
  type SaveSummary,
  type SlotId
} from '../../shared/saves'
import { errorMessage } from './errors'

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

  const refresh = () => window.api.listSaves().then(setSaves)
  useEffect(() => {
    refresh()
  }, [])

  if (!saves) return null

  async function run(action: () => Promise<void>) {
    try {
      setNotice('')
      await action()
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  const save = (slotId: SlotId, occupied: boolean) =>
    run(async () => {
      if (!current) return
      if (occupied && !window.confirm(`Overwrite ${slotLabel(slotId)}?`)) return
      await window.api.saveGame({ slotId, ...current })
      await refresh()
      setNotice(`Saved to ${slotLabel(slotId)}.`)
    })

  const load = (slotId: SlotId) => run(async () => onLoad(await window.api.loadGame(slotId)))

  const remove = (slotId: SlotId) =>
    run(async () => {
      if (!window.confirm(`Delete ${slotLabel(slotId)}? This cannot be undone.`)) return
      await window.api.deleteSave(slotId)
      await refresh()
    })

  return (
    <div className="overlay">
      <div className="settings">
        <h1>{mode === 'save' ? 'Save game' : 'Load game'}</h1>
        {(mode === 'save' ? MANUAL_SLOT_IDS : SLOT_IDS).map((slotId) => {
          const summary = saves.find((s) => s.slotId === slotId)
          return (
            <div key={slotId} className="slot">
              <div>
                <strong>{slotLabel(slotId)}</strong>
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
    </div>
  )
}
