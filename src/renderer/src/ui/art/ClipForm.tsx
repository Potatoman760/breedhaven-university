import { useEffect, useState } from 'react'
import { MAX_CLIP_SECONDS, videoPromptFor, type ComfySettings, type GenerateArtResult, type WorkflowListResult } from '../../../../shared/comfy'
import type { LoveInterest, Npc } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { Button } from '../Button'

/**
 * A pose's clip, which the tool is opened to see to: of which pose, from which picture, the clip it has now, and what
 * its host does when one is made, uploaded or taken off. The clip is a layer over the picture, and nothing here changes the picture.
 */
export interface ClipTarget {
  kind: 'video'
  who: Pick<LoveInterest | Npc, 'id' | 'name'>
  /** The pose the clip is of; its picture, which a clip is made from as its first frame; and the clip it has, with whether that plays round and round. */
  pose: { id: string; name: string; image: string; clip?: string; loop: boolean }
  /** Puts a clip that was made on the pose, in place of any it has. `loop` says whether it was made to play round and round or once; left out, the pose keeps what it had. */
  onUse: (poseId: string, path: string, loop?: boolean) => void | Promise<void>
  /** Has the user pick a clip of their own for the pose, in place of any it has. */
  onUpload: () => Promise<void>
  onRemove: () => void
  onLoop: (loop: boolean) => void
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
  const [prompt, setPrompt] = useState(videoPromptFor(settings, pose.id))
  // The prompt is the one kept for the pose until it is edited by hand; putting it back follows the settings again.
  const [edited, setEdited] = useState(false)
  useEffect(() => {
    if (!edited) setPrompt(videoPromptFor(settings, pose.id))
  }, [edited, settings, pose.id])
  const [workflow, setWorkflow] = useState('')
  const [seed, setSeed] = useState('')
  // How long the clip runs, as it is typed; kept in the settings once it is left.
  const [seconds, setSeconds] = useState(String(settings.videoSeconds))
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  // The clips made while the tool is open, newest first, each with whether it was made to loop.
  const [made, setMade] = useState<(GenerateArtResult & { loop?: boolean })[]>([])

  // A workflow makes clips when it has somewhere to put a first frame.
  const usable = (list?.workflows ?? []).filter((w) => w.bindings.firstFrame !== null && w.bindings.positive !== null)
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
      const result = await window.api.comfy.generateVideo({
        subjectId: target.who.id,
        name: `nsfw-${pose.id}`,
        workflow: chosen?.file ?? '',
        image: pose.image,
        prompt,
        lastImage: looping ? pose.image : undefined,
        seed: seed.trim() === '' ? undefined : Math.max(0, Math.floor(Number(seed)) || 0),
        seconds: canLast ? lengthOf(seconds) : undefined
      })
      if (!result.ok) setNotice(result.message)
      else {
        // A workflow with no last frame cannot be asked either way, so a clip from it leaves the pose playing as it did.
        setMade((before) => [{ ...result, loop: canEnd ? looping : undefined }, ...before])
        if (result.skipped.length > 0) setNotice(`Made, but "${chosen?.name}" had nowhere to put: ${result.skipped.join(', ')}.`)
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
          First frame
          <img className="clip-frame" src={`content://pack/${pose.image}`} alt={pose.name} />
        </label>

        <label>
          Prompt
          <textarea rows={9} value={prompt} onChange={(e) => (setPrompt(e.target.value), setEdited(true))} />
          {edited && (
            <span className="hint">
              <Button variant="quiet" onClick={() => setEdited(false)}>
                Put back the sex-act's own
              </Button>
            </span>
          )}
        </label>

        <label className="inline">
          <input type="checkbox" checked={looping} disabled={!canEnd} onChange={(e) => onSave({ ...settings, videoLastFrame: e.target.checked })} />
          Looping video
        </label>
        {chosen && !canEnd && <span className="hint">“{chosen.name}” has no last frame, so it cannot make a looping clip.</span>}

        <div className="row">
          <label>
            Workflow
            <select value={chosen?.file ?? ''} onChange={(e) => setWorkflow(e.target.value)} disabled={usable.length === 0}>
              {usable.length === 0 && <option value="">None set up</option>}
              {usable.map((w) => (
                <option key={w.file} value={w.file}>
                  {w.name}
                  {w.file === settings.defaults.video ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="studio-narrow">
            Length (s)
            <input
              type="number"
              min={1}
              max={MAX_CLIP_SECONDS}
              value={seconds}
              disabled={!canLast}
              title={canLast ? undefined : `“${chosen?.name}” sets its own length.`}
              onChange={(e) => setSeconds(e.target.value)}
              onBlur={commitSeconds}
            />
          </label>
          <label className="studio-narrow">
            Seed
            <input value={seed} placeholder="Random" inputMode="numeric" onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))} />
          </label>
        </div>
        {list?.ok && usable.length === 0 && (
          <p className="notice">None of the game's workflows makes a clip: none has somewhere to put a first frame.</p>
        )}

        <div className="editor-foot">
          <Button variant="primary" disabled={busy || !chosen || prompt.trim() === ''} onClick={generate}>
            {busy ? 'Working...' : 'Generate'}
          </Button>
          {busy && <Button onClick={() => window.api.comfy.cancel()}>Cancel</Button>}
          <div className="editor-status">{notice && <p className="notice">{notice}</p>}</div>
        </div>
      </div>

      <div className="studio-results">
        <h2>The sex-act's clip</h2>
        {pose.clip ? (
          <figure className="studio-result of-video">
            {/* Keyed by its file, so that a clip put in its place is the one played. */}
            <video key={pose.clip} src={`content://pack/${pose.clip}`} controls loop muted autoPlay />
            <figcaption>
              <code>{pose.clip}</code>
              <label className="inline">
                <input type="checkbox" checked={!pose.loop} onChange={(e) => target.onLoop(!e.target.checked)} />
                Play once
              </label>
              <div className="row">
                <Button onClick={() => change(target.onUpload)}>Replace with a file</Button>
                <Button onClick={target.onRemove}>Remove the clip</Button>
              </div>
              <span className="hint">The picture stays as it is. Save the character to keep any change.</span>
            </figcaption>
          </figure>
        ) : (
          <>
            <p className="hint">None yet. Generate one from the picture, or upload a clip of your own.</p>
            <div className="row">
              <Button onClick={() => change(target.onUpload)}>Upload a clip</Button>
            </div>
          </>
        )}

        <h2>Generated</h2>
        {made.length === 0 && <p className="hint">Clips you generate appear here, saved in your add-on folder. Nothing is kept on the character until you choose it.</p>}
        {made.map((m) => (
          <figure key={m.path} className="studio-result of-video">
            <video src={`content://pack/${m.path}`} controls loop={m.loop !== false} muted />
            <figcaption>
              <span className="hint">
                {m.workflow?.replace(/\.json$/i, '')} · seed {m.seed}
                {m.loop !== undefined && (m.loop ? ' · looping' : ' · plays once')}
              </span>
              <code>{m.path}</code>
              {m.path === pose.clip ? (
                <span className="chip">This is the sex-act's clip. Save the character to keep it.</span>
              ) : (
                <div className="row">
                  <Button variant="primary" onClick={() => change(() => (m.path ? target.onUse(pose.id, m.path, m.loop) : undefined))}>
                    {pose.clip ? 'Replace the clip with this' : `Use as the “${pose.name}” clip`}
                  </Button>
                  <Button variant="quiet" onClick={() => setSeed(String(m.seed ?? ''))}>
                    Reuse seed
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
