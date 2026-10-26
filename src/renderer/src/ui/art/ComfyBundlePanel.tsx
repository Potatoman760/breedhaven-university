import { useEffect, useState } from 'react'
import type { ComfyBundle, ComfyBundleCheck, ComfyDownloadList, ModelDownloadProgress } from '../../../../shared/comfy'
import { errorMessage } from '../../errors'
import { Button } from '../Button'
import { t } from '../../../../shared/i18n'

const gigabytes = (megabytes: number) => (megabytes >= 1024 ? t('comfy.bundlePanel.gigabytes', { size: (megabytes / 1024).toFixed(1) }) : t('comfy.bundlePanel.megabytes', { size: Math.round(megabytes) }))
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
      setStatus({ ok: true, text: value.trim() ? t('comfy.bundlePanel.keyKept') : t('comfy.bundlePanel.keyForgotten') })
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
      setStatus({ ok: true, text: t('comfy.bundlePanel.downloaded', { count: files.length }) })
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
      <h2>{t('comfy.bundlePanel.title')}</h2>
      <p className="hint">{t('comfy.bundlePanel.intro', { count: workflows.length, names: workflows.map((w) => w.name).join(', ') })}</p>
      <div className="row">
        <Button disabled={busy} onClick={look}>
          {t('comfy.bundlePanel.check')}
        </Button>
      </div>

      {models.length > 0 && (
        <>
          <div className="row">
            <label>
              {t('comfy.bundlePanel.modelsFolder')}
              <input readOnly value={list?.modelsDir ?? ''} placeholder={t('comfy.bundlePanel.modelsFolderPlaceholder')} />
              <span className="hint">{t('comfy.bundlePanel.modelsFolderHint')}</span>
            </label>
            <Button disabled={busy} onClick={chooseFolder}>
              {t('comfy.bundlePanel.choose')}
            </Button>
          </div>
          <div className="row">
            <label>
              {t('comfy.bundlePanel.civitaiKey')}
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={list?.hasCivitaiKey ? t('comfy.bundlePanel.keySavedPlaceholder') : t('comfy.bundlePanel.keyPlaceholder')}
              />
              <span className="hint">
                {t('comfy.bundlePanel.keyHintBefore')}{' '}
                <a href="https://civitai.com/user/account" target="_blank" rel="noreferrer">
                  {t('comfy.bundlePanel.keyHintLink')}
                </a>
                {t('comfy.bundlePanel.keyHintAfter')}
              </span>
            </label>
            <Button disabled={busy || key.trim() === ''} onClick={() => saveKey(key)}>
              {t('comfy.bundlePanel.saveKey')}
            </Button>
            {list?.hasCivitaiKey && (
              <Button variant="quiet" disabled={busy} onClick={() => saveKey('')}>
                {t('comfy.bundlePanel.forgetKey')}
              </Button>
            )}
          </div>

          <span className="caps">{t('comfy.bundlePanel.models')}</span>
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
                        {model.civitaiVersionId !== undefined ? t('comfy.bundlePanel.civitaiPage') : t('comfy.bundlePanel.itsPage')}
                      </a>
                    </span>
                    {active && (
                      <div className="meter">
                        <div style={{ width: `${done && done.total > 0 ? Math.min(100, (done.received / done.total) * 100) : 0}%` }} />
                      </div>
                    )}
                    {active && <span className="hint">{done ? t('comfy.bundlePanel.progress', { received: gigabytes(done.received / 1048576), total: gigabytes(done.total / 1048576) }) : t('comfy.bundlePanel.starting')}</span>}
                  </div>
                  {model.present ? (
                    <span className={notSeen ? 'chip madder' : 'chip'}>{notSeen ? t('comfy.bundlePanel.notSeen') : t('comfy.bundlePanel.installed')}</span>
                  ) : active ? (
                    <Button onClick={() => window.api.comfy.cancelDownload()}>{t('comfy.bundlePanel.stop')}</Button>
                  ) : waiting ? (
                    <span className="chip">{t('comfy.bundlePanel.waiting')}</span>
                  ) : (
                    <Button disabled={busy || !list?.modelsDir} title={list?.modelsDir ? undefined : t('comfy.bundlePanel.chooseFirst')} onClick={() => download([model.file])}>
                      {t('comfy.bundlePanel.download')}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
          {missing.length > 1 && !downloading && (
            <div className="row">
              <Button variant="primary" disabled={busy || !list?.modelsDir} onClick={() => download(missing.map((model) => model.file))}>
                {t('comfy.bundlePanel.downloadAll', { count: missing.length, size: gigabytes(missing.reduce((sum, model) => sum + model.sizeMb, 0)) })}
              </Button>
            </div>
          )}
          {needsKey && <p className="hint">{t('comfy.bundlePanel.needsKey')}</p>}
        </>
      )}

      {unlisted.length > 0 && (
        <div>
          <span className="caps">{t('comfy.bundlePanel.unlisted')}</span>
          <ul className="bundle-needs">
            {unlisted.map((file) => (
              <li key={file} className={check?.missingModels.includes(file) ? 'missing' : undefined}>
                {file}
                {check?.missingModels.includes(file) && t('comfy.bundlePanel.notFoundSuffix')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(list?.nodes.length ?? 0) > 0 && (
        <div>
          <span className="caps">{t('comfy.bundlePanel.nodes')}</span>
          <ul className="bundle-needs">
            {list?.nodes.map((pack) => {
              const lacking = check?.missingNodes.some((node) => pack.provides.includes(node)) === true
              return (
                <li key={pack.name} className={lacking ? 'missing' : undefined}>
                  <a href={pack.page} target="_blank" rel="noreferrer">
                    {pack.name}
                  </a>
                  {pack.provides.length > 0 && ` (${pack.provides.join(', ')})`}
                  {lacking && t('comfy.bundlePanel.notInstalledSuffix')}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {/* Any kind of node a running ComfyUI lacks that no listed pack is known to bring. */}
      {check && check.missingNodes.filter((node) => !list?.nodes.some((pack) => pack.provides.includes(node))).length > 0 && (
        <div>
          <span className="caps">{t('comfy.bundlePanel.otherNodes')}</span>
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
