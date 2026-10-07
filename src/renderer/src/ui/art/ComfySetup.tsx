import { Button } from '../Button'
import { useEffect, useState } from 'react'
import {
  ART_KIND_LABELS,
  ART_KINDS,
  BINDING_SLOTS,
  COMFY_DEFAULT_BASE_URL,
  COMFY_MAX_TIMEOUT_SECONDS,
  COMFY_MIN_TIMEOUT_SECONDS,
  DEFAULT_FRAMING,
  framingFor,
  normaliseComfyUrl,
  sizeFor,
  SLOT_LABELS,
  type ArtKind,
  type BindingSlot,
  type ComfySettings,
  type ComfyTestResult,
  type NodeField,
  type WorkflowListResult,
  type WorkflowSummary
} from '../../../../shared/comfy'

interface Props {
  settings: ComfySettings
  list: WorkflowListResult | null
  onSave: (settings: ComfySettings) => Promise<void>
}

const AUTO = '__auto__'
const NONE = '__none__'
const key = (at: NodeField) => `${at.node}\u0000${at.field}`

/**
 * Setting up ComfyUI. Three things have to be true before anything can be drawn, and they
 * fail separately: ComfyUI has to be running, the folder has to hold API-format exports,
 * and each workflow has to have somewhere to put a prompt. Each has its own answer here.
 */
export function ComfySetup({ settings, list, onSave }: Props) {
  // Typed fields are held here and saved when left, so a half-typed address is not refused on every key.
  const [url, setUrl] = useState(settings.baseUrl)
  const [timeout, setTimeoutSeconds] = useState(String(settings.timeoutSeconds))
  const [test, setTest] = useState<ComfyTestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => setUrl(settings.baseUrl), [settings.baseUrl])

  const typed = normaliseComfyUrl(url)
  const workflows = list?.workflows ?? []
  const current = workflows.find((w) => w.file === selected) ?? workflows[0] ?? null
  const patch = (change: Partial<ComfySettings>) => onSave({ ...settings, ...change })

  const commitUrl = () => {
    if (typed.url !== null && typed.url !== settings.baseUrl) patch({ baseUrl: typed.url })
  }
  const commitTimeout = () => {
    const seconds = Math.min(COMFY_MAX_TIMEOUT_SECONDS, Math.max(COMFY_MIN_TIMEOUT_SECONDS, Math.round(Number(timeout)) || settings.timeoutSeconds))
    setTimeoutSeconds(String(seconds))
    if (seconds !== settings.timeoutSeconds) patch({ timeoutSeconds: seconds })
  }
  const runTest = async () => {
    setTesting(true)
    setTest(null)
    commitUrl()
    setTest(await window.api.comfy.test(url))
    setTesting(false)
  }
  const chooseFolder = async () => {
    const dir = await window.api.comfy.chooseFolder()
    if (dir !== null) patch({ workflowDir: dir })
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
          <h2>Server</h2>
          <div className="row">
            <label>
              ComfyUI address
              <input
                value={url}
                placeholder={COMFY_DEFAULT_BASE_URL}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={commitUrl}
                onKeyDown={(e) => e.key === 'Enter' && commitUrl()}
              />
            </label>
            <Button disabled={testing} onClick={runTest}>
              {testing ? 'Testing...' : 'Test'}
            </Button>
          </div>
          {typed.problem !== null && url.trim() !== '' && <p className="notice">{typed.problem}</p>}
          {test && <p className={test.ok ? 'hint' : 'notice'}>{test.ok ? `Answered. ${test.device ?? ''}` : test.message}</p>}

          <div className="row">
            <label>
              Workflow folder
              <input readOnly value={settings.workflowDir ?? ''} placeholder="No folder chosen yet" />
              <span className="hint">In ComfyUI use Workflow → Export (API) and save the files here. A workflow saved the ordinary way cannot be run.</span>
            </label>
            <Button onClick={chooseFolder}>
              Choose...
            </Button>
          </div>
          {list && !list.ok && list.message && <p className="notice">{list.message}</p>}

          <label className="studio-narrow">
            Give up after (seconds)
            <input type="number" min={COMFY_MIN_TIMEOUT_SECONDS} max={COMFY_MAX_TIMEOUT_SECONDS} value={timeout} onChange={(e) => setTimeoutSeconds(e.target.value)} onBlur={commitTimeout} />
          </label>
        </div>

        <div className="editor-group">
          <h2>Kinds of picture</h2>
          <p className="hint">Each kind has its own size and its own framing words, which close every prompt of that kind, after its subject. They say how the picture is composed, not what is in it.</p>
          {ART_KINDS.map((kind) => (
            <KindRow key={kind} kind={kind} settings={settings} onChange={(change) => setKind(kind, change)} />
          ))}
        </div>
      </div>

      <div className="studio-results">
        <h2>Workflows</h2>
        {workflows.length === 0 && <p className="hint">None yet. Choose the folder your API-format workflows are exported to.</p>}
        <div className="studio-workflows">
          {workflows.map((w) => (
            <button key={w.file} className={w.file === current?.file ? 'courier-person selected' : 'courier-person'} onClick={() => setSelected(w.file)}>
              <span>
                <strong>{w.name}</strong>
                <span className="hint">
                  {w.problem !== null
                    ? 'Unreadable'
                    : w.bindings.positive === null
                      ? 'Nowhere to put a prompt'
                      : ART_KINDS.filter((kind) => settings.defaults[kind] === w.file)
                          .map((kind) => `Default for ${ART_KIND_LABELS[kind].toLowerCase()}s`)
                          .join(' · ') || 'Ready'}
                </span>
              </span>
            </button>
          ))}
        </div>
        {current && <WorkflowEditor key={current.file} workflow={current} settings={settings} onPatch={patch} />}
      </div>
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
          Framing
          <textarea rows={3} value={framing} placeholder={DEFAULT_FRAMING[kind]} onChange={(e) => setFraming(e.target.value)} onBlur={() => framing !== framingFor(settings, kind) && onChange({ framing })} />
        </label>
        <label className="studio-narrow">
          Width
          <input type="number" min={64} max={8192} step={8} defaultValue={size.width} onBlur={(e) => Number(e.target.value) !== size.width && onChange({ width: Number(e.target.value) })} />
        </label>
        <label className="studio-narrow">
          Height
          <input type="number" min={64} max={8192} step={8} defaultValue={size.height} onBlur={(e) => Number(e.target.value) !== size.height && onChange({ height: Number(e.target.value) })} />
        </label>
      </div>
    </div>
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
  const setDefault = (kind: ArtKind, on: boolean) => {
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
      const wanted = slot === 'positive' || slot === 'negative' ? 'string' : 'number'
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
        <span className="field-label">Default for</span>
        {ART_KINDS.map((kind) => (
          <label key={kind} className="inline">
            <input type="checkbox" checked={settings.defaults[kind] === file} onChange={(e) => setDefault(kind, e.target.checked)} />
            {ART_KIND_LABELS[kind]}s
          </label>
        ))}
      </div>

      <label>
        Prompt prefix
        <textarea
          rows={2}
          value={prefix}
          placeholder="score_9, masterpiece, <lora:comic-style:0.8>"
          onChange={(e) => setPrefix(e.target.value)}
          onBlur={() => prefix !== (settings.promptPrefixes[file] ?? '') && onPatch({ promptPrefixes: { ...settings.promptPrefixes, [file]: prefix } })}
        />
        <span className="hint">Put in front of every prompt sent through this workflow: model tokens, quality tags, LoRA triggers.</span>
      </label>
      <label>
        Negative prefix
        <textarea
          rows={2}
          value={negative}
          placeholder="lowres, bad anatomy, extra fingers, text, watermark"
          onChange={(e) => setNegative(e.target.value)}
          onBlur={() => negative !== (settings.negativePrefixes[file] ?? '') && onPatch({ negativePrefixes: { ...settings.negativePrefixes, [file]: negative } })}
        />
      </label>

      <div className="editor-group">
        <h2>Where things go</h2>
        <p className="hint">Worked out by reading the workflow. Repoint one if it chose the wrong node.</p>
        {BINDING_SLOTS.map((slot) => {
          const bound = workflow.bindings[slot]
          const value = slot in override ? (override[slot] ? key(override[slot]) : NONE) : AUTO
          const detected = analysis.detected[slot]
          return (
            <label key={slot}>
              {SLOT_LABELS[slot]}
              <select value={value} onChange={(e) => bind(slot, e.target.value)}>
                <option value={AUTO}>{detected ? `Detected: ${analysis.notes[slot] ?? `#${detected.node} ${detected.field}`}` : 'Detected: nothing'}</option>
                <option value={NONE}>Leave as the workflow has it</option>
                {options(slot).map((option) => (
                  <option key={key(option.at)} value={key(option.at)}>
                    {option.label}
                  </option>
                ))}
              </select>
              {!bound && slot !== 'negative' && <span className="hint">Not bound: {slot === 'output' ? 'any picture the run makes is taken.' : 'this value is not sent.'}</span>}
            </label>
          )
        })}
      </div>
    </div>
  )
}
