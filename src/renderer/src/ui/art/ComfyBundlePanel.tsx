import { useEffect, useState } from 'react'
import type { ComfyBundle, ComfyBundleCheck, ComfyDownloadList, ModelDownloadProgress } from '../../../../shared/comfy'
import { errorMessage } from '../../errors'
import { Button } from '../Button'

const gigabytes = (megabytes: number) => (megabytes >= 1024 ? `${(megabytes / 1024).toFixed(1)} GB` : `${Math.round(megabytes)} MB`)
// A workflow names a file with whichever slash its author's system uses.
const sameFile = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()

/**
 * The game's workflows, and everything they need. The workflows themselves are run from
 * the game and need no installing; the models they call for are downloaded from here, each
 * into the folder of ComfyUI's models it belongs in. Those on Civitai that are adult-rated need the player's own key.
 * Custom nodes are linked to, for the player to install. A game that ships no workflows
 * shows nothing here.
 */
export function ComfyBundlePanel() {
  const [bundle, setBundle] = useState<ComfyBundle | null>(null)
  const [list, setList] = useState<ComfyDownloadList | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [check, setCheck] = useState<ComfyBundleCheck | null>(null)
  // The key as it is being typed. What is kept is never sent back here: only whether there is one.
  const [key, setKey] = useState('')
  // The file being downloaded, how far it has got, and those still waiting their turn.
  const [progress, setProgress] = useState<ModelDownloadProgress | null>(null)
  const [queue, setQueue] = useState<string[]>([])

  useEffect(() => {
    window.api.comfy.bundle().then(setBundle, (error) => setStatus({ ok: false, text: errorMessage(error) }))
    window.api.comfy.downloads().then(setList, (error) => setStatus({ ok: false, text: errorMessage(error) }))
    return window.api.comfy.onDownloadProgress(setProgress)
  }, [])

  /** Does one thing at a time, and says what went wrong with it. */
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setStatus(null)
    try {
      await work()
    } catch (error) {
      setStatus({ ok: false, text: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  const look = () =>
    run(async () => {
      setCheck(null)
      setCheck(await window.api.comfy.checkBundle())
      setList(await window.api.comfy.downloads())
    })
  const chooseFolder = () => run(async () => setList(await window.api.comfy.chooseModelsDir()))
  const saveKey = (value: string) =>
    run(async () => {
      setList(await window.api.comfy.setCivitaiKey(value))
      setKey('')
      setStatus({ ok: true, text: value.trim() ? 'Your Civitai key is kept on this computer, and used only to download these files.' : 'The Civitai key has been forgotten.' })
    })

  /** Downloads the given files one after another, stopping at the first that fails. */
  const download = (files: string[]) =>
    run(async () => {
      setQueue(files)
      for (const [i, file] of files.entries()) {
        setQueue(files.slice(i))
        const result = await window.api.comfy.downloadModel(file)
        setProgress(null)
        setList(await window.api.comfy.downloads())
        if (!result.ok) {
          setStatus({ ok: false, text: `${file}: ${result.message}` })
          setQueue([])
          return
        }
      }
      setQueue([])
      setStatus({ ok: true, text: files.length === 1 ? 'Downloaded. ComfyUI will find it the next time it is asked for.' : `${files.length} files downloaded. ComfyUI will find them the next time they are asked for.` })
    })

  if (!bundle || bundle.workflows.length === 0) return null
  const { workflows } = bundle
  const models = list?.models ?? []
  const missing = models.filter((model) => !model.present)
  // Files a workflow names that the game has no address for: listed, for the player to find himself.
  const unlisted = [...new Set(workflows.flatMap((w) => w.models))].filter((file) => !models.some((model) => sameFile(model.file, file)))
  const needsKey = missing.some((model) => model.civitaiVersionId !== undefined) && list?.hasCivitaiKey === false
  const downloading = queue.length > 0

  return (
    <div className="editor-group">
      <h2>The game's workflows</h2>
      <p className="hint">
        The game draws with {workflows.length === 1 ? 'a workflow' : `${workflows.length} workflows`} of its own: {workflows.map((w) => w.name).join(', ')}. Nothing of
        {workflows.length === 1 ? ' it' : ' them'} needs installing. The models can be downloaded from here; custom nodes are yours to install.
      </p>
      <div className="row">
        <Button disabled={busy} onClick={look}>
          Check my ComfyUI for what they need
        </Button>
      </div>

      {models.length > 0 && (
        <>
          <div className="row">
            <label>
              Models folder
              <input readOnly value={list?.modelsDir ?? ''} placeholder="Not found yet: choose your ComfyUI folder" />
              <span className="hint">Where ComfyUI keeps its models. Each download goes into the folder inside it that it belongs in.</span>
            </label>
            <Button disabled={busy} onClick={chooseFolder}>
              Choose...
            </Button>
          </div>
          <div className="row">
            <label>
              Civitai API key
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={list?.hasCivitaiKey ? 'Saved. Type another to replace it.' : 'Needed for the adult-rated models on Civitai'}
              />
              <span className="hint">
                Civitai only gives adult-rated models to someone signed in. Make a key under{' '}
                <a href="https://civitai.com/user/account" target="_blank" rel="noreferrer">
                  your Civitai account settings
                </a>
                , API Keys, and paste it here. It is kept on this computer and sent to Civitai alone.
              </span>
            </label>
            <Button disabled={busy || key.trim() === ''} onClick={() => saveKey(key)}>
              Save key
            </Button>
            {list?.hasCivitaiKey && (
              <Button variant="quiet" disabled={busy} onClick={() => saveKey('')}>
                Forget it
              </Button>
            )}
          </div>

          <span className="caps">Models they load</span>
          <div className="bundle-models">
            {models.map((model) => {
              const active = downloading && queue[0] === model.file
              const waiting = downloading && queue.slice(1).includes(model.file)
              const notSeen = check?.missingModels.some((file) => sameFile(file, model.file)) === true
              const done = active && progress?.file === model.file ? progress : null
              return (
                <div key={model.file} className="bundle-model">
                  <div>
                    <strong>{model.name || model.file}</strong>
                    <span className="hint">
                      {model.folder}/{model.file} · {gigabytes(model.sizeMb)} ·{' '}
                      <a href={model.page} target="_blank" rel="noreferrer">
                        {model.civitaiVersionId !== undefined ? 'Civitai page' : 'its page'}
                      </a>
                    </span>
                    {active && (
                      <div className="meter">
                        <div style={{ width: `${done && done.total > 0 ? Math.min(100, (done.received / done.total) * 100) : 0}%` }} />
                      </div>
                    )}
                    {active && <span className="hint">{done ? `${gigabytes(done.received / 1048576)} of ${gigabytes(done.total / 1048576)}` : 'Starting...'}</span>}
                  </div>
                  {model.present ? (
                    <span className={notSeen ? 'chip madder' : 'chip'}>{notSeen ? 'Downloaded, but ComfyUI does not see it' : 'Installed'}</span>
                  ) : active ? (
                    <Button onClick={() => window.api.comfy.cancelDownload()}>Stop</Button>
                  ) : waiting ? (
                    <span className="chip">Waiting</span>
                  ) : (
                    <Button disabled={busy || !list?.modelsDir} title={list?.modelsDir ? undefined : 'Choose your ComfyUI folder first'} onClick={() => download([model.file])}>
                      Download
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
          {missing.length > 1 && !downloading && (
            <div className="row">
              <Button variant="primary" disabled={busy || !list?.modelsDir} onClick={() => download(missing.map((model) => model.file))}>
                Download all {missing.length} missing ({gigabytes(missing.reduce((sum, model) => sum + model.sizeMb, 0))})
              </Button>
            </div>
          )}
          {needsKey && <p className="hint">Some of these are on Civitai, which will want your key before it hands them over.</p>}
        </>
      )}

      {unlisted.length > 0 && (
        <div>
          <span className="caps">Other files they load, to find yourself</span>
          <ul className="bundle-needs">
            {unlisted.map((file) => (
              <li key={file} className={check?.missingModels.includes(file) ? 'missing' : undefined}>
                {file}
                {check?.missingModels.includes(file) && ' · not found'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(list?.nodes.length ?? 0) > 0 && (
        <div>
          <span className="caps">Custom nodes to install in ComfyUI</span>
          <ul className="bundle-needs">
            {list?.nodes.map((pack) => {
              const lacking = check?.missingNodes.some((node) => pack.provides.includes(node)) === true
              return (
                <li key={pack.name} className={lacking ? 'missing' : undefined}>
                  <a href={pack.page} target="_blank" rel="noreferrer">
                    {pack.name}
                  </a>
                  {pack.provides.length > 0 && ` (${pack.provides.join(', ')})`}
                  {lacking && ' · not installed'}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {/* Any kind of node a running ComfyUI lacks that no listed pack is known to bring. */}
      {check && check.missingNodes.filter((node) => !list?.nodes.some((pack) => pack.provides.includes(node))).length > 0 && (
        <div>
          <span className="caps">Other nodes ComfyUI is missing</span>
          <ul className="bundle-needs">
            {check.missingNodes
              .filter((node) => !list?.nodes.some((pack) => pack.provides.includes(node)))
              .map((node) => (
                <li key={node} className="missing">
                  {node}
                </li>
              ))}
          </ul>
        </div>
      )}
      {check && <p className={check.ok ? 'hint' : 'notice'}>{check.message}</p>}
      {status && <p className={status.ok ? 'hint' : 'notice'}>{status.text}</p>}
    </div>
  )
}
