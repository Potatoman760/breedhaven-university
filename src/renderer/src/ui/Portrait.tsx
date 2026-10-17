import type { CSSProperties, ReactNode } from 'react'
import type { Outfit } from '../../../shared/model'

/** Whose face it is: a name, and how far down the sprite the face is. Her outfits give the picture when none is passed. */
export interface FaceOwner {
  name: string
  faceY: number
  outfits?: Outfit[]
  defaultOutfitId?: string
}

interface Props {
  who: FaceOwner
  /** The picture to cut the face from, where it is not her neutral sprite: what she is wearing, how she looks now. */
  image?: string
  /** Its height, in pixels or as any CSS length; its width follows. `fill` takes the width of what it is in instead. */
  size?: number | string
  /** Her first name under it. */
  caption?: boolean
  className?: string
  /** Drawn over it, such as a badge in its corner. */
  children?: ReactNode
}

/** Her neutral sprite in her own outfit, the picture a face is cut from when no other is given. */
export function neutralSprite(who: FaceOwner): string | undefined {
  const outfit = who.outfits?.find((o) => o.id === who.defaultOutfitId) ?? who.outfits?.[0]
  return (outfit?.sprites['neutral'] ?? Object.values(outfit?.sprites ?? {})[0])?.image
}

/**
 * A face cut from the top of a full-body sprite, the one portrait of the game: always upright, six wide to seven tall,
 * so that where the editor puts a face is where it is everywhere. Without a picture it shows her initial.
 */
export function Portrait({ who, image, size = 56, caption, className, children }: Props) {
  const picture = image ?? neutralSprite(who)
  const height = typeof size === 'number' ? `${size}px` : size
  // Both sides are given, so that a row or column it stands in can never stretch it out of shape.
  const style = {
    ...(size === 'fill' ? { width: '100%', aspectRatio: '6 / 7' } : { width: `calc(${height} * 6 / 7)`, height, fontSize: `calc(${height} * 0.45)` }),
    ...(picture && { backgroundImage: `url("content://pack/${picture}")`, backgroundPosition: `50% ${who.faceY}%` })
  } as CSSProperties
  const face = (
    <span className={['portrait-face', !picture && 'initial', className].filter(Boolean).join(' ')} role="img" aria-label={who.name} title={caption ? undefined : who.name} style={style}>
      {!picture && who.name[0]}
      {children}
    </span>
  )
  if (!caption) return face
  return (
    <span className="portrait">
      {face}
      <span className="caps">{who.name.split(' ')[0]}</span>
    </span>
  )
}
