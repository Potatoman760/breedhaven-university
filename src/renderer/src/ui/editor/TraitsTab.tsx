import { Button } from '../Button'
import { useState } from 'react'
import { slugify, type EditorInfo, type EditorResult } from '../../../../shared/editor'
import type { ContentPack, LoveInterest, Trait } from '../../../../shared/model'
import { Text } from './fields'

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
  const toggle = (id: string) => set({ traitIds: has(id) ? draft.traitIds.filter((t) => t !== id) : [...draft.traitIds, id] })
  const picked = draft.traitIds.flatMap((id) => content.traits.filter((t) => t.id === id))
  const first = draft.name.split(' ')[0] || 'Their'

  const form = editing && trait && (
    <div className="card trait-form">
      <div className="row">
        <Text label="Name" value={trait.name} onChange={(name) => patch(editing.isNew ? { name, id: slugify(name) } : { name })} />
        <Text label="Id" value={trait.id} disabled={!editing.isNew} onChange={(id) => patch({ id: slugify(id) })} />
      </div>
      <Text
        label="Definition"
        value={trait.definition}
        onChange={(definition) => patch({ definition })}
        rows={3}
        hint="What the trait is and how it shows in what the character says and does. Given to the LLM as written."
      />
      {issues.map((issue) => (
        <p key={issue} className="notice">
          {issue}
        </p>
      ))}
      <div className="actions">
        <Button variant="primary" onClick={() => apply(window.api.editor.saveTrait(trait))}>
          Save trait
        </Button>
        {!editing.isNew && info.traits[trait.id] !== 'base' && (
          <Button onClick={() => apply(window.api.editor.deleteTrait(trait.id))}>
            {info.traits[trait.id] === 'addon' ? 'Delete trait' : 'Put back the original'}
          </Button>
        )}
        <Button variant="quiet" onClick={() => setEditing(null)}>
          Cancel
        </Button>
      </div>
    </div>
  )

  return (
    <div className="traits">
      <aside className="trait-rail">
        <Button variant="primary" disabled={editing?.isNew} onClick={() => open(BLANK, true)}>
          New trait
        </Button>
        <span className="field-label">
          {first === 'Their' ? 'Their traits' : `${first}'s traits`} · {picked.length}
        </span>
        <div className="trait-picked">
          {picked.length === 0 && <span className="hint">None yet. Pick them from the list.</span>}
          {picked.map((t) => (
            <span key={t.id} className="pill" title={t.definition}>
              {t.name}
              <button type="button" aria-label={`Remove ${t.name}`} title={`Remove ${t.name}`} onClick={() => toggle(t.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
        <span className="hint">
          Each trait's definition is given to the LLM whenever the character speaks. Traits are shared by every character: changing one changes it for all of them.
        </span>
      </aside>

      <div className="trait-list">
        {editing?.isNew && form}
        {content.traits.map((t) =>
          editing && !editing.isNew && editing.trait.id === t.id ? (
            <div key={t.id}>{form}</div>
          ) : (
            <div key={t.id} className={has(t.id) ? 'trait-row picked' : 'trait-row'}>
              <label className="trait-pick">
                <input type="checkbox" checked={has(t.id)} onChange={() => toggle(t.id)} />
                <span className="trait-text">
                  <strong>{t.name}</strong>
                  <span>{t.definition}</span>
                </span>
              </label>
              {/* Editing the game's own files, every trait is the game's own: there is no add-on to tell apart. */}
              {!info.base && info.traits[t.id] === 'addon' && <span className="chip">add-on</span>}
              <Button variant="quiet" size="small" onClick={() => open(t, false)}>
                Edit
              </Button>
            </div>
          )
        )}
      </div>
    </div>
  )
}
