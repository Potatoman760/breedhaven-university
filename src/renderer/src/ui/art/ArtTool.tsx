import { Button } from '../Button'
import { useCallback, useEffect, useState } from 'react'
import {
  backgroundPrompt,
  framingFor,
  birthPrompt,
  walkPrompt,
  nsfwPrompt,
  sizeFor,
  spritePrompt,
  type ComfySettings,
  type GenerateArtResult,
  type WorkflowListResult
} from '../../../../shared/comfy'
import { isPregnantPose, EXPRESSIONS, type CustomExpression, type Location, type LoveInterest, type Npc } from '../../../../shared/model'
import { t, type MessageKey } from '../../../../shared/i18n'
import { errorMessage } from '../../errors'
import { Overlay } from '../Dialog'
import { Text } from '../editor/fields'
import { GenerateClip, type ClipTarget } from './ClipForm'
import { ComfySetup } from './ComfySetup'

/**
 * What the tool is being asked to draw, and what its host does with a picture that is
 * kept. The host decides the subject; the tool only draws it.
 */
export type ArtTarget =
  | {
      kind: 'sprite'
      who: Pick<LoveInterest | Npc, 'id' | 'name' | 'pronouns' | 'appearance' | 'outfits' | 'imageSeed'>
      /** The outfit and expression it is opened on. Both can be changed in the tool. */
      outfitId: string
      expression: string
      /** Faces added in the editor, offered beside the standard ones and drawn in their own words. */
      faces?: readonly CustomExpression[]
      onUse: (outfitId: string, expression: string, path: string) => void | Promise<void>
    }
  | {
      kind: 'background'
      location: Pick<Location, 'id' | 'name' | 'appearance' | 'indoors'>
      /** What the tool calls it in its heading, when the place has no name to put in the prompt. */
      title?: string
      /** Times of day a picture can be made for. */
      periods: { id: string; name: string }[]
      /** The view the tool is opened on, and the time of day. Left out, a name is typed and any time may be picked. */
      view?: string
      period?: string
      /** Called with the view's name, the picture, and the period id it was drawn for (empty for none in particular). */
      onUse: (view: string, path: string, period: string) => void | Promise<void>
    }
  | {
      kind: 'nsfw'
      who: Pick<LoveInterest | Npc, 'id' | 'name' | 'pronouns' | 'appearance' | 'outfits' | 'imageSeed'>
      /** The poses a picture can be made for: what each is called, and what it is drawn from. */
      poses: { id: string; name: string; draws: string }[]
      /** The pose it is opened on. It can be changed in the tool. */
      pose: string
      onUse: (poseId: string, path: string) => void | Promise<void>
    }
  | { kind: 'photo' }
  | {
      kind: 'birth'
      who: Pick<LoveInterest | Npc, 'id' | 'name' | 'pronouns' | 'appearance' | 'imageSeed'>
      onUse: (path: string) => void | Promise<void>
    }
  | {
      kind: 'walk'
      who: Pick<LoveInterest, 'id' | 'name' | 'pronouns' | 'appearance' | 'outfits' | 'defaultOutfitId' | 'imageSeed'>
      onUse: (path: string) => void | Promise<void>
    }
  | ClipTarget

/** Something drawn as a picture, which is everything but a clip. */
type PictureTarget = Exclude<ArtTarget, ClipTarget>

interface Props {
  target: ArtTarget
  onClose: () => void
}

const TABS = ['Generate', 'ComfyUI setup'] as const
type Tab = (typeof TABS)[number]
const TAB_LABELS: Record<Tab, MessageKey> = { Generate: 'comfy.art.tabGenerate', 'ComfyUI setup': 'comfy.art.tabSetup' }


/** One picture made while the tool was open, with what it was made for. */
interface Made {
  result: GenerateArtResult
  outfitId: string
  expression: string
  view: string
  /** The period id it was drawn for, for a background. */
  period: string
  /** What became of it, once it has been put to use. */
  used?: string
  /** Its background has been taken out. */
  cut?: boolean
}

/**
 * The art tool: draws a picture on the user's own ComfyUI from what the content says about
 * its subject. A dialog any editor screen can open for the thing it is editing; it runs
 * only when asked, and nothing in a scene calls it.
 */
export function ArtTool({ target, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('Generate')
  const [settings, setSettings] = useState<ComfySettings | null>(null)
  const [list, setList] = useState<WorkflowListResult | null>(null)
  const [status, setStatus] = useState('')

  const reload = useCallback(() => window.api.comfy.workflows().then(setList, (error) => setStatus(errorMessage(error))), [])
  useEffect(() => {
    window.api.comfy.getSettings().then(setSettings, (error) => setStatus(errorMessage(error)))
    reload()
  }, [reload])

  /** Saves the settings, then reads the folder again, since how a workflow reads may have changed. */
  const save = async (next: ComfySettings) => {
    try {
      setSettings(await window.api.comfy.saveSettings(next))
      setStatus('')
      await reload()
    } catch (error) {
      setStatus(errorMessage(error))
    }
  }

  const subject =
    target.kind === 'video'
      ? `${target.who.name}, ${target.pose.name}`
      : target.kind === 'sprite' || target.kind === 'nsfw' || target.kind === 'birth' || target.kind === 'walk'
        ? target.who.name
        : target.kind === 'background'
          ? (target.title ?? target.location.name)
          : ''
  return (
    <Overlay onClose={onClose}>
      <div className="dialog art-tool">
        <div className="dialog-head">
          <h1>
            {t(subject ? 'comfy.art.titleOf' : 'comfy.art.title', { kind: target.kind, subject })}
          </h1>
          <div className="tabs" role="tablist">
            {TABS.map((name) => (
              <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? 'tab selected' : 'tab'} onClick={() => setTab(name)}>
                {t(TAB_LABELS[name])}
              </button>
            ))}
          </div>
          <Button onClick={onClose}>
            {t('comfy.art.close')}
          </Button>
        </div>
        {status && <p className="notice">{status}</p>}
        {list && !list.ok && tab === 'Generate' && (
          <p className="notice">{list.message || t('comfy.art.noWorkflowRead')}</p>
        )}
        {!settings ? (
          <p className="hint">{t('comfy.art.loading')}</p>
        ) : tab !== 'Generate' ? (
          <ComfySetup settings={settings} list={list} onSave={save} />
        ) : target.kind === 'video' ? (
          <GenerateClip target={target} settings={settings} list={list} onSave={save} />
        ) : (
          <Generate target={target} settings={settings} list={list} />
        )}
      </div>
    </Overlay>
  )
}

interface GenerateProps {
  target: PictureTarget
  settings: ComfySettings
  list: WorkflowListResult | null
}

function Generate({ target, settings, list }: GenerateProps) {
  const { kind } = target
  const [outfitId, setOutfitId] = useState(target.kind === 'sprite' ? target.outfitId : '')
  // For a sprite, the face; for an NSFW picture, the pose.
  const [expression, setExpression] = useState(target.kind === 'sprite' ? target.expression : target.kind === 'nsfw' ? target.pose : '')
  const [view, setView] = useState(target.kind === 'background' ? (target.view ?? '') : '')
  const [period, setPeriod] = useState(target.kind === 'background' ? (target.period ?? '') : '')
  const [subject, setSubject] = useState('')
  const [positive, setPositive] = useState('')
  const [negative, setNegative] = useState('')
  const [workflow, setWorkflow] = useState('')
  const [size, setSize] = useState(sizeFor(settings, kind))
  // Her preferred seed, when she has one, so that a new picture matches the ones she has.
  const [seed, setSeed] = useState((target.kind === 'sprite' || target.kind === 'nsfw' || target.kind === 'birth' || target.kind === 'walk') && target.who.imageSeed !== undefined ? String(target.who.imageSeed) : '')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [made, setMade] = useState<Made[]>([])
  // Cutting out leaves the gaps the art closes around.
  const [edgesOnly, setEdgesOnly] = useState(false)
  // The picture opened to be looked at whole, while one is.
  const [viewing, setViewing] = useState<string | null>(null)

  // One that takes a first frame makes clips, and is not offered for a picture.
  const usable = (list?.workflows ?? []).filter((w) => w.bindings.positive !== null && w.bindings.firstFrame === null)
  const chosen = usable.find((w) => w.file === workflow) ?? usable.find((w) => w.file === settings.defaults[kind]) ?? usable[0]

  /** The prompt as the content would have it, for what is picked. */
  const written = (): string => {
    const framing = framingFor(settings, kind)
    if (target.kind === 'sprite') return spritePrompt(target.who, outfitId, expression, framing, target.faces?.find((face) => face.id === expression)?.draws)
    if (target.kind === 'background') return backgroundPrompt(target.location, view, period, framing)
    // A pose drawn pregnant is the same pose, with her pregnant nude in place of her nude.
    if (target.kind === 'birth') return birthPrompt(target.who, framing)
    if (target.kind === 'walk') return walkPrompt(target.who, framing)
    if (target.kind === 'nsfw') return nsfwPrompt(target.who, target.poses.find((pose) => pose.id === expression)?.draws ?? '', framing, isPregnantPose(expression))
    return [subject.trim(), framing].filter(Boolean).join('\n\n')
  }
  // The prompt follows the choices until it is edited by hand; "Rewrite" puts it back.
  const [edited, setEdited] = useState(false)
  useEffect(() => {
    if (!edited) setPositive(written())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outfitId, expression, view, period, subject, edited, settings])

  async function generate() {
    setBusy(true)
    setNotice('')
    const subjectId = target.kind === 'sprite' || target.kind === 'nsfw' || target.kind === 'birth' || target.kind === 'walk' ? target.who.id : target.kind === 'background' ? target.location.id : ''
    const name = kind === 'birth' ? 'birth' : kind === 'walk' ? 'walk' : kind === 'nsfw' ? `nsfw-${expression}` : kind === 'sprite' ? `${outfitId}-${expression || 'neutral'}` : kind === 'background' ? [view, period].filter(Boolean).join('-') || 'view' : subject.slice(0, 40) || 'photo'
    try {
      const result = await window.api.comfy.generate({
        kind,
        subjectId,
        name,
        workflow: chosen?.file ?? '',
        positive,
        negative,
        width: size.width,
        height: size.height,
        seed: seed.trim() === '' ? undefined : Math.max(0, Math.floor(Number(seed)) || 0)
      })
      if (!result.ok) setNotice(result.message)
      else {
        setMade((before) => [{ result, outfitId, expression: expression.trim() || 'neutral', view: view || t('comfy.art.newView'), period }, ...before])
        if (result.skipped.length > 0) setNotice(t('comfy.art.skipped', { workflow: String(chosen?.name), slots: result.skipped.join(', ') }))
      }
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  /** Hands a picture to whoever opened the tool, to do with as that screen does. */
  async function use(m: Made) {
    if (!m.result.path) return
    try {
      if (target.kind === 'sprite') await target.onUse(m.outfitId, m.expression, m.result.path)
      else if (target.kind === 'background') await target.onUse(m.view, m.result.path, m.period)
      else if (target.kind === 'nsfw') await target.onUse(m.expression, m.result.path)
      else if (target.kind === 'birth' || target.kind === 'walk') await target.onUse(m.result.path)
      const used =
        target.kind === 'sprite'
          ? t('comfy.art.usedSprite', { expression: m.expression })
          : target.kind === 'nsfw'
            ? t('comfy.art.usedPose', { pose: m.expression })
            : t('comfy.art.used')
      setMade((before) => before.map((one) => (one.result.path === m.result.path ? { ...one, used } : one)))
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  /**
   * Takes the flat background out from behind a picture. The cut-out replaces it, so one
   * already put to use is handed over again under its new name.
   */
  async function cutout(m: Made) {
    if (!m.result.path) return
    setBusy(true)
    setNotice('')
    try {
      const cut = await window.api.comfy.cutout({ path: m.result.path, mode: edgesOnly ? 'edge' : 'gaps' })
      if (!cut.ok || !cut.path) return setNotice(cut.colour ? t('comfy.art.cutFailedColour', { message: cut.message, colour: cut.colour }) : cut.message)
      const next: Made = { ...m, result: { ...m.result, path: cut.path }, cut: true }
      setMade((before) => before.map((one) => (one.result.path === m.result.path ? next : one)))
      setNotice(cut.message)
      if (m.used) await use(next)
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="studio-main">
      <div className="studio-form editor-body">
        {target.kind === 'sprite' && (
          <div className="row">
            <label>
              {t('comfy.art.outfit')}
              <select value={outfitId} onChange={(e) => (setOutfitId(e.target.value), setEdited(false))}>
                {target.who.outfits.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('comfy.art.expression')}
              <input list="art-expressions" value={expression} placeholder="neutral" onChange={(e) => (setExpression(e.target.value), setEdited(false))} />
              <datalist id="art-expressions">
                {[...EXPRESSIONS, ...(target.kind === 'sprite' ? (target.faces ?? []).map((face) => face.id) : [])].map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </label>
          </div>
        )}

        {target.kind === 'nsfw' && (
          <div className="row">
            <label>
              {t('comfy.art.pose')}
              <select value={expression} onChange={(e) => (setExpression(e.target.value), setEdited(false))}>
                {target.poses.map((pose) => (
                  <option key={pose.id} value={pose.id}>
                    {pose.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {target.kind === 'background' && (
          <div className="row">
            <label>
              {t('comfy.art.view')}
              <input value={view} placeholder={t('comfy.art.viewPlaceholder')} onChange={(e) => (setView(e.target.value), setEdited(false))} />
            </label>
            <label>
              {t('comfy.art.light')}
              <select value={period} onChange={(e) => (setPeriod(e.target.value), setEdited(false))}>
                <option value="">{t('comfy.art.anyLight')}</option>
                {target.periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {target.kind === 'photo' && <Text label={t('comfy.art.photoShows')} value={subject} onChange={(value) => (setSubject(value), setEdited(false))} />}

        <label>
          {t('comfy.art.prompt')}
          <textarea rows={9} value={positive} onChange={(e) => (setPositive(e.target.value), setEdited(true))} />
          <span className="hint">
            {t('comfy.art.writtenFrom', { kind: target.kind })}{' '}
            {chosen && settings.promptPrefixes[chosen.file]?.trim() && <>{t('comfy.art.prefixed', { prefix: settings.promptPrefixes[chosen.file], workflow: chosen.name })} </>}
            {edited && (
              <Button variant="quiet" onClick={() => setEdited(false)}>
                {t('comfy.art.rewrite')}
              </Button>
            )}
          </span>
        </label>
        <Text label={t('comfy.art.negative')} value={negative} onChange={setNegative} rows={2} hint={t('comfy.art.negativeHint')} />

        <div className="row">
          <label>
            {t('comfy.art.workflow')}
            <select value={chosen?.file ?? ''} onChange={(e) => setWorkflow(e.target.value)} disabled={usable.length === 0}>
              {usable.length === 0 && <option value="">{t('comfy.art.noneSetUp')}</option>}
              {usable.map((w) => (
                <option key={w.file} value={w.file}>
                  {w.name}
                  {w.file === settings.defaults[kind] ? t('comfy.art.defaultSuffix') : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="studio-narrow">
            {t('comfy.art.width')}
            <input type="number" min={64} max={8192} step={8} value={size.width} onChange={(e) => setSize({ ...size, width: Number(e.target.value) })} />
          </label>
          <label className="studio-narrow">
            {t('comfy.art.height')}
            <input type="number" min={64} max={8192} step={8} value={size.height} onChange={(e) => setSize({ ...size, height: Number(e.target.value) })} />
          </label>
          <label className="studio-narrow">
            {t('comfy.art.seed')}
            <input value={seed} placeholder={t('comfy.art.random')} inputMode="numeric" onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))} />
          </label>
        </div>

        <div className="editor-foot">
          <Button variant="primary" disabled={busy || !chosen || positive.trim() === ''} onClick={generate}>
            {busy ? t('comfy.art.working') : t('comfy.art.generate')}
          </Button>
          {busy && (
            <Button onClick={() => window.api.comfy.cancel()}>
              {t('comfy.art.cancel')}
            </Button>
          )}
          <div className="editor-status">{notice && <p className="notice">{notice}</p>}</div>
        </div>
      </div>

      {viewing && (
        <figure className="lightbox over" onClick={() => setViewing(null)}>
          <img src={`content://pack/${viewing}`} alt="" />
          <figcaption>
            <code>{viewing}</code> {t('comfy.art.clickToClose')}
          </figcaption>
        </figure>
      )}
      <div className="studio-results">
        {made.length === 0 && <p className="hint">{t('comfy.art.empty')}</p>}
        {made.map((m) => (
          <figure key={m.result.path} className={`studio-result of-${kind}`}>
            <a className="studio-thumb" href={`content://pack/${m.result.path}`} title={t('comfy.art.lookWhole')} onClick={(e) => (e.preventDefault(), setViewing(m.result.path))}>
              <img src={`content://pack/${m.result.path}`} alt="" />
            </a>
            <figcaption>
              <span className="hint">
                {t('comfy.art.madeWith', { workflow: m.result.workflow?.replace(/\.json$/i, '') ?? '', seed: m.result.seed ?? '' })}
              </span>
              <code>{m.result.path}</code>
              {kind !== 'background' && kind !== 'nsfw' && kind !== 'birth' && (
                <div className="row">
                  <Button
                    disabled={busy}
                    title={edgesOnly ? t('comfy.art.cutEdgesTitle') : t('comfy.art.cutGapsTitle')}
                    onClick={() => cutout(m)}
                  >
                    {m.cut ? t('comfy.art.cutAgain') : edgesOnly ? t('comfy.art.cutEdges') : t('comfy.art.cutGaps')}
                  </Button>
                  <label className="inline">
                    <input type="checkbox" checked={edgesOnly} onChange={(e) => setEdgesOnly(e.target.checked)} />
                    {t('comfy.art.edgesOnly')}
                  </label>
                </div>
              )}
              {m.used ? (
                <span className="chip">{m.used}</span>
              ) : (
                <div className="row">
                  {target.kind === 'sprite' && (
                    <Button variant="primary" onClick={() => use(m)}>
                      {t('comfy.art.useSprite', { expression: m.expression })}
                    </Button>
                  )}
                  {target.kind === 'nsfw' && (
                    <Button variant="primary" onClick={() => use(m)}>
                      {t('comfy.art.usePose', { pose: target.poses.find((pose) => pose.id === m.expression)?.name ?? m.expression })}
                    </Button>
                  )}
                  {target.kind === 'birth' && (
                    <Button variant="primary" onClick={() => use(m)}>
                      {t('comfy.art.useBirth')}
                    </Button>
                  )}
                  {target.kind === 'walk' && (
                    <Button variant="primary" onClick={() => use(m)}>
                      {t('comfy.art.useWalk')}
                    </Button>
                  )}
                  {target.kind === 'background' && (
                    <Button variant="primary" onClick={() => use(m)}>
                      {m.period ? t('comfy.art.useForPeriod', { period: target.periods.find((p) => p.id === m.period)?.name.toLowerCase() ?? m.period }) : t('comfy.art.useBackground')}
                    </Button>
                  )}
                  <Button variant="quiet" onClick={() => setSeed(String(m.result.seed ?? ''))}>
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
