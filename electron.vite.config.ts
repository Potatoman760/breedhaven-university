import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { version } from './package.json'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    // The game's version, as package.json has it, for the foot of the title screen.
    define: { __APP_VERSION__: JSON.stringify(version) }
  }
})
