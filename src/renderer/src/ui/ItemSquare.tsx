import { ItemIcon } from './icons'

/** The picture of a thing: its own where it has one, and failing that the line icon it names. */
export function ItemArt({ icon, image, size = 28 }: { icon: string; image?: string; size?: number }) {
  return image ? <img className="item-art" src={`content://pack/${image}`} alt="" width={size} height={size} /> : <ItemIcon name={icon} size={size} />
}

interface Props {
  icon: string
  image?: string
  /** How many of it, shown in the corner when more than one. */
  count?: number
  /** A word along its foot: "ready", "3 days". */
  tag?: string
  picked?: boolean
  /** Shown faint: something not to hand yet. */
  faint?: boolean
  title?: string
  /** Left out, it is only looked at. */
  onClick?: () => void
}

/**
 * The square a thing is shown in wherever things are shown: the bag, a stall. Its picture fills it; how many there
 * are sits in the corner. With nothing in it, it is an empty place in the bag.
 */
export function ItemSquare({ icon, image, count, tag, picked, faint, title, onClick }: Props) {
  const inside = (
    <>
      <ItemArt icon={icon} image={image} size={image ? 104 : 56} />
      {count !== undefined && count > 1 && <span className="item-count">{count}</span>}
      {tag && <span className="item-tag">{tag}</span>}
    </>
  )
  const classes = `item-square${picked ? ' picked' : ''}${faint ? ' faint' : ''}`
  return onClick ? (
    <button type="button" className={classes} title={title} aria-pressed={picked} onClick={onClick}>
      {inside}
    </button>
  ) : (
    <span className={classes} title={title}>
      {inside}
    </span>
  )
}

/** A place in the bag with nothing in it. */
export function EmptySquare() {
  return <span className="item-square empty" />
}
