/**
 * Opens the game in dev on the festival date's lanterns alone, to look at them without playing to the festival:
 *
 *   npm run preview:lantern                   one love interest and then two, picked at random, round and round
 *   npm run preview:lantern -- tamsin         her, by id or first name
 *   npm run preview:lantern -- tamsin,faye    the two of them, at either side
 */
import { spawn } from 'node:child_process'

const who = process.argv[2]?.trim()
const child = spawn('npx', ['electron-vite', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, BREEDHAVEN_PREVIEW: who ? `lantern:${who}` : 'lantern' }
})
child.on('exit', (code) => process.exit(code ?? 0))
