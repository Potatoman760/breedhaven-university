import { useEffect, useState, type ReactNode } from 'react'
import type { EditorInfo, EditorResult } from '../../../../shared/editor'
import { Portrait } from '../Portrait'
import { OutfitSchema, type ContentPack, type NewGame, type PlayerLook, type Room } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { ArtTool } from '../art/ArtTool'
import { Button } from '../Button'
import { Lightbox } from '../Lightbox'
import { EditorFoot, Group, Text } from './fields'
import { RoomPictures } from './RoomPictures'
import { t } from '../../../../shared/i18n'

interface Props {
  content: ContentPack
  /** Called whenever a change has been written and the game's content reloaded. */
  onContent: (content: ContentPack) => void
  /** The switch between the sides of the editor, given a check to make before leaving this one. */
  switcher: (mayLeave: () => boolean) => ReactNode
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// The folder his pictures are filed under in the add-on folder, beside the characters'.
const PLAYER_FILES = 'player'

/**
 * The player character as a new game starts him: what he is called unless the player says
 * otherwise, who he is as the characters are told it, what he has in his pocket, where he wakes up, and his own room. His stats are
 * not here: they are set by the player when a game begins. A change is kept in the add-on
 * folder and the game's own left as it was.
 */
export function PlayerEditor({ content, onContent, switcher }: Props) {
  const [info, setInfo] = useState<EditorInfo | null>(null)
  const [original, setOriginal] = useState<NewGame>(content.newGame)
  const [draft, setDraft] = useState<NewGame>(content.newGame)
  const [issues, setIssues] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  // Likewise his own picture.
  const [drawingHim, setDrawingHim] = useState(false)
  const [viewingHim, setViewingHim] = useState(false)

  useEffect(() => {
    window.api.editor.info().then(setInfo, (error) => setStatus(errorMessage(error)))
  }, [])

  const dirty = !same(draft, original)
  const mayLeave = () => !dirty || window.confirm(t('editor.common.discard'))
  const change = (patch: Partial<NewGame>) => {
    // What was wrong with the last save may no longer be.
    setIssues([])
    setDraft((current) => ({ ...current, ...patch }))
  }
  const setPlayer = (patch: Partial<NewGame['player']>) => change({ player: { ...draft.player, ...patch } })
  const look = draft.look
  const setLook = (patch: Partial<PlayerLook>) => change({ look: { ...look, ...patch } })
  const room = draft.room
  const setRoom = (patch: Partial<Room>) => room && change({ room: { ...room, ...patch } })
  const number = (value: string, least: number) => Math.max(least, Math.floor(Number(value)) || 0)

  const home = content.locations.find((l) => l.id === draft.locationId)
  const roomPlace = content.locations.find((l) => l.id === room?.locationId)

  async function apply(change: Promise<EditorResult>, done: string) {
    setBusy(true)
    try {
      const result = await change
      setIssues(result.issues)
      if (result.issues.length > 0) return
      setInfo(result.info)
      onContent(result.content)
      setOriginal(result.content.newGame)
      setDraft(result.content.newGame)
      setStatus(done)
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  /** Has the user pick a picture of him, which is copied into the add-on folder. */
  async function uploadHim() {
    setStatus('')
    try {
      const sprite = await window.api.editor.importAsset({ loveInterestId: PLAYER_FILES, kind: 'image' })
      if (sprite) setLook({ sprite })
    } catch (error) {
      setStatus(errorMessage(error))
    }
  }

  return (
    <main className="editor player-editor">
      {switcher(mayLeave)}
      {viewingHim && look.sprite && <Lightbox image={look.sprite} name={draft.player.name} onClose={() => setViewingHim(false)} />}
      {drawingHim && (
        <ArtTool
          target={{
            kind: 'sprite',
            // Drawn as a character is, from what he looks like and what he wears, in his usual clothes and with a neutral face.
            who: {
              id: PLAYER_FILES,
              name: draft.player.name,
              pronouns: 'he/him',
              appearance: look.appearance,
              outfits: [OutfitSchema.parse({ id: 'default', name: 'Usual clothes', description: look.clothes })],
              imageSeed: look.imageSeed
            },
            outfitId: 'default',
            expression: 'neutral',
            onUse: (_outfit, _expression, sprite) => setLook({ sprite })
          }}
          onClose={() => setDrawingHim(false)}
        />
      )}

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>{t('editor.player.title')}</h1>
            <span className="hint">
              {t('editor.player.headHint', { changed: !!info?.playerChanged })}
            </span>
          </div>
        </div>

        <div className="editor-body">
          <Group title={t('editor.player.who')}>
            <div className="row">
              <Text
                label={t('editor.player.defaultName')}
                llm
                value={draft.player.name}
                onChange={(name) => setPlayer({ name })}
                hint={t('editor.player.defaultNameHint')}
              />
              <label>
                {t('editor.player.start')}
                <select value={draft.locationId} onChange={(e) => change({ locationId: e.target.value })}>
                  {content.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
                <span className="hint">{t('editor.player.startHint', { has: !!home, home: home?.name })}</span>
              </label>
            </div>
            <Text
              label={t('editor.player.bio')}
              value={draft.player.bio}
              rows={4}
              onChange={(bio) => setPlayer({ bio })}
              llm
              hint={t('editor.player.bioHint')}
            />
          </Group>

          <Group title={t('editor.player.picture')} hint={t('editor.player.pictureHint')}>
            <Text
              label={t('editor.player.appearance')}
              value={look.appearance}
              rows={3}
              placeholder={t('editor.player.appearancePlaceholder')}
              onChange={(appearance) => setLook({ appearance })}
              hint={t('editor.player.appearanceHint')}
            />
            <Text label={t('editor.player.clothes')} value={look.clothes} placeholder={t('editor.player.clothesPlaceholder')} onChange={(clothes) => setLook({ clothes })} />
            <div className="row checks">
              {look.sprite ? (
                <button type="button" className="sprite-thumb player-sprite" title={t('editor.slots.view')} onClick={() => setViewingHim(true)}>
                  <img src={`content://pack/${look.sprite}`} alt={draft.player.name} />
                </button>
              ) : (
                <span className="hint">{t('editor.player.noPicture')}</span>
              )}
              {look.sprite && (
                <Portrait who={{ name: t('editor.player.portrait'), faceY: look.faceY }} image={look.sprite} size={88} />
              )}
              <Button title={t('editor.player.generateTitle')} disabled={look.appearance.trim() === ''} onClick={() => setDrawingHim(true)}>
                {t('editor.player.generate')}
              </Button>
              <Button onClick={uploadHim}>{look.sprite ? t('editor.player.replacePicture') : t('editor.player.addPicture')}</Button>
              {look.sprite && (
                <Button variant="quiet" onClick={() => setLook({ sprite: undefined })}>
                  {t('editor.player.removePicture')}
                </Button>
              )}
            </div>
            <div className="row">
              <label>
                {t('editor.player.faceY', { y: look.faceY })}
                <input type="range" min={0} max={100} value={look.faceY} onChange={(e) => setLook({ faceY: Number(e.target.value) })} />
              </label>
              <label className="studio-narrow">
                {t('editor.common.seed')}
                <input
                  inputMode="numeric"
                  value={look.imageSeed ?? ''}
                  placeholder={t('editor.common.random')}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '')
                    setLook({ imageSeed: digits === '' ? undefined : Number(digits) })
                  }}
                />
              </label>
            </div>
          </Group>

          <Group title={t('editor.player.startsWith')} hint={t('editor.player.startsWithHint')}>
            <div className="row">
              <label>
                {t('editor.player.money')}
                <input type="number" min={0} value={draft.player.money} onChange={(e) => setPlayer({ money: number(e.target.value, 0) })} />
              </label>
              <label>
                {t('editor.player.energy')}
                <input
                  type="number"
                  min={0}
                  max={draft.player.maxEnergy}
                  value={draft.player.energy}
                  onChange={(e) => setPlayer({ energy: Math.min(draft.player.maxEnergy, number(e.target.value, 0)) })}
                />
              </label>
              <label>
                {t('editor.player.maxEnergy')}
                <input
                  type="number"
                  min={1}
                  value={draft.player.maxEnergy}
                  onChange={(e) => {
                    const maxEnergy = number(e.target.value, 1)
                    setPlayer({ maxEnergy, energy: Math.min(draft.player.energy, maxEnergy) })
                  }}
                />
              </label>
            </div>
          </Group>

          <Group title={t('editor.player.room')} hint={t('editor.player.roomHint')}>
            {!room ? (
              <Button onClick={() => change({ room: { name: 'his room', description: '', locationId: draft.locationId } })}>{t('editor.player.giveRoom')}</Button>
            ) : (
              <>
                <div className="row">
                  <Text label={t('editor.jobs.whatItIs')} value={room.name} placeholder={t('editor.player.roomPlaceholder')} onChange={(name) => setRoom({ name })} />
                  <label>
                    {t('editor.player.roomWhere')}
                    <select value={room.locationId} onChange={(e) => setRoom({ locationId: e.target.value })}>
                      {content.locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <Text
                  label={t('editor.common.description')}
                  value={room.description}
                  rows={3}
                  onChange={(description) => setRoom({ description })}
                  hint={t('editor.player.roomDescriptionHint')}
                />
                <RoomPictures room={room} place={roomPlace} owner={PLAYER_FILES} onChange={setRoom} onStatus={setStatus} />
                <div className="row checks">
                  <Button variant="quiet" onClick={() => change({ room: undefined })}>
                    {t('editor.player.removeRoom')}
                  </Button>
                </div>
              </>
            )}
          </Group>
        </div>

        <EditorFoot
          issues={issues}
          status={status}
          busy={busy}
          dirty={dirty}
          canSave={draft.player.name.trim() !== ''}
          onUndo={() => (setDraft(original), setIssues([]))}
          onSave={() => apply(window.api.editor.savePlayer(draft), t('editor.player.saved'))}
          remove={
            info?.playerChanged
              ? {
                  label: t('editor.player.putBack'),
                  onClick: () => window.confirm(t('editor.player.putBackConfirm')) && apply(window.api.editor.resetPlayer(), t('editor.player.putBackDone'))
                }
              : undefined
          }
        />
      </section>
    </main>
  )
}
