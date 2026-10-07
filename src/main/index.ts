import { app, BrowserWindow, dialog, ipcMain, protocol, safeStorage, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { chatCompletion, listModels } from './ai/openai'
import { completeWithFallback, NOT_CONFIGURED } from './ai/router'
import { parseDirectives, sceneCast, sceneWitnesses, validLook } from '../shared/game/scene'
import { CONTENT_SCHEME, serveContent } from './content/assets'
import { deleteLoveInterest,
  removeUnusedAssets,
  deleteTrait, importAsset, loadWithAddons, saveCatalogue, saveLocation, deleteLocation, saveLoveInterest, saveTrait } from './content/addons'
import { isSafeId, type EditorInfo, type EditorResult } from '../shared/editor'
import { SaveStore } from './saves/store'
import { SettingsStore, type KeyCipher } from './settings/store'
import { SaveRequestSchema, SlotIdSchema } from '../shared/saves'
import { buildCourseWordingPrompt, parseCourseWording, WORDING_BATCH } from '../shared/game/catalogue'
import { CourseSchema } from '../shared/model'
import { fallbackInvite } from '../shared/game/courier'
import { buildFeedPrompt, fallbackPost, parseFeedReply } from '../shared/game/feed'
import { buildEventPrompt, parseGeneratedEvents } from '../shared/game/events'
import { buildSummaryPrompt, fallbackSummary, parseSummary, PLAIN_FEELINGS, type Summary } from '../shared/game/memory'
import { npcOf, sceneExtras, withNpc } from '../shared/game/npcs'
import { sceneHours } from '../shared/game/sceneMoves'
import { buildOutingPrompt, fallbackOuting, parseOuting } from '../shared/game/outing'
import { buildCharacterPrompt } from '../shared/game/prompt'
import { IPC } from '../shared/ipc'
import {
  CutoutRequestSchema,
  GenerateArtRequestSchema,
  normaliseComfyUrl,
  type ComfyTestResult,
  type CutoutResult,
  type GenerateArtResult
} from '../shared/comfy'
import { testComfy } from './comfy/client'
import { cutoutArt } from './comfy/cutout'
import { ComfyStore, generateArt } from './comfy/studio'
import { listWorkflows } from './comfy/workflows'
import type { BondProposal, ContentPack, LoveInterest, Proposal } from '../shared/model'
import { wornOutfit } from '../shared/game/pregnancy'
import { buildDraftPrompt, DRAFT_MAX_IDEA_CHARS, DRAFT_MIN_TOKENS, parseDraft } from '../shared/game/draftCharacter'
import {
  excuseTool,
  leaveTool,
  meetingTool,
  moveTool,
  relationshipTool,
  contactTool,
  rapportTool,
  revealTool,
  type Leaving,
  type Revelation
} from './ai/tools'
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
const EVENT_MIN_TOKENS = 800
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
  comfy: ComfyStore
): void {
  // Replaced whenever the editor changes an add-on; every handler below reads the current one.
  let { content, info } = loaded
  const baseTraitIds = () => Object.keys(info.traits).filter((id) => info.traits[id] !== 'addon')

  ipcMain.handle(IPC.getContent, () => content)

  /** Makes a change to the add-ons, then loads the content afresh so the game and the editor agree. */
  const change = (apply: () => string[]): EditorResult => {
    const issues = apply()
    if (issues.length === 0) ({ content, info } = loadWithAddons(packDir, info.addonDir))
    return { issues, content, info }
  }
  ipcMain.handle(IPC.editorInfo, () => info)
  /** Saves a character, then clears out whatever of hers the saved file no longer uses. */
  const saveAndTidy = (raw: unknown, save: () => string[], find: (id: string) => Parameters<typeof removeUnusedAssets>[1] | undefined): EditorResult => {
    const result = change(save)
    const saved = result.issues.length === 0 ? find(String((raw as { id?: unknown } | null)?.id ?? '')) : undefined
    return saved ? { ...result, removed: removeUnusedAssets(info.addonDir, saved).length } : result
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
  ipcMain.handle(IPC.editorSaveLocation, (_event, raw: unknown) => change(() => saveLocation(info.addonDir, content, raw)))
  ipcMain.handle(IPC.editorDeleteLocation, (_event, raw: unknown) => change(() => deleteLocation(info.addonDir, z.string().parse(raw))))
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
    const { loveInterestId, kind } = z.object({ loveInterestId: z.string(), kind: z.enum(['image', 'video']) }).parse(raw)
    if (!isSafeId(loveInterestId)) throw new Error('Give the character a usable id first.')
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: kind === 'image' ? 'Choose a picture' : 'Choose a video',
      properties: ['openFile' as const],
      filters: [
        kind === 'image'
          ? { name: 'Pictures', extensions: ['png', 'webp', 'jpg', 'jpeg', 'gif'] }
          : { name: 'Videos', extensions: ['mp4', 'webm'] }
      ]
    }
    // A test or a script can name the file outright instead of going through the dialog.
    const forced = app.isPackaged ? undefined : process.env['BREEDHAVEN_IMPORT_FILE']
    const picked = forced ? { canceled: false, filePaths: [forced] } : await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options))
    if (picked.canceled || !picked.filePaths[0]) return null
    return importAsset(info.addonDir, loveInterestId, picked.filePaths[0])
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
  // One picture at a time: a second request while one is being drawn takes its place in the queue behind it.
  let drawing: AbortController | null = null
  ipcMain.handle(IPC.comfyGenerate, async (_event, raw: unknown): Promise<GenerateArtResult> => {
    const request = GenerateArtRequestSchema.parse(raw)
    const mine = new AbortController()
    drawing = mine
    try {
      return await generateArt(comfy.get(), info.addonDir, request, mine.signal)
    } finally {
      if (drawing === mine) drawing = null
    }
  })
  ipcMain.handle(IPC.comfyCancel, () => drawing?.abort())
  ipcMain.handle(IPC.comfyCutout, (_event, raw: unknown): CutoutResult => {
    try {
      return cutoutArt(info.addonDir, CutoutRequestSchema.parse(raw))
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
      look: scene,
      looks: scene.looks,
      comfort: scene.comfort,
      gifts: scene.gifts,
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
    let hoursPassed = 0
    let left: Leaving | undefined
    const leave = leaveTool(content, state, scene, (leaving) => (left = leaving))
    const revealed: Revelation[] = []
    const reveal = npc ? undefined : revealTool(content, state, sceneCast(scene), (revelation) => revealed.push(revelation))
    const contacts: string[] = []
    const contact = npc ? undefined : contactTool(content, state, sceneCast(scene), (id) => contacts.push(id))
    const rapportChanges: ChatResponse['rapport'] = []
    const rapport = npc ? undefined : rapportTool(content, state, sceneCast(scene), (change) => rapportChanges.push(change))
    const move = npc
      ? undefined
      : moveTool(content, state, scene, (destination, hours) => {
          movedTo = destination.id
          hoursPassed = hours
        })
    const { reply, profileId } = await completeWithFallback(settings.get(), scene.nsfw, {
      system: systemPrompt,
      messages: scene.messages,
      // An NPC makes no plans and no promises with the player.
      tools: [
        ...(npc
          ? []
          : [
              meetingTool(content, state, scene.loveInterestId, (p) => (proposal = p), sceneCast(scene)),
              relationshipTool(content, state, scene.loveInterestId, (p) => (bondProposal = p), sceneCast(scene))
            ]),
        ...(move ? [move] : []),
        ...(leave ? [leave] : []),
        ...(reveal ? [reveal] : []),
        ...(contact ? [contact] : []),
        ...(rapport ? [rapport] : [])
      ]
    })
    const { text, ended, seeded, named, comfort: readings, ...asked } = parseDirectives(reply)
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
    // An animation takes the whole stage, so it is only played when she is alone with him.
    if (group) look = { outfitId: look.outfitId, expression: look.expression }
    return {
      message: { role: 'assistant', content: text || '...' },
      systemPrompt,
      profileId,
      sceneEnded: ended,
      proposal,
      bondProposal,
      seededIds: npc ? [] : [...new Set(seededIds)],
      rolls,
      moveTo: movedTo,
      left,
      revealed,
      contacts: [...new Set(contacts)],
      rapport: rapportChanges,
      comfort,
      hours: hoursPassed > 0 ? hoursPassed : undefined,
      look: li ? fitted(validLook(look, li, scene), li) : {},
      looks
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

  ipcMain.handle(IPC.courier, async (_event, raw: unknown): Promise<CourierResponse> => {
    const { state, loveInterestId, invite, news } = CourierRequestSchema.parse(raw)
    const unprompted = invite || news !== undefined
    const thread = state.courier[loveInterestId] ?? []
    let proposal: Proposal | undefined
    const told: string[] = []
    // An NPC in his Chats is his boss, and makes no plans with him. Whoever his boss is, NPC or not, can be told he will miss a shift.
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
        mode: news !== undefined ? 'news' : invite ? 'invite' : 'courier',
        news,
        recentText: thread
          .slice(-CODEX_SCAN_MESSAGES)
          .map((note) => note.text)
          .join('\n')
      })
      // The exchange so far is in the prompt; this only says whose turn it is.
      const cue = unprompted
        ? '(Write your message now.)'
        : `(${state.player.name} has just messaged you. Write your answer.)`
      const { reply } = await completeWithFallback(settings.get(), false, {
        system,
        messages: [{ role: 'user', content: cue }],
        tools: [...(npc ? [] : [meetingTool(content, state, loveInterestId, (p) => (proposal = p)), ...(reveal ? [reveal] : [])]), ...(excuse ? [excuse] : [])]
      })
      const { text } = parseDirectives(reply)
      // An invitation has to name a time the game has checked.
      if (invite && news === undefined && !proposal) throw new Error('The note did not settle on a time.')
      return { text: text || '...', proposal, revealed: told, excused }
    } catch (error) {
      if (!unprompted) throw error
      // An unprompted note is never worth an error: send a plain one, or none.
      const plain = news === undefined ? fallbackInvite(content, state, loveInterestId) : undefined
      return { text: plain?.text ?? '', proposal: plain?.proposal, error: (error as Error).message }
    }
  })

  // Never fails: without an LLM, or for anyone it leaves out, the post is a plain one.
  ipcMain.handle(IPC.feed, async (_event, raw: unknown): Promise<FeedResponse> => {
    const { state, authorIds } = FeedRequestSchema.parse(raw)
    const known = authorIds.filter((id) => content.loveInterests.some((li) => li.id === id))
    const plain = (written: { authorId: string; text: string }[]) =>
      known.map((id) => written.find((post) => post.authorId === id) ?? { authorId: id, text: fallbackPost(content, state, id) })
    const profile = settings.get().main
    if (!isConfigured(profile)) return { posts: plain([]), error: NOT_CONFIGURED }
    try {
      const { system, user } = buildFeedPrompt(content, state, known)
      const reply = await chatCompletion(profile, { system, messages: [{ role: 'user', content: user }] })
      return { posts: plain(parseFeedReply(reply, known)) }
    } catch (error) {
      return { posts: plain([]), error: (error as Error).message }
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
      sceneWitnesses(request.scene).map(async (forId): Promise<[string, Summary]> => {
        const input = { content: request.scene.npc ? withNpc(content, request.scene.loveInterestId) : content, ...request, forId }
        try {
          const { system, user } = buildSummaryPrompt(input)
          const { reply } = await completeWithFallback(settings.get(), input.scene.nsfw, {
            system,
            messages: [{ role: 'user', content: user }],
            temperature: SUMMARY_TEMPERATURE
          })
          const read = parseSummary(reply)
          const feels = !input.scene.npc && request.state.relationships[forId] !== undefined
          // A memory is always kept, and a love interest always comes away feeling something.
          return [forId, { memory: read.memory || fallbackSummary(input), feelings: feels ? (read.feelings ?? PLAIN_FEELINGS) : undefined }]
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
      error: failure
    }
  })
}

app.whenReady().then(() => {
  const addonDir = join(app.getPath('userData'), 'addons')
  let loaded: { content: ContentPack; info: EditorInfo }
  try {
    loaded = loadWithAddons(contentDir(), addonDir)
  } catch (error) {
    dialog.showErrorBox('Could not load game content', (error as Error).message)
    app.quit()
    return
  }

  serveContentAssets(contentDir(), addonDir)
  const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'), keyCipher())
  const saves = new SaveStore(join(app.getPath('userData'), 'saves'))
  const comfy = new ComfyStore(join(app.getPath('userData'), 'comfy.json'))
  registerIpc(loaded, contentDir(), settings, saves, comfy)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
