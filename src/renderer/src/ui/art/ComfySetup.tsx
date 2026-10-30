import { Button } from '../Button'
import { ComfyBundlePanel } from './ComfyBundlePanel'
import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '../../errors'
import {
  ART_KIND_LABELS,
  ART_KINDS,
  BINDING_SLOTS,
  COMFY_DEFAULT_BASE_URL,
  COMFY_MAX_TIMEOUT_SECONDS,
  COMFY_MAX_VIDEO_TIMEOUT_SECONDS,
  COMFY_MIN_TIMEOUT_SECONDS,
  DEFAULT_FRAMING,
  defaultsFor,
  framingFor,
  normaliseComfyUrl,
  sizeFor,
  SLOT_LABELS,
  videoPromptFor,
  WORKFLOW_KINDS,
  type ArtKind,
  type BindingSlot,
  type ComfySettings,
  type ComfyTestResult,
  type NodeField,
  type WorkflowKind,
  type WorkflowListResult,
  type WorkflowSummary
} from '../../../../shared/comfy'
import { NSFW_POSES } from '../../../../shared/model'
import { t } from '../../../../shared/i18n'

interface Props {
  settings: ComfySettings
  list: WorkflowListResult | null
  onSave: (settings: ComfySettings) => Promise<void>
  /**
   * Only what a player needs for the game to reach ComfyUI at all: the server, and the game's own workflows and
   * their models. What is drawn and how (the framing, the clips' prompts, each workflow's prefixes and bindings)
   * is the editor's, and is left out.
   */
  connectionOnly?: boolean
  /** Sex-acts added in the editor: each has a clip prompt of its own beside the standard ones'. */
  acts?: readonly { id: string; name: string }[]
}

const AUTO = '__auto__'
const NONE = '__none__'
const key = (at: NodeField) => `${at.node}\u0000${at.field}`
/** What a workflow can be the default for: clips when it takes a first frame, and each kind of picture when it does not. */
const kindsOf = (workflow: WorkflowSummary): readonly WorkflowKind[] => (workflow.bindings.firstFrame !== null ? ['video'] : ART_KINDS)

/**
 * Setting up ComfyUI. The workflows are the game's own, so there is none to choose: ComfyUI
 * has to be running and have what they call for, and each workflow has to have somewhere to
 * put a prompt. Each has its own answer here.
 */
export function ComfySetup({ settings, list, onSave, connectionOnly, acts = [] }: Props) {
  // Typed fields are held here and saved when left, so a half-typed address is not refused on every key.
  const [url, setUrl] = useState(settings.baseUrl)
  const [timeout, setTimeoutSeconds] = useState(String(settings.timeoutSeconds))
  const [videoTimeout, setVideoTimeout] = useState(String(settings.videoTimeoutSeconds))
  const [test, setTest] = useState<ComfyTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => setUrl(settings.baseUrl), [settings.baseUrl])

  const typed = normaliseComfyUrl(url)
  const workflows = list?.workflows ?? []
  const current = workflows.find((w) => w.file === selected) ?? workflows[0] ?? null
  const videoWorkflows = workflows.filter((w) => w.bindings.firstFrame !== null)
  const videoWorkflow = videoWorkflows.find((w) => w.file === defaultsFor(settings).video) ?? videoWorkflows[0]
  const patch = (change: Partial<ComfySettings>) => onSave({ ...settings, ...change })

  const commitUrl = () => {
    if (typed.url !== null && typed.url !== settings.baseUrl) patch({ baseUrl: typed.url })
  }
  const commitTimeout = () => {
    const seconds = Math.min(COMFY_MAX_TIMEOUT_SECONDS, Math.max(COMFY_MIN_TIMEOUT_SECONDS, Math.round(Number(timeout)) || settings.timeoutSeconds))
    setTimeoutSeconds(String(seconds))
    if (seconds !== settings.timeoutSeconds) patch({ timeoutSeconds: seconds })
  }
  const commitVideoTimeout = () => {
    const seconds = Math.min(COMFY_MAX_VIDEO_TIMEOUT_SECONDS, Math.max(COMFY_MIN_TIMEOUT_SECONDS, Math.round(Number(videoTimeout)) || settings.videoTimeoutSeconds))
    setVideoTimeout(String(seconds))
    if (seconds !== settings.videoTimeoutSeconds) patch({ videoTimeoutSeconds: seconds })
  }
  const runTest = async () => {
    setTesting(true)
    setTest(null)
    commitUrl()
    setTest(await window.api.comfy.test(url))
    setTesting(false)
  }
  const setKind = (kind: ArtKind, change: { framing?: string; width?: number; height?: number }) => {
    const size = { ...sizeFor(settings, kind), ...(change.width ? { width: change.width } : {}), ...(change.height ? { height: change.height } : {}) }
    patch({
      framing: change.framing === undefined ? settings.framing : { ...settings.framing, [kind]: change.framing },
      sizes: { ...settings.sizes, [kind]: size }
    })
  }

  return (
    <section className="studio-main">
      <div className="studio-form editor-body">
        <div className="editor-group">
          <h2>{t('comfy.setup.server')}</h2>
          <div className="row">
            <label>
              {t('comfy.setup.address')}
              <input
                value={url}
                placeholder={COMFY_DEFAULT_BASE_URL}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={commitUrl}
                onKeyDown={(e) => e.key === 'Enter' && commitUrl()}
              />
            </label>
            <Button disabled={testing} onClick={runTest}>
              {testing ? t('comfy.setup.testing') : t('comfy.setup.test')}
            </Button>
          </div>
          {typed.problem !== null && url.trim() !== '' && <p className="notice">{typed.problem}</p>}
          {test && <p className={test.ok ? 'hint' : 'notice'}>{test.ok ? t('comfy.setup.answered', { device: test.device ?? '' }) : test.message}</p>}

          {list && !list.ok && list.message && <p className="notice">{list.message}</p>}

          {/* Level at their boxes, however their labels wrap. */}
          <div className="row level-inputs">
            <label className="studio-narrow">
              {t('comfy.setup.timeout')}
              <input type="number" min={COMFY_MIN_TIMEOUT_SECONDS} max={COMFY_MAX_TIMEOUT_SECONDS} value={timeout} onChange={(e) => setTimeoutSeconds(e.target.value)} onBlur={commitTimeout} />
            </label>
            <label className="studio-narrow">
              {t('comfy.setup.videoTimeout')}
              <input type="number" min={COMFY_MIN_TIMEOUT_SECONDS} max={COMFY_MAX_VIDEO_TIMEOUT_SECONDS} value={videoTimeout} onChange={(e) => setVideoTimeout(e.target.value)} onBlur={commitVideoTimeout} />
            </label>
          </div>
          {/* The game has a clip workflow for each kind of graphics card: this computer's is the one clips are made with. */}
          {videoWorkflows.length > 1 && (
            <label>
              {t('comfy.setup.videoWorkflow')}
              <select value={videoWorkflow?.file ?? ''} onChange={(e) => patch({ videoWorkflow: e.target.value })}>
                {videoWorkflows.map((w) => (
                  <option key={w.file} value={w.file}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* In the game's own settings, only how big sprites and backgrounds are drawn: the rest of each kind is the editor's. */}
        {connectionOnly && (
          <div className="editor-group">
            <h2>{t('comfy.setup.sizes')}</h2>
            {SIZED_KINDS.map((kind) => (
              <SizeRow key={kind} kind={kind} settings={settings} onChange={(change) => setKind(kind, change)} />
            ))}
          </div>
        )}

        {/* Read again for another clip workflow, since what is needed is that workflow's. */}
        <ComfyBundlePanel key={videoWorkflow?.file} />

        {!connectionOnly && (
        <>
        <div className="editor-group">
          <h2>{t('comfy.setup.kinds')}</h2>
          <p className="hint">{t('comfy.setup.kindsHint')}</p>
          {ART_KINDS.map((kind) => (
            <KindRow key={kind} kind={kind} settings={settings} onChange={(change) => setKind(kind, change)} />
          ))}
        </div>

        <div className="editor-group">
          <h2>{t('comfy.setup.videoClips')}</h2>
          <p className="hint">{t('comfy.setup.videoClipsHint')}</p>
          {[...NSFW_POSES, ...acts].map((pose) => (
            <VideoPromptRow key={pose.id} pose={pose} settings={settings} onChange={(prompt) => patch({ videoPrompts: { ...settings.videoPrompts, [pose.id]: prompt } })} />
          ))}
        </div>
        </>
        )}
      </div>

      {!connectionOnly && (
      <div className="studio-results">
        <h2>{t('comfy.setup.workflows')}</h2>
        {workflows.length === 0 && <p className="hint">{t('comfy.setup.noWorkflows')}</p>}
        <div className="studio-workflows">
          {workflows.map((w) => (
            <button key={w.file} className={w.file === current?.file ? 'courier-person selected' : 'courier-person'} onClick={() => setSelected(w.file)}>
              <span>
                <strong>{w.name}</strong>
                <span className="hint">
                  {w.problem !== null
                    ? t('comfy.setup.unreadable')
                    : w.bindings.positive === null
                      ? t('comfy.setup.noPrompt')
                      : WORKFLOW_KINDS.filter((kind) => settings.defaults[kind] === w.file)
                          .map((kind) => t('comfy.setup.defaultForKind', { kind }))
                          .join(' · ') || (w.bindings.firstFrame !== null ? t('comfy.setup.readyVideo') : t('comfy.setup.ready'))}
                </span>
              </span>
            </button>
          ))}
        </div>
        {current && <WorkflowEditor key={current.file} workflow={current} settings={settings} onPatch={patch} />}
      </div>
      )}
    </section>
  )
}

interface KindRowProps {
  kind: ArtKind
  settings: ComfySettings
  onChange: (change: { framing?: string; width?: number; height?: number }) => void
}

function KindRow({ kind, settings, onChange }: KindRowProps) {
  const [framing, setFraming] = useState(framingFor(settings, kind))
  const size = sizeFor(settings, kind)
  return (
    <div className="studio-kind">
      <strong>{ART_KIND_LABELS[kind]}</strong>
      <div className="row">
        <label>
          {t('comfy.setup.framing')}
          <textarea rows={3} value={framing} placeholder={DEFAULT_FRAMING[kind]} onChange={(e) => setFraming(e.target.value)} onBlur={() => framing !== framingFor(settings, kind) && onChange({ framing })} />
        </label>
        <label className="studio-narrow">
          {t('comfy.setup.width')}
          <input type="number" min={64} max={8192} step={8} defaultValue={size.width} onBlur={(e) => Number(e.target.value) !== size.width && onChange({ width: Number(e.target.value) })} />
        </label>
        <label className="studio-narrow">
          {t('comfy.setup.height')}
          <input type="number" min={64} max={8192} step={8} defaultValue={size.height} onBlur={(e) => Number(e.target.value) !== size.height && onChange({ height: Number(e.target.value) })} />
        </label>
      </div>
    </div>
  )
}

// The kinds a player is offered a size for in the game's settings.
const SIZED_KINDS = ['sprite', 'background'] as const satisfies readonly ArtKind[]

/** How big one kind of picture is drawn, and nothing else of it. A size left as it is stays the game's own. */
function SizeRow({ kind, settings, onChange }: { kind: ArtKind; settings: ComfySettings; onChange: (change: { width?: number; height?: number }) => void }) {
  const size = sizeFor(settings, kind)
  return (
    <div className="row level-inputs">
      <strong className="size-kind">{ART_KIND_LABELS[kind]}</strong>
      <label className="studio-narrow">
        {t('comfy.setup.width')}
        <input type="number" min={64} max={8192} step={8} defaultValue={size.width} onBlur={(e) => Number(e.target.value) !== size.width && onChange({ width: Number(e.target.value) })} />
      </label>
      <label className="studio-narrow">
        {t('comfy.setup.height')}
        <input type="number" min={64} max={8192} step={8} defaultValue={size.height} onBlur={(e) => Number(e.target.value) !== size.height && onChange({ height: Number(e.target.value) })} />
      </label>
    </div>
  )
}

interface VideoPromptRowProps {
  pose: { id: string; name: string }
  settings: ComfySettings
  onChange: (prompt: string) => void
}

/** What a clip of one pose is asked for with. Held as it is typed, and saved when it is left. */
function VideoPromptRow({ pose, settings, onChange }: VideoPromptRowProps) {
  const [prompt, setPrompt] = useState(videoPromptFor(settings, pose.id))
  return (
    <label>
      {pose.name}
      <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} onBlur={() => prompt !== videoPromptFor(settings, pose.id) && onChange(prompt)} />
    </label>
  )
}

interface WorkflowEditorProps {
  workflow: WorkflowSummary
  settings: ComfySettings
  onPatch: (change: Partial<ComfySettings>) => Promise<void>
}

/** One workflow: what it is the default for, its prefixes, and where each value is written. */
function WorkflowEditor({ workflow, settings, onPatch }: WorkflowEditorProps) {
  const { file, analysis } = workflow
  const [prefix, setPrefix] = useState(settings.promptPrefixes[file] ?? '')
  const [negative, setNegative] = useState(settings.negativePrefixes[file] ?? '')
  if (!analysis) return <p className="notice">{workflow.problem}</p>

  const override = settings.overrides[file] ?? {}
  const setDefault = (kind: WorkflowKind, on: boolean) => {
    const defaults = { ...settings.defaults }
    if (on) defaults[kind] = file
    else delete defaults[kind]
    onPatch({ defaults })
  }
  const bind = (slot: BindingSlot, value: string) => {
    const next = { ...override }
    if (value === AUTO) delete next[slot]
    else if (value === NONE) next[slot] = null
    else {
      const [node, field] = value.split('\u0000')
      next[slot] = { node, field }
    }
    onPatch({ overrides: { ...settings.overrides, [file]: next } })
  }
  /** Everything a slot could be pointed at: text inputs for the prompts, numbers for the rest, any node for the output. */
  const options = (slot: BindingSlot): { at: NodeField; label: string }[] =>
    analysis.nodes.flatMap((node) => {
      const name = `${node.title ?? node.classType} #${node.id}`
      if (slot === 'output') return [{ at: { node: node.id, field: 'images' }, label: name }]
      const wanted = slot === 'positive' || slot === 'negative' || slot === 'firstFrame' || slot === 'lastFrame' ? 'string' : 'number'
      return node.fields.filter((f) => typeof f.value === wanted).map((f) => ({ at: { node: node.id, field: f.name }, label: `${name} · ${f.name}` }))
    })

  return (
    <div className="studio-workflow editor-body">
      {analysis.problems.map((problem) => (
        <p key={problem} className="notice">
          {problem}
        </p>
      ))}

      <div className="row checks">
        <span className="field-label">{t('comfy.setup.defaultFor')}</span>
        {kindsOf(workflow).map((kind) => (
          <label key={kind} className="inline">
            <input type="checkbox" checked={settings.defaults[kind] === file} onChange={(e) => setDefault(kind, e.target.checked)} />
            {t('comfy.setup.kindPlural', { kind })}
          </label>
        ))}
      </div>

      <label>
        {t('comfy.setup.promptPrefix')}
        <textarea
          rows={2}
          value={prefix}
          placeholder="score_9, masterpiece, <lora:comic-style:0.8>"
          onChange={(e) => setPrefix(e.target.value)}
          onBlur={() => prefix !== (settings.promptPrefixes[file] ?? '') && onPatch({ promptPrefixes: { ...settings.promptPrefixes, [file]: prefix } })}
        />
        <span className="hint">{t('comfy.setup.promptPrefixHint')}</span>
      </label>
      <label>
        {t('comfy.setup.negativePrefix')}
        <textarea
          rows={2}
          value={negative}
          placeholder="lowres, bad anatomy, extra fingers, text, watermark"
          onChange={(e) => setNegative(e.target.value)}
          onBlur={() => negative !== (settings.negativePrefixes[file] ?? '') && onPatch({ negativePrefixes: { ...settings.negativePrefixes, [file]: negative } })}
        />
      </label>

      <div className="editor-group">
        <h2>{t('comfy.setup.bindings')}</h2>
        <p className="hint">{t('comfy.setup.bindingsHint')}</p>
        {BINDING_SLOTS.map((slot) => {
          const bound = workflow.bindings[slot]
          const value = slot in override ? (override[slot] ? key(override[slot]) : NONE) : AUTO
          const detected = analysis.detected[slot]
          return (
            <label key={slot}>
              {SLOT_LABELS[slot]}
              <select value={value} onChange={(e) => bind(slot, e.target.value)}>
                <option value={AUTO}>{detected ? t('comfy.setup.detected', { note: analysis.notes[slot] ?? `#${detected.node} ${detected.field}` }) : t('comfy.setup.detectedNothing')}</option>
                <option value={NONE}>{t('comfy.setup.leave')}</option>
                {options(slot).map((option) => (
                  <option key={key(option.at)} value={key(option.at)}>
                    {option.label}
                  </option>
                ))}
              </select>
              {!bound && slot !== 'negative' && slot !== 'firstFrame' && slot !== 'lastFrame' && slot !== 'length' && <span className="hint">{slot === 'output' ? t('comfy.setup.unboundOutput') : t('comfy.setup.unbound')}</span>}
            </label>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The same setup, for a screen that has nothing else to do with ComfyUI: it reads the
 * settings and the game's workflows itself, and saves each change as it is made.
 */
export function ComfySetupPanel({ connectionOnly }: Pick<Props, 'connectionOnly'>) {
  const [settings, setSettings] = useState<ComfySettings | null>(null)
  const [list, setList] = useState<WorkflowListResult | null>(null)
  const [status, setStatus] = useState('')

  const reload = useCallback(() => window.api.comfy.workflows().then(setList, (error) => setStatus(errorMessage(error))), [])
  useEffect(() => {
    window.api.comfy.getSettings().then(setSettings, (error) => setStatus(errorMessage(error)))
    void reload()
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

  return (
    <>
      {status && <p className="notice">{status}</p>}
      {settings ? <ComfySetup settings={settings} list={list} onSave={save} connectionOnly={connectionOnly} /> : <p className="hint">{t('comfy.setup.loading')}</p>}
    </>
  )
}
