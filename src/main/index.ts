import { app, BrowserWindow, dialog, ipcMain, protocol, safeStorage, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { chatCompletion, listModels } from './ai/openai'
import { completeWithFallback, NOT_CONFIGURED } from './ai/router'
import { leavers, lookLines, parseDirectives, sceneCast, sceneWitnesses, validLook } from '../shared/game/scene'
import { canSleepOver } from '../shared/game/sleep'
import { CONTENT_SCHEME, serveContent } from './content/assets'
import { deleteLoveInterest,
  removeUnusedAssets,
  deleteTrait, deleteEvent, importAsset, loadBase, saveEvent, loadWithAddons, saveCatalogue, saveLocation, deleteLocation, saveLoveInterest, saveTrait,
  resetPlayer,
  savePlayer
} from './content/addons'
import { isSafeId, type EditorInfo, type EditorResult } from '../shared/editor'
import { SaveStore } from './saves/store'
import { SettingsStore, type KeyCipher } from './settings/store'
import { RenameSaveRequestSchema, SaveRequestSchema, SlotIdSchema } from '../shared/saves'
import { buildCourseWordingPrompt, parseCourseWording, WORDING_BATCH } from '../shared/game/catalogue'
import { CourseSchema } from '../shared/model'
import { contactsSaid, DM_CLOSE, DM_OPEN, fallbackInvite, messageText } from '../shared/game/courier'
import { buildFeedPrompt, draftPosts, feedReplyTokens, parseFeedReply } from '../shared/game/feed'
import { attendableEvents, buildEventPrompt, parseGeneratedEvents } from '../shared/game/events'
import { buildSpendingPrompt, buildSummaryPrompt, fallbackSummary, parseSpending, parseSummary, PLAIN_FEELINGS, sceneRapport, sceneRevelations, type Spending, type Summary } from '../shared/game/memory'
import { npcOf, sceneExtras, withNpc } from '../shared/game/npcs'
import { sceneHours } from '../shared/game/sceneMoves'
import { asEventOuting, buildOutingPrompt, fallbackOuting, parseOuting } from '../shared/game/outing'
import { personalise } from '../shared/game/personalise'
import { createInitialState } from '../shared/game/state'
import { buildCharacterPrompt, sceneTurns } from '../shared/game/prompt'
import { IPC } from '../shared/ipc'
import {
  CutoutRequestSchema,
  GenerateArtRequestSchema,
  framingFor,
  normaliseComfyUrl,
  sizeFor,
  type ComfyBundle,
  type ComfyBundleCheck,
  type ComfyBundleInstall,
  type ComfyTestResult,
  type CutoutResult,
  type GenerateArtResult
} from '../shared/comfy'
import { testComfy } from './comfy/client'
import { cutoutArt } from './comfy/cutout'
import { ComfyStore, generateArt } from './comfy/studio'
import { listWorkflows } from './comfy/workflows'
import { checkBundle, installBundle, readBundle } from './comfy/bundle'
import { basePoseId, isMoment, isSeeding, pregnantPoseId, type CalendarEvent, type BondProposal, type ContentPack, type LoveInterest, type Proposal } from '../shared/model'
import { pregnancyStage, wornOutfit } from '../shared/game/pregnancy'
import { buildDraftPrompt, DRAFT_MAX_IDEA_CHARS, DRAFT_MIN_TOKENS, parseDraft } from '../shared/game/draftCharacter'
import { excuseTool, meetingTool, moveTool, relationshipTool, revealTool, type Leaving } from './ai/tools'
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
  FeedPictureRequestSchema,
  type FeedPictureResponse,
  FeedRequestSchema,
  type FeedResponse,
  type CourseWordingResponse,
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
// Room enough for the lecture a class opens with, whatever the profile allows an ordinary reply.
const LESSON_MIN_TOKENS = 900
const EVENT_MIN_TOKENS = 800
// How many events the editor asks the LLM for at a time.
const DRAFTED_EVENTS = 5
// A whole catalogue needs more still.
const COURSE_MIN_TOKENS = 2500
// The player is looking at a waiting screen while the catalogue is written, so don't wait long.
const COURSE_TIMEOUT_MS = 75_000
// A whole character takes a while to write.
const DRAFT_TIMEOUT_MS = 180_000


function contentDir(): string {
  const root = app.isPackaged ? process.resourcesPath : app.getAppPath()
  return join(root, 'content', 'default')
}

// Must happen before the app is ready. Lets the renderer load pack artwork as images.
protocol.registerSchemesAsPrivileged([
  { scheme: CONTENT_SCHEME, privileges: { standard: true, secure: true } }
])

function serveContentAssets(packDir: string, addonDir: string): void {
  protocol.handle(CONTENT_SCHEME, (request) => serveContent(packDir, request, addonDir))
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

function registerIpc(
  loaded: { content: ContentPack; info: EditorInfo },
  packDir: string,
  settings: SettingsStore,
  saves: SaveStore,
  comfy: ComfyStore,
  /** The user's own add-on folder, where what the game makes as it is played (the selfies on the feed) is always filed. */
  userDir: string
): void {
  // Replaced whenever the editor changes an add-on; every handler below reads the current one.
  let { content, info } = loaded
  /** The content as the game with this state reads it: the player's name filled in wherever the content wrote the token. */
  const readBy = (state: { player: { name: string } }): ContentPack => personalise(content, state.player.name)
  const baseTraitIds = () => Object.keys(info.traits).filter((id) => info.traits[id] !== 'addon')

  ipcMain.handle(IPC.getContent, () => content)

  /** Makes a change to the add-ons, then loads the content afresh so the game and the editor agree. */
  const change = (apply: () => string[]): EditorResult => {
    const issues = apply()
    // Read afresh the way it was first read: the game's own files when they are what is being edited, and otherwise with the add-ons over them.
    if (issues.length === 0) ({ content, info } = info.base ? loadBase(packDir) : loadWithAddons(packDir, info.addonDir))
    return { issues, content, info }
  }
  ipcMain.handle(IPC.editorInfo, () => info)
  /** Saves a character, then clears out whatever of hers the saved file no longer uses. */
  const saveAndTidy = (raw: unknown, save: () => string[], find: (id: string) => Parameters<typeof removeUnusedAssets>[1] | undefined): EditorResult => {
    const result = change(save)
    const saved = result.issues.length === 0 ? find(String((raw as { id?: unknown } | null)?.id ?? '')) : undefined
    return saved ? { ...result, removed: removeUnusedAssets(info.addonDir, saved, info.assetPrefix).length } : result
  }
  ipcMain.handle(IPC.editorSaveLoveInterest, (_event, raw: unknown) =>
    saveAndTidy(raw, () => saveLoveInterest(info.addonDir, content, raw), (id) => [...content.loveInterests, ...content.npcs].find((li) => li.id === id))
  )
  ipcMain.handle(IPC.editorDeleteLoveInterest, (_event, raw: unknown) =>
    change(() => deleteLoveInterest(info.addonDir, z.string().parse(raw)))
  )
  // Never fails: a character that can't be written comes back as the reason why.
  ipcMain.handle(IPC.editorDraftLoveInterest, async (_event, raw: unknown): Promise<{ loveInterest?: LoveInterest; error?: string }> => {
    const idea = z.string().trim().min(1).max(DRAFT_MAX_IDEA_CHARS).safeParse(raw)
    if (!idea.success) return { error: 'Say something about who she is first.' }
    const profile = settings.get().main
    if (!isConfigured(profile)) return { error: NOT_CONFIGURED }
    try {
      const { system, user } = buildDraftPrompt(content, idea.data)
      const reply = await chatCompletion(profile, {
        system,
        messages: [{ role: 'user', content: user }],
        maxTokens: Math.max(profile.maxTokens, DRAFT_MIN_TOKENS),
        timeoutMs: DRAFT_TIMEOUT_MS
      })
      return { loveInterest: parseDraft(content, reply) }
    } catch (error) {
      return { error: (error as Error).message }
    }
  })
  ipcMain.handle(IPC.editorSaveTrait, (_event, raw: unknown) => change(() => saveTrait(info.addonDir, raw)))
  ipcMain.handle(IPC.editorDeleteTrait, (_event, raw: unknown) =>
    change(() => deleteTrait(info.addonDir, content, baseTraitIds(), z.string().parse(raw)))
  )
  ipcMain.handle(IPC.editorSaveLocation, (_event, raw: unknown) => change(() => saveLocation(info.addonDir, content, raw, info.base)))
  ipcMain.handle(IPC.editorDeleteLocation, (_event, raw: unknown) => change(() => deleteLocation(info.addonDir, z.string().parse(raw))))
  ipcMain.handle(IPC.editorSaveEvent, (_event, raw: unknown) => change(() => saveEvent(info.addonDir, content, raw, info.base)))
  ipcMain.handle(IPC.editorDeleteEvent, (_event, raw: unknown) => change(() => deleteEvent(info.addonDir, z.string().parse(raw), info.base)))
  // Never fails: the LLM thinks of events for the whole of the calendar, as it stands at the start of a game. Nothing is saved here.
  ipcMain.handle(IPC.editorDraftEvents, async (): Promise<{ events?: CalendarEvent[]; error?: string }> => {
    const profile = settings.get().main
    if (!isConfigured(profile)) return { error: NOT_CONFIGURED }
    try {
      const state = createInitialState(content)
      const { system, user } = buildEventPrompt({ content, state, count: DRAFTED_EVENTS, windowDays: content.calendar.lengthDays })
      const reply = await chatCompletion(profile, { system, messages: [{ role: 'user', content: user }], maxTokens: Math.max(profile.maxTokens, EVENT_MIN_TOKENS) })
      return { events: parseGeneratedEvents(reply, { content, state }) }
    } catch (error) {
      return { error: (error as Error).message }
    }
  })
  ipcMain.handle(IPC.editorSavePlayer, (_event, raw: unknown) => change(() => savePlayer(info.addonDir, content, raw)))
  ipcMain.handle(IPC.editorResetPlayer, () => change(() => resetPlayer(info.addonDir)))
  ipcMain.handle(IPC.editorSaveCatalogue, (_event, raw: unknown) => change(() => saveCatalogue(info.addonDir, raw)))
  // Never fails: without an LLM the courses keep the wording they came with.
  ipcMain.handle(IPC.editorWriteCourseWording, async (_event, raw: unknown): Promise<CourseWordingResponse> => {
    const courses = z.array(CourseSchema).max(WORDING_BATCH).parse(raw)
    const profile = settings.get().main
    if (courses.length === 0) return { courses }
    if (!isConfigured(profile)) return { courses, error: NOT_CONFIGURED }
    try {
      const { system, user } = buildCourseWordingPrompt(content, courses)
      const reply = await chatCompletion(profile, {
        system,
        messages: [{ role: 'user', content: user }],
        maxTokens: Math.max(profile.maxTokens, COURSE_MIN_TOKENS),
        timeoutMs: COURSE_TIMEOUT_MS
      })
      return { courses: parseCourseWording(reply, courses) }
    } catch (error) {
      return { courses, error: (error as Error).message }
    }
  })
  ipcMain.handle(IPC.editorImportAsset, async (event, raw: unknown): Promise<string | null> => {
    const { loveInterestId, kind } = z.object({ loveInterestId: z.string(), kind: z.enum(['image', 'video', 'media']) }).parse(raw)
    if (!isSafeId(loveInterestId)) throw new Error('Give the character a usable id first.')
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: kind === 'image' ? 'Choose a picture' : kind === 'video' ? 'Choose a video' : 'Choose a picture or a clip',
      properties: ['openFile' as const],
      filters: [
        kind === 'image'
          ? { name: 'Pictures', extensions: ['png', 'webp', 'jpg', 'jpeg', 'gif'] }
          : kind === 'video'
            ? { name: 'Videos', extensions: ['mp4', 'webm'] }
            : { name: 'Pictures and clips', extensions: ['png', 'webp', 'jpg', 'jpeg', 'gif', 'mp4', 'webm'] }
      ]
    }
    // A test or a script can name the file outright instead of going through the dialog.
    const forced = app.isPackaged ? undefined : process.env['BREEDHAVEN_IMPORT_FILE']
    const picked = forced ? { canceled: false, filePaths: [forced] } : await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
    if (picked.canceled || !picked.filePaths[0]) return null
    return importAsset(info.addonDir, loveInterestId, picked.filePaths[0], info.assetPrefix)
  })
  // The art studio. Nothing in a scene reaches these: they run only when the studio asks.
  ipcMain.handle(IPC.comfyGetSettings, () => comfy.get())
  ipcMain.handle(IPC.comfySaveSettings, (_event, raw: unknown) => comfy.update(raw))
  ipcMain.handle(IPC.comfyTest, async (_event, raw: unknown): Promise<ComfyTestResult> => {
    const { url, problem } = normaliseComfyUrl(z.string().parse(raw))
    return url === null ? { ok: false, message: problem ?? 'That is not an address.', device: null } : testComfy(url)
  })
  ipcMain.handle(IPC.comfyChooseFolder, async (event): Promise<string | null> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = { title: 'Choose the folder your ComfyUI workflows are exported to', properties: ['openDirectory' as const] }
    const picked = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
    return picked.canceled ? null : (picked.filePaths[0] ?? null)
  })
  ipcMain.handle(IPC.comfyWorkflows, () => listWorkflows(comfy.get().workflowDir, comfy.get().overrides))
  // The workflows the game ships with, which anyone can have written out for their own ComfyUI.
  ipcMain.handle(IPC.comfyBundle, (): ComfyBundle => readBundle(packDir))
  ipcMain.handle(IPC.comfyBundleInstall, async (event): Promise<ComfyBundleInstall> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = { title: 'Choose your ComfyUI folder: the workflows are put in a folder of their own inside it', properties: ['openDirectory' as const, 'createDirectory' as const] }
    const picked = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
    const into = picked.canceled ? undefined : picked.filePaths[0]
    if (!into) return { ok: false, message: '', settings: null }
    try {
      const installed = installBundle(packDir, into, comfy.get())
      const settings = comfy.update(installed.settings)
      return { ok: true, message: `${installed.files.length} workflow${installed.files.length === 1 ? '' : 's'} written to ${installed.dir}, and the game now uses that folder.`, settings }
    } catch (error) {
      return { ok: false, message: (error as Error).message, settings: null }
    }
  })
  ipcMain.handle(IPC.comfyBundleCheck, (): Promise<ComfyBundleCheck> => checkBundle(comfy.get().baseUrl, readBundle(packDir)))
  // One picture at a time: a second request while one is being drawn takes its place in the queue behind it.
  let drawing: AbortController | null = null
  ipcMain.handle(IPC.comfyGenerate, async (_event, raw: unknown): Promise<GenerateArtResult> => {
    const request = GenerateArtRequestSchema.parse(raw)
    const mine = new AbortController()
    drawing = mine
    try {
      return await generateArt(comfy.get(), info.addonDir, request, mine.signal, info.assetPrefix)
    } finally {
      if (drawing === mine) drawing = null
    }
  })
  ipcMain.handle(IPC.comfyCancel, () => drawing?.abort())
  ipcMain.handle(IPC.comfyCutout, (_event, raw: unknown): CutoutResult => {
    try {
      return cutoutArt(info.addonDir, CutoutRequestSchema.parse(raw), info.assetPrefix)
    } catch (error) {
      return { ok: false, message: (error as Error).message, path: null, colour: null, cleared: 0, feathered: 0, enclosed: 0 }
    }
  })
  ipcMain.handle(IPC.editorOpenFolder, async () => {
    mkdirSync(info.addonDir, { recursive: true })
    await shell.openPath(info.addonDir)
  })

  ipcMain.handle(IPC.listSaves, () => saves.list())

  ipcMain.handle(IPC.saveGame, (_event, raw: unknown) => {
    const { slotId, name, ...data } = SaveRequestSchema.parse(raw)
    return saves.save(slotId, data, new Date(), name)
  })

  ipcMain.handle(IPC.renameSave, (_event, raw: unknown) => {
    const { slotId, name } = RenameSaveRequestSchema.parse(raw)
    return saves.rename(slotId, name)
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

  ipcMain.handle(IPC.chat, async (event, raw: unknown): Promise<ChatResponse> => {
    const { state, scene } = SceneRequestSchema.parse(raw)
    // Said to the window the moment a move is called for, while the leaving and arriving are still to be written: it has something to show meanwhile.
    const moving = (where: string) => !event.sender.isDestroyed() && event.sender.send(IPC.chatMoving, where)
    // The content as this game reads it, with the player's name where the content wrote the token.
    const content = readBy(state)
    // A scene with an NPC is built the same way, with the NPC standing among the characters.
    const npc = scene.npc ? npcOf(content, scene.loveInterestId) : undefined
    const cast = npc ? withNpc(content, npc.id) : content
    const systemPrompt = buildCharacterPrompt({
      content: cast,
      state,
      npc: npc && { role: npc.role, knowledge: npc.ai.knowledge },
      extras: sceneExtras(content, state, scene),
      backgroundId: scene.backgroundId,
      roomOf: scene.roomOf,
      departed: scene.departed,
      hoursSoFar: sceneHours(state, scene),
      loveInterestId: scene.loveInterestId,
      companionIds: scene.companionIds,
      sceneBeats: scene.beats,
      lesson: scene.lesson,
      opening: scene.messages.length === 0,
      look: scene,
      looks: scene.looks,
      comfort: scene.comfort,
      gifts: scene.gifts,
      pendingProposal: scene.proposal && scene.proposal.time > state.time ? scene.proposal : undefined,
      recentText: scene.messages
        .slice(-CODEX_SCAN_MESSAGES)
        .map((m) => m.content)
        .join('\n')
    })
    // Set if the character uses the scheduling tool while writing this reply.
    let proposal: Proposal | undefined
    let bondProposal: BondProposal | undefined
    const rolls: string[] = []
    let movedTo: string | undefined
    // The place the scene has gone to in this reply, so that going there is not also booked as a plan.
    let movedPlace: string | undefined
    let hoursPassed = 0
    let left: Leaving | undefined
    // Set when they leave together for something of his that is theirs too: the scene ends with the going.
    let walkTo: { withIds: string[] } | undefined
    const move = npc
      ? undefined
      : moveTool(content, state, scene, (destination, hours, stayingIds) => {
          movedTo = destination.id
          movedPlace = destination.locationId
          // A room is named with what it is like after a colon: only its name is said.
          moving(`Going to ${destination.name.split(':')[0]}`)
          // A plan made a moment ago for the place they are now going to is the same thing asked for twice: the going is kept.
          if (proposal?.locationId === destination.locationId) proposal = undefined
          hoursPassed = hours
          // Whoever is left behind when the scene moves on is out of it, with no hard feelings unless she said otherwise.
          if (stayingIds.length > 0 && !left) left = { ids: stayingIds, feeling: 'content', reason: 'stayed behind when the others left' }
        }, (next, withIds) => {
          walkTo = { withIds }
          moving(`Going to ${content.locations.find((l) => l.id === next.locationId)?.name ?? next.title}`)
        })
    const { reply, profileId } = await completeWithFallback(settings.get(), scene.nsfw, {
      system: systemPrompt,
      // With nothing said yet, the character opens the scene.
      messages: sceneTurns(scene.messages, state.player.name, scene.lesson),
      // The lecture a class opens with is several times the length of an ordinary reply.
      ...(scene.lesson && scene.messages.length === 0 ? { maxTokens: Math.max(settings.get().main.maxTokens, LESSON_MIN_TOKENS) } : {}),
      // An NPC makes no plans and no promises with the player.
      tools: [
        ...(npc
          ? []
          : [
              meetingTool(content, state, scene.loveInterestId, (p) => (proposal = p), sceneCast(scene), () => movedPlace),
              relationshipTool(content, state, scene.loveInterestId, (p) => (bondProposal = p), sceneCast(scene))
            ]),
        ...(move ? [move] : [])
      ]
    })
    const { text, ended, seeded, named, comfort: readings, leaving, attending: saidGoing, agreed, slept, ...asked } = parseDirectives(reply)
    const li = cast.loveInterests.find((c) => c.id === scene.loveInterestId)
    // A tag without a name means the scene's love interest; with one, whoever in the scene it names.
    const present = sceneCast(scene)
    const idOf = (name: string): string | undefined =>
      name === ''
        ? scene.loveInterestId
        : present.find((id) => {
            const full = cast.loveInterests.find((c) => c.id === id)?.name.toLowerCase() ?? ''
            return [id, full, full.split(' ')[0]].includes(name.toLowerCase())
          })
    const seededIds = seeded.map(idOf).filter((id): id is string => id !== undefined)
    // Who the reply says leaves: at least one has to stay, and whoever was left behind by a move has already gone.
    const goers = leavers(scene, leaving.map((one) => idOf(one.name)).filter((id): id is string => id !== undefined))
    if (!npc && goers.length > 0 && !left) {
      const said = leaving.find((one) => idOf(one.name) === goers[0])
      left = { ids: goers, feeling: said?.feeling ?? 'content', reason: said?.reason ?? '' }
    }
    // Who the reply says will be at an event: only events that can be gone to, by people who are here.
    const goable = attendableEvents(content, state)
    const attending = npc
      ? []
      : saidGoing.flatMap((one) => {
          const id = idOf(one.name)
          const event = goable.find((e) => e.id.toLowerCase() === one.eventId || e.name.toLowerCase().replace(/^the /, '') === one.eventId.replace(/^the /, ''))
          return id && event ? [{ eventId: event.id, ids: [id] }] : []
        })
    // The plan she suggested earlier, agreed to in words: booked, unless a new one was suggested in its place.
    const proposalAccepted = !npc && agreed && scene.proposal !== undefined && scene.proposal.time > state.time && !proposal
    // They go to sleep for the night where they are, when it is late enough for that.
    const sleptOver = !npc && slept && canSleepOver(content, state) && !walkTo && !movedTo
    // How comfortable each of them says she is, kept for the next prompt and for nothing else.
    const comfort: ChatResponse['comfort'] = {}
    for (const { name, level, reason } of readings) {
      const id = idOf(name)
      if (id && !npc) comfort[id] = { level, reason }
    }
    // Each love interest's face and outfit: the lead's on the scene itself, the others' beside it.
    let look: typeof asked = asked
    const looks: Record<string, { outfitId?: string; expression?: string }> = {}
    for (const one of named) {
      const id = idOf(one.name)
      const theirs = cast.loveInterests.find((c) => c.id === id)
      if (!id || !theirs) continue
      if (id === scene.loveInterestId) look = { ...look, outfitId: one.outfitId ?? look.outfitId, expression: one.expression ?? look.expression }
      else {
        const valid = validLook({ outfitId: one.outfitId, expression: one.expression }, theirs, { outfitId: scene.looks?.[id]?.outfitId })
        looks[id] = { outfitId: valid.outfitId && wornOutfit(content, state, theirs, valid.outfitId)?.id, expression: valid.expression }
      }
    }
    const fitted = (valid: ReturnType<typeof validLook>, who: LoveInterest): ReturnType<typeof validLook> =>
      valid.outfitId === undefined || npc ? valid : { ...valid, outfitId: wornOutfit(content, state, who, valid.outfitId)?.id }
    // A pose is one character's and is shown over everyone: the one named with it, or the scene's lead. It has to be one she has something to show for.
    const poser = cast.loveInterests.find((c) => c.id === (look.animationOf ? idOf(look.animationOf) : scene.loveInterestId))
    const drawn = (a: { image?: string; clip?: string }) => a.image !== undefined || a.clip !== undefined
    // The pose asked for, by its own name: a plain one, or one drawn pregnant.
    const pose = poser?.animations.find((a) => a.id.toLowerCase() === look.animationId?.toLowerCase() && drawn(a))
    // Asked for plain while her pregnancy shows, it is put up as the same pose drawn pregnant, where she has that picture.
    const showing = poser !== undefined && !npc && pregnancyStage(content, state, poser.id)?.showing === true
    const shown = (showing && pose && poser?.animations.find((a) => a.id === pregnantPoseId(pose.id) && drawn(a))) || pose
    // A moment is shown once: asked for again in the very next reply, it is not put up a second time.
    const again = pose !== undefined && shown !== undefined && isMoment(basePoseId(pose.id)) && scene.animationId === shown.id && (scene.animationOf ?? scene.loveInterestId) === poser?.id
    const posed = look.animationId === null ? { animationId: null } : pose && shown && poser && !npc && !again ? { animationId: shown.id, animationOf: poser.id } : {}
    return {
      message: { role: 'assistant', content: text || '...', tags: lookLines(reply) || undefined },
      systemPrompt,
      profileId,
      // Setting off together for his class, and going to sleep for the night, both close the scene.
      sceneEnded: ended || walkTo !== undefined || sleptOver,
      walkTo,
      proposal,
      bondProposal,
      // A pose that shows him finishing inside her says what the tag says, whether or not the tag was written. The game still decides what comes of it.
      seededIds: npc ? [] : [...new Set([...seededIds, ...(pose && poser && isSeeding(basePoseId(pose.id)) ? [poser.id] : [])])],
      rolls,
      // Setting off for his class or plan is the going: the scene is not also taken somewhere.
      moveTo: walkTo || sleptOver ? undefined : movedTo,
      sleptOver: sleptOver || undefined,
      proposalAccepted: proposalAccepted || undefined,
      attending: attending.length > 0 ? attending : undefined,
      left,
      // A handle written out in the reply is a handle given.
      contacts: npc ? [] : contactsSaid(content, state, sceneCast(scene), text),
      comfort,
      hours: hoursPassed > 0 ? hoursPassed : undefined,
      look: li ? { ...fitted(validLook({ outfitId: look.outfitId, expression: look.expression }, li, scene), li), ...posed } : {},
      looks
    }
  })

  ipcMain.handle(IPC.generateEvents, async (_event, raw: unknown) => {
    const { state } = GenerateEventsRequestSchema.parse(raw)
    // The content as this game reads it, with the player's name where the content wrote the token.
    const content = readBy(state)
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

  ipcMain.handle(IPC.courier, async (_event, raw: unknown): Promise<CourierResponse> => {
    const { state, loveInterestId, invite, note, news } = CourierRequestSchema.parse(raw)
    // The content as this game reads it, with the player's name where the content wrote the token.
    const content = readBy(state)
    const unprompted = invite || note || news !== undefined
    const thread = state.courier[loveInterestId] ?? []
    let proposal: Proposal | undefined
    const told: string[] = []
    // An NPC in his DMs is his boss, and makes no plans with him. Whoever his boss is, NPC or not, can be told he will miss a shift.
    const npc = npcOf(content, loveInterestId)
    let excused: string | undefined
    const excuse = excuseTool(content, state, loveInterestId, (key) => (excused = key))
    const reveal = npc ? undefined : revealTool(content, state, [loveInterestId], (revelation) => told.push(revelation.factId))
    try {
      const system = buildCharacterPrompt({
        content: npc ? withNpc(content, npc.id) : content,
        npc: npc && { role: npc.role, knowledge: npc.ai.knowledge },
        state,
        loveInterestId,
        mode: news !== undefined ? 'news' : invite ? 'invite' : note ? 'note' : 'courier',
        news,
        recentText: thread
          .slice(-CODEX_SCAN_MESSAGES)
          .map((note) => note.text)
          .join('\n')
      })
      // The exchange so far is in the prompt; this only says whose turn it is.
      const cue = unprompted
        ? `(Write your message now, between ${DM_OPEN} and ${DM_CLOSE}.)`
        : `(${state.player.name} has just messaged you. Write your answer, between ${DM_OPEN} and ${DM_CLOSE}.)`
      const { reply } = await completeWithFallback(settings.get(), false, {
        system,
        messages: [{ role: 'user', content: cue }],
        tools: [...(npc ? [] : [meetingTool(content, state, loveInterestId, (p) => (proposal = p)), ...(reveal ? [reveal] : [])]), ...(excuse ? [excuse] : [])]
      })
      // Only the message is kept: whatever the LLM said to itself around it is dropped.
      const who = [...content.loveInterests, ...content.npcs].find((c) => c.id === loveInterestId)
      const read = parseDirectives(reply)
      const text = messageText(read.text, who?.name ?? '')
      // Saying she will be at an event puts her down for it, as it does face to face.
      const goable = attendableEvents(content, state)
      const attending = npc ? [] : read.attending.flatMap((one) => (goable.some((e) => e.id.toLowerCase() === one.eventId) ? [{ eventId: goable.find((e) => e.id.toLowerCase() === one.eventId)!.id, ids: [loveInterestId] }] : []))
      // An invitation has to name a time the game has checked.
      if (invite && news === undefined && !proposal) throw new Error('The note did not settle on a time.')
      return { text: text || '...', proposal, revealed: told, excused, attending: attending.length > 0 ? attending : undefined }
    } catch (error) {
      if (!unprompted) throw error
      // An unprompted note is never worth an error: send a plain one, or none.
      const plain = invite && news === undefined ? fallbackInvite(content, state, loveInterestId) : undefined
      return { text: plain?.text ?? '', proposal: plain?.proposal, error: (error as Error).message }
    }
  })

  // Bloomr is selfies: it needs the Main LLM for the captions and ComfyUI for the pictures, and without both there are no posts.
  const comfyReady = (): boolean => normaliseComfyUrl(comfy.get().baseUrl).url !== null && comfy.get().workflowDir !== null
  // Never fails: writes the captions of the day's planned posts, and the prompt each selfie is drawn from.
  ipcMain.handle(IPC.feed, async (_event, raw: unknown): Promise<FeedResponse> => {
    const { state, plans } = FeedRequestSchema.parse(raw)
    // The content as this game reads it, with the player's name where the content wrote the token.
    const content = readBy(state)
    const planned = plans.filter((plan) => content.loveInterests.some((li) => li.id === plan.authorId))
    const profile = settings.get().main
    if (!isConfigured(profile)) return { drafts: [], error: NOT_CONFIGURED }
    if (!comfyReady()) return { drafts: [], error: 'ComfyUI is not set up.' }
    if (planned.length === 0) return { drafts: [] }
    try {
      const { system, user } = buildFeedPrompt(content, state, planned)
      const reply = await chatCompletion(profile, { system, messages: [{ role: 'user', content: user }], maxTokens: Math.max(profile.maxTokens, feedReplyTokens(planned)) })
      return { drafts: draftPosts(content, state, planned, parseFeedReply(reply, planned), framingFor(comfy.get(), 'photo')) }
    } catch (error) {
      return { drafts: [], error: (error as Error).message }
    }
  })
  // Never fails: one selfie, drawn on ComfyUI with the photo workflow and filed with the author's photos.
  ipcMain.handle(IPC.feedPicture, async (_event, raw: unknown): Promise<FeedPictureResponse> => {
    const { authorId, name, prompt } = FeedPictureRequestSchema.parse(raw)
    // Made by the game as it is played, not by the editor: it goes with the player's own files whatever is being edited.
    const made = await generateArt(comfy.get(), userDir, { kind: 'photo', subjectId: authorId, name, workflow: '', positive: prompt, negative: '', ...sizeFor(comfy.get(), 'photo') })
    return made.ok ? { image: made.path } : { image: null, error: made.message }
  })

  // Never fails: without an LLM the plan is read off the names and places in the player's words.
  ipcMain.handle(IPC.planOuting, async (_event, raw: unknown): Promise<PlanOutingResponse> => {
    const { state, text } = PlanOutingRequestSchema.parse(raw)
    // The content as this game reads it, with the player's name where the content wrote the token.
    const content = readBy(state)
    try {
      const { system, user } = buildOutingPrompt(content, state, text)
      const { reply } = await completeWithFallback(settings.get(), false, {
        system,
        messages: [{ role: 'user', content: user }],
        temperature: SUMMARY_TEMPERATURE
      })
      // Something typed that is going to an event on today keeps the event's hours.
      return { outing: asEventOuting(content, state, parseOuting(reply, content, state, text)) }
    } catch (error) {
      return { outing: asEventOuting(content, state, fallbackOuting(content, state, text)), error: (error as Error).message }
    }
  })

  // Never fails: a scene that can't be summarised by the LLM still leaves a plain memory.
  ipcMain.handle(IPC.summarize, async (_event, raw: unknown): Promise<SummarizeResponse> => {
    const request = SceneRequestSchema.parse(raw)
    // The content as this game reads it, with the player's name where the content wrote the token.
    const content = readBy(request.state)
    let failure: string | undefined
    // What he paid for is worked out alongside, from what was said. No answer is no spending: he is never charged on a guess.
    const spending = (async (): Promise<Spending | undefined> => {
      if (!request.scene.messages.some((m) => m.role === 'user')) return undefined
      try {
        const { system, user } = buildSpendingPrompt(content, request.state, request.scene)
        // Once the scene is over the Main LLM is asked again, whichever wrote the scene: the NSFW one only if it declines.
        const { reply } = await completeWithFallback(settings.get(), false, { system, messages: [{ role: 'user', content: user }], temperature: SUMMARY_TEMPERATURE })
        return parseSpending(reply, request.state.player.money)
      } catch {
        return undefined
      }
    })()
    // Every love interest in the scene keeps her own memory of it, written from her side. An NPC keeps none: nothing is asked of the LLM for one.
    const written = await Promise.all(
      (request.scene.npc ? [] : sceneWitnesses(request.scene)).map(async (forId): Promise<[string, Summary]> => {
        const input = { content: request.scene.npc ? withNpc(content, request.scene.loveInterestId) : content, ...request, forId }
        try {
          const { system, user } = buildSummaryPrompt(input)
          // The same for the memories: the Main LLM first, and the NSFW one for a scene it will not go over.
          const { reply } = await completeWithFallback(settings.get(), false, {
            system,
            messages: [{ role: 'user', content: user }],
            temperature: SUMMARY_TEMPERATURE
          })
          const read = parseSummary(reply)
          const feels = !input.scene.npc && request.state.relationships[forId] !== undefined
          // A memory is always kept, and a love interest always comes away feeling something.
          // Sex is counted when she says it happened, or when she conceived in the scene.
          const intimate = feels && (read.intimate === true || input.scene.conceived.includes(forId))
          return [forId, { memory: read.memory || fallbackSummary(input), feelings: feels ? (read.feelings ?? PLAIN_FEELINGS) : undefined, intimate, learned: feels ? read.learned : undefined, rapport: feels ? read.rapport : undefined }]
        } catch (error) {
          failure = (error as Error).message
          const feels = !input.scene.npc && request.state.relationships[forId] !== undefined
          return [forId, { memory: fallbackSummary(input), feelings: feels ? PLAIN_FEELINGS : undefined }]
        }
      })
    )
    return {
      memories: Object.fromEntries(written.map(([id, summary]) => [id, summary.memory])),
      feelings: Object.fromEntries(written.flatMap(([id, summary]) => (summary.feelings ? [[id, summary.feelings]] : []))),
      intimate: written.filter(([, summary]) => summary.intimate === true).map(([id]) => id),
      revealed: sceneRevelations(content, request.state, written.map(([id, summary]) => ({ id, learned: summary.learned ?? [] }))),
      rapport: sceneRapport(request.state, sceneWitnesses(request.scene), written.map(([id, summary]) => ({ id, rapport: summary.rapport ?? [] }))),
      spending: await spending,
      error: failure
    }
  })
}

app.whenReady().then(() => {
  const addonDir = join(app.getPath('userData'), 'addons')
  let loaded: { content: ContentPack; info: EditorInfo }
  try {
    // Run from its source, the game is being written: the editor changes the base game itself, and add-ons are left out of it.
    // (BREEDHAVEN_ADDONS=1 runs it as a player has it, add-ons and all.) A packaged game keeps what the user makes apart, as add-ons.
    const authoring = !app.isPackaged && process.env['BREEDHAVEN_ADDONS'] !== '1'
    loaded = authoring ? loadBase(contentDir()) : loadWithAddons(contentDir(), addonDir)
  } catch (error) {
    dialog.showErrorBox('Could not load game content', (error as Error).message)
    app.quit()
    return
  }

  serveContentAssets(contentDir(), addonDir)
  const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'), keyCipher())
  const saves = new SaveStore(join(app.getPath('userData'), 'saves'))
  const comfy = new ComfyStore(join(app.getPath('userData'), 'comfy.json'))
  registerIpc(loaded, contentDir(), settings, saves, comfy, addonDir)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
