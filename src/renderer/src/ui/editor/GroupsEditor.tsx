import { useEffect, useRef, useState, type ReactNode } from 'react'
import { framingFor, groupNsfwPrompt, sizeFor } from '../../../../shared/comfy'
import { isSafeId, slugify, type EditorInfo, type EditorResult } from '../../../../shared/editor'
import { GROUP_SIZE, SKIN_TONES, groupFiles, posesOf, type Animation, type ContentPack, type Group as GroupData, type SkinTone } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { ArtTool } from '../art/ArtTool'
import { BatchProgress, useBatch, type BatchOutcome } from '../art/batch'
import { clipRequest } from '../art/ClipForm'
import { Button } from '../Button'
import { useConfirm } from '../Confirm'
import { VideoIcon } from '../icons'
import { Lightbox } from '../Lightbox'
import { EditorFoot, Group, Text } from './fields'
import { EmptySlot, PictureSlot, SlotGrid } from './slots'
import { t } from '../../../../shared/i18n'

interface Props {
  content: ContentPack
  /** Called whenever a change has been written and the game's content reloaded. */
  onContent: (content: ContentPack) => void
  /** The switch between the sides of the editor, given a check to make before leaving this one. */
  switcher: (mayLeave: () => boolean) => ReactNode
}

const blank = (): GroupData => ({ id: '', name: '', memberIds: ['', ''], animations: [], tonedAnimations: {} })
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
// The runs that draw the group's missing sex-acts, and make their missing clips.
const POSES_BATCH = '(group-poses)'
const CLIPS_BATCH = '(group-clips)'

/**
 * Groups: two or three love interests together, and a picture, and a clip, of each sex-act with all of them in it. In a
 * scene of exactly them, a sex-act is shown from the group where it has one, in place of the one woman's.
 */
export function GroupsEditor({ content, onContent, switcher }: Props) {
  const first = content.groups[0]
  const [original, setOriginal] = useState<GroupData | null>(first ?? null)
  const [draft, setDraft] = useState<GroupData>(first ?? blank())
  const [issues, setIssues] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<EditorInfo | null>(null)
  const [posing, setPosing] = useState<string | null>(null)
  const [clipping, setClipping] = useState<string | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  // Which tone's sex-acts are shown: those drawn with a man of that skin. Light ones are the group's own `animations`.
  const [tone, setTone] = useState<SkinTone>('light')
  const { batch, run, stop } = useBatch()
  const { ask, dialog } = useConfirm()
  useEffect(() => {
    window.api.editor.info().then(setInfo, () => undefined)
  }, [])

  // The draft as it is now, for runs that put a picture on it as each arrives, and whose group it is.
  const latest = useRef(draft)
  latest.current = draft
  const owner = (id: string) => (latest.current.id === id ? undefined : ({ ok: false, message: t('editor.sprites.anotherOpened'), fatal: true } as BatchOutcome))

  const isNew = original === null
  const files = groupFiles(draft.id)
  const ready = isSafeId(draft.id)
  const members = draft.memberIds.filter((id) => id !== '')
  const women = members.flatMap((id) => content.loveInterests.find((li) => li.id === id) ?? [])
  const lead = women[0]
  const dirty = !same(draft, original ?? blank())
  const mayLeave = () => !dirty || window.confirm(t('editor.common.discard'))
  const slots = posesOf(content.looks).poses
  // A group's picture of an act is asked for in the act's group wording, all of them in it; one with none, in its own.
  const drawsOf = (slot: (typeof slots)[number]) => slot.groupDraws?.trim() || slot.draws
  const manIn = (id: string) => slots.find((slot) => slot.id === id)?.manShown !== false
  /** The group's sex-acts of a tone. */
  const posesIn = (group: Pick<GroupData, 'animations' | 'tonedAnimations'>, of: SkinTone = tone): Animation[] =>
    of === 'light' ? group.animations : (group.tonedAnimations[of] ?? [])
  /** The group with these as its sex-acts of a tone. */
  const withPoses = (group: GroupData, list: Animation[], of: SkinTone = tone): GroupData =>
    of === 'light' ? { ...group, animations: list } : { ...group, tonedAnimations: { ...group.tonedAnimations, [of]: list } }
  const poseOf = (id: string) => posesIn(draft).find((a) => a.id === id)
  const removable = !isNew && info?.groups[draft.id] !== 'base'
  const canSave = ready && draft.name.trim() !== '' && members.length >= GROUP_SIZE.least && new Set(members).size === members.length

  const set = (patch: Partial<GroupData>) => {
    setIssues([])
    setDraft((current) => ({ ...current, ...patch }))
  }
  /** Changes a sex-act, making its entry if the group has none for it yet. Onto the draft as it is now. */
  function setPose(id: string, patch: Partial<Animation>, of: SkinTone = tone) {
    setDraft((current) => {
      const name = slots.find((slot) => slot.id === id)?.name ?? id
      const have = posesIn(current, of)
      return withPoses(current, have.some((a) => a.id === id) ? have.map((a) => (a.id === id ? { ...a, ...patch } : a)) : [...have, { id, name, description: '', loop: true, ...patch }], of)
    })
  }
  const setMember = (at: number, id: string) => set({ memberIds: Array.from({ length: Math.max(GROUP_SIZE.least, at + 1, draft.memberIds.length) }, (_, i) => (i === at ? id : (draft.memberIds[i] ?? ''))) })

  function open(next: GroupData | null) {
    if (!mayLeave()) return
    setOriginal(next)
    setDraft(next ?? blank())
    setIssues([])
    setStatus('')
  }

  async function apply(change: Promise<EditorResult>, done: string, showId: string) {
    setBusy(true)
    try {
      const result = await change
      setIssues(result.issues)
      if (result.issues.length > 0) return
      onContent(result.content)
      setInfo(result.info)
      const shown = result.content.groups.find((group) => group.id === showId) ?? result.content.groups[0] ?? null
      setOriginal(shown)
      setDraft(shown ?? blank())
      setStatus(done)
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function pick(kind: 'image' | 'video'): Promise<string | null> {
    setStatus('')
    try {
      return await window.api.editor.importAsset({ loveInterestId: files, kind })
    } catch (error) {
      setStatus(errorMessage(error))
      return null
    }
  }

  /** Draws every sex-act the group has no picture for, one after another, each put in its slot as it arrives. */
  async function generateMissing() {
    const id = latest.current.id
    // A run keeps to the tone it was started on, whatever is shown meanwhile.
    const of = tone
    const missing = slots.filter((slot) => !posesIn(latest.current, of).find((a) => a.id === slot.id)?.image)
    const settings = await window.api.comfy.getSettings()
    const size = sizeFor(settings, 'nsfw')
    const { failed } = await run(POSES_BATCH, t('editor.common.drawing'), missing, (slot) => slot.name, async (slot) => {
      const stopped = owner(id)
      if (stopped) return stopped
      const result = await window.api.comfy.generate({ kind: 'nsfw', subjectId: groupFiles(id), name: of === 'light' ? `nsfw-${slot.id}` : `nsfw-${of}-${slot.id}`, positive: groupNsfwPrompt(women, drawsOf(slot), framingFor(settings, 'nsfw'), manIn(slot.id), of), width: size.width, height: size.height, seed: lead?.imageSeed })
      if (!result.ok || !result.path) return { ok: false, message: result.message, fatal: true }
      if (latest.current.id === id) setPose(slot.id, { image: result.path }, of)
      return { ok: true }
    })
    if (failed.length > 0) setStatus(t('editor.common.stoppedAt', { name: failed[0] }))
  }

  // The sex-acts that have a picture and no clip yet.
  const unclipped = posesIn(draft).filter((pose) => pose.image !== undefined && pose.clip === undefined)

  async function generateMissingClips() {
    const id = latest.current.id
    const of = tone
    const missing = posesIn(latest.current, of).filter((pose) => pose.image !== undefined && pose.clip === undefined)
    const [settings, list] = await Promise.all([window.api.comfy.getSettings(), window.api.comfy.workflows()])
    const { failed } = await run(CLIPS_BATCH, t('editor.sprites.animating'), missing, (pose) => pose.name, async (pose) => {
      const stopped = owner(id)
      if (stopped) return stopped
      const asked = clipRequest(settings, list, groupFiles(id), { id: pose.id, image: pose.image!, clipPrompt: pose.clipPrompt }, {}, true)
      if (!asked) return { ok: false, message: t('editor.sprites.noClipWorkflow'), fatal: true }
      const result = await window.api.comfy.generateVideo(asked.request)
      if (!result.ok || !result.path) return { ok: false, message: result.message, fatal: true }
      if (latest.current.id === id) setPose(pose.id, asked.loop === undefined ? { clip: result.path } : { clip: result.path, loop: asked.loop }, of)
      return { ok: true }
    })
    if (failed.length > 0) setStatus(t('editor.common.stoppedAt', { name: failed[0] }))
  }

  const nameOf = (group: GroupData) => group.name || group.memberIds.map((id) => content.loveInterests.find((li) => li.id === id)?.name.split(' ')[0] ?? id).join(' & ')
  const withPictures = slots.filter((slot) => poseOf(slot.id)?.image)
  const clip = clipping ? poseOf(clipping) : undefined

  return (
    <main className="editor">
      {switcher(mayLeave)}
      {dialog}
      {posing && (
        <ArtTool
          target={{
            kind: 'nsfw',
            who: { id: files, name: nameOf(draft), pronouns: 'she/her', appearance: '', outfits: [], imageSeed: lead?.imageSeed },
            poses: slots.map((slot) => ({ id: slot.id, name: slot.name, draws: drawsOf(slot) })),
            pose: posing,
            prompt: (draws, framing, poseId) => groupNsfwPrompt(women, draws, framing, manIn(poseId), tone),
            onUse: (poseId, image) => setPose(poseId, { image })
          }}
          onClose={() => setPosing(null)}
        />
      )}
      {clipping && clip?.image && (
        <ArtTool
          target={{
            kind: 'video',
            group: true,
            who: { id: files, name: nameOf(draft) },
            pose: { id: clipping, name: clip.name, image: clip.image, clip: clip.clip, loop: clip.loop, clipPrompt: clip.clipPrompt },
            onUse: (poseId, path, loop) => setPose(poseId, loop === undefined ? { clip: path } : { clip: path, loop }),
            onUpload: async () => {
              const picked = await pick('video')
              if (picked) setPose(clipping, { clip: picked })
            },
            onRemove: () => setPose(clipping, { clip: undefined }),
            onLoop: (loop) => setPose(clipping, { loop }),
            onKeepPrompt: (clipPrompt) => setPose(clipping, { clipPrompt })
          }}
          onClose={() => setClipping(null)}
        />
      )}
      {viewing && poseOf(viewing)?.image && (
        <Lightbox
          image={poseOf(viewing)!.image!}
          name={poseOf(viewing)!.name}
          onClose={() => setViewing(null)}
          position={t('editor.common.position', { at: withPictures.findIndex((slot) => slot.id === viewing) + 1, total: withPictures.length })}
          onStep={withPictures.length > 1 ? (by) => setViewing(withPictures[(withPictures.findIndex((slot) => slot.id === viewing) + by + withPictures.length) % withPictures.length].id) : undefined}
        />
      )}

      <aside className="editor-list">
        <div className="editor-people">
          <Button variant="primary" onClick={() => open(null)}>
            {t('editor.groups.new')}
          </Button>
          {content.groups.map((group) => (
            <button key={group.id} className={!isNew && group.id === original?.id ? 'courier-person selected' : 'courier-person'} onClick={() => open(group)}>
              <span>
                <strong>{nameOf(group)}</strong>
                <span className="hint">{t('editor.groups.acts', { n: group.animations.filter((a) => a.image || a.clip).length })}</span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>{nameOf(draft) || t('editor.groups.new')}</h1>
            <span className="hint">{isNew ? t('editor.common.notSaved') : t('editor.groups.title')}</span>
          </div>
        </div>

        <div className="editor-body">
          <Group title={t('editor.groups.title')}>
            <div className="row">
              <Text label={t('editor.common.name')} value={draft.name} onChange={(name) => set(isNew ? { name, id: slugify(name) } : { name })} />
              <Text label={t('editor.common.id')} value={draft.id} disabled={!isNew} onChange={(id) => set({ id: slugify(id) })} hint={isNew ? t('editor.common.idFixed') : undefined} />
            </div>
            <div className="row">
              {Array.from({ length: GROUP_SIZE.most }, (_, at) => (
                <label key={at}>
                  {t('editor.groups.member', { n: at + 1 })}
                  <select value={draft.memberIds[at] ?? ''} onChange={(e) => setMember(at, e.target.value)}>
                    <option value="">{at < GROUP_SIZE.least ? t('editor.groups.choose') : t('editor.groups.none')}</option>
                    {content.loveInterests.map((li) => (
                      <option key={li.id} value={li.id} disabled={draft.memberIds.includes(li.id) && draft.memberIds[at] !== li.id}>
                        {li.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </Group>

          {/* The sex-acts are drawn once for each tone of the man in them, and shown as a character's are. */}
          <div className="tabs" role="tablist" aria-label={t('editor.sprites.manTone')}>
            {SKIN_TONES.map((one) => (
              <button key={one} type="button" role="tab" aria-selected={tone === one} className={tone === one ? 'tab selected' : 'tab'} title={t('editor.sprites.manToneTip')} onClick={() => setTone(one)}>
                {t(`editor.family.tone.${one}`)}
              </button>
            ))}
          </div>
          <Group title={t('editor.sprites.nsfw')}>
            <div className="outfit-actions">
              {slots.some((slot) => !poseOf(slot.id)?.image) && (
                <Button variant="primary" disabled={!ready || women.length < GROUP_SIZE.least || batch !== null} onClick={() => void generateMissing()}>
                  {t('editor.sprites.generatePoses', { count: slots.filter((slot) => !poseOf(slot.id)?.image).length })}
                </Button>
              )}
              {unclipped.length > 0 && (
                <Button disabled={!ready || batch !== null} title={t('editor.sprites.clipsTitle')} onClick={() => void generateMissingClips()}>
                  {t('editor.sprites.clips', { count: unclipped.length })}
                </Button>
              )}
            </div>
            <BatchProgress batch={batch} at={POSES_BATCH} onStop={stop} />
            <BatchProgress batch={batch} at={CLIPS_BATCH} onStop={stop} />
            <SlotGrid wide>
              {slots.map((slot) => {
                const pose = poseOf(slot.id)
                return pose?.image ? (
                  <PictureSlot
                    key={slot.id}
                    image={pose.image}
                    name={slot.name}
                    onView={() => setViewing(slot.id)}
                    badge={
                      pose.clip && (
                        <button type="button" className="sprite-badge" title={t('editor.sprites.clipBadge')} aria-label={t('editor.sprites.clipLabel', { name: slot.name })} onClick={() => setClipping(slot.id)}>
                          <VideoIcon size={18} />
                        </button>
                      )
                    }
                    actions={
                      <>
                        <Button disabled={!ready} onClick={async () => {
                          const picked = await pick('image')
                          if (picked) setPose(slot.id, { image: picked })
                        }}>
                          {t('editor.common.replace')}
                        </Button>
                        <Button disabled={!ready || women.length < GROUP_SIZE.least} onClick={() => setPosing(slot.id)}>
                          {t('editor.common.generate')}
                        </Button>
                        <Button disabled={!ready} title={t('editor.sprites.videoTitle')} onClick={() => setClipping(slot.id)}>
                          {t('editor.sprites.video')}
                        </Button>
                        <Button onClick={() => set(withPoses(draft, posesIn(draft).filter((a) => a.id !== slot.id)))}>{t('editor.common.remove')}</Button>
                      </>
                    }
                  />
                ) : (
                  <EmptySlot
                    key={slot.id}
                    name={slot.name}
                    disabled={!ready || women.length < GROUP_SIZE.least}
                    onAdd={async () => {
                      const picked = await pick('image')
                      if (picked) setPose(slot.id, { image: picked })
                    }}
                    onGenerate={() => setPosing(slot.id)}
                  />
                )
              })}
            </SlotGrid>
          </Group>
        </div>

        <EditorFoot
          issues={issues}
          status={status}
          busy={busy}
          dirty={dirty}
          canSave={canSave}
          onUndo={() => (setDraft(original ?? blank()), setIssues([]))}
          onSave={() => apply(window.api.editor.saveGroup({ ...draft, memberIds: members }), t('editor.common.saved'), draft.id)}
          remove={
            removable
              ? {
                  label: t('editor.common.delete'),
                  onClick: async () =>
                    (await ask({ title: t('editor.common.deleteNamed', { name: nameOf(draft) }), confirm: t('editor.common.delete'), grave: true })) &&
                    apply(window.api.editor.deleteGroup(draft.id), t('editor.common.deleted'), '')
                }
              : undefined
          }
        />
      </section>
    </main>
  )
}
