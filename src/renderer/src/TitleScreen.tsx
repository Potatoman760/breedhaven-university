import { useEffect, useRef, useState, type FormEvent } from 'react'
import music from '../../assets/Magical College Days.mp3'
import titleArt from '../../assets/BreedhavenTitle.png'
import { adjustStat, catalogueIsStale, createInitialState, describeModifier, describeStat, PLAYER_TOKEN, POINT_BUY, pointCost, pointsLeft, randomStats, startingStats } from '../../shared/game'
import { STAT_LABELS, STATS, type ContentPack, type Stat } from '../../shared/model'
import { AUTO_SLOT_ID, latestSave, type SaveData, type SaveSummary } from '../../shared/saves'
import { errorMessage } from './errors'
import { useVolumes } from './sound'
import { Overlay } from './ui/Dialog'
import { describeSave, SavesPanel } from './SavesPanel'
import { SettingsPanel } from './SettingsPanel'

// Where it is remembered that the player turned the menu's music off.
const MUSIC_OFF = 'breedhaven.menuMusicOff'

interface Props {
  content: ContentPack
  onStart: (data: SaveData) => void
  /** Open the content editor: only when the game is run from its source. */
  onEdit?: () => void
}

export function TitleScreen({ content, onStart, onEdit }: Props) {
  const [saves, setSaves] = useState<SaveSummary[]>([])
  const [panel, setPanel] = useState<'new' | 'load' | 'settings' | null>(null)
  const [name, setName] = useState(content.newGame.player.name)
  // Who he is, as the characters are told it: the content's own, which is fixed, and whatever the player adds to it.
  const [about, setAbout] = useState('')
  const [notice, setNotice] = useState('')
  // His stats as he has set them so far: all at the lowest when the dialog opens, with the whole pool to spend.
  const [stats, setStats] = useState<Record<Stat, number>>(startingStats)
  const left = pointsLeft(stats)

  /** Opens the new-game dialog with nothing spent. */
  const openNew = () => {
    setStats(startingStats())
    setAbout('')
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
    onStart({ state: createInitialState(content, name, seed, stats, about), scene: null })
  }

  // The menu's music: it plays round and round while the menu is up, and stops with it. Whether it is wanted is remembered.
  const [muted, setMuted] = useState(() => window.localStorage.getItem(MUSIC_OFF) === '1')
  const player = useRef<HTMLAudioElement>(null)
  const { music: musicVolume } = useVolumes()
  useEffect(() => {
    if (player.current) player.current.volume = musicVolume
  }, [musicVolume])
  const toggleMusic = () => {
    window.localStorage.setItem(MUSIC_OFF, muted ? '0' : '1')
    setMuted(!muted)
  }

  return (
    <main className="title">
      <audio ref={player} src={music} autoPlay loop muted={muted} />
      <button type="button" className="quiet title-music" aria-pressed={!muted} onClick={toggleMusic}>
        Music: {muted ? 'off' : 'on'}
      </button>
      <div className="title-frame">
        {/* The game's name, as its own picture, at the head of the menu. */}
        <img className="title-logo" src={titleArt} alt="Breedhaven University" />

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
          {import.meta.env.DEV && onEdit && (
            <button className="quiet" onClick={onEdit}>
              Edit game content
            </button>
          )}
        </div>
        {notice && <p className="notice">{notice}</p>}
        <p className="title-version">v{__APP_VERSION__}</p>
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
            <label>
              About you
              <span className="new-game-bio">{content.newGame.player.bio.split(PLAYER_TOKEN).join(name.trim() || content.newGame.player.name)}</span>
              <textarea rows={3} value={about} placeholder="Anything more about you" title={`Told to everyone you meet, after the lines above. Write ${PLAYER_TOKEN} for your name.`} onChange={(e) => setAbout(e.target.value)} />
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
                <button type="button" className="secondary" title="Spend the whole pool at random" onClick={() => setStats(randomStats())}>
                  Randomize
                </button>
              </div>
            </div>
            {noCatalogue && (
              <p className="notice">
                The game's course catalogue is missing, so a new game cannot start.
              </p>
            )}
            {/* A warning for whoever is writing the game: a built one ships a catalogue its tests have checked. */}
            {import.meta.env.DEV && staleCatalogue && (
              <p className="hint">The course catalogue was built before the characters last changed. Rebuild it with scripts/build-catalogue.ts.</p>
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
