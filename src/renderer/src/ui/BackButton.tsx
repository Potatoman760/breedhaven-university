import { Button } from './Button'
import { BackIcon } from './icons'

/** The way out of a main screen (the phone, the map, the bag, the calendar): a round button in its bottom left corner. */
export function BackButton({ onClick, label = 'Close', className }: { onClick: () => void; label?: string; className?: string }) {
  return (
    <Button className={['back-button', className].filter(Boolean).join(' ')} aria-label={label} title={label} onClick={onClick}>
      <BackIcon size={22} />
    </Button>
  )
}
