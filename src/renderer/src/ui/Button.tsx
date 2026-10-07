import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * What kind of action it is. `primary` is the one thing the screen is for, `secondary`
   * anything else worth a button, `quiet` a minor or undoing action, `danger` one that
   * destroys something.
   */
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  /** `small` for a button inside a card or a row of several. */
  size?: 'medium' | 'small'
}

/**
 * The one button of the interface. Every button is drawn by this, so that they share a
 * height, a padding and a look wherever they sit, whatever the styles of what is around them.
 */
export function Button({ variant = 'secondary', size = 'medium', className, type = 'button', ...rest }: Props) {
  const classes = ['btn', variant !== 'primary' && variant, size === 'small' && 'small', className].filter(Boolean).join(' ')
  return <button type={type} className={classes} {...rest} />
}
