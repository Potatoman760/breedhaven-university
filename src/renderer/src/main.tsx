import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/alegreya-sans/400.css'
import '@fontsource/alegreya-sans/500.css'
import '@fontsource/alegreya-sans/700.css'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/cormorant-garamond/700.css'
import { App } from './App'
import { CrashScreen } from './ui/CrashScreen'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashScreen>
      <App />
    </CrashScreen>
  </StrictMode>
)
