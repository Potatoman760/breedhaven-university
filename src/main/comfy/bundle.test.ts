import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ComfySettingsSchema } from '../../shared/comfy'
import { checkBundle, installBundle, INSTALL_FOLDER, readBundle, saveBundle, workflowNeeds } from './bundle'

const workflow = JSON.stringify({
  '1': { class_type: 'UNETLoader', inputs: { unet_name: 'model.safetensors' } },
  '2': { class_type: 'Power Lora Loader (rgthree)', inputs: { lora_1: { on: true, lora: 'style/comic.safetensors', strength: 1 }, model: ['1', 0] } },
  '3': { class_type: 'KSampler', inputs: { seed: 1, model: ['2', 0] } }
})

function folders() {
  const root = mkdtempSync(join(tmpdir(), 'bundle-'))
  const pack = join(root, 'pack')
  const mine = join(root, 'mine')
  const theirs = join(root, 'theirs')
  for (const dir of [pack, mine, theirs]) mkdirSync(dir)
  writeFileSync(join(mine, 'comic.json'), workflow)
  writeFileSync(join(mine, 'notes.txt'), 'not a workflow')
  return { pack, mine, theirs }
}

describe("the game's own workflows", () => {
  it('reads what a workflow calls for: its model files, however deep, and its kinds of node', () => {
    expect(workflowNeeds(workflow)).toEqual({ models: ['model.safetensors', 'style/comic.safetensors'], nodes: ['KSampler', 'Power Lora Loader (rgthree)', 'UNETLoader'] })
    expect(workflowNeeds('not json')).toEqual({ models: [], nodes: [] })
  })

  it('are taken into the game with what is said of them, and nothing of the machine they came from', () => {
    const { pack, mine } = folders()
    expect(readBundle(pack)).toEqual({ workflows: [] })
    const settings = ComfySettingsSchema.parse({
      baseUrl: 'http://10.0.0.5:8188',
      workflowDir: mine,
      promptPrefixes: { 'comic.json': 'comic book style', 'gone.json': 'old' },
      defaults: { sprite: 'comic.json', photo: 'gone.json' }
    })
    const saved = saveBundle(pack, settings)
    expect(saved.workflows.map((w) => [w.file, w.name, w.models.length])).toEqual([['comic.json', 'comic', 2]])
    expect(readdirSync(join(pack, 'comfy')).sort()).toEqual(['bundle.json', 'comic.json'])
    const shipped = JSON.parse(readFileSync(join(pack, 'comfy', 'bundle.json'), 'utf8'))
    expect(shipped.promptPrefixes).toEqual({ 'comic.json': 'comic book style' })
    expect(shipped.defaults).toEqual({ sprite: 'comic.json' })
    expect(JSON.stringify(shipped)).not.toContain('10.0.0.5')
    expect(JSON.stringify(shipped)).not.toContain('mine')
    expect(() => saveBundle(pack, { ...settings, workflowDir: null })).toThrow(/Choose the folder/)
  })

  it('are written into a folder of their own for a player, whose settings then use them and keep what was theirs', () => {
    const { pack, mine, theirs } = folders()
    saveBundle(pack, ComfySettingsSchema.parse({ workflowDir: mine, promptPrefixes: { 'comic.json': 'comic book style' }, defaults: { sprite: 'comic.json' } }))
    const before = ComfySettingsSchema.parse({ baseUrl: 'http://127.0.0.1:9000', timeoutSeconds: 600, promptPrefixes: { 'own.json': 'mine', 'comic.json': 'theirs' } })
    const { settings, dir, files } = installBundle(pack, theirs, before)
    expect(dir).toBe(join(theirs, INSTALL_FOLDER))
    expect(files).toEqual(['comic.json'])
    expect(readdirSync(dir)).toEqual(['comic.json'])
    expect(settings).toMatchObject({ baseUrl: 'http://127.0.0.1:9000', timeoutSeconds: 600, workflowDir: dir, defaults: { sprite: 'comic.json' } })
    expect(settings.promptPrefixes).toEqual({ 'own.json': 'mine', 'comic.json': 'comic book style' })
    expect(() => installBundle(join(theirs, 'empty'), theirs, before)).toThrow(/no workflows of its own/)
  })

  it('are checked against a running ComfyUI for the models and nodes it lacks', async () => {
    const { pack, mine } = folders()
    const bundle = saveBundle(pack, ComfySettingsSchema.parse({ workflowDir: mine }))
    const answering = (body: unknown) => (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch
    const has = { UNETLoader: { input: { required: { unet_name: [['model.safetensors']] } } }, KSampler: {}, LoraLoader: { input: { required: { lora_name: [['style/comic.safetensors']] } } } }
    expect(await checkBundle('http://x', bundle, answering(has))).toMatchObject({ ok: false, missingNodes: ['Power Lora Loader (rgthree)'], missingModels: [] })
    expect(await checkBundle('http://x', bundle, answering({ ...has, 'Power Lora Loader (rgthree)': {} }))).toMatchObject({ ok: true, missingNodes: [], missingModels: [] })
    expect(await checkBundle('http://x', bundle, answering({ KSampler: {}, UNETLoader: {}, 'Power Lora Loader (rgthree)': {} }))).toMatchObject({ ok: false, missingModels: ['model.safetensors', 'style/comic.safetensors'] })
    const down = (async () => { throw new Error('refused') }) as unknown as typeof fetch
    expect(await checkBundle('http://x', bundle, down)).toMatchObject({ ok: false, missingNodes: [], missingModels: [] })
  })
})
