import { useEffect, useState } from 'react'
import { MAX_CLIP_SECONDS, videoPromptFor, type ComfySettings, type GenerateArtResult, type GenerateVideoRequest, type WorkflowListResult } from '../../../../shared/comfy'
import type { LoveInterest, Npc } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { t } from '../../../../shared/i18n'
import { Button } from '../Button'

/**
 * A pose's clip, which the tool is opened to see to: of which pose, from which picture, the clip it has now, and what
 * its host does when one is made, uploaded or taken off. The clip is a layer over the picture, and nothing here changes the picture.
 */
export interface ClipTarget {
  kind: 'video'
  who: Pick<LoveInterest | Npc, 'id' | 'name'>
  /** The pose the clip is of; its picture, which a clip is made from as its first frame; and the clip it has, with whether that plays round and round. */
  pose: { id: string; name: string; image: string; clip?: string; loop: boolean; clipPrompt?: string }
  /** Puts a clip that was made on the pose, in place of any it has. `loop` says whether it was made to play round and round or once; left out, the pose keeps what it had. */
  onUse: (poseId: string, path: string, loop?: boolean) => void | Promise<void>
  /** Has the user pick a clip of their own for the pose, in place of any it has. */
  onUpload: () => Promise<void>
  onRemove: () => void
  onLoop: (loop: boolean) => void
  /** Keeps a prompt on the pose for its clips from now on, or with none, goes back to the settings' own. */
  onKeepPrompt: (prompt: string | undefined) => void
}

/** The workflows that make clips: those with somewhere to put a first frame. */
export const clipWorkflows = (list: WorkflowListResult | null) => (list?.workflows ?? []).filter((w) => w.bindings.firstFrame !== null && w.bindings.positive !== null)

/**
 * What a clip of a pose is made with: its picture as the first frame and, when the workflow can end on a frame and the
 * settings ask for it, the last, so that it loops. Anything not chosen is as the settings and the pose have it. Nothing
 * when no workflow makes clips. `loop` is left out when the workflow cannot be asked either way.
 */
export function clipRequest(
  settings: ComfySettings,
  list: WorkflowListResult | null,
  subjectId: string,
  pose: { id: string; image: string; clipPrompt?: string },
  choice: { workflow?: string; prompt?: string; seed?: number; seconds?: number } = {}
): { request: GenerateVideoRequest; loop?: boolean; workflow: string } | null {
  const usable = clipWorkflows(list)
  const chosen = usable.find((w) => w.file === choice.workflow) ?? usable.find((w) => w.file === settings.defaults.video) ?? usable[0]
  if (!chosen) return null
  const canEnd = chosen.bindings.lastFrame !== null
  const looping = settings.videoLastFrame && canEnd
  return {
    workflow: chosen.name,
    loop: canEnd ? looping : undefined,
    request: {
      subjectId,
      name: `nsfw-${pose.id}`,
      workflow: chosen.file,
      image: pose.image,
      prompt: choice.prompt ?? pose.clipPrompt ?? videoPromptFor(settings, pose.id),
      lastImage: looping ? pose.image : undefined,
      seed: choice.seed,
      seconds: chosen.bindings.length !== null ? (choice.seconds ?? settings.videoSeconds) : undefined
    }
  }
}

interface Props {
  target: ClipTarget
  settings: ComfySettings
  list: WorkflowListResult | null
  onSave: (settings: ComfySettings) => Promise<void>
}

/**
 * The art tool's page for a pose's clip. On one side a clip is made: the pose's picture sent to a video workflow as
 * its first frame, with the prompt kept for that pose, which says what moves and nothing of who she is, since the
 * picture already shows her. On the other is the clip the pose has, to play, replace with a file or take off, and
 * the ones made while the tool is open.
 */
export function GenerateClip({ target, settings, list, onSave }: Props) {
  const { pose } = target
  // Her own for the pose, when one was kept, or else the settings' for the sex-act.
  const own = pose.clipPrompt ?? videoPromptFor(settings, pose.id)
  const [prompt, setPrompt] = useState(own)
  // The prompt is the one kept for the pose until it is edited by hand; putting it back follows it again.
  const [edited, setEdited] = useState(false)
  useEffect(() => {
    if (!edited) setPrompt(own)
  }, [edited, own])
  const [workflow, setWorkflow] = useState('')
  const [seed, setSeed] = useState('')
  // How long the clip runs, as it is typed; kept in the settings once it is left.
  const [seconds, setSeconds] = useState(String(settings.videoSeconds))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  // The clips made while the tool is open, newest first, each with whether it was made to loop.
  const [made, setMade] = useState<(GenerateArtResult & { loop?: boolean })[]>([])

  // A workflow makes clips when it has somewhere to put a first frame.
  const usable = clipWorkflows(list)
  const chosen = usable.find((w) => w.file === workflow) ?? usable.find((w) => w.file === settings.defaults.video) ?? usable[0]
  const canEnd = chosen !== undefined && chosen.bindings.lastFrame !== null
  const canLast = chosen === undefined || chosen.bindings.length !== null
  /** The length typed, held to what a clip may be. */
  const lengthOf = (typed: string) => Math.min(MAX_CLIP_SECONDS, Math.max(1, Math.round(Number(typed)) || settings.videoSeconds))
  const commitSeconds = () => {
    const value = lengthOf(seconds)
    setSeconds(String(value))
    if (value !== settings.videoSeconds) void onSave({ ...settings, videoSeconds: value })
  }
  // A looping clip ends on the picture it started from, so that it goes round without a jump; one that does not is played once.
  const looping = settings.videoLastFrame && canEnd
  async function generate() {
    setBusy(true)
    setNotice('')
    try {
      const asked = clipRequest(settings, list, target.who.id, pose, {
        workflow: chosen?.file,
        prompt,
        seed: seed.trim() === '' ? undefined : Math.max(0, Math.floor(Number(seed)) || 0),
        seconds: lengthOf(seconds)
      })
      if (!asked) return
      const result = await window.api.comfy.generateVideo(asked.request)
      if (!result.ok) setNotice(result.message)
      else {
        // A workflow with no last frame cannot be asked either way, so a clip from it leaves the pose playing as it did.
        setMade((before) => [{ ...result, loop: asked.loop }, ...before])
        if (result.skipped.length > 0) setNotice(t('comfy.clip.skipped', { workflow: String(chosen?.name), slots: result.skipped.join(', ') }))
      }
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  /** Does something to the pose's clip through whoever opened the tool, and says so if it could not be done. */
  async function change(apply: () => void | Promise<void>) {
    setNotice('')
    try {
      await apply()
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  return (
    <section className="studio-main">
      <div className="studio-form editor-body">
        <label>
          {t('comfy.clip.firstFrame')}
          <img className="clip-frame" src={`content://pack/${pose.image}`} alt={pose.name} />
        </label>

        <label>
          {t('comfy.art.prompt')}
          <textarea rows={9} value={prompt} onChange={(e) => (setPrompt(e.target.value), setEdited(true))} />
          {edited ? (
            <span className="row">
              <Button size="small" title={t('comfy.clip.keepPromptTitle')} onClick={() => (target.onKeepPrompt(prompt), setEdited(false))}>
                {t('comfy.clip.keepPrompt')}
              </Button>
              <Button size="small" variant="quiet" onClick={() => setEdited(false)}>
                {t('comfy.clip.putBack')}
              </Button>
            </span>
          ) : (
            pose.clipPrompt !== undefined && (
              <span className="row">
                <Button size="small" variant="quiet" title={t('comfy.clip.usualPromptTitle')} onClick={() => target.onKeepPrompt(undefined)}>
                  {t('comfy.clip.usualPrompt')}
                </Button>
              </span>
            )
          )}
        </label>

        <label className="inline">
          <input type="checkbox" checked={looping} disabled={!canEnd} onChange={(e) => onSave({ ...settings, videoLastFrame: e.target.checked })} />
          {t('comfy.clip.looping')}
        </label>
        {chosen && !canEnd && <span className="hint">{t('comfy.clip.cannotLoop', { workflow: chosen.name })}</span>}

        <div className="row">
          <label>
            {t('comfy.art.workflow')}
            <select value={chosen?.file ?? ''} onChange={(e) => setWorkflow(e.target.value)} disabled={usable.length === 0}>
              {usable.length === 0 && <option value="">{t('comfy.art.noneSetUp')}</option>}
              {usable.map((w) => (
                <option key={w.file} value={w.file}>
                  {w.name}
                  {w.file === settings.defaults.video ? t('comfy.art.defaultSuffix') : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="studio-narrow">
            {t('comfy.clip.length')}
            <input
              type="number"
              min={1}
              max={MAX_CLIP_SECONDS}
              value={seconds}
              disabled={!canLast}
              title={canLast ? undefined : t('comfy.clip.ownLength', { workflow: String(chosen?.name) })}
              onChange={(e) => setSeconds(e.target.value)}
              onBlur={commitSeconds}
            />
          </label>
          <label className="studio-narrow">
            {t('comfy.art.seed')}
            <input value={seed} placeholder={t('comfy.art.random')} inputMode="numeric" onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))} />
          </label>
        </div>
        {list?.ok && usable.length === 0 && (
          <p className="notice">{t('comfy.workflows.noVideo')}</p>
        )}

        <div className="editor-foot">
          <Button variant="primary" disabled={busy || !chosen || prompt.trim() === ''} onClick={generate}>
            {busy ? t('comfy.art.working') : t('comfy.art.generate')}
          </Button>
          {busy && <Button onClick={() => window.api.comfy.cancel()}>{t('comfy.art.cancel')}</Button>}
          <div className="editor-status">{notice && <p className="notice">{notice}</p>}</div>
        </div>
      </div>

      <div className="studio-results">
        <h2>{t('comfy.clip.current')}</h2>
        {pose.clip ? (
          <figure className="studio-result of-video">
            {/* Keyed by its file, so that a clip put in its place is the one played. */}
            <video key={pose.clip} src={`content://pack/${pose.clip}`} controls loop muted autoPlay />
            <figcaption>
              <code>{pose.clip}</code>
              <label className="inline">
                <input type="checkbox" checked={!pose.loop} onChange={(e) => target.onLoop(!e.target.checked)} />
                {t('comfy.clip.playOnce')}
              </label>
              <div className="row">
                <Button onClick={() => change(target.onUpload)}>{t('comfy.clip.replaceFile')}</Button>
                <Button onClick={target.onRemove}>{t('comfy.clip.remove')}</Button>
              </div>
              <span className="hint">{t('comfy.clip.pictureStays')}</span>
            </figcaption>
          </figure>
        ) : (
          <>
            <p className="hint">{t('comfy.clip.none')}</p>
            <div className="row">
              <Button onClick={() => change(target.onUpload)}>{t('comfy.clip.upload')}</Button>
            </div>
          </>
        )}

        <h2>{t('comfy.clip.generated')}</h2>
        {made.length === 0 && <p className="hint">{t('comfy.clip.empty')}</p>}
        {made.map((m) => (
          <figure key={m.path} className="studio-result of-video">
            <video src={`content://pack/${m.path}`} controls loop={m.loop !== false} muted />
            <figcaption>
              <span className="hint">
                {t('comfy.art.madeWith', { workflow: m.workflow?.replace(/\.json$/i, '') ?? '', seed: m.seed ?? '' })}
                {m.loop !== undefined && (m.loop ? t('comfy.clip.loopsSuffix') : t('comfy.clip.onceSuffix'))}
              </span>
              <code>{m.path}</code>
              {m.path === pose.clip ? (
                <span className="chip">{t('comfy.clip.isCurrent')}</span>
              ) : (
                <div className="row">
                  <Button variant="primary" onClick={() => change(() => (m.path ? target.onUse(pose.id, m.path, m.loop) : undefined))}>
                    {pose.clip ? t('comfy.clip.replaceWith') : t('comfy.clip.use', { pose: pose.name })}
                  </Button>
                  <Button variant="quiet" onClick={() => setSeed(String(m.seed ?? ''))}>
                    {t('comfy.art.reuseSeed')}
                  </Button>
                </div>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
