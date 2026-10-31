import type { ReactNode } from 'react'
import { Button } from './Button'
import { t } from '../../../shared/i18n'

interface Props {
  /** What went wrong. */
  children: ReactNode
  className?: string
  disabled?: boolean
  onRetry: () => void
}

/** Something that could not be written or drawn, with the way to ask for it again. */
export function RetryNotice({ children, className = 'notice', disabled, onRetry }: Props) {
  return (
    <div className={className}>
      {children}
      <Button variant="quiet" size="small" disabled={disabled} onClick={onRetry}>
        {t('screens.sceneView.retry')}
      </Button>
    </div>
  )
}
