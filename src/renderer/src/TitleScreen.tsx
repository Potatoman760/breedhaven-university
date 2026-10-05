import { useEffect, useState, type FormEvent } from 'react'
import { createInitialState } from '../../shared/game'
import type { ContentPack } from '../../shared/model'
import { AUTO_SLOT_ID, latestSave, type SaveData, type SaveSummary } from '../../shared/saves'
import { errorMessage } from './errors'
import { describeSave, SavesPanel } from './SavesPanel'
import { SettingsPanel } from './SettingsPanel'
import { Dialog, ToBeImplemented } from './ui/Dialog'
import { Sprig, VineCorner } from './ui/icons'

interface Props {
  content: ContentPack
  onStart: (data: SaveData) => void
}

export function TitleScreen({ content, onStart }: Props) {
  const [saves, setSaves] = useState<SaveSummary[]>([])
  const [panel, setPanel] = useState<'new' | 'load' | 'settings' | 'editor' | null>(null)
  const [name, setName] = useState(content.newGame.player.name)
  const [notice, setNotice] = useState('')

  const refresh = () => window.api.listSaves().then(setSaves)
  useEffect(() => {
    refresh()
  }, [])

  const latest = latestSave(saves)
  const hasAutosave = saves.some((s) => s.slotId === AUTO_SLOT_ID)

  async function resume() {
    if (!latest) return
    try {
      onStart(await window.api.loadGame(latest.slotId))
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  function startNew(event: FormEvent) {
    event.preventDefault()
    // A fresh seed gives each game its own run of weather.
    const seed = Math.floor(Math.random() * 0x7fffffff)
    onStart({ state: createInitialState(content, name, seed), scene: null })
  }

  return (
    <main className="title">
      <div className="title-frame framed">
        <VineCorner corner="tl" />
        <VineCorner corner="tr" />
        <VineCorner corner="bl" />
        <VineCorner corner="br" />

        <div className="wordmark">
          <h1>Breedhaven</h1>
          <Sprig width={260} />
        </div>

        <div className="menu">
          <button className="continue" disabled={!latest} onClick={resume}>
            Continue
            {latest && <span>{describeSave(content, latest)}</span>}
          </button>
          <button className="secondary" onClick={() => setPanel('new')}>
            New Game
          </button>
          <button className="secondary" disabled={saves.length === 0} onClick={() => setPanel('load')}>
            Load
          </button>
          <button className="secondary" onClick={() => setPanel('settings')}>
            Settings
          </button>
          <button className="quiet" onClick={() => setPanel('editor')}>
            Edit game content
          </button>
        </div>
        {notice && <p className="notice">{notice}</p>}
      </div>

      {panel === 'new' && (
        <div className="overlay">
          <form className="dialog narrow" onSubmit={startNew}>
            <div className="dialog-head">
              <h1>New game</h1>
            </div>
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
            {hasAutosave && (
              <p className="hint">
                The autosave will be replaced as soon as you act in the new game. Saves in
                numbered slots are kept.
              </p>
            )}
            <div className="actions">
              <button type="submit">Start</button>
              <button type="button" className="secondary" onClick={() => setPanel(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      {panel === 'load' && (
        <SavesPanel
          content={content}
          mode="load"
          onLoad={onStart}
          onClose={() => {
            setPanel(null)
            refresh()
          }}
        />
      )}
      {panel === 'settings' && <SettingsPanel onClose={() => setPanel(null)} />}
      {panel === 'editor' && (
        <Dialog title="Edit game content" onClose={() => setPanel(null)} narrow>
          <ToBeImplemented note="Editors for the calendar, characters and sprites, and the codex and trait library. Until then, edit the JSON files in content/default." />
        </Dialog>
      )}
    </main>
  )
}
