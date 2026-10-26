import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/alegreya-sans/400.css'
import '@fontsource/alegreya-sans/500.css'
import '@fontsource/alegreya-sans/700.css'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/cormorant-garamond/700.css'
import { App } from './App'
import { LanternPreview } from './LanternPreview'
import { TripPreview } from './TripPreview'
import { LoadingPreview } from './LoadingPreview'
import { CrashScreen } from './ui/CrashScreen'
import { installMouseBack } from './mouseBack'
import { loadLanguage } from './language'
import './styles.css'

installMouseBack()

// A screen asked for on its own, by `npm run preview:loading` or `preview:lantern`: "loading" or "lantern", with ":<who>" after it.
const preview = new URLSearchParams(window.location.hash.slice(1)).get('preview') ?? undefined

// The language comes first, so that nothing is drawn in the wrong one. Without it, the game is in English.
loadLanguage().catch(() => undefined).finally(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashScreen>
      {preview?.startsWith('loading') ? (
        <LoadingPreview who={preview.split(':')[1] || undefined} />
      ) : preview?.startsWith('lantern') ? (
        <LanternPreview who={preview.split(':')[1] || undefined} />
      ) : preview?.startsWith('trip') ? (
        <TripPreview who={preview.slice('trip:'.length) || undefined} />
      ) : (
        <App />
      )}
    </CrashScreen>
  </StrictMode>
))
