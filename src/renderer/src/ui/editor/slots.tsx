import type { ReactNode } from 'react'
import { Button } from '../Button'

/**
 * The grid a set of pictures is laid out in, one card to a slot: an outfit's expressions,
 * a view's times of day. `wide` is for pictures that are wider than they are tall.
 */
export function SlotGrid({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return <div className={wide ? 'sprite-grid wide' : 'sprite-grid'}>{children}</div>
}

interface PictureProps {
  image: string
  /** What the slot is: "happy", "Night". */
  name: string
  /** Opens the picture to be looked at whole. */
  onView: () => void
  /** Whatever the slot has besides its picture: a name to edit, a description. Left out, the name is shown as a label. */
  children?: ReactNode
  /** The buttons under it: replace, generate again, remove. */
  actions: ReactNode
  /** Something laid over a corner of the picture, to say what it has besides: a clip. */
  badge?: ReactNode
}

/** A slot that has its picture. */
export function PictureSlot({ image, name, onView, children, actions, badge }: PictureProps) {
  return (
    <div className="sprite-card">
      <div className="sprite-frame">
        <button type="button" className="sprite-thumb" title="Look at the whole picture" onClick={onView}>
          <img src={`content://pack/${image}`} alt={name} />
        </button>
        {badge}
      </div>
      {children ?? <span className="caps">{name}</span>}
      <div className="row">{actions}</div>
    </div>
  )
}

interface EmptyProps {
  name: string
  disabled?: boolean
  /** Has the user pick a file for it. */
  onAdd: () => void
  /** Opens the art tool on it. */
  onGenerate: () => void
}

/** A slot that has not been drawn: a place for it, in the same grid as the ones that have. */
export function EmptySlot({ name, disabled, onAdd, onGenerate }: EmptyProps) {
  return (
    <div className="sprite-card sprite-slot">
      <span className="caps">{name}</span>
      <span className="hint">Not drawn yet</span>
      <div className="row">
        <Button disabled={disabled} onClick={onAdd}>
          Add
        </Button>
        <Button disabled={disabled} onClick={onGenerate}>
          Generate
        </Button>
      </div>
    </div>
  )
}
