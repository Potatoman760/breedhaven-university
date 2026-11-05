/**
 * Opens the game in dev on the trips' moments alone, to look at them without playing to them:
 *
 *   npm run preview:trip                          every moment in turn, Saltmere's then the getaways' (a click goes on)
 *   npm run preview:trip -- fireworks             only that one: drive-there, soak, cascade, market, private-bath,
 *                                                 fireworks, last-morning, drive-home, beach, boardwalk, sunrise-swim,
 *                                                 trail, campfire, dawn-lake, and the bay cruise's fly-there,
 *                                                 bay, cabin, sea-cave, fly-home (the flights aboard the airship)
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
