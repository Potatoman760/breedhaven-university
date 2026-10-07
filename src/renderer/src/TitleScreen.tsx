import { useEffect, useState, type FormEvent } from 'react'
import { adjustStat, catalogueIsStale, createInitialState, describeModifier, describeStat, POINT_BUY, pointCost, pointsLeft, startingStats } from '../../shared/game'
import { STAT_LABELS, STATS, type ContentPack, type Stat } from '../../shared/model'
import { AUTO_SLOT_ID, latestSave, type SaveData, type SaveSummary } from '../../shared/saves'
import { errorMessage } from './errors'
import { Overlay } from './ui/Dialog'
import { describeSave, SavesPanel } from './SavesPanel'
import { SettingsPanel } from './SettingsPanel'
import { Sprig, VineCorner } from './ui/icons'

interface Props {
  content: ContentPack
  onStart: (data: SaveData) => void
  /** Open the content editor. */
  onEdit: () => void
}

export function TitleScreen({ content, onStart, onEdit }: Props) {
  const [saves, setSaves] = useState<SaveSummary[]>([])
  const [panel, setPanel] = useState<'new' | 'load' | 'settings' | null>(null)
  const [name, setName] = useState(content.newGame.player.name)
  const [notice, setNotice] = useState('')
  // His stats as he has set them so far: all at the lowest when the dialog opens, with the whole pool to spend.
  const [stats, setStats] = useState<Record<Stat, number>>(startingStats)
  const left = pointsLeft(stats)

  /** Opens the new-game dialog with nothing spent. */
  const openNew = () => {
    setStats(startingStats())
    setPanel('new')
  }

  const refresh = () => window.api.listSaves().then(setSaves)
  useEffect(() => {
    refresh()
  }, [])

  // A game with coursework starts from the catalogue built in the editor.
  const noCatalogue = content.coursework !== undefined && content.catalogue === undefined
  const staleCatalogue = catalogueIsStale(content)
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
    onStart({ state: createInitialState(content, name, seed, stats), scene: null })
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
          <button className="secondary" onClick={openNew}>
            New Game
          </button>
          <button className="secondary" disabled={saves.length === 0} onClick={() => setPanel('load')}>
            Load
          </button>
          <button className="secondary" onClick={() => setPanel('settings')}>
            Settings
          </button>
          <button className="quiet" onClick={onEdit}>
            Edit game content
          </button>
        </div>
        {notice && <p className="notice">{notice}</p>}
      </div>

      {panel === 'new' && (
        <Overlay onClose={() => setPanel(null)}>
          <form className="dialog" onSubmit={startNew}>
            <div className="dialog-head">
              <h1>New game</h1>
            </div>
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
            <div className="field">
              <span className="field-label">
                Your stats · {left} of {POINT_BUY.pool} points left
              </span>
              <div className="ability-grid">
                {STATS.map((stat) => {
                  const score = stats[stat]
                  const up = adjustStat(stats, stat, 1) !== stats
                  const down = adjustStat(stats, stat, -1) !== stats
                  return (
                    <div key={stat} className="ability">
                      <span className="caps">{STAT_LABELS[stat]}</span>
                      <strong>{score}</strong>
                      <span className="ability-mod">
                        {describeModifier(score)} · {describeStat(score)}
                      </span>
                      <div className="ability-steps">
                        <button type="button" className="secondary" disabled={!down} aria-label={`Lower ${STAT_LABELS[stat].toLowerCase()}`} onClick={() => setStats(adjustStat(stats, stat, -1))}>
                          −
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={!up}
                          aria-label={`Raise ${STAT_LABELS[stat].toLowerCase()}`}
                          title={score < POINT_BUY.max ? `${pointCost(score + 1) - pointCost(score)} point${pointCost(score + 1) - pointCost(score) === 1 ? '' : 's'}` : 'As high as it starts'}
                          onClick={() => setStats(adjustStat(stats, stat, 1))}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="ability-foot">
                <button type="button" className="secondary" disabled={left === POINT_BUY.pool} onClick={() => setStats(startingStats())}>
                  Start over
                </button>
                <span className="hint">
                  Every stat starts at {POINT_BUY.min} and can go to {POINT_BUY.max}. A point buys a point up to 13; the two above that cost two each. Ten is ordinary.
                  Classes, training and work raise them from here.
                </span>
              </div>
            </div>
            {noCatalogue && (
              <p className="notice">
                There is no course catalogue yet. Build one under Edit game content, Courses, and save it: a new game starts from it.
              </p>
            )}
            {staleCatalogue && (
              <p className="hint">
                The course catalogue was built before the characters last changed. The game will start with it as it is; build it again under Edit game
                content, Courses, to bring it up to date.
              </p>
            )}
            {hasAutosave && (
              <p className="hint">
                The autosave will be replaced as soon as you act in the new game. Saves in
                numbered slots are kept.
              </p>
            )}
            <div className="actions">
              <button type="submit" disabled={noCatalogue}>
                Start
              </button>
              <button type="button" className="secondary" onClick={() => setPanel(null)}>
                Cancel
              </button>
            </div>
          </form>
        </Overlay>
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
    </main>
  )
}
