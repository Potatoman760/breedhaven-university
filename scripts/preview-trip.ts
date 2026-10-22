/**
 * Opens the game in dev on the Saltmere trip's moments alone, to look at them without playing to the break:
 *
 *   npm run preview:trip                          every moment in turn, drive there to drive home (a click goes on)
 *   npm run preview:trip -- fireworks             only that one: drive-there, soak, cascade, market, private-bath,
 *                                                 fireworks, last-morning, drive-home
 *   npm run preview:trip -- fireworks:tamsin,faye that one, with them
 */
import { spawn } from 'node:child_process'

const what = process.argv[2]?.trim()
const child = spawn('npx', ['electron-vite', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, BREEDHAVEN_PREVIEW: what ? `trip:${what}` : 'trip' }
})
child.on('exit', (code) => process.exit(code ?? 0))
