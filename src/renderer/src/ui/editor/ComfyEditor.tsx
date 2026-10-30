import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { ComfySettings, WorkflowListResult } from '../../../../shared/comfy'
import { errorMessage } from '../../errors'
import { t } from '../../../../shared/i18n'
import { ComfySetup } from '../art/ComfySetup'
import { EditorFoot } from './fields'

interface Props {
  /** The rail of the editor's sides, which asks this one whether it may be left. */
  switcher: (mayLeave: () => boolean) => ReactNode
  /** Sex-acts added in the editor, which have clip prompts beside the standard ones. */
  acts: readonly { id: string; name: string }[]
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The editor's ComfyUI side: how the art tool draws. Like every other side it keeps a draft, and nothing is kept
 * until it is saved. With the game's own files being edited, what is said of the workflows is saved into the game.
 */
export function ComfyEditor({ switcher, acts }: Props) {
  const [original, setOriginal] = useState<ComfySettings | null>(null)
  const [draft, setDraft] = useState<ComfySettings | null>(null)
  const [list, setList] = useState<WorkflowListResult | null>(null)
  const [issues, setIssues] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  // Something has been typed that its field has not handed over yet: a field does so when it is left, which is before a click on Save lands.
  const [typed, setTyped] = useState(false)
  // Counted up to put every field back to what the draft says, when the changes are undone.
  const [round, setRound] = useState(0)

  const reload = useCallback(() => window.api.comfy.workflows().then(setList, (error) => setStatus(errorMessage(error))), [])
  useEffect(() => {
    window.api.comfy.getSettings().then(
      (settings) => (setOriginal(settings), setDraft(settings)),
      (error) => setStatus(errorMessage(error))
    )
    void reload()
  }, [reload])

  const dirty = typed || !same(draft, original)
  const mayLeave = () => !dirty || window.confirm(t('comfy.editor.discard'))

  async function save() {
    if (!draft) return
    setBusy(true)
    setIssues([])
    try {
      // Where the models are is found and kept by the downloads on this page as they are used, and is not the draft's to put back.
      const { modelsDir } = await window.api.comfy.getSettings()
      const saved = await window.api.comfy.saveSettings({ ...draft, modelsDir })
      setOriginal(saved)
      setDraft(saved)
      setTyped(false)
      setStatus(t('comfy.editor.saved'))
      // How a workflow reads may have changed with its bindings.
      await reload()
    } catch (error) {
      setIssues([errorMessage(error)])
    } finally {
      setBusy(false)
    }
  }

  function undo() {
    setDraft(original)
    setTyped(false)
    setIssues([])
    setStatus('')
    setRound((n) => n + 1)
  }

  return (
    <main className="editor player-editor">
      {switcher(mayLeave)}
      <section className="editor-main" onInput={() => setTyped(true)}>
        <div className="editor-head">
          <div>
            <h1>ComfyUI</h1>
            <span className="hint">{t('comfy.editor.hint')}</span>
          </div>
        </div>
        {draft ? (
          <ComfySetup key={round} settings={draft} list={list} acts={acts} onSave={async (next) => (setDraft(next), setStatus(''))} />
        ) : (
          <p className="hint">{t('comfy.setup.loading')}</p>
        )}
        <EditorFoot issues={issues} status={status} busy={busy} dirty={dirty} onUndo={undo} onSave={save} />
      </section>
    </main>
  )
}
