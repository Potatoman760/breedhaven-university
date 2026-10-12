import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ComfySettingsSchema } from '../../shared/comfy'
import { checkBundle, readBundle, readBundleSettings, workflowNeeds, writeBundleSettings } from './bundle'

const workflow = JSON.stringify({
  '1': { class_type: 'UNETLoader', inputs: { unet_name: 'model.safetensors' } },
  '2': { class_type: 'Power Lora Loader (rgthree)', inputs: { lora_1: { on: true, lora: 'style/comic.safetensors', strength: 1 }, model: ['1', 0] } },
  '3': { class_type: 'KSampler', inputs: { seed: 1, model: ['2', 0] } }
})

/** A game's content with one workflow in it, beside the two files kept there that are not workflows. */
function pack(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'bundle-')), 'pack')
  mkdirSync(join(dir, 'comfy'), { recursive: true })
  writeFileSync(join(dir, 'comfy', 'comic.json'), workflow)
  writeFileSync(join(dir, 'comfy', 'downloads.json'), JSON.stringify({ models: [{ file: 'model.safetensors' }] }))
  return dir
}

describe("the game's own workflows", () => {
  it('reads what a workflow calls for: its model files, however deep, and its kinds of node', () => {
    expect(workflowNeeds(workflow)).toEqual({ models: ['model.safetensors', 'style/comic.safetensors'], nodes: ['KSampler', 'Power Lora Loader (rgthree)', 'UNETLoader'] })
    expect(workflowNeeds('not json')).toEqual({ models: [], nodes: [] })
  })

  it('are the workflow files in the content, and not what is kept beside them', () => {
    expect(readBundle(join(tmpdir(), 'no-such-pack'))).toEqual({ workflows: [] })
    const dir = pack()
    writeBundleSettings(dir, ComfySettingsSchema.parse({ promptPrefixes: { 'comic.json': 'comic book style' } }))
    expect(readBundle(dir).workflows.map((w) => [w.file, w.name, w.models.length])).toEqual([['comic.json', 'comic', 2]])
  })

  it('have what the game says of them kept beside them, with nothing of the machine it was written on', () => {
    const dir = pack()
    expect(readBundleSettings(dir).promptPrefixes).toEqual({})
    writeBundleSettings(dir, ComfySettingsSchema.parse({ baseUrl: 'http://10.0.0.5:8188', modelsDir: 'D:/mine', promptPrefixes: { 'comic.json': 'comic book style' }, defaults: { sprite: 'comic.json' } }))
    const written = readFileSync(join(dir, 'comfy', 'bundle.json'), 'utf8')
    expect(JSON.parse(written)).toMatchObject({ promptPrefixes: { 'comic.json': 'comic book style' }, defaults: { sprite: 'comic.json' }, videoPrompts: {} })
    expect(written).not.toContain('10.0.0.5')
    expect(written).not.toContain('mine')
    expect(readBundleSettings(dir).defaults).toEqual({ sprite: 'comic.json' })
  })

  it('are checked against a running ComfyUI for the models and nodes it lacks', async () => {
    const bundle = readBundle(pack())
    const answering = (body: unknown) => (async () => new Response(JSON.stringify(body))) as unknown as typeof fetch
    const has = { UNETLoader: { input: { required: { unet_name: [['model.safetensors']] } } }, KSampler: {}, LoraLoader: { input: { required: { lora_name: [['style/comic.safetensors']] } } } }
    expect(await checkBundle('http://x', bundle, answering(has))).toMatchObject({ ok: false, missingNodes: ['Power Lora Loader (rgthree)'], missingModels: [] })
    expect(await checkBundle('http://x', bundle, answering({ ...has, 'Power Lora Loader (rgthree)': {} }))).toMatchObject({ ok: true, missingNodes: [], missingModels: [] })
    expect(await checkBundle('http://x', bundle, answering({ KSampler: {}, UNETLoader: {}, 'Power Lora Loader (rgthree)': {} }))).toMatchObject({ ok: false, missingModels: ['model.safetensors', 'style/comic.safetensors'] })
    const down = (async () => { throw new Error('refused') }) as unknown as typeof fetch
    expect(await checkBundle('http://x', bundle, down)).toMatchObject({ ok: false, missingNodes: [], missingModels: [] })
  })
})
