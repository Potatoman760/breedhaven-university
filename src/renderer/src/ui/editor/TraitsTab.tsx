import { Button } from '../Button'
import { useState } from 'react'
import { slugify, type EditorInfo, type EditorResult } from '../../../../shared/editor'
import type { ContentPack, LoveInterest, Trait } from '../../../../shared/model'
import { Text } from './fields'
import { t } from '../../../../shared/i18n'

interface Props {
  content: ContentPack
  info: EditorInfo
  draft: LoveInterest
  set: (patch: Partial<LoveInterest>) => void
  /** Called with the result of any change to the trait library. */
  onResult: (result: EditorResult) => void
}

const BLANK: Trait = { id: '', name: '', definition: '', drama: { jealousy: 0, sociable: 0 } }

/**
 * Which traits the character has, and the library those are picked from: what she has in
 * a rail on the left, and every trait there is in a list beside it, the height of the screen.
 */
export function TraitsTab({ content, info, draft, set, onResult }: Props) {
  // The trait open in a form in the list: one from the library, or a new one.
  const [editing, setEditing] = useState<{ trait: Trait; isNew: boolean } | null>(null)
  const [issues, setIssues] = useState<string[]>([])

  async function apply(change: Promise<EditorResult>) {
    const result = await change
    setIssues(result.issues)
    onResult(result)
    if (result.issues.length === 0) setEditing(null)
  }

  const open = (trait: Trait, isNew: boolean) => {
    setIssues([])
    setEditing({ trait, isNew })
  }
  const trait = editing?.trait
  const patch = (change: Partial<Trait>) => editing && setEditing({ ...editing, trait: { ...editing.trait, ...change } })
  const has = (id: string) => draft.traitIds.includes(id)
  const toggle = (id: string) => set({ traitIds: has(id) ? draft.traitIds.filter((one) => one !== id) : [...draft.traitIds, id] })
  const picked = draft.traitIds.flatMap((id) => content.traits.filter((one) => one.id === id))
  const first = draft.name.split(' ')[0] || 'Their'

  const form = editing && trait && (
    <div className="card trait-form">
      <div className="row">
        <Text label={t('editor.common.name')} value={trait.name} onChange={(name) => patch(editing.isNew ? { name, id: slugify(name) } : { name })} />
        <Text label={t('editor.common.id')} value={trait.id} disabled={!editing.isNew} onChange={(id) => patch({ id: slugify(id) })} />
      </div>
      <Text
        label={t('editor.traits.definition')}
        value={trait.definition}
        onChange={(definition) => patch({ definition })}
        rows={3}
        hint={t('editor.traits.definitionHint')}
      />
      {issues.map((issue) => (
        <p key={issue} className="notice">
          {issue}
        </p>
      ))}
      <div className="actions">
        <Button variant="primary" onClick={() => apply(window.api.editor.saveTrait(trait))}>
          {t('editor.traits.save')}
        </Button>
        {!editing.isNew && info.traits[trait.id] !== 'base' && (
          <Button onClick={() => apply(window.api.editor.deleteTrait(trait.id))}>
            {info.traits[trait.id] === 'addon' ? t('editor.traits.delete') : t('editor.common.putBack')}
          </Button>
        )}
        <Button variant="quiet" onClick={() => setEditing(null)}>
          {t('editor.common.cancel')}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="traits">
      <aside className="trait-rail">
        <Button variant="primary" disabled={editing?.isNew} onClick={() => open(BLANK, true)}>
          {t('editor.traits.new')}
        </Button>
        <span className="field-label">
          {first === 'Their' ? t('editor.traits.theirs') : t('editor.traits.hers', { name: first })} · {picked.length}
        </span>
        <div className="trait-picked">
          {picked.length === 0 && <span className="hint">{t('editor.traits.none')}</span>}
          {picked.map((one) => (
            <span key={one.id} className="pill" title={one.definition}>
              {one.name}
              <button type="button" aria-label={t('editor.common.removeNamed', { name: one.name })} title={t('editor.common.removeNamed', { name: one.name })} onClick={() => toggle(one.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
        <span className="hint">
          {t('editor.traits.hint')}
        </span>
      </aside>

      <div className="trait-list">
        {editing?.isNew && form}
        {content.traits.map((one) =>
          editing && !editing.isNew && editing.trait.id === one.id ? (
            <div key={one.id}>{form}</div>
          ) : (
            <div key={one.id} className={has(one.id) ? 'trait-row picked' : 'trait-row'}>
              <label className="trait-pick">
                <input type="checkbox" checked={has(one.id)} onChange={() => toggle(one.id)} />
                <span className="trait-text">
                  <strong>{one.name}</strong>
                  <span>{one.definition}</span>
                </span>
              </label>
              {/* Editing the game's own files, every trait is the game's own: there is no add-on to tell apart. */}
              {!info.base && info.traits[one.id] === 'addon' && <span className="chip">{t('editor.common.addon')}</span>}
              <Button variant="quiet" size="small" onClick={() => open(one, false)}>
                {t('editor.common.edit')}
              </Button>
            </div>
          )
        )}
      </div>
    </div>
  )
}
