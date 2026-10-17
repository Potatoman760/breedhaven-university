import { useEffect, useState, type ReactNode } from 'react'
import type { EditorInfo, EditorResult } from '../../../../shared/editor'
import { viewImage } from '../../../../shared/game'
import { Portrait } from '../Portrait'
import { LIGHTS, OutfitSchema, type ContentPack, type NewGame, type PlayerLook, type Room } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { ArtTool } from '../art/ArtTool'
import { Button } from '../Button'
import { Lightbox } from '../Lightbox'
import { EditorFoot, Group, Text } from './fields'

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
  // The art tool is open on his room, or its picture is being looked at whole.
  const [drawing, setDrawing] = useState(false)
  const [viewing, setViewing] = useState(false)
  // Likewise his own picture.
  const [drawingHim, setDrawingHim] = useState(false)
  const [viewingHim, setViewingHim] = useState(false)

  useEffect(() => {
    window.api.editor.info().then(setInfo, (error) => setStatus(errorMessage(error)))
  }, [])

  const dirty = !same(draft, original)
  const mayLeave = () => !dirty || window.confirm('Discard the changes you have not saved?')
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
  // The pictures of the place his room is in, any of which can stand for the room.
  const roomViews = (roomPlace?.backgrounds ?? []).flatMap((view) => {
    const image = viewImage(view, 'day')
    return image ? [{ id: view.id, name: view.name, image }] : []
  })

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

  /** Has the user pick a picture for his room, which is copied into the add-on folder. */
  async function upload() {
    setStatus('')
    try {
      const background = await window.api.editor.importAsset({ loveInterestId: PLAYER_FILES, kind: 'image' })
      if (background) setRoom({ background })
    } catch (error) {
      setStatus(errorMessage(error))
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
      {viewing && room?.background && <Lightbox image={room.background} name={room.name || 'His room'} onClose={() => setViewing(false)} />}
      {drawing && room && (
        <ArtTool
          target={{
            kind: 'background',
            // The room's name says whose it is, which is no use to an image model: it is drawn from what it looks like.
            location: { id: PLAYER_FILES, name: '', appearance: room.description, indoors: true },
            title: room.name || 'His room',
            periods: [...LIGHTS],
            onUse: (_view, background) => setRoom({ background })
          }}
          onClose={() => setDrawing(false)}
        />
      )}

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>The player</h1>
            <span className="hint">
              How a new game starts him. A game already under way keeps what it has.
              {info?.playerChanged ? ' Changed from the game’s own.' : ''}
            </span>
          </div>
        </div>

        <div className="editor-body">
          <Group title="Who he is">
            <div className="row">
              <Text
                label="Default name"
                llm
                value={draft.player.name}
                onChange={(name) => setPlayer({ name })}
                hint="What he is called unless the player types another at the start of a game. Everywhere else the content writes {player}."
              />
              <label>
                Where a new game starts
                <select value={draft.locationId} onChange={(e) => change({ locationId: e.target.value })}>
                  {content.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
                <span className="hint">Where he wakes on the first day{home ? `: ${home.name}` : ''}, and where “my own room” is for studying.</span>
              </label>
            </div>
            <Text
              label="Bio"
              value={draft.player.bio}
              rows={4}
              onChange={(bio) => setPlayer({ bio })}
              llm
              hint="The default: the player can write his own when a game begins. Write {player} for his name."
            />
          </Group>

          <Group title="His picture" hint="His neutral sprite, drawn as a character's is. His portrait is cut from it wherever one of him is shown.">
            <Text
              label="Appearance"
              value={look.appearance}
              rows={3}
              placeholder="a young man of eighteen, tall and lean, short dark hair, grey eyes"
              onChange={(appearance) => setLook({ appearance })}
              hint="His body and face, as a picture: no clothes and no name. Sent to ComfyUI as the start of the prompt."
            />
            <Text label="Usual clothes" value={look.clothes} placeholder="a navy hoodie over a white t-shirt, dark jeans, sneakers" onChange={(clothes) => setLook({ clothes })} />
            <div className="row checks">
              {look.sprite ? (
                <button type="button" className="sprite-thumb player-sprite" title="Look at the whole picture" onClick={() => setViewingHim(true)}>
                  <img src={`content://pack/${look.sprite}`} alt={draft.player.name} />
                </button>
              ) : (
                <span className="hint">No picture yet.</span>
              )}
              {look.sprite && (
                <Portrait who={{ name: 'His portrait', faceY: look.faceY }} image={look.sprite} size={88} />
              )}
              <Button title="Draw him with your own ComfyUI, from his appearance and clothes" disabled={look.appearance.trim() === ''} onClick={() => setDrawingHim(true)}>
                Generate a picture
              </Button>
              <Button onClick={uploadHim}>{look.sprite ? 'Replace the picture' : 'Add a picture'}</Button>
              {look.sprite && (
                <Button variant="quiet" onClick={() => setLook({ sprite: undefined })}>
                  Remove the picture
                </Button>
              )}
            </div>
            <div className="row">
              <label>
                How far down the picture his face is: {look.faceY}%
                <input type="range" min={0} max={100} value={look.faceY} onChange={(e) => setLook({ faceY: Number(e.target.value) })} />
              </label>
              <label className="studio-narrow">
                ImageGen preferred seed
                <input
                  inputMode="numeric"
                  value={look.imageSeed ?? ''}
                  placeholder="Random"
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '')
                    setLook({ imageSeed: digits === '' ? undefined : Number(digits) })
                  }}
                />
              </label>
            </div>
          </Group>

          <Group title="What he starts with" hint="His six stats are not set here: the player spends a pool of points on them when a game begins.">
            <div className="row">
              <label>
                Money ($)
                <input type="number" min={0} value={draft.player.money} onChange={(e) => setPlayer({ money: number(e.target.value, 0) })} />
              </label>
              <label>
                Energy
                <input
                  type="number"
                  min={0}
                  max={draft.player.maxEnergy}
                  value={draft.player.energy}
                  onChange={(e) => setPlayer({ energy: Math.min(draft.player.maxEnergy, number(e.target.value, 0)) })}
                />
              </label>
              <label>
                Most energy he can have
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

          <Group title="His room" hint="Somewhere private of his own that a scene can go to, as it can to a character's room, with a picture of its own.">
            {!room ? (
              <Button onClick={() => change({ room: { name: 'his room', description: '', locationId: draft.locationId } })}>Give him a room</Button>
            ) : (
              <>
                <div className="row">
                  <Text label="What it is" value={room.name} placeholder="a single room on the third floor" onChange={(name) => setRoom({ name })} />
                  <label>
                    Where it is
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
                  label="Description"
                  value={room.description}
                  rows={3}
                  onChange={(description) => setRoom({ description })}
                  hint="What the room looks like, as a picture: the space, the things in it, the light, with no 'he' or 'his'. Given to the LLM when a scene is there, and sent to ComfyUI as the prompt for its picture."
                />
                <div className="row checks">
                  {room.background ? (
                    <button type="button" className="sprite-thumb room-thumb" title="Look at the whole picture" onClick={() => setViewing(true)}>
                      <img className="room-art" src={`content://pack/${room.background}`} alt="His room" />
                    </button>
                  ) : (
                    <span className="hint">No picture yet: the place it is in is shown.</span>
                  )}
                  <Button onClick={upload}>{room.background ? 'Replace the picture' : 'Add a picture'}</Button>
                  <Button title="Draw his room with your own ComfyUI, from its description" onClick={() => setDrawing(true)}>
                    Generate a picture
                  </Button>
                  {roomViews.length > 0 && (
                    <label className="inline">
                      or use
                      <select
                        value={roomViews.some((view) => view.image === room.background) ? room.background : ''}
                        onChange={(e) => setRoom({ background: e.target.value || undefined })}
                      >
                        <option value="">a view of {roomPlace?.name}...</option>
                        {roomViews.map((view) => (
                          <option key={view.id} value={view.image}>
                            {view.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {room.background && (
                    <Button variant="quiet" onClick={() => setRoom({ background: undefined })}>
                      Remove the picture
                    </Button>
                  )}
                  <Button variant="quiet" onClick={() => change({ room: undefined })}>
                    Remove the room
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
          onSave={() => apply(window.api.editor.savePlayer(draft), 'Saved. New games start with it.')}
          remove={
            info?.playerChanged
              ? {
                  label: 'Put back as shipped',
                  onClick: () => window.confirm('Put the player back as the game shipped him? Your changes here are lost.') && apply(window.api.editor.resetPlayer(), 'Put back as shipped.')
                }
              : undefined
          }
        />
      </section>
    </main>
  )
}
