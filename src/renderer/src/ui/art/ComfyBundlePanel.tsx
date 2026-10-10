import { useEffect, useState } from 'react'
import type { ComfyBundle, ComfyBundleCheck, ComfySettings } from '../../../../shared/comfy'
import { errorMessage } from '../../errors'
import { Button } from '../Button'

interface Props {
  /** Told the settings as they are once the game's workflows have been installed, so that the screen around this shows them. */
  onInstalled: (settings: ComfySettings) => Promise<void>
}

/**
 * The workflows the game ships with. A player has them written into their own ComfyUI
 * folder, which also points the game at them; the models and custom nodes they call for
 * are the player's to fetch, and are listed here, with a check of what a running ComfyUI
 * still lacks. A game that ships none shows nothing here.
 */
export function ComfyBundlePanel({ onInstalled }: Props) {
  const [bundle, setBundle] = useState<ComfyBundle | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [check, setCheck] = useState<ComfyBundleCheck | null>(null)

  useEffect(() => {
    window.api.comfy.bundle().then(setBundle, (error) => setStatus({ ok: false, text: errorMessage(error) }))
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

  const install = () =>
    run(async () => {
      const result = await window.api.comfy.installBundle()
      if (result.message) setStatus({ ok: result.ok, text: result.message })
      if (result.settings) await onInstalled(result.settings)
    })
  const look = () =>
    run(async () => {
      setCheck(null)
      setCheck(await window.api.comfy.checkBundle())
    })

  if (!bundle || bundle.workflows.length === 0) return null
  const { workflows } = bundle
  const models = [...new Set(workflows.flatMap((w) => w.models))]

  return (
    <div className="editor-group">
      <h2>The game's workflows</h2>
      <>
          <p className="hint">
            The game comes with {workflows.length === 1 ? 'a workflow' : `${workflows.length} workflows`} of its own: {workflows.map((w) => w.name).join(', ')}. Installing writes
            {workflows.length === 1 ? ' it' : ' them'} into a folder inside the one you pick and sets the game to use {workflows.length === 1 ? 'it' : 'them'}. The models and custom nodes
            are yours to download.
          </p>
          {models.length > 0 && (
            <div>
              <span className="caps">Models they load</span>
              <ul className="bundle-needs">
                {models.map((file) => (
                  <li key={file} className={check?.missingModels.includes(file) ? 'missing' : undefined}>
                    {file}
                    {check?.missingModels.includes(file) && ' · not found'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {check && check.missingNodes.length > 0 && (
            <div>
              <span className="caps">Custom nodes to install</span>
              <ul className="bundle-needs">
                {check.missingNodes.map((node) => (
                  <li key={node} className="missing">
                    {node}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {check && <p className={check.ok ? 'hint' : 'notice'}>{check.message}</p>}
      </>
      <div className="row">
        <Button disabled={busy} onClick={install}>
          Install into my ComfyUI folder...
        </Button>
        <Button disabled={busy} onClick={look}>
          Check my ComfyUI for what they need
        </Button>
      </div>
      {status && <p className={status.ok ? 'hint' : 'notice'}>{status.text}</p>}
    </div>
  )
}
