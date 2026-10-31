import type { ReactNode } from 'react'
import { MEMORY_LEVEL_LABELS, MEMORY_LEVELS, type MemoryLevel } from '../../../shared/model'
import { t } from '../../../shared/i18n'

interface Props {
  label: string
  /** What the choice of how much it matters is called, to a screen reader. */
  levelLabel: string
  value: string
  level: MemoryLevel
  placeholder?: string
  autoFocus?: boolean
  onChange: (value: string) => void
  onLevel: (level: MemoryLevel) => void
  /** Anything else that can be done to it, beside its level. */
  children?: ReactNode
}

/** A memory to be written or reworded, and how much it matters. */
export function MemoryField({ label, levelLabel, value, level, placeholder, autoFocus, onChange, onLevel, children }: Props) {
  return (
    <>
      <textarea className="memory" rows={3} aria-label={label} value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
      <div className="memory-level">
        <label className="inline">
          {t('screens.summaryView.memory')}
          <select aria-label={levelLabel} value={level} onChange={(e) => onLevel(e.target.value as MemoryLevel)}>
            {MEMORY_LEVELS.map((one) => (
              <option key={one} value={one}>
                {MEMORY_LEVEL_LABELS[one]}
              </option>
            ))}
          </select>
        </label>
        {children}
      </div>
    </>
  )
}
