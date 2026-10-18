/**
 * Opens the game in dev on its loading screen alone, to look at it without starting a scene:
 *
 *   npm run preview:loading              someone with a walking profile, picked at random (a click shows another)
 *   npm run preview:loading -- tamsin    her, by id or first name
 */
import { spawn } from 'node:child_process'

const who = process.argv[2]?.trim()
const child = spawn('npx', ['electron-vite', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, BREEDHAVEN_PREVIEW: who ? `loading:${who}` : 'loading' }
})
child.on('exit', (code) => process.exit(code ?? 0))
