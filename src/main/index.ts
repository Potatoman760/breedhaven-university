import { app, BrowserWindow, dialog, ipcMain, protocol, safeStorage, shell } from 'electron'
import { join } from 'node:path'
import { z } from 'zod'
import { chatCompletion, listModels } from './ai/openai'
import { completeWithFallback, NOT_CONFIGURED } from './ai/router'
import { parseDirectives, sceneCast, validLook } from '../shared/game/scene'
import { CONTENT_SCHEME, serveContent } from './content/assets'
import { loadContentPack } from './content/loader'
import { SaveStore } from './saves/store'
import { SettingsStore, type KeyCipher } from './settings/store'
import { SaveRequestSchema, SlotIdSchema } from '../shared/saves'
import {
  buildCoursePrompt,
  buildTimetablePrompt,
  draftCourses,
  fallbackTimetable,
  parseGeneratedCourses,
  parseTimetable
} from '../shared/game/courses'
import { fallbackInvite } from '../shared/game/courier'
import { buildEventPrompt, parseGeneratedEvents } from '../shared/game/events'
import { buildSummaryPrompt, fallbackSummary } from '../shared/game/memory'
import { buildOutingPrompt, fallbackOuting, parseOuting } from '../shared/game/outing'
import { buildCharacterPrompt } from '../shared/game/prompt'
import { IPC } from '../shared/ipc'
import type { BondProposal, ContentPack, Proposal } from '../shared/model'
import { meetingTool, relationshipTool } from './ai/tools'
import {
  isConfigured,
  ListModelsRequestSchema,
  LLM_PROFILE_IDS,
  SettingsUpdateSchema,
  type ListModelsResponse,
  toView
} from '../shared/settings'
import {
  CourierRequestSchema,
  type CourierResponse,
  type GenerateCoursesResponse,
  PlanOutingRequestSchema,
  type PlanOutingResponse,
  GenerateEventsRequestSchema,
  SceneRequestSchema,
  type ChatResponse,
  type SummarizeResponse,
  type TestConnectionResponse
} from '../shared/types'

// How many trailing messages are scanned for codex keywords.
const CODEX_SCAN_MESSAGES = 4
// Summaries should be faithful rather than creative.
const SUMMARY_TEMPERATURE = 0.3

// A list of events as JSON needs more room than a line of dialogue.
const EVENT_MIN_TOKENS = 800
// A whole catalogue needs more still.
const COURSE_MIN_TOKENS = 2500
// The player is looking at a waiting screen while the catalogue is written, so don't wait long.
const COURSE_TIMEOUT_MS = 75_000


function contentDir(): string {
  const root = app.isPackaged ? process.resourcesPath : app.getAppPath()
  return join(root, 'content', 'default')
}

// Must happen before the app is ready. Lets the renderer load pack artwork as images.
protocol.registerSchemesAsPrivileged([
  { scheme: CONTENT_SCHEME, privileges: { standard: true, secure: true } }
])

function serveContentAssets(packDir: string): void {
  protocol.handle(CONTENT_SCHEME, (request) => serveContent(packDir, request))
}

function keyCipher(): KeyCipher | undefined {
  if (!safeStorage.isEncryptionAvailable()) return undefined
  return {
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (stored) => safeStorage.decryptString(Buffer.from(stored, 'base64'))
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // electron-vite sets ELECTRON_RENDERER_URL when running the dev server.
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(content: ContentPack, settings: SettingsStore, saves: SaveStore): void {
  ipcMain.handle(IPC.getContent, () => content)

  ipcMain.handle(IPC.listSaves, () => saves.list())

  ipcMain.handle(IPC.saveGame, (_event, raw: unknown) => {
    const { slotId, ...data } = SaveRequestSchema.parse(raw)
    return saves.save(slotId, data)
  })

  ipcMain.handle(IPC.loadGame, (_event, raw: unknown) => saves.load(SlotIdSchema.parse(raw)))

  ipcMain.handle(IPC.deleteSave, (_event, raw: unknown) => saves.delete(SlotIdSchema.parse(raw)))

  ipcMain.handle(IPC.getSettings, () => toView(settings.get()))

  ipcMain.handle(IPC.saveSettings, (_event, raw: unknown) =>
    toView(settings.update(SettingsUpdateSchema.parse(raw)))
  )

  ipcMain.handle(IPC.listModels, async (_event, raw: unknown): Promise<ListModelsResponse> => {
    const { profileId, baseUrl, apiKey } = ListModelsRequestSchema.parse(raw)
    try {
      // A key the user hasn't retyped stays in the main process; fall back to the saved one.
      const key = apiKey ?? settings.get()[profileId].apiKey
      return { models: await listModels({ baseUrl, apiKey: key }) }
    } catch (error) {
      return { models: [], error: (error as Error).message }
    }
  })

  ipcMain.handle(
    IPC.testConnection,
    async (_event, raw: unknown): Promise<TestConnectionResponse> => {
      const profile = settings.get()[z.enum(LLM_PROFILE_IDS).parse(raw)]
      if (!isConfigured(profile)) return { ok: false, message: 'Base URL and model are required.' }
      try {
        const reply = await chatCompletion(profile, {
          system: 'This is a connection test.',
          messages: [{ role: 'user', content: 'Reply with the single word OK.' }]
        })
        return { ok: true, message: `Connected. The model replied: ${reply.slice(0, 80)}` }
      } catch (error) {
        return { ok: false, message: (error as Error).message }
      }
    }
  )

  ipcMain.handle(IPC.chat, async (_event, raw: unknown): Promise<ChatResponse> => {
    const { state, scene } = SceneRequestSchema.parse(raw)
    const group = scene.companionIds.length > 0
    const systemPrompt = buildCharacterPrompt({
      content,
      state,
      loveInterestId: scene.loveInterestId,
      companionIds: scene.companionIds,
      sceneBeats: scene.beats,
      // Outfits and animations are chosen for one character; a group stands as it came.
      look: group ? undefined : scene,
      gifts: scene.gifts,
      recentText: scene.messages
        .slice(-CODEX_SCAN_MESSAGES)
        .map((m) => m.content)
        .join('\n')
    })
    // Set if the character uses the scheduling tool while writing this reply.
    let proposal: Proposal | undefined
    let bondProposal: BondProposal | undefined
    const { reply, profileId } = await completeWithFallback(settings.get(), scene.nsfw, {
      system: systemPrompt,
      messages: scene.messages,
      tools: [
        meetingTool(content, state, scene.loveInterestId, (p) => (proposal = p)),
        relationshipTool(content, state, scene.loveInterestId, (p) => (bondProposal = p))
      ]
    })
    const { text, ended, ...look } = parseDirectives(reply)
    const li = content.loveInterests.find((c) => c.id === scene.loveInterestId)
    return {
      message: { role: 'assistant', content: text || '...' },
      systemPrompt,
      profileId,
      sceneEnded: ended,
      proposal,
      bondProposal,
      look: li && !group ? validLook(look, li, scene) : {}
    }
  })

  ipcMain.handle(IPC.generateEvents, async (_event, raw: unknown) => {
    const { state } = GenerateEventsRequestSchema.parse(raw)
    const profile = settings.get().main
    if (!isConfigured(profile)) throw new Error(NOT_CONFIGURED)

    const { system, user } = buildEventPrompt({ content, state })
    const reply = await chatCompletion(profile, {
      system,
      messages: [{ role: 'user', content: user }],
      maxTokens: Math.max(profile.maxTokens, EVENT_MIN_TOKENS)
    })
    return parseGeneratedEvents(reply, { content, state })
  })

  // Never fails: without an LLM the catalogue keeps its plain draft wording.
  ipcMain.handle(IPC.generateCourses, async (): Promise<GenerateCoursesResponse> => {
    let courses = draftCourses(content)
    if (courses.length === 0) return { courses }
    const profile = settings.get().main
    if (!isConfigured(profile)) {
      return { courses: fallbackTimetable(content, courses), error: NOT_CONFIGURED }
    }
    const ask = ({ system, user }: { system: string; user: string }) =>
      chatCompletion(profile, {
        system,
        messages: [{ role: 'user', content: user }],
        maxTokens: Math.max(profile.maxTokens, COURSE_MIN_TOKENS),
        timeoutMs: COURSE_TIMEOUT_MS
      })

    // Two requests at once: the catalogue's wording, and who takes what (chosen by subject,
    // so it needn't wait for the titles). Each falls back on its own, so a bad or slow
    // reply to one doesn't cost the other.
    const drafts = courses
    const [wording, timetable] = await Promise.allSettled([
      ask(buildCoursePrompt(content, drafts)),
      ask(buildTimetablePrompt(content, drafts))
    ])
    const errors: string[] = []
    try {
      if (wording.status === 'rejected') throw wording.reason
      courses = parseGeneratedCourses(wording.value, courses)
    } catch (error) {
      errors.push(`Course names are placeholders: ${(error as Error).message}`)
    }
    try {
      if (timetable.status === 'rejected') throw timetable.reason
      const chosen = parseTimetable(timetable.value, content, drafts)
      courses = courses.map((c, i) => ({ ...c, studentIds: chosen[i].studentIds }))
    } catch (error) {
      const dealt = fallbackTimetable(content, drafts)
      courses = courses.map((c, i) => ({ ...c, studentIds: dealt[i].studentIds }))
      errors.push(`Classmates' timetables were dealt out by rote: ${(error as Error).message}`)
    }
    return { courses, error: errors.join(' ') || undefined }
  })

  ipcMain.handle(IPC.courier, async (_event, raw: unknown): Promise<CourierResponse> => {
    const { state, loveInterestId, invite } = CourierRequestSchema.parse(raw)
    const thread = state.courier[loveInterestId] ?? []
    let proposal: Proposal | undefined
    try {
      const system = buildCharacterPrompt({
        content,
        state,
        loveInterestId,
        mode: invite ? 'invite' : 'courier',
        recentText: thread
          .slice(-CODEX_SCAN_MESSAGES)
          .map((note) => note.text)
          .join('\n')
      })
      // The exchange so far is in the prompt; this only says whose turn it is.
      const cue = invite
        ? '(Write your note now.)'
        : `(The courier has just brought you ${state.player.name}'s latest note. Write your answer.)`
      const { reply } = await completeWithFallback(settings.get(), false, {
        system,
        messages: [{ role: 'user', content: cue }],
        tools: [meetingTool(content, state, loveInterestId, (p) => (proposal = p))]
      })
      const { text } = parseDirectives(reply)
      // An invitation has to name a time the game has checked.
      if (invite && !proposal) throw new Error('The note did not settle on a time.')
      return { text: text || '...', proposal }
    } catch (error) {
      if (!invite) throw error
      // An unprompted note is never worth an error: send a plain one, or none.
      const plain = fallbackInvite(content, state, loveInterestId)
      return { text: plain?.text ?? '', proposal: plain?.proposal, error: (error as Error).message }
    }
  })

  // Never fails: without an LLM the plan is read off the names and places in the player's words.
  ipcMain.handle(IPC.planOuting, async (_event, raw: unknown): Promise<PlanOutingResponse> => {
    const { state, text } = PlanOutingRequestSchema.parse(raw)
    try {
      const { system, user } = buildOutingPrompt(content, state, text)
      const { reply } = await completeWithFallback(settings.get(), false, {
        system,
        messages: [{ role: 'user', content: user }],
        temperature: SUMMARY_TEMPERATURE
      })
      return { outing: parseOuting(reply, content, state, text) }
    } catch (error) {
      return { outing: fallbackOuting(content, state, text), error: (error as Error).message }
    }
  })

  // Never fails: a scene that can't be summarised by the LLM still leaves a plain memory.
  ipcMain.handle(IPC.summarize, async (_event, raw: unknown): Promise<SummarizeResponse> => {
    const request = SceneRequestSchema.parse(raw)
    let failure: string | undefined
    // Everyone in the scene keeps their own memory of it, written from their side.
    const written = await Promise.all(
      sceneCast(request.scene).map(async (forId): Promise<[string, string]> => {
        const input = { content, ...request, forId }
        try {
          const { system, user } = buildSummaryPrompt(input)
          const { reply } = await completeWithFallback(settings.get(), input.scene.nsfw, {
            system,
            messages: [{ role: 'user', content: user }],
            temperature: SUMMARY_TEMPERATURE
          })
          return [forId, reply]
        } catch (error) {
          failure = (error as Error).message
          return [forId, fallbackSummary(input)]
        }
      })
    )
    return { memories: Object.fromEntries(written), error: failure }
  })
}

app.whenReady().then(() => {
  let content: ContentPack
  try {
    content = loadContentPack(contentDir())
  } catch (error) {
    dialog.showErrorBox('Could not load game content', (error as Error).message)
    app.quit()
    return
  }

  serveContentAssets(contentDir())
  const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'), keyCipher())
  const saves = new SaveStore(join(app.getPath('userData'), 'saves'))
  registerIpc(content, settings, saves)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
