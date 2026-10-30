import { useEffect, useState, type ReactNode } from 'react'
import { isSafeId, slugify, type EditorInfo, type EditorResult, type LookKind } from '../../../../shared/editor'
import { FACES } from '../../../../shared/comfy'
import { EXPRESSIONS, NSFW_POSES, isMoment, isSeeding, poseDescription, type ContentPack, type CustomAct, type CustomExpression } from '../../../../shared/model'
import { errorMessage } from '../../errors'
import { Button } from '../Button'
import { useConfirm } from '../Confirm'
import { EditorFoot, Group, Text } from './fields'
import { t, type MessageKey } from '../../../../shared/i18n'

interface Props {
  content: ContentPack
  /** Called whenever a change has been written and the game's content reloaded. */
  onContent: (content: ContentPack) => void
  /** The switch between the sides of the editor, given a check to make before leaving this one. */
  switcher: (mayLeave: () => boolean) => ReactNode
}

// One face or one sex-act, whichever is open: a face has only some of an act's fields.
type Draft = { kind: LookKind } & CustomAct

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const blank = (kind: LookKind): Draft => ({ kind, id: '', name: '', description: '', draws: '', moment: false, seeding: false })

const HEADINGS: Record<LookKind, { title: MessageKey; add: MessageKey }> = {
  expressions: { title: 'editor.looks.expressions', add: 'editor.looks.newExpression' },
  acts: { title: 'editor.looks.acts', add: 'editor.looks.newAct' }
}

/** What is saved of the draft: a face has no flags. */
function saved(draft: Draft): CustomExpression | CustomAct {
  const { kind, ...look } = draft
  if (kind === 'acts') return look
  const { moment: _moment, seeding: _seeding, ...face } = look
  return face
}

/** A draft of a face or an act as the content has it. */
const draftOf = (kind: LookKind, look: CustomExpression | CustomAct): Draft => ({ ...blank(kind), ...look })

/**
 * The standard ones, as the game has them in its code: shown as the added ones are, to be looked at and not changed.
 * Made as they are shown, so that what the LLM is told of an act is in the language the game is in now.
 */
const standardOf = (): Record<LookKind, Draft[]> => ({
  expressions: EXPRESSIONS.map((face) => ({ ...blank('expressions'), id: face, name: face, draws: FACES[face] ?? '' })),
  acts: NSFW_POSES.map((pose) => ({
    ...blank('acts'),
    id: pose.id,
    name: pose.name,
    description: poseDescription({ id: pose.id, description: '' }),
    draws: pose.draws,
    moment: isMoment(pose.id),
    seeding: isSeeding(pose.id)
  }))
})

/**
 * Faces and sex-acts added to the standard ones. Each is a slot for every character in her Media tab, offered to the
 * LLM for one who has its picture. The standard ones are listed and cannot be changed: the game's rules lean on them.
 */
export function LooksEditor({ content, onContent, switcher }: Props) {
  const first = content.looks.expressions[0]
  const [original, setOriginal] = useState<Draft | null>(first ? draftOf('expressions', first) : null)
  const [draft, setDraft] = useState<Draft>(original ?? blank('expressions'))
  const [issues, setIssues] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<EditorInfo | null>(null)
  // A standard one is open: shown, and not to be changed.
  const [locked, setLocked] = useState(false)
  const { ask, dialog } = useConfirm()
  useEffect(() => {
    window.api.editor.info().then(setInfo, () => undefined)
  }, [])

  const isNew = original === null
  const dirty = !same(draft, original ?? blank(draft.kind))
  const mayLeave = () => !dirty || window.confirm(t('editor.common.discard'))
  const set = (patch: Partial<Draft>) => {
    setIssues([])
    setDraft((current) => ({ ...current, ...patch }))
  }
  // One that came with the game can be changed here but not taken away.
  const removable = !isNew && info?.looks[draft.kind][draft.id] !== 'base'

  function open(next: Draft | null, kind: LookKind = draft.kind, standard = false) {
    if (!mayLeave()) return
    setLocked(standard)
    setOriginal(next)
    setDraft(next ?? blank(kind))
    setIssues([])
    setStatus('')
  }

  /** Makes a change, and afterwards shows the one of the given id, or the first of its kind. */
  async function apply(change: Promise<EditorResult>, done: string, kind: LookKind, showId: string) {
    setBusy(true)
    try {
      const result = await change
      setIssues(result.issues)
      if (result.issues.length > 0) return
      onContent(result.content)
      setInfo(result.info)
      const all = result.content.looks[kind]
      const shown = all.find((look) => look.id === showId) ?? all[0]
      const next = shown ? draftOf(kind, shown) : null
      setLocked(false)
      setOriginal(next)
      setDraft(next ?? blank(kind))
      setStatus(done)
    } catch (error) {
      setStatus(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const standard = standardOf()
  const isOpen = (kind: LookKind, id: string, standardOne: boolean) => !isNew && locked === standardOne && draft.kind === kind && id === original?.id

  return (
    <main className="editor">
      {switcher(mayLeave)}
      {dialog}
      <aside className="editor-list">
        {(['expressions', 'acts'] as const).map((kind) => (
          <div key={kind} className="editor-people">
            <span className="field-label">{t(HEADINGS[kind].title)}</span>
            <Button variant="primary" onClick={() => open(null, kind)}>
              {t(HEADINGS[kind].add)}
            </Button>
            {content.looks[kind].map((look) => (
              <button
                key={look.id}
                className={isOpen(kind, look.id, false) ? 'courier-person selected' : 'courier-person'}
                onClick={() => open(draftOf(kind, look), kind)}
              >
                <span>
                  <strong>{look.name}</strong>
                  <span className="hint">{look.id}</span>
                </span>
              </button>
            ))}
            {standard[kind].map((look) => (
              <button
                key={look.id}
                className={isOpen(kind, look.id, true) ? 'courier-person selected' : 'courier-person'}
                title={t('editor.looks.standard')}
                onClick={() => open(look, kind, true)}
              >
                <span>
                  {look.name}
                  <span className="hint">{t('editor.looks.standardHint')}</span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </aside>

      <section className="editor-main">
        <div className="editor-head">
          <div>
            <h1>{draft.name || (isNew ? t(HEADINGS[draft.kind].add) : draft.id)}</h1>
            <span className="hint">{isNew ? t('editor.common.notSaved') : locked ? t('editor.looks.standard') : t(HEADINGS[draft.kind].title)}</span>
          </div>
        </div>

        <div className="editor-body">
          <Group title={t(HEADINGS[draft.kind].title)}>
            <div className="row">
              <Text label={t('editor.common.name')} value={draft.name} disabled={locked} onChange={(name) => set(isNew ? { name, id: slugify(name) } : { name })} />
              <Text label={t('editor.common.id')} value={draft.id} disabled={!isNew} onChange={(id) => set({ id: slugify(id) })} hint={isNew ? t('editor.common.idFixed') : undefined} />
            </div>
            <Text label={t('editor.looks.description')} llm value={draft.description} rows={2} disabled={locked} onChange={(description) => set({ description })} />
            <Text
              label={t('editor.looks.draws')}
              value={draft.draws}
              rows={draft.kind === 'acts' ? 3 : 2}
              disabled={locked}
              placeholder={draft.kind === 'acts' ? NSFW_POSES[0].draws : t('editor.looks.drawsFace')}
              onChange={(draws) => set({ draws })}
            />
            {draft.kind === 'acts' && (
              <div className="row checks">
                <label className="inline" title={t('editor.looks.momentTitle')}>
                  <input type="checkbox" checked={draft.moment} disabled={locked} onChange={(e) => set({ moment: e.target.checked })} />
                  {t('editor.looks.moment')}
                </label>
                <label className="inline" title={t('editor.looks.seedingTitle')}>
                  <input type="checkbox" checked={draft.seeding} disabled={locked} onChange={(e) => set({ seeding: e.target.checked })} />
                  {t('editor.looks.seeding')}
                </label>
              </div>
            )}
          </Group>
        </div>

        {!locked && <EditorFoot
          issues={issues}
          status={status}
          busy={busy}
          dirty={dirty}
          canSave={isSafeId(draft.id) && draft.name.trim() !== ''}
          onUndo={() => (setDraft(original ?? blank(draft.kind)), setIssues([]))}
          onSave={() => apply(window.api.editor.saveLook({ kind: draft.kind, look: saved(draft) }), t('editor.common.saved'), draft.kind, draft.id)}
          remove={
            removable
              ? {
                  label: t('editor.common.delete'),
                  onClick: async () =>
                    (await ask({ title: t('editor.common.deleteNamed', { name: draft.name }), detail: t('editor.looks.deleteDetail'), confirm: t('editor.common.delete'), grave: true })) &&
                    apply(window.api.editor.deleteLook({ kind: draft.kind, id: draft.id }), t('editor.common.deleted'), draft.kind, '')
                }
              : undefined
          }
        />}
      </section>
    </main>
  )
}
