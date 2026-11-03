import { SKIN_TONES, type SkinTone } from '../../../shared/model'
import { Button } from './Button'
import { t } from '../../../shared/i18n'

// What each tone looks like on its swatch.
const SWATCH: Record<SkinTone, string> = { light: '#f1d3b8', medium: '#c48e62', dark: '#6b4229' }

/** The player's skin tone, of three, each a swatch with its name: the one he has is marked. */
export function SkinTonePicker({ value, onChange }: { value: SkinTone; onChange: (tone: SkinTone) => void }) {
  return (
    <div className="skin-tones" role="radiogroup" aria-label={t('shell.skinTone.label')}>
      {SKIN_TONES.map((tone) => (
        <Button key={tone} size="small" variant={tone === value ? 'primary' : 'secondary'} role="radio" aria-checked={tone === value} onClick={() => onChange(tone)}>
          <span className="skin-swatch" style={{ background: SWATCH[tone] }} />
          {t(`shell.skinTone.${tone}`)}
        </Button>
      ))}
    </div>
  )
}
