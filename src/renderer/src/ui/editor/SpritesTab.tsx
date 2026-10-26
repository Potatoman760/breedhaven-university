import { useEffect, useRef, useState } from 'react'
import { framingFor, nsfwPrompt, sizeFor, spritePrompt } from '../../../../shared/comfy'
import { ADDON_PREFIX, isSafeId, slugify } from '../../../../shared/editor'
import { EXPRESSIONS, isPregnantPose, NSFW_POSES, NSFW_PREGNANT_POSES, STANDARD_POSES, outfitDescription, STANDARD_OUTFITS, type Animation, type LoveInterest, type Outfit } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { ArtTool } from '../art/ArtTool'
import { BatchProgress, useBatch, type BatchOutcome } from '../art/batch'
import { clipRequest } from '../art/ClipForm'
import { fileName, pngsIn, renamed, toWebp } from '../art/optimize'
import { Button } from '../Button'
import { VideoIcon } from '../icons'
import { Lightbox } from '../Lightbox'
import { Portrait } from '../Portrait'
import { Group, Text } from './fields'
import { EmptySlot, PictureSlot, SlotGrid } from './slots'
import { t } from '../../../../shared/i18n'

/** What the sprite editor needs of a character: a love interest and an NPC both have it. */
type SpriteOwner = Pick<LoveInterest, 'id' | 'name' | 'pronouns' | 'appearance' | 'outfits' | 'defaultOutfitId' | 'faceY' | 'stageHeight' | 'animations' | 'imageSeed' | 'birthPicture' | 'walkSprite' | 'room'>

interface Props {
  draft: SpriteOwner
  set: (patch: Partial<SpriteOwner>) => void
  /** Leaves out what only a love interest has: an outfit drawn pregnant. */
  plain?: boolean
  /** What the path of a picture the editor can change starts with: `addons/` for an add-on, nothing when the game's own files are being edited. */
  assetPrefix?: string
  /** The outfits the game's events put a woman in, each with where: an outfit of hers by that id is the one she wears there. */
  eventOutfits?: { id: string; worn: string[] }[]
}

// What the run that draws her missing NSFW poses is filed under, beside the runs of her outfits.
const NSFW_BATCH = '(nsfw)'
// And the run that draws the same poses pregnant.
const NSFW_PREGNANT_BATCH = '(nsfw-pregnant)'
const CLIPS_BATCH = '(clips)'
// What the run that makes her pictures smaller is filed under.
const OPTIMIZE_BATCH = '(optimize)'

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
        aria-label={t('editor.sprites.heightPercent')}
        value={text ?? String(value)}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      %
    </span>
  )
}

/** Outfits and their sprites, the portrait crop, and the NSFW pictures and clips. */
export function SpritesTab({ draft, set, plain, assetPrefix = ADDON_PREFIX, eventOutfits = [] }: Props) {
  const [notice, setNotice] = useState('')
  // The art tool open on her walking profile, and that picture shown large.
  const [walking, setWalking] = useState(false)
  const [walkViewing, setWalkViewing] = useState(false)
  // Cutting out leaves the gaps the art closes around.
  const [edgesOnly, setEdgesOnly] = useState(false)
  // The outfit and expression the art tool is open on, while it is.
  const [drawing, setDrawing] = useState<{ outfitId: string; expression: string } | null>(null)
  const ready = isSafeId(draft.id)
  // The run that is drawing or cutting out the pictures of one outfit, while there is one.
  const { batch, run, stop } = useBatch()
  // The picture opened to be looked at whole, while one is.
  const [viewing, setViewing] = useState<{ outfitId: string; name: string } | null>(null)
  // The NSFW pose the art tool is open on, and the one opened to be looked at whole, while either is.
  const [posing, setPosing] = useState<string | null>(null)
  const [poseViewing, setPoseViewing] = useState<string | null>(null)
  // The pose whose clip is being seen to, while the art tool is open on one: made from its picture, uploaded, replaced or taken off.
  const [clipping, setClipping] = useState<string | null>(null)
  // A seed typed for an outfit's run of missing faces, by outfit id, in place of her preferred one.
  const [batchSeeds, setBatchSeeds] = useState<Record<string, string>>({})
  // The draft as it stands now, for a run that outlives the render it was started from.
  const latest = useRef(draft)
  latest.current = draft
  // A run belongs to the character it was started for. Another opened while it runs ends it, and whatever of it was
  // still on its way is let go, never put on the one now open: that is how one character's pictures became another's.
  useEffect(() => {
    if (batch) stop()
  }, [draft.id])
  /** What a run started for one character writes with: nothing, once another is open. */
  const forOwner = (owner: string) => (patch: Partial<SpriteOwner>) => {
    if (latest.current.id === owner) set(patch)
  }
  const gone = (owner: string): BatchOutcome | undefined => (latest.current.id === owner ? undefined : { ok: false, message: t('editor.sprites.anotherOpened'), fatal: true })

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
    const owner = latest.current.id
    const put = forOwner(owner)
    const { failed } = await run(outfitId, t('editor.common.drawing'), missing, (face) => face, async (face) => {
      const stopped = gone(owner)
      if (stopped) return stopped
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
      put({
        outfits: latest.current.outfits.map((outfit) =>
          outfit.id === outfitId ? { ...outfit, sprites: { ...outfit.sprites, [face]: { image, description: '' } } } : outfit
        )
      })
      return { ok: true }
    })
    if (failed.length > 0) setNotice(t('editor.common.stoppedAt', { name: failed[0] }))
  }

  // Her pictures that are still PNGs, her room's among them: everything the optimize button would turn into WebP.
  const pngs = pngsIn({ outfits: draft.outfits, animations: draft.animations, birthPicture: draft.birthPicture, walkSprite: draft.walkSprite, room: draft.room?.images })

  /**
   * Turns every PNG of hers into a WebP of the same picture, one after another, and puts each in every slot the PNG
   * was in as it is done. Nothing is kept until she is saved; the PNGs go once a save no longer names them.
   */
  async function optimize() {
    const paths = pngsIn({ outfits: latest.current.outfits, animations: latest.current.animations, birthPicture: latest.current.birthPicture, walkSprite: latest.current.walkSprite, room: latest.current.room?.images })
    if (paths.length === 0 || batch) return
    setNotice('')
    const put = forOwner(latest.current.id)
    const { failed } = await run(OPTIMIZE_BATCH, t('editor.common.optimizing'), paths, fileName, async (path) => {
      try {
        const to = await toWebp(path)
        put({ outfits: renamed(latest.current.outfits, path, to), animations: renamed(latest.current.animations, path, to), birthPicture: renamed(latest.current.birthPicture, path, to), walkSprite: renamed(latest.current.walkSprite, path, to), room: latest.current.room && { ...latest.current.room, images: renamed(latest.current.room.images, path, to) } })
        return { ok: true }
      } catch (error) {
        return { ok: false, message: errorMessage(error) }
      }
    })
    setNotice(failed.length > 0 ? t('editor.common.optimizeFailed', { failed: failed.join('; ') }) : t('editor.sprites.optimized'))
  }

  /** Whether a sprite still has its flat background: a PNG of hers in the add-on folder that is not already a cut-out. */
  const uncut = (image: string) => image.startsWith(assetPrefix) && /\.png$/i.test(image) && !/-cutout(-\d+)?\.png$/i.test(image)

  /** Takes the background out from behind every sprite of an outfit that still has one, one after another. */
  async function cutOutAll(outfitId: string) {
    const names = Object.entries(latest.current.outfits.find((o) => o.id === outfitId)?.sprites ?? {})
      .filter(([, sprite]) => uncut(sprite.image))
      .map(([name]) => name)
    if (names.length === 0 || batch) return
    setNotice('')
    const owner = latest.current.id
    const put = forOwner(owner)
    const { failed } = await run(outfitId, t('editor.sprites.cuttingOut'), names, (name) => name, async (name) => {
      const stopped = gone(owner)
      if (stopped) return stopped
      const from = latest.current.outfits.find((o) => o.id === outfitId)?.sprites[name]?.image
      if (!from) return { ok: true }
      const cut = await window.api.comfy.cutout({ path: from, mode: edgesOnly ? 'edge' : 'gaps' })
      // One that can't be keyed is left as it is, and the rest go on.
      if (!cut.ok || !cut.path) return { ok: false, message: cut.message }
      const to = cut.path
      // Every sprite on the old file moves, since that file is gone.
      put({
        outfits: latest.current.outfits.map((o) => ({
          ...o,
          sprites: Object.fromEntries(Object.entries(o.sprites).map(([key, sprite]) => [key, sprite.image === from ? { ...sprite, image: to } : sprite]))
        }))
      })
      return { ok: true }
    })
    setNotice(failed.length > 0 ? t('editor.sprites.cutFailed', { failed: failed.join('; ') }) : t('editor.sprites.cutAll'))
  }

  const setOutfit = (index: number, patch: Partial<Outfit>) =>
    set({ outfits: draft.outfits.map((outfit, i) => (i === index ? { ...outfit, ...patch } : outfit)) })

  /** Has the user pick a file, which is copied into this character's add-on folder. */
  async function pick(kind: 'image' | 'video' | 'media'): Promise<string | null> {
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
      const cut = await window.api.comfy.cutout({ path: sprite.image, mode: edgesOnly ? 'edge' : 'gaps' })
      if (!cut.ok || !cut.path) return setNotice(cut.colour ? t('editor.sprites.cutColour', { message: cut.message, colour: cut.colour }) : cut.message)
      // Every sprite on the old file moves, since that file is gone.
      const from = sprite.image
      const to = cut.path
      set({
        outfits: draft.outfits.map((o) => ({
          ...o,
          sprites: Object.fromEntries(Object.entries(o.sprites).map(([key, s]) => [key, s.image === from ? { ...s, image: to } : s]))
        }))
      })
      setNotice(cut.message || t('editor.sprites.cutOne'))
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

  // What the trip to the springs starts her in, and its pregnant form: without it she goes into the bath dressed.
  function addBathrobe() {
    set({
      outfits: [
        ...draft.outfits,
        { id: 'bathrobe', name: 'Bathrobe', description: 'a short silk bathrobe, loosely tied at the waist and slipping off one shoulder, a deep plunging neckline showing her cleavage, the hem high on her bare thighs', sprites: {}, pregnant: false },
        { id: 'bathrobe-pregnant', name: 'Bathrobe, pregnant', inherits: 'bathrobe', description: 'She has a round, pregnant belly.', sprites: {}, pregnant: true }
      ]
    })
  }

  function removeOutfit(index: number) {
    const outfits = draft.outfits.filter((_, i) => i !== index)
    const gone = draft.outfits[index].id
    // Nothing is left pointing at an outfit that is no longer there.
    const freed = outfits.map((o) => ({ ...o, inherits: o.inherits === gone ? undefined : o.inherits, fallback: o.fallback === gone ? undefined : o.fallback }))
    set({ outfits: freed, defaultOutfitId: draft.defaultOutfitId === gone ? (freed[0]?.id ?? '') : draft.defaultOutfitId })
  }

  /** The pose of that id as she has it, if she has anything for it yet. */
  const poseOf = (id: string) => draft.animations.find((a) => a.id === id)
  // Every slot of the NSFW section: the standard poses in their usual order, with or without a picture, then any of her own.
  const poses = [
    ...NSFW_POSES.map((pose) => poseOf(pose.id) ?? { id: pose.id, name: pose.name, description: '', image: undefined, clip: undefined, loop: true }),
    ...draft.animations.filter((a) => !STANDARD_POSES.some((pose) => pose.id === a.id))
  ]
  // The row under it: each standard pose drawn pregnant, built on the one above.
  const pregnantPoses = NSFW_PREGNANT_POSES.map((pose) => poseOf(pose.id) ?? { id: pose.id, name: pose.name, description: '', image: undefined, clip: undefined, loop: true })
  /** What a pose is drawn from: the standard wording, or for one of her own, what its description says. */
  const drawsOf = (id: string) => STANDARD_POSES.find((pose) => pose.id === id)?.draws ?? poseOf(id)?.description ?? ''

  // The poses that have a picture, in the order they are shown, for stepping through them.
  const withPictures = [...poses, ...pregnantPoses].filter((pose) => pose.image !== undefined)

  /** Changes a pose, making its entry if she has none for it yet. Written onto the draft as it is now, by `put` when a run does it. */
  function setPose(id: string, patch: Partial<Animation>, put: (patch: Partial<SpriteOwner>) => void = set) {
    const have = latest.current.animations
    const standard = STANDARD_POSES.find((pose) => pose.id === id)
    put({
      animations: have.some((a) => a.id === id)
        ? have.map((a) => (a.id === id ? { ...a, ...patch } : a))
        : [...have, { id, name: standard?.name ?? id, description: '', loop: true, ...patch }]
    })
  }

  function removePose(id: string) {
    set({ animations: draft.animations.filter((a) => a.id !== id) })
  }

  /** Renames a pose of her own. A standard one keeps its name, which is how the game knows it. */
  function renamePose(from: string, to: string) {
    if (to === from || draft.animations.some((a) => a.id === to)) return
    set({ animations: draft.animations.map((a) => (a.id === from ? { ...a, id: to, name: to } : a)) })
  }

  /** Has the user pick a picture for a pose of her own, beyond the standard ones. */
  async function addPose() {
    const image = await pick('image')
    if (!image) return
    const stem = image.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'pose'
    const id = unique(slugify(stem), [...STANDARD_POSES.map((pose) => pose.id), ...draft.animations.map((a) => a.id)])
    set({ animations: [...draft.animations, { id, name: id, description: '', image, loop: true }] })
  }

  /** Draws every standard pose that has no picture yet, one after another, and puts each in its slot as it arrives. */
  async function generateMissingPoses(from: readonly { id: string; name: string; draws: string }[] = NSFW_POSES, at: string = NSFW_BATCH) {
    const missing = from.filter((pose) => !latest.current.animations.find((a) => a.id === pose.id)?.image)
    setNotice('')
    const settings = await window.api.comfy.getSettings()
    const size = sizeFor(settings, 'nsfw')
    const owner = latest.current.id
    const put = forOwner(owner)
    const { failed } = await run(at, t('editor.common.drawing'), missing, (pose) => pose.name, async (pose) => {
      const stopped = gone(owner)
      if (stopped) return stopped
      const who = latest.current
      const result = await window.api.comfy.generate({
        kind: 'nsfw',
        subjectId: who.id,
        name: `nsfw-${pose.id}`,
        // One drawn pregnant is the same pose, with her pregnant nude in place of her nude.
        positive: nsfwPrompt(who, pose.draws, framingFor(settings, 'nsfw'), isPregnantPose(pose.id)),
        width: size.width,
        height: size.height,
        seed: who.imageSeed
      })
      // Without a working ComfyUI the rest would fail the same way.
      if (!result.ok || !result.path) return { ok: false, message: result.message, fatal: true }
      setPose(pose.id, { image: result.path }, put)
      return { ok: true }
    })
    if (failed.length > 0) setNotice(t('editor.common.stoppedAt', { name: failed[0] }))
  }

  // The sex-acts that have a picture and no clip yet, in the order they are shown.
  const unclipped = [...poses, ...pregnantPoses].filter((pose) => pose.image !== undefined && pose.clip === undefined)

  /** Makes a clip of every sex-act that has a picture and no clip, one after another, as the clip tool would with nothing changed. */
  async function generateMissingClips() {
    const missing = [...latest.current.animations].filter((pose) => pose.image !== undefined && pose.clip === undefined)
    setNotice('')
    const [settings, list] = await Promise.all([window.api.comfy.getSettings(), window.api.comfy.workflows()])
    const owner = latest.current.id
    const put = forOwner(owner)
    const { failed } = await run(CLIPS_BATCH, t('editor.sprites.animating'), missing, (pose) => pose.name, async (pose) => {
      const stopped = gone(owner)
      if (stopped) return stopped
      const asked = clipRequest(settings, list, owner, { id: pose.id, image: pose.image!, clipPrompt: pose.clipPrompt })
      if (!asked) return { ok: false, message: t('editor.sprites.noClipWorkflow'), fatal: true }
      const result = await window.api.comfy.generateVideo(asked.request)
      if (!result.ok || !result.path) return { ok: false, message: result.message, fatal: true }
      setPose(pose.id, asked.loop === undefined ? { clip: result.path } : { clip: result.path, loop: asked.loop }, put)
      return { ok: true }
    })
    if (failed.length > 0) setNotice(t('editor.common.stoppedAt', { name: failed[0] }))
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
  /** One slot of the NSFW section: a pose's picture with what can be done to it, or the empty place for one. */
  const poseSlot = (pose: Animation | (typeof poses)[number]) => {
    const image = pose.image
    const standard = STANDARD_POSES.find((known) => known.id === pose.id)
    return image ? (
      <PictureSlot
        key={pose.id}
        image={image}
        name={pose.name}
        onView={() => setPoseViewing(pose.id)}
        badge={
          pose.clip && (
            <button type="button" className="sprite-badge" title={t('editor.sprites.clipBadge')} aria-label={t('editor.sprites.clipLabel', { name: pose.name })} onClick={() => setClipping(pose.id)}>
              <VideoIcon size={18} />
            </button>
          )
        }
        actions={
          <>
            <Button
              disabled={!ready}
              onClick={async () => {
                const picked = await pick('image')
                if (picked) setPose(pose.id, { image: picked })
              }}
            >
              {t('editor.common.replace')}
            </Button>
            <Button disabled={!ready} title={t('editor.sprites.drawPoseAgain')} onClick={() => setPosing(pose.id)}>
              {t('editor.common.generate')}
            </Button>
            {/* The clip is a layer over the picture: each is made, replaced and removed without touching the other. */}
            <Button disabled={!ready} title={t('editor.sprites.videoTitle')} onClick={() => setClipping(pose.id)}>
              {t('editor.sprites.video')}
            </Button>
            <Button onClick={() => removePose(pose.id)}>{t('editor.common.remove')}</Button>
          </>
        }
      >
        <input
          aria-label={t('editor.sprites.poseName')}
          defaultValue={pose.id}
          key={pose.id}
          disabled={standard !== undefined}
          onBlur={(e) => renamePose(pose.id, slugify(e.target.value) || pose.id)}
        />
        <textarea
          aria-label={t('editor.sprites.poseDescription')}
          rows={2}
          value={pose.description}
          placeholder={standard?.description ?? t('editor.sprites.descriptionPlaceholder')}
          onChange={(e) => setPose(pose.id, { description: e.target.value })}
        />
      </PictureSlot>
    ) : (
      <EmptySlot
        key={pose.id}
        name={pose.name}
        disabled={!ready}
        onAdd={async () => {
          const picked = await pick('image')
          if (picked) setPose(pose.id, { image: picked })
        }}
        onGenerate={() => setPosing(pose.id)}
      />
    )
  }

  return (
    <>
      {viewedOutfit && viewed && (
        <Lightbox
          image={viewed[1].image}
          name={t('editor.sprites.viewing', { outfit: viewedOutfit.name, name: viewed[0] })}
          onClose={() => setViewing(null)}
          position={viewedAll.length > 1 ? t('editor.common.position', { at: viewedAt + 1, total: viewedAll.length }) : undefined}
          onStep={viewedAll.length > 1 ? step : undefined}
        />
      )}
      {posing && (
        <ArtTool
          target={{
            kind: 'nsfw',
            who: draft,
            poses: [...poses, ...pregnantPoses].map((pose) => ({ id: pose.id, name: pose.name, draws: drawsOf(pose.id) })),
            pose: posing,
            onUse: (poseId, image) => setPose(poseId, { image })
          }}
          onClose={() => setPosing(null)}
        />
      )}
      {clipping && poseOf(clipping)?.image && (
        <ArtTool
          target={{
            kind: 'video',
            who: draft,
            pose: {
              id: clipping,
              name: poseOf(clipping)!.name,
              image: poseOf(clipping)!.image!,
              clip: poseOf(clipping)!.clip,
              loop: poseOf(clipping)!.loop,
              clipPrompt: poseOf(clipping)!.clipPrompt
            },
            onUse: (poseId, clip, loop) => setPose(poseId, loop === undefined ? { clip } : { clip, loop }),
            onUpload: async () => {
              const clip = await pick('video')
              if (clip) setPose(clipping, { clip })
            },
            onRemove: () => setPose(clipping, { clip: undefined }),
            onLoop: (loop) => setPose(clipping, { loop }),
            onKeepPrompt: (clipPrompt) => setPose(clipping, { clipPrompt })
          }}
          onClose={() => setClipping(null)}
        />
      )}
      {poseViewing && poseOf(poseViewing)?.image && (
        <Lightbox
          image={poseOf(poseViewing)!.image!}
          name={poseOf(poseViewing)!.name}
          onClose={() => setPoseViewing(null)}
          position={t('editor.common.position', { at: withPictures.findIndex((pose) => pose.id === poseViewing) + 1, total: withPictures.length })}
          onStep={
            withPictures.length > 1
              ? (by) => setPoseViewing(withPictures[(withPictures.findIndex((pose) => pose.id === poseViewing) + by + withPictures.length) % withPictures.length].id)
              : undefined
          }
        />
      )}
      {drawing && (
        <ArtTool
          target={{ kind: 'sprite', who: draft, outfitId: drawing.outfitId, expression: drawing.expression, onUse: useGenerated }}
          onClose={() => setDrawing(null)}
        />
      )}
      {!ready && <p className="notice">{t('editor.common.idFirst')}</p>}
      {notice && <p className="notice">{notice}</p>}

      <div className="outfit-actions">
        <Button
          disabled={!ready || batch !== null || pngs.length === 0}
          title={t('editor.sprites.optimizeTitle')}
          onClick={optimize}
        >
          {pngs.length > 0 ? t('editor.common.optimize', { count: pngs.length }) : t('editor.common.optimizedButton')}
        </Button>
      </div>
      <BatchProgress batch={batch} at={OPTIMIZE_BATCH} onStop={stop} />

      <Group title={t('editor.sprites.portrait')} hint={t('editor.sprites.portraitHint')}>
        <div className="portrait-crop">
          <Portrait who={draft} caption />
          <label>
            {t('editor.sprites.faceY', { y: draft.faceY })}
            <input type="range" min={0} max={100} value={draft.faceY} onChange={(e) => set({ faceY: Number(e.target.value) })} />
          </label>
        </div>
      </Group>

      <Group
        title={t('editor.sprites.height')}
        hint={t('editor.sprites.heightHint')}
      >
        <div className="percent-field">
          <input
            type="range"
            aria-label={t('editor.sprites.height')}
            min={40}
            max={115}
            value={draft.stageHeight}
            onChange={(e) => set({ stageHeight: Number(e.target.value) })}
          />
          <PercentBox value={draft.stageHeight} min={30} max={120} onChange={(stageHeight) => set({ stageHeight })} />
          <span className="hint">{draft.stageHeight === 100 ? t('editor.sprites.fullHeight') : draft.stageHeight < 100 ? t('editor.sprites.shorter') : t('editor.sprites.taller')}</span>
          {draft.stageHeight !== 100 && (
            <Button variant="quiet" size="small" onClick={() => set({ stageHeight: 100 })}>
              {t('editor.sprites.reset')}
            </Button>
          )}
        </div>
      </Group>

      <Group title={t('editor.sprites.imageGen')} hint={t('editor.sprites.imageGenHint')}>
        <label className="studio-narrow">
          {t('editor.common.seed')}
          <input
            inputMode="numeric"
            value={draft.imageSeed ?? ''}
            placeholder={t('editor.common.random')}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '')
              set({ imageSeed: digits === '' ? undefined : Number(digits) })
            }}
          />
          <span className="hint">{t('editor.sprites.seedHint')}</span>
        </label>
      </Group>

      <Group
        title={t('editor.sprites.outfits')}
        hint={
          plain
            ? t('editor.sprites.outfitsHintPlain')
            : t('editor.sprites.outfitsHint', { faces: EXPRESSIONS.join(', ') })
        }
      >
        <label className="inline" title={t('editor.sprites.edgesTitle')}>
          <input type="checkbox" checked={edgesOnly} onChange={(e) => setEdgesOnly(e.target.checked)} />
          {t('editor.sprites.edges')}
        </label>
        <label>
          {t('editor.sprites.usualOutfit')}
          <select value={draft.defaultOutfitId} onChange={(e) => set({ defaultOutfitId: e.target.value })}>
            {draft.outfits
              .filter((outfit) => !outfit.pregnant)
              .map((outfit) => (
                <option key={outfit.id} value={outfit.id}>
                  {outfit.name} ({outfit.id})
                </option>
              ))}
          </select>
        </label>
        {draft.outfits.map((outfit, index) => (
          <div key={index} className="outfit card">
            <div className="row">
              <Text label={t('editor.common.id')} value={outfit.id} disabled={isStandardOutfit(outfit.id)} onChange={(id) => {
                const next = slugify(id)
                setOutfit(index, { id: next })
                if (draft.defaultOutfitId === outfit.id) set({ outfits: draft.outfits.map((o, i) => (i === index ? { ...o, id: next } : o)), defaultOutfitId: next })
              }} />
              <Text label={t('editor.common.name')} value={outfit.name} onChange={(name) => setOutfit(index, { name })} />
              {/* An outfit by the id an event names is the one she wears there. */}
              {!isStandardOutfit(outfit.id) && eventOutfits.length > 0 && (
                <label>
                  {t('editor.sprites.wornFor')}
                  <select
                    value={eventOutfits.some((one) => one.id === outfit.id) ? outfit.id : ''}
                    onChange={(e) => {
                      if (!e.target.value) return
                      const next = e.target.value
                      set({ outfits: draft.outfits.map((o, i) => (i === index ? { ...o, id: next } : o)), ...(draft.defaultOutfitId === outfit.id && { defaultOutfitId: next }) })
                    }}
                  >
                    <option value="">{t('editor.sprites.ownChoosing')}</option>
                    {eventOutfits
                      .filter((one) => one.id === outfit.id || !draft.outfits.some((o) => o.id === one.id))
                      .map((one) => (
                        <option key={one.id} value={one.id}>
                          {one.worn.join('; ')}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            {!isStandardOutfit(outfit.id) && (
              <label className="inline">
                <input type="checkbox" checked={outfit.oneOff === true} onChange={(e) => setOutfit(index, { oneOff: e.target.checked || undefined })} />
                {t('editor.sprites.oneOff')}
              </label>
            )}
            <label>
              {t('editor.sprites.parent')}
              <select
                value={outfit.inherits ?? ''}
                disabled={isStandardOutfit(outfit.id)}
                onChange={(e) => setOutfit(index, { inherits: e.target.value || undefined })}
              >
                <option value="">{t('editor.sprites.noParent')}</option>
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
                  {t('editor.sprites.inherits', { description: outfitDescription(draft.outfits, draft.outfits.find((o) => o.id === outfit.inherits)) || t('editor.sprites.nothingWritten') })}
                </span>
              )}
            </label>
            {/* A pregnant outfit is the pregnant form of its parent. The two standard ones are fixed; any other can be made one. */}
            {!plain && (
              <label className="inline">
                <input
                  type="checkbox"
                  checked={outfit.pregnant}
                  disabled={isStandardOutfit(outfit.id) || (!outfit.pregnant && !outfit.inherits)}
                  onChange={(e) => setOutfit(index, { pregnant: e.target.checked })}
                />
                {t('editor.sprites.pregnantForm')}
              </label>
            )}
            <Text
              label={outfit.inherits ? t('editor.sprites.addsToIt') : t('editor.common.description')}
              value={outfit.description}
              onChange={(description) => setOutfit(index, { description })}
              rows={outfit.inherits ? 2 : 3}
              placeholder={outfit.inherits ? t('editor.sprites.addsPlaceholder') : t('editor.sprites.wearingPlaceholder')}
            />
            <label>
              {t('editor.sprites.pictures')}
              <select
                value={outfit.fallback ?? ''}
                disabled={outfit.id === draft.defaultOutfitId}
                onChange={(e) => setOutfit(index, { fallback: e.target.value || undefined })}
              >
                <option value="">{t('editor.room.itsOwn')}</option>
                {draft.outfits
                  .filter((other) => other.id !== outfit.id && other.fallback !== outfit.id)
                  .map((other) => (
                    <option key={other.id} value={other.id}>
                      {t('editor.sprites.sameAs', { name: other.name, id: other.id })}
                    </option>
                  ))}
              </select>
              {outfit.fallback && (
                <span className="hint">
                  {t('editor.sprites.fallbackHint', { kept: Object.keys(outfit.sprites).length > 0, count: Object.keys(outfit.sprites).length })}
                </span>
              )}
            </label>
            {!outfit.fallback && (
            <>
            <div className="outfit-actions">
              {!plain && EXPRESSIONS.some((face) => !(face in outfit.sprites)) && (
                <Button
                  disabled={!ready || batch !== null}
                  title={t('editor.sprites.generateMissingTitle')}
                  onClick={() => generateMissing(outfit.id)}
                >
                  {t('editor.sprites.generateMissing', { count: EXPRESSIONS.filter((face) => !(face in outfit.sprites)).length })}
                </Button>
              )}
              {!plain && EXPRESSIONS.some((face) => !(face in outfit.sprites)) && (
                <input
                  className="batch-seed"
                  inputMode="numeric"
                  aria-label={t('editor.sprites.batchSeed')}
                  title={t('editor.sprites.batchSeedTitle')}
                  value={batchSeeds[outfit.id] ?? ''}
                  placeholder={draft.imageSeed === undefined ? t('editor.sprites.seedRandom') : t('editor.sprites.seedIs', { seed: draft.imageSeed })}
                  disabled={batch !== null}
                  onChange={(e) => setBatchSeeds({ ...batchSeeds, [outfit.id]: e.target.value.replace(/\D/g, '').slice(0, 15) })}
                />
              )}
              <Button
                disabled={!ready}
                title={t('editor.sprites.drawSpriteTitle')}
                onClick={() => setDrawing({ outfitId: outfit.id, expression: EXPRESSIONS.find((face) => !(face in outfit.sprites)) ?? '' })}
              >
                {t('editor.player.generate')}
              </Button>
              <Button disabled={!ready} onClick={() => addSprite(index)}>
                {plain ? t('editor.player.addPicture') : t('editor.sprites.addAnother')}
              </Button>
              {Object.values(outfit.sprites).some((sprite) => uncut(sprite.image)) && (
                <Button
                  disabled={batch !== null}
                  title={t('editor.sprites.cutAllTitle')}
                  onClick={() => cutOutAll(outfit.id)}
                >
                  {t('editor.sprites.cutAllButton', { count: Object.values(outfit.sprites).filter((sprite) => uncut(sprite.image)).length })}
                </Button>
              )}
              <Button variant="quiet" className="outfit-remove" disabled={draft.outfits.length <= 1 || isStandardOutfit(outfit.id) || outfit.id === draft.defaultOutfitId} onClick={() => removeOutfit(index)}>
                {t('editor.sprites.removeOutfit')}
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
                        {t('editor.common.replace')}
                      </Button>
                      <Button disabled={!ready} title={t('editor.sprites.drawSpriteAgain')} onClick={() => setDrawing({ outfitId: outfit.id, expression: name })}>
                        {t('editor.common.generate')}
                      </Button>
                      {sprite.image.startsWith(assetPrefix) && sprite.image.toLowerCase().endsWith('.png') && (
                        <Button title={t('editor.sprites.cutOutTitle')} onClick={() => cutOut(index, name)}>
                          {t('editor.sprites.cutOut')}
                        </Button>
                      )}
                      <Button
                        onClick={() => {
                          const { [name]: _removed, ...rest } = outfit.sprites
                          setOutfit(index, { sprites: rest })
                        }}
                      >
                        {t('editor.common.remove')}
                      </Button>
                    </>
                  }
                >
                  <input
                    aria-label={t('editor.sprites.spriteName')}
                    defaultValue={name}
                    key={name}
                    disabled={isFace(name)}
                    onBlur={(e) => renameSprite(index, name, slugify(e.target.value) || name)}
                  />
                  <textarea
                    aria-label={t('editor.sprites.spriteDescription')}
                    rows={2}
                    value={sprite.description}
                    placeholder={t('editor.sprites.descriptionPlaceholder')}
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
                  {t('editor.sprites.removeOutfit')}
                </Button>
              </div>
            )}
          </div>
        ))}
        <div className="row checks">
          <Button onClick={addOutfit}>{t('editor.sprites.addOutfit')}</Button>
          {!plain && !draft.outfits.some((outfit) => outfit.id === 'bathrobe') && eventOutfits.some((one) => one.id === 'bathrobe') && (
            <Button title={eventOutfits.find((one) => one.id === 'bathrobe')?.worn.join(', ')} onClick={addBathrobe}>
              {t('editor.sprites.addBathrobe')}
            </Button>
          )}
        </div>
      </Group>

      <Group
        title={t('editor.sprites.nsfw')}
        hint={t('editor.sprites.nsfwHint')}
      >
        <div className="outfit-actions">
          {NSFW_POSES.some((pose) => !poseOf(pose.id)?.image) && (
            <Button
              variant="primary"
              disabled={!ready || batch !== null}
              title={t('editor.sprites.generatePosesTitle')}
              onClick={() => generateMissingPoses()}
            >
              {t('editor.sprites.generatePoses', { count: NSFW_POSES.filter((pose) => !poseOf(pose.id)?.image).length })}
            </Button>
          )}
          <Button disabled={!ready} title={t('editor.sprites.drawPoseTitle')} onClick={() => setPosing(NSFW_POSES.find((pose) => !poseOf(pose.id)?.image)?.id ?? NSFW_POSES[0].id)}>
            {t('editor.player.generate')}
          </Button>
          <Button disabled={!ready} onClick={addPose}>
            {t('editor.sprites.addAnother')}
          </Button>
          {unclipped.length > 0 && (
            <Button disabled={!ready || batch !== null} title={t('editor.sprites.clipsTitle')} onClick={generateMissingClips}>
              {t('editor.sprites.clips', { count: unclipped.length })}
            </Button>
          )}
        </div>
        <BatchProgress batch={batch} at={NSFW_BATCH} onStop={stop} />
        <BatchProgress batch={batch} at={CLIPS_BATCH} onStop={stop} />

        <SlotGrid wide>
          {poses.map(poseSlot)}
        </SlotGrid>
      </Group>

      {/* The same poses drawn pregnant: shown in their place once a pregnancy shows. Only a love interest can be. */}
      {!plain && (
        <Group
          title={t('editor.sprites.nsfwPregnant')}
          hint={t('editor.sprites.nsfwPregnantHint')}
        >
          <div className="outfit-actions">
            {NSFW_PREGNANT_POSES.some((pose) => !poseOf(pose.id)?.image) && (
              <Button
                variant="primary"
                disabled={!ready || batch !== null}
                title={t('editor.sprites.generatePregnantTitle')}
                onClick={() => generateMissingPoses(NSFW_PREGNANT_POSES, NSFW_PREGNANT_BATCH)}
              >
                {t('editor.sprites.generatePoses', { count: NSFW_PREGNANT_POSES.filter((pose) => !poseOf(pose.id)?.image).length })}
              </Button>
            )}
          </div>
          <BatchProgress batch={batch} at={NSFW_PREGNANT_BATCH} onStop={stop} />
          <SlotGrid wide>{pregnantPoses.map(poseSlot)}</SlotGrid>
        </Group>
      )}

      {!plain && (
        <Group title={t('editor.sprites.walking')} hint={t('editor.sprites.walkingHint')}>
          {walking && <ArtTool target={{ kind: 'walk', who: draft, onUse: (walkSprite) => set({ walkSprite }) }} onClose={() => setWalking(false)} />}
          {walkViewing && draft.walkSprite && <Lightbox image={draft.walkSprite} name={t('editor.sprites.walking')} onClose={() => setWalkViewing(false)} />}
          <SlotGrid>
            {draft.walkSprite ? (
              <PictureSlot
                image={draft.walkSprite}
                name={t('editor.sprites.walking')}
                onView={() => setWalkViewing(true)}
                actions={
                  <>
                    <Button disabled={!isSafeId(draft.id)} onClick={() => setWalking(true)}>
                      {t('editor.common.generate')}
                    </Button>
                    <Button disabled={!isSafeId(draft.id)} onClick={async () => {
                      const picked = await window.api.editor.importAsset({ loveInterestId: draft.id, kind: 'image' })
                      if (picked) set({ walkSprite: picked })
                    }}>
                      {t('editor.common.replace')}
                    </Button>
                    <Button onClick={() => set({ walkSprite: undefined })}>{t('editor.common.remove')}</Button>
                  </>
                }
              />
            ) : (
              <EmptySlot name={t('editor.sprites.walking')} disabled={!isSafeId(draft.id)} onAdd={async () => {
                const picked = await window.api.editor.importAsset({ loveInterestId: draft.id, kind: 'image' })
                if (picked) set({ walkSprite: picked })
              }} onGenerate={() => setWalking(true)} />
            )}
          </SlotGrid>
        </Group>
      )}
    </>
  )
}
