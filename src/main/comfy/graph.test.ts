import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { backgroundPrompt, ComfySettingsSchema, normaliseComfyUrl, prependPrompt, spritePrompt } from '../../shared/comfy'
import { outfitDescription } from '../../shared/model'
import { analyse, applyBindings, effectiveBindings, parseGraph } from './graph'
import { ComfyStore, fileArt } from './studio'
import { listWorkflows, loadWorkflows, resolveWorkflow } from './workflows'

/** A plain text-to-image export: checkpoint, two prompts, an empty latent, a sampler, a decode and a save. */
const BASIC = {
  '3': { class_type: 'KSampler', inputs: { seed: 5, steps: 20, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
  '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
  '5': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: 'a cat', clip: ['4', 1] }, _meta: { title: 'Positive' } },
  '7': { class_type: 'CLIPTextEncode', inputs: { text: 'blurry', clip: ['4', 1] } },
  '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
  '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'out', images: ['8', 0] } }
}

const read = (source: unknown) => parseGraph(JSON.stringify(source)).graph!

describe('reading a workflow', () => {
  it('finds where the prompt, size, seed and picture are by following the wiring', () => {
    const analysis = analyse(read(BASIC))
    expect(analysis.sampler).toBe('3')
    expect(analysis.detected).toEqual({
      positive: { node: '6', field: 'text' },
      negative: { node: '7', field: 'text' },
      width: { node: '5', field: 'width' },
      height: { node: '5', field: 'height' },
      seed: { node: '3', field: 'seed' },
      output: { node: '9', field: 'images' }
    })
    expect(analysis.notes.positive).toContain('CLIPTextEncode #6 ("Positive") text')
    expect(analysis.problems).toEqual([])
  })

  it('walks through what sits between the sampler and the text, and takes the last of two samplers', () => {
    const chained = {
      ...BASIC,
      '10': { class_type: 'ConditioningCombine', inputs: { conditioning_1: ['6', 0], conditioning_2: ['6', 0] } },
      '11': { class_type: 'LatentUpscale', inputs: { samples: ['3', 0], width: 1024, height: 1024 } },
      '12': { class_type: 'KSampler', inputs: { seed: 9, model: ['4', 0], positive: ['10', 0], negative: ['7', 0], latent_image: ['11', 0] } },
      '8': { class_type: 'VAEDecode', inputs: { samples: ['12', 0], vae: ['4', 2] } }
    }
    const analysis = analyse(read(chained))
    expect(analysis.sampler).toBe('12')
    expect(analysis.detected.positive).toEqual({ node: '6', field: 'text' })
    // The size is set where the picture starts, not at the upscale on the way.
    expect(analysis.detected.width).toEqual({ node: '5', field: 'width' })
  })

  it('says why a file is not one it can run', () => {
    expect(parseGraph('{nope').problem).toContain('not readable JSON')
    expect(parseGraph(JSON.stringify({ nodes: [], links: [] })).problem).toContain('Export (API)')
    expect(parseGraph('{}').problem).toContain('Export (API)')
    expect(analyse(read({ '1': { class_type: 'SaveImage', inputs: { images: ['2', 0] } } })).problems.join(' ')).toContain('No sampler here')
  })

  it('writes values into a copy and leaves everything else as exported', () => {
    const graph = read(BASIC)
    const { bindings } = effectiveBindings(graph, analyse(graph), undefined)
    expect(applyBindings(graph, bindings, {}).prompt).toEqual(BASIC)

    const sent = applyBindings(graph, bindings, { positive: 'a fox', width: 832, height: 1472, seed: 7 })
    const inputs = (id: string) => (sent.prompt[id] as { inputs: Record<string, unknown> }).inputs
    expect([inputs('6')['text'], inputs('7')['text'], inputs('5')['width'], inputs('3')['seed']]).toEqual(['a fox', 'blurry', 832, 7])
    expect(sent.skipped).toEqual([])
    expect(graph.source).toEqual(BASIC)
  })

  it('lets a binding be repointed or dropped by hand, and falls back when it has gone stale', () => {
    const graph = read(BASIC)
    const analysis = analyse(graph)
    const mine = effectiveBindings(graph, analysis, { positive: { node: '7', field: 'text' }, seed: null })
    expect(mine.bindings.positive).toEqual({ node: '7', field: 'text' })
    expect(mine.bindings.seed).toBeNull()
    expect(applyBindings(graph, mine.bindings, { seed: 1 }).skipped).toEqual(['seed'])

    const stale = effectiveBindings(graph, analysis, { positive: { node: '99', field: 'text' } })
    expect(stale.bindings.positive).toEqual({ node: '6', field: 'text' })
    expect(stale.problems[0]).toContain('no longer has')
  })
})

describe('the workflow folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'comfy-'))
  writeFileSync(join(dir, 'sprites.json'), JSON.stringify(BASIC))
  writeFileSync(join(dir, 'scenery.json'), JSON.stringify(BASIC))
  writeFileSync(join(dir, 'canvas.json'), JSON.stringify({ nodes: [] }))

  it('lists every file, keeping an unreadable one with its reason', () => {
    const list = listWorkflows(dir, {})
    expect(list.ok).toBe(true)
    expect(list.workflows.map((w) => [w.name, w.problem === null])).toEqual([
      ['canvas', false],
      ['scenery', true],
      ['sprites', true]
    ])
    expect(listWorkflows(null, {}).message).toBe('No workflow folder is chosen yet.')
    expect(listWorkflows(join(dir, 'missing'), {}).message).toContain('There is no folder')
  })

  it('runs the one named, else the default for the kind, else the first that takes a prompt', () => {
    const { loaded } = loadWorkflows(dir, {})
    expect(resolveWorkflow(loaded, 'sprites.json', 'background', {}).workflow?.name).toBe('sprites')
    expect(resolveWorkflow(loaded, '', 'sprite', { sprite: 'sprites.json' }).workflow?.name).toBe('sprites')
    expect(resolveWorkflow(loaded, '', 'sprite', { sprite: 'gone.json' }).workflow?.name).toBe('scenery')
    expect(resolveWorkflow(loaded, 'nope', 'sprite', {}).problem).toContain('no workflow called "nope"')
  })
})

describe('the studio', () => {
  it('keeps its settings, and refuses an address that is not one', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'comfy-')), 'comfy.json')
    const store = new ComfyStore(path)
    expect(store.get().baseUrl).toBe('http://127.0.0.1:8188')
    store.update({ ...store.get(), baseUrl: 'http://localhost:8188/', promptPrefixes: { 'sprites.json': 'score_9' } })
    expect(new ComfyStore(path).get()).toMatchObject({ baseUrl: 'http://localhost:8188', promptPrefixes: { 'sprites.json': 'score_9' } })
    expect(() => store.update({ ...store.get(), baseUrl: '127.0.0.1:8188' })).toThrow('Include the http://')
    expect(normaliseComfyUrl('file:///etc/passwd').problem).toContain('Only http and https')
    expect(ComfySettingsSchema.parse({}).timeoutSeconds).toBe(300)
  })

  it('files a picture under a name of its own, and can make it a view of a location', () => {
    const addons = mkdtempSync(join(tmpdir(), 'addons-'))
    const first = fileArt(addons, 'sprite', 'ana', 'default-happy', Buffer.from('one'))
    const second = fileArt(addons, 'sprite', 'ana', 'default-happy', Buffer.from('two'))
    expect([first, second]).toEqual(['addons/sprites/ana/default-happy.png', 'addons/sprites/ana/default-happy-2.png'])
    const scene = fileArt(addons, 'background', 'cafe', 'Counter', Buffer.from('bg'))
    expect(scene).toBe('addons/generated/backgrounds/cafe/counter.png')
  })

  it('writes prompts from what the content says can be seen', () => {
    const who = {
      appearance: 'A woman with brown skin and long black hair.',
      outfits: [
        { id: 'default', name: 'Usual', description: 'a blue bodice and a short skirt', sprites: {}, pregnant: false },
        { id: 'nude', name: 'Nude', description: 'nothing at all, completely nude', sprites: {}, pregnant: false }
      ]
    }
    const framing = 'three-quarter shot from knees up\n\nplain white background'
    expect(spritePrompt(who, 'default', 'happy-2', framing)).toBe(
      'A woman with brown skin and long black hair.\n\nShe wears a blue bodice and a short skirt.\n\nthree-quarter shot from knees up\n\nplain white background\n\nshe has a happy expression'
    )
    // An outfit that builds on another is asked for as that one's description, then what it adds.
    const carrying = {
      ...who,
      outfits: [
        ...who.outfits,
        { id: 'pregnant', name: 'Pregnant', inherits: 'default', description: 'She has a round, pregnant belly.', sprites: {}, pregnant: true },
        { id: 'nude-pregnant', name: 'Nude, pregnant', inherits: 'nude', description: 'She has a round, pregnant belly.', sprites: {}, pregnant: true }
      ]
    }
    expect(spritePrompt(carrying, 'pregnant', 'neutral', '')).toBe(
      'A woman with brown skin and long black hair.\n\nShe wears a blue bodice and a short skirt.\n\nShe has a round, pregnant belly.'
    )
    expect(spritePrompt(carrying, 'nude-pregnant', 'neutral', '')).toBe(
      'A woman with brown skin and long black hair.\n\nShe wears nothing at all, completely nude.\n\nShe has a round, pregnant belly.'
    )
    expect(outfitDescription(carrying.outfits, carrying.outfits[2])).toBe('a blue bodice and a short skirt. She has a round, pregnant belly.')
    // The description is sent as it is written: nothing is swapped for other words on the way.
    const posed = { ...who, outfits: [{ ...who.outfits[1], description: 'nothing at all, completely nude, hands cupped under her breasts' }] }
    expect(spritePrompt(posed, 'nude', 'neutral', '')).toBe(
      'A woman with brown skin and long black hair.\n\nShe wears nothing at all, completely nude, hands cupped under her breasts.'
    )
    // A neutral face is asked for by saying nothing about it, as the game's own were.
    expect(spritePrompt(who, 'nude', 'neutral', '')).toBe('A woman with brown skin and long black hair.\n\nShe wears nothing at all, completely nude.')
    expect(spritePrompt(who, 'default', 'aroused', '').endsWith('she has an aroused expression, flushed cheeks, half-lidded eyes, parted lips')).toBe(true)
    expect(backgroundPrompt({ name: 'the Lumen', appearance: 'A cinema in an old music hall.', indoors: true }, 'Balcony', 'evening', 'no people')).toBe(
      'Interior of the Lumen: Balcony.\n\nA cinema in an old music hall.\n\nevening light\n\nno people'
    )
    // A character's room has no name worth drawing: only what it looks like is sent.
    expect(backgroundPrompt({ name: '', appearance: 'A sunny attic room under sloping eaves', indoors: true }, '', '', 'no people')).toBe(
      'A sunny attic room under sloping eaves.\n\nno people'
    )
    expect(prependPrompt(' score_9 ', 'a fox')).toBe('score_9\n\na fox')
    expect(prependPrompt('', 'a fox')).toBe('a fox')
  })
})

describe('a man\'s sprite', () => {
  it('is asked for as "he"', () => {
    const who = { pronouns: 'he/him', appearance: 'A lean man of 43 with a short beard.', outfits: [{ id: 'default', name: 'Whites', description: "a black chef's jacket", sprites: {}, pregnant: false }] }
    expect(spritePrompt(who, 'default', 'happy', '')).toBe("A lean man of 43 with a short beard.\n\nHe wears a black chef's jacket.\n\nhe has a happy expression")
  })
})
