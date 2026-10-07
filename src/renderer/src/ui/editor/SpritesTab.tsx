import { useRef, useState } from 'react'
import { framingFor, sizeFor, spritePrompt } from '../../../../shared/comfy'
import { ADDON_PREFIX, isSafeId, slugify } from '../../../../shared/editor'
import { EXPRESSIONS, outfitDescription, STANDARD_OUTFITS, type LoveInterest, type Outfit } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { ArtTool } from '../art/ArtTool'
import { BatchProgress, useBatch } from '../art/batch'
import { Button } from '../Button'
import { Lightbox } from '../Lightbox'
import { Portrait } from '../MapPanel'
import { Group, Text } from './fields'
import { EmptySlot, PictureSlot, SlotGrid } from './slots'

/** What the sprite editor needs of a character: a love interest and an NPC both have it. */
type SpriteOwner = Pick<LoveInterest, 'id' | 'name' | 'pronouns' | 'appearance' | 'outfits' | 'defaultOutfitId' | 'faceY' | 'stageHeight' | 'animations' | 'imageSeed'>

interface Props {
  draft: SpriteOwner
  set: (patch: Partial<SpriteOwner>) => void
  /** Leaves out what only a love interest has: an outfit drawn pregnant. */
  plain?: boolean
}

/** A name not already taken in the list, made from the wanted one: "happy", "happy-2"... */
function unique(wanted: string, taken: string[]): string {
  const base = wanted || 'new'
  let name = base
  for (let n = 2; taken.includes(name); n++) name = `${base}-${n}`
  return name
}

/** A percentage that can be typed: kept as written while it is being typed, and held to its limits once it is left. */
function PercentBox({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (value: number) => void }) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    const typed = Math.round(Number(text))
    if (text !== null && text.trim() !== '' && Number.isFinite(typed)) onChange(Math.min(max, Math.max(min, typed)))
    setText(null)
  }
  return (
    <span className="percent-box">
      <input
        inputMode="numeric"
        aria-label="Height on stage, as a percentage"
        value={text ?? String(value)}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      %
    </span>
  )
}

/** Outfits and their sprites, the portrait crop, and animations. */
export function SpritesTab({ draft, set, plain }: Props) {
  const [notice, setNotice] = useState('')
  // The outfit and expression the art tool is open on, while it is.
  const [drawing, setDrawing] = useState<{ outfitId: string; expression: string } | null>(null)
  const ready = isSafeId(draft.id)
  // The run that is drawing or cutting out the pictures of one outfit, while there is one.
  const { batch, run, stop } = useBatch()
  // The picture opened to be looked at whole, while one is.
  const [viewing, setViewing] = useState<{ outfitId: string; name: string } | null>(null)
  // A seed typed for an outfit's run of missing faces, by outfit id, in place of her preferred one.
  const [batchSeeds, setBatchSeeds] = useState<Record<string, string>>({})
  // The draft as it stands now, for a run that outlives the render it was started from.
  const latest = useRef(draft)
  latest.current = draft

  /**
   * Draws every face an outfit lacks, one after another, and puts each on the outfit as it
   * arrives. Nothing is asked first: a picture that is not liked can be removed and drawn again.
   */
  async function generateMissing(outfitId: string) {
    const missing = EXPRESSIONS.filter((face) => !(face in (latest.current.outfits.find((o) => o.id === outfitId)?.sprites ?? {})))
    // The seed typed for this run, for every picture in it; without one, her preferred seed.
    const typed = batchSeeds[outfitId] ?? ''
    const seed = typed === '' ? undefined : Number(typed)
    setNotice('')
    const settings = await window.api.comfy.getSettings()
    const size = sizeFor(settings, 'sprite')
    const { failed } = await run(outfitId, 'Drawing', missing, (face) => face, async (face) => {
      const who = latest.current
      const result = await window.api.comfy.generate({
        kind: 'sprite',
        subjectId: who.id,
        name: `${outfitId}-${face}`,
        positive: spritePrompt(who, outfitId, face, framingFor(settings, 'sprite')),
        width: size.width,
        height: size.height,
        seed: seed ?? who.imageSeed
      })
      // Without a working ComfyUI the rest would fail the same way.
      if (!result.ok || !result.path) return { ok: false, message: result.message, fatal: true }
      const image = result.path
      // Onto the draft as it is now, so nothing edited while this ran is lost.
      set({
        outfits: latest.current.outfits.map((outfit) =>
          outfit.id === outfitId ? { ...outfit, sprites: { ...outfit.sprites, [face]: { image, description: '' } } } : outfit
        )
      })
      return { ok: true }
    })
    if (failed.length > 0) setNotice(`Stopped at ${failed[0]}`)
  }

  /** Whether a sprite still has its flat background: a PNG of hers in the add-on folder that is not already a cut-out. */
  const uncut = (image: string) => image.startsWith(ADDON_PREFIX) && /\.png$/i.test(image) && !/-cutout(-\d+)?\.png$/i.test(image)

  /** Takes the background out from behind every sprite of an outfit that still has one, one after another. */
  async function cutOutAll(outfitId: string) {
    const names = Object.entries(latest.current.outfits.find((o) => o.id === outfitId)?.sprites ?? {})
      .filter(([, sprite]) => uncut(sprite.image))
      .map(([name]) => name)
    if (names.length === 0 || batch) return
    setNotice('')
    const { failed } = await run(outfitId, 'Cutting out', names, (name) => name, async (name) => {
      const from = latest.current.outfits.find((o) => o.id === outfitId)?.sprites[name]?.image
      if (!from) return { ok: true }
      const cut = await window.api.comfy.cutout({ path: from })
      // One that can't be keyed is left as it is, and the rest go on.
      if (!cut.ok || !cut.path) return { ok: false, message: cut.message }
      const to = cut.path
      // Every sprite on the old file moves, since that file is gone.
      set({
        outfits: latest.current.outfits.map((o) => ({
          ...o,
          sprites: Object.fromEntries(Object.entries(o.sprites).map(([key, sprite]) => [key, sprite.image === from ? { ...sprite, image: to } : sprite]))
        }))
      })
      return { ok: true }
    })
    setNotice(failed.length > 0 ? `Could not cut out: ${failed.join('; ')}` : 'Cut out. Save the character to keep them.')
  }

  const setOutfit = (index: number, patch: Partial<Outfit>) =>
    set({ outfits: draft.outfits.map((outfit, i) => (i === index ? { ...outfit, ...patch } : outfit)) })

  /** Has the user pick a file, which is copied into this character's add-on folder. */
  async function pick(kind: 'image' | 'video'): Promise<string | null> {
    setNotice('')
    try {
      return await window.api.editor.importAsset({ loveInterestId: draft.id, kind })
    } catch (error) {
      setNotice(errorMessage(error))
      return null
    }
  }

  async function addSprite(index: number) {
    const image = await pick('image')
    if (!image) return
    const outfit = draft.outfits[index]
    const stem = image.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'new'
    // The first picture of an outfit is the one shown by default.
    const name = unique(Object.keys(outfit.sprites).length === 0 ? 'neutral' : stem, Object.keys(outfit.sprites))
    setOutfit(index, { sprites: { ...outfit.sprites, [name]: { image, description: '' } } })
  }

  /** Puts a generated picture on an outfit under the expression it was drawn for, in place of any there. */
  function useGenerated(outfitId: string, expression: string, image: string) {
    set({
      outfits: draft.outfits.map((outfit) =>
        outfit.id === outfitId
          ? { ...outfit, sprites: { ...outfit.sprites, [expression]: { image, description: outfit.sprites[expression]?.description ?? '' } } }
          : outfit
      )
    })
  }

  /** Takes the flat background out from behind a sprite in the add-on folder, and points the sprite at the cut-out. */
  async function cutOut(index: number, name: string) {
    const outfit = draft.outfits[index]
    const sprite = outfit.sprites[name]
    setNotice('')
    try {
      const cut = await window.api.comfy.cutout({ path: sprite.image })
      if (!cut.ok || !cut.path) return setNotice(cut.colour ? `${cut.message} (The background it found is ${cut.colour}.)` : cut.message)
      // Every sprite on the old file moves, since that file is gone.
      const from = sprite.image
      const to = cut.path
      set({
        outfits: draft.outfits.map((o) => ({
          ...o,
          sprites: Object.fromEntries(Object.entries(o.sprites).map(([key, s]) => [key, s.image === from ? { ...s, image: to } : s]))
        }))
      })
      setNotice(cut.message || 'Cut out. Save the character to keep it.')
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  const isStandardOutfit = (id: string) => !plain && STANDARD_OUTFITS.some((s) => s.id === id)
  const isFace = (name: string) => !plain && (EXPRESSIONS as readonly string[]).includes(name)
  /** An outfit's pictures, the standard faces first and in their usual order. */
  const ordered = (outfit: Outfit) => [
    ...EXPRESSIONS.filter((face) => face in outfit.sprites).map((face) => [face, outfit.sprites[face]] as const),
    ...Object.entries(outfit.sprites).filter(([name]) => !(EXPRESSIONS as readonly string[]).includes(name))
  ]

  /** Has the user pick a picture for one of an outfit's faces. */
  async function addFace(index: number, face: string) {
    const image = await pick('image')
    if (image) setOutfit(index, { sprites: { ...draft.outfits[index].sprites, [face]: { image, description: '' } } })
  }

  /** Renames a sprite without moving it in the list. */
  function renameSprite(index: number, from: string, to: string) {
    const outfit = draft.outfits[index]
    if (to === from || to in outfit.sprites) return
    setOutfit(index, {
      sprites: Object.fromEntries(Object.entries(outfit.sprites).map(([name, sprite]) => [name === from ? to : name, sprite]))
    })
  }

  function addOutfit() {
    const id = unique('outfit', draft.outfits.map((o) => o.id))
    set({ outfits: [...draft.outfits, { id, name: 'New outfit', description: '', sprites: {}, pregnant: false }] })
  }

  function removeOutfit(index: number) {
    const outfits = draft.outfits.filter((_, i) => i !== index)
    const gone = draft.outfits[index].id
    // Nothing is left pointing at an outfit that is no longer there.
    const freed = outfits.map((o) => ({ ...o, inherits: o.inherits === gone ? undefined : o.inherits, fallback: o.fallback === gone ? undefined : o.fallback }))
    set({ outfits: freed, defaultOutfitId: draft.defaultOutfitId === gone ? (freed[0]?.id ?? '') : draft.defaultOutfitId })
  }

  async function addAnimation() {
    const video = await pick('video')
    if (!video) return
    const stem = video.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'animation'
    const id = unique(slugify(stem), draft.animations.map((a) => a.id))
    set({ animations: [...draft.animations, { id, name: stem, description: '', video, loop: true }] })
  }

  // The picture being looked at, among the others of its outfit, in the order they are shown.
  const viewedOutfit = draft.outfits.find((o) => o.id === viewing?.outfitId)
  const viewedAll = viewedOutfit ? ordered(viewedOutfit) : []
  const viewedAt = viewedAll.findIndex(([name]) => name === viewing?.name)
  const viewed = viewedAll[viewedAt]
  /** Moves to the picture before or after, round from the last to the first. */
  const step = (by: number) => {
    if (!viewedOutfit || viewedAll.length < 2 || viewedAt < 0) return
    setViewing({ outfitId: viewedOutfit.id, name: viewedAll[(viewedAt + by + viewedAll.length) % viewedAll.length][0] })
  }
  return (
    <>
      {viewedOutfit && viewed && (
        <Lightbox
          image={viewed[1].image}
          name={`${viewedOutfit.name}: ${viewed[0]}`}
          onClose={() => setViewing(null)}
          position={viewedAll.length > 1 ? `${viewedAt + 1} of ${viewedAll.length}` : undefined}
          onStep={viewedAll.length > 1 ? step : undefined}
        />
      )}
      {drawing && (
        <ArtTool
          target={{ kind: 'sprite', who: draft, outfitId: drawing.outfitId, expression: drawing.expression, onUse: useGenerated }}
          onClose={() => setDrawing(null)}
        />
      )}
      {!ready && <p className="notice">Give the character an id before adding pictures: they are filed under it.</p>}
      {notice && <p className="notice">{notice}</p>}

      <Group title="Portrait" hint="The small round picture used on the map and in lists is cut from the default outfit's first sprite.">
        <div className="portrait-crop">
          <Portrait li={draft} />
          <label>
            How far down the picture the face is: {draft.faceY}%
            <input type="range" min={0} max={100} value={draft.faceY} onChange={(e) => set({ faceY: Number(e.target.value) })} />
          </label>
        </div>
      </Group>

      <Group
        title="Height on stage"
        hint="An image model draws everyone filling the frame, however short she is meant to be. Draw her full-frame like anyone else, and set how tall she stands here: she is scaled from the floor up, in every outfit and expression. Portraits are not affected."
      >
        <div className="percent-field">
          <input
            type="range"
            aria-label="Height on stage"
            min={40}
            max={115}
            value={draft.stageHeight}
            onChange={(e) => set({ stageHeight: Number(e.target.value) })}
          />
          <PercentBox value={draft.stageHeight} min={30} max={120} onChange={(stageHeight) => set({ stageHeight })} />
          <span className="hint">{draft.stageHeight === 100 ? 'Full height' : draft.stageHeight < 100 ? 'Shorter than most' : 'Taller than most'}</span>
          {draft.stageHeight !== 100 && (
            <Button variant="quiet" size="small" onClick={() => set({ stageHeight: 100 })}>
              Reset
            </Button>
          )}
        </div>
      </Group>

      <Group title="Image generation" hint="Used by the art tool whenever it draws her.">
        <label className="studio-narrow">
          ImageGen preferred seed
          <input
            inputMode="numeric"
            value={draft.imageSeed ?? ''}
            placeholder="Random"
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '')
              set({ imageSeed: digits === '' ? undefined : Number(digits) })
            }}
          />
          <span className="hint">The same seed keeps her face and build alike from one picture to the next. Empty, each picture gets a seed of its own.</span>
        </label>
      </Group>

      <Group
        title="Outfits"
        hint={
          plain
            ? 'Each outfit has its own pictures. The LLM reads every name and description to decide which to show, so describe them.'
            : `Every love interest has four outfits: her usual clothes, nude, and each of those pregnant, worn once a pregnancy shows. Each has seven faces (${EXPRESSIONS.join(', ')}), and in a scene the LLM picks one for her in every reply. A face that has not been drawn shows the neutral one, and an outfit with no pictures borrows from the one nearest it.`
        }
      >
        {draft.outfits.map((outfit, index) => (
          <div key={index} className="outfit card">
            <div className="row">
              <Text label="Id" value={outfit.id} disabled={isStandardOutfit(outfit.id)} onChange={(id) => {
                const next = slugify(id)
                setOutfit(index, { id: next })
                if (draft.defaultOutfitId === outfit.id) set({ outfits: draft.outfits.map((o, i) => (i === index ? { ...o, id: next } : o)), defaultOutfitId: next })
              }} />
              <Text label="Name" value={outfit.name} onChange={(name) => setOutfit(index, { name })} />
            </div>
            <label>
              Builds on
              <select
                value={outfit.inherits ?? ''}
                disabled={isStandardOutfit(outfit.id)}
                onChange={(e) => setOutfit(index, { inherits: e.target.value || undefined })}
              >
                <option value="">Nothing: its description is its own</option>
                {draft.outfits
                  .filter((other) => other.id !== outfit.id)
                  .map((other) => (
                    <option key={other.id} value={other.id}>
                      {other.name} ({other.id})
                    </option>
                  ))}
              </select>
              {outfit.inherits && (
                <span className="hint">
                  Starts from that outfit's description: “{outfitDescription(draft.outfits, draft.outfits.find((o) => o.id === outfit.inherits)) || 'nothing written yet'}”
                </span>
              )}
            </label>
            <Text
              label={outfit.inherits ? 'Adds to it' : 'Description'}
              value={outfit.description}
              onChange={(description) => setOutfit(index, { description })}
              rows={outfit.inherits ? 2 : 3}
              placeholder={outfit.inherits ? 'what is different about this one, as a sentence of its own' : 'what she is wearing, as the LLM should understand it'}
            />
            <label>
              Pictures
              <select
                value={outfit.fallback ?? ''}
                disabled={outfit.id === draft.defaultOutfitId}
                onChange={(e) => setOutfit(index, { fallback: e.target.value || undefined })}
              >
                <option value="">Its own</option>
                {draft.outfits
                  .filter((other) => other.id !== outfit.id && other.fallback !== outfit.id)
                  .map((other) => (
                    <option key={other.id} value={other.id}>
                      Same as {other.name} ({other.id})
                    </option>
                  ))}
              </select>
              {outfit.fallback && (
                <span className="hint">
                  She looks the same in this outfit as in that one, so its pictures are shown and this one needs none.
                  {Object.keys(outfit.sprites).length > 0 && ` The ${Object.keys(outfit.sprites).length} it already has are kept, and come back if this is set to its own.`}
                </span>
              )}
            </label>
            {!outfit.fallback && (
            <>
            <div className="outfit-actions">
              {!plain && EXPRESSIONS.some((face) => !(face in outfit.sprites)) && (
                <Button
                  disabled={!ready || batch !== null}
                  title="Draws every expression this outfit does not have yet with your own ComfyUI, and sets each as it is finished"
                  onClick={() => generateMissing(outfit.id)}
                >
                  Generate all {EXPRESSIONS.filter((face) => !(face in outfit.sprites)).length} missing expressions
                </Button>
              )}
              {!plain && EXPRESSIONS.some((face) => !(face in outfit.sprites)) && (
                <input
                  className="batch-seed"
                  inputMode="numeric"
                  aria-label="Seed for the missing expressions"
                  title="The seed for every picture in that run, in place of her preferred seed. Empty, her preferred seed is used."
                  value={batchSeeds[outfit.id] ?? ''}
                  placeholder={draft.imageSeed === undefined ? 'Seed: random' : `Seed: ${draft.imageSeed}`}
                  disabled={batch !== null}
                  onChange={(e) => setBatchSeeds({ ...batchSeeds, [outfit.id]: e.target.value.replace(/\D/g, '').slice(0, 15) })}
                />
              )}
              <Button
                disabled={!ready}
                title="Draw a sprite of this outfit with your own ComfyUI"
                onClick={() => setDrawing({ outfitId: outfit.id, expression: EXPRESSIONS.find((face) => !(face in outfit.sprites)) ?? '' })}
              >
                Generate a picture
              </Button>
              <Button disabled={!ready} onClick={() => addSprite(index)}>
                {plain ? 'Add a picture' : 'Add another picture'}
              </Button>
              {Object.values(outfit.sprites).some((sprite) => uncut(sprite.image)) && (
                <Button
                  disabled={batch !== null}
                  title="Makes the flat background transparent on every sprite of this outfit that still has one"
                  onClick={() => cutOutAll(outfit.id)}
                >
                  Cut out all {Object.values(outfit.sprites).filter((sprite) => uncut(sprite.image)).length}
                </Button>
              )}
              <Button variant="quiet" className="outfit-remove" disabled={draft.outfits.length <= 1 || isStandardOutfit(outfit.id) || outfit.id === draft.defaultOutfitId} onClick={() => removeOutfit(index)}>
                Remove outfit
              </Button>
            </div>
            <BatchProgress batch={batch} at={outfit.id} onStop={stop} />

            <SlotGrid>
              {ordered(outfit).map(([name, sprite]) => (
                <PictureSlot
                  key={name}
                  image={sprite.image}
                  name={name}
                  onView={() => setViewing({ outfitId: outfit.id, name })}
                  actions={
                    <>
                      <Button
                        disabled={!ready}
                        onClick={async () => {
                          const image = await pick('image')
                          if (image) setOutfit(index, { sprites: { ...outfit.sprites, [name]: { ...sprite, image } } })
                        }}
                      >
                        Replace
                      </Button>
                      <Button disabled={!ready} title="Draw this sprite again with ComfyUI" onClick={() => setDrawing({ outfitId: outfit.id, expression: name })}>
                        Generate
                      </Button>
                      {sprite.image.startsWith(ADDON_PREFIX) && sprite.image.toLowerCase().endsWith('.png') && (
                        <Button title="Make its flat background transparent" onClick={() => cutOut(index, name)}>
                          Cut out
                        </Button>
                      )}
                      <Button
                        onClick={() => {
                          const { [name]: _removed, ...rest } = outfit.sprites
                          setOutfit(index, { sprites: rest })
                        }}
                      >
                        Remove
                      </Button>
                    </>
                  }
                >
                  <input
                    aria-label="Sprite name"
                    defaultValue={name}
                    key={name}
                    disabled={isFace(name)}
                    onBlur={(e) => renameSprite(index, name, slugify(e.target.value) || name)}
                  />
                  <textarea
                    aria-label="Sprite description"
                    rows={2}
                    value={sprite.description}
                    placeholder="what it shows, so the LLM knows when it fits"
                    onChange={(e) => setOutfit(index, { sprites: { ...outfit.sprites, [name]: { ...sprite, description: e.target.value } } })}
                  />
                </PictureSlot>
              ))}
              {!plain &&
                EXPRESSIONS.filter((face) => !(face in outfit.sprites)).map((face) => (
                  <EmptySlot key={face} name={face} disabled={!ready} onAdd={() => addFace(index, face)} onGenerate={() => setDrawing({ outfitId: outfit.id, expression: face })} />
                ))}
            </SlotGrid>
            </>
            )}
            {outfit.fallback && (
              <div className="outfit-actions">
                <Button variant="quiet" className="outfit-remove" disabled={draft.outfits.length <= 1 || isStandardOutfit(outfit.id)} onClick={() => removeOutfit(index)}>
                  Remove outfit
                </Button>
              </div>
            )}
          </div>
        ))}
        <Button onClick={addOutfit}>
          Add an outfit
        </Button>
      </Group>

      <Group title="Animations" hint="Videos that take the sprite's place. The LLM plays one when the scene reaches what its description says. One that loops plays until the LLM ends it; one that plays once gives way to the sprite when it finishes.">
        {draft.animations.map((animation, index) => {
          const setAnimation = (patch: Partial<typeof animation>) =>
            set({ animations: draft.animations.map((a, i) => (i === index ? { ...a, ...patch } : a)) })
          return (
            <div key={index} className="card">
              <div className="row">
                <Text label="Id" value={animation.id} onChange={(id) => setAnimation({ id: slugify(id) })} />
                <Text label="Name" value={animation.name} onChange={(name) => setAnimation({ name })} />
              </div>
              <Text label="Description" value={animation.description} onChange={(description) => setAnimation({ description })} />
              <div className="row checks">
                <label className="inline">
                  <input type="checkbox" checked={!animation.loop} onChange={(e) => setAnimation({ loop: !e.target.checked })} />
                  Play once
                </label>
                <span className="hint">{animation.video}</span>
                <Button variant="quiet" onClick={() => set({ animations: draft.animations.filter((_, i) => i !== index) })}>
                  Remove
                </Button>
              </div>
            </div>
          )
        })}
        <Button disabled={!ready} onClick={addAnimation}>
          Add an animation
        </Button>
      </Group>
    </>
  )
}
