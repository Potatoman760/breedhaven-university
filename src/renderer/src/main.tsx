import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/alegreya-sans/400.css'
import '@fontsource/alegreya-sans/500.css'
import '@fontsource/alegreya-sans/700.css'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/cormorant-garamond/700.css'
import { App } from './App'
import { LoadingPreview } from './LoadingPreview'
import { CrashScreen } from './ui/CrashScreen'
import { installMouseBack } from './mouseBack'
import './styles.css'

installMouseBack()

// A screen asked for on its own, by `npm run preview:loading`: "loading", or "loading:<her id or first name>".
const preview = new URLSearchParams(window.location.hash.slice(1)).get('preview') ?? undefined

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashScreen>
      {preview?.startsWith('loading') ? <LoadingPreview who={preview.split(':')[1] || undefined} /> : <App />}
    </CrashScreen>
  </StrictMode>
)
