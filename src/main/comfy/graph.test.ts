import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { backgroundPrompt, birthPrompt, ComfySettingsSchema, DEFAULT_SIZES, DEFAULT_VIDEO_PROMPT, normaliseComfyUrl, nsfwPrompt, prependPrompt, spritePrompt, videoPromptFor } from '../../shared/comfy'
import { NSFW_POSES, outfitDescription, poseDescription } from '../../shared/model'
import { analyse, applyBindings, effectiveBindings, parseGraph, unplugLastFrame } from './graph'
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
      firstFrame: null,
      lastFrame: null,
      length: null,
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

describe('the folder of workflows', () => {
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
    expect(listWorkflows(join(dir, 'missing'), {}).message).toContain('there is no folder')
    // What the game keeps beside its workflows is not one of them.
    const beside = mkdtempSync(join(tmpdir(), 'comfy-'))
    writeFileSync(join(beside, 'bundle.json'), '{}')
    writeFileSync(join(beside, 'downloads.json'), '{}')
    expect(listWorkflows(beside, {})).toMatchObject({ ok: false, workflows: [] })
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

  it('reads what the game says of its workflows under what the player changed, and keeps only the changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'comfy-'))
    const pack = join(root, 'pack')
    mkdirSync(join(pack, 'comfy'), { recursive: true })
    const shipped = { promptPrefixes: { 'a.json': 'comic book style', 'b.json': 'watercolour' }, defaults: { sprite: 'a.json' }, videoPrompts: { doggy: 'she rocks' } }
    writeFileSync(join(pack, 'comfy', 'bundle.json'), JSON.stringify(shipped))
    const path = join(root, 'comfy.json')
    const store = new ComfyStore(path, pack)
    expect(store.get()).toMatchObject(shipped)

    // A player's change is theirs: kept on their computer, and the game's content is left as it was.
    store.update({ ...store.get(), timeoutSeconds: 600, promptPrefixes: { ...store.get().promptPrefixes, 'a.json': 'mine' } })
    const kept = JSON.parse(readFileSync(path, 'utf8'))
    expect(kept).toMatchObject({ timeoutSeconds: 600, promptPrefixes: { 'a.json': 'mine' }, defaults: {}, videoPrompts: {} })
    expect(JSON.parse(readFileSync(join(pack, 'comfy', 'bundle.json'), 'utf8'))).toEqual(shipped)
    // What they never touched still follows the game when the game changes it.
    writeFileSync(join(pack, 'comfy', 'bundle.json'), JSON.stringify({ ...shipped, promptPrefixes: { 'a.json': 'new', 'b.json': 'ink wash' } }))
    expect(new ComfyStore(path, pack).get().promptPrefixes).toEqual({ 'a.json': 'mine', 'b.json': 'ink wash' })

    // The game's author changes the game itself, and nothing of it is left on their own computer to shadow it.
    const author = new ComfyStore(join(root, 'author.json'), pack)
    author.update({ ...author.get(), baseUrl: 'http://10.0.0.5:8188', videoPrompts: { doggy: 'she sways' } }, true)
    const game = JSON.parse(readFileSync(join(pack, 'comfy', 'bundle.json'), 'utf8'))
    expect(game.videoPrompts).toEqual({ doggy: 'she sways' })
    expect(JSON.stringify(game)).not.toContain('10.0.0.5')
    expect(JSON.parse(readFileSync(join(root, 'author.json'), 'utf8'))).toMatchObject({ baseUrl: 'http://10.0.0.5:8188', videoPrompts: {}, promptPrefixes: {} })
    expect(new ComfyStore(path, pack).get().videoPrompts).toEqual({ doggy: 'she sways' })
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
    // The Default view is the place as it is: its name is not sent.
    expect(backgroundPrompt({ name: 'the Lumen', appearance: 'A cinema in an old music hall.', indoors: true }, 'Default', 'day', 'no people')).toBe(
      'Interior of the Lumen.\n\nA cinema in an old music hall.\n\ndaytime, bright natural daylight\n\nno people'
    )
    expect(backgroundPrompt({ name: '', appearance: 'A sunny room', indoors: true }, 'default', '', '')).toBe('A sunny room.')
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

describe('the NSFW section', () => {
  const nude = { id: 'nude', name: 'Nude', description: 'nothing at all, her hair loose', sprites: {}, pregnant: false }
  const who = { pronouns: 'she/her', appearance: 'A woman with brown skin and long black hair', outfits: [nude] }

  it('has a slot for each standard pose, each with what the LLM is told and what it is drawn from', () => {
    expect(NSFW_POSES.map((pose) => pose.id)).toEqual(['blowjob', 'missionary', 'doggy', 'cowgirl', 'creampie', 'facial'])
    for (const pose of NSFW_POSES) {
      expect(pose.description).not.toBe('')
      expect(pose.draws).not.toBe('')
    }
    // Her own words for a pose come before the standard ones.
    expect(poseDescription({ id: 'doggy', description: '' })).toBe(NSFW_POSES[2].description)
    expect(poseDescription({ id: 'doggy', description: ' On the desk. ' })).toBe('On the desk.')
    expect(poseDescription({ id: 'her-own', description: '' })).toBe('')
  })

  it('is drawn wide, from her body, her own nude outfit, the pose and the framing', () => {
    expect(DEFAULT_SIZES.nsfw).toEqual({ width: 1920, height: 1080 })
    expect(nsfwPrompt(who, 'she lies back on a bed', 'wide cinematic shot')).toBe(
      'A woman with brown skin and long black hair.\n\nShe wears nothing at all, her hair loose.\n\nshe lies back on a bed.\n\nwide cinematic shot'
    )
    // Without a nude outfit of her own, the usual words for it.
    expect(nsfwPrompt({ ...who, outfits: [] }, 'x', '')).toContain('She wears nothing at all, completely nude.')
  })
})

describe('the picture of a birth', () => {
  it('is drawn wide, from her body, in a hospital bed with the child in her arms', () => {
    expect(DEFAULT_SIZES.birth).toEqual({ width: 1920, height: 1080 })
    expect(birthPrompt({ pronouns: 'she/her', appearance: 'A woman with brown skin and long black hair' }, 'wide shot, a maternity room')).toBe(
      'A woman with brown skin and long black hair.\n\nShe wears a pale hospital gown.\n\n' +
        'She sits propped up on pillows in a hospital bed, cradling a newborn baby wrapped in a soft blanket in her arms, smiling down at it, tired and radiant.\n\nwide shot, a maternity room'
    )
  })
})

describe('what of a pose is shown', () => {
  it('is its clip, and failing that its picture', async () => {
    const { poseMedia } = await import('../../shared/model')
    expect(poseMedia({ clip: 'c.mp4', image: 'p.webp' })).toEqual(['c.mp4', 'p.webp'])
    expect(poseMedia({ image: 'p.webp' })).toEqual(['p.webp'])
    expect(poseMedia({})).toEqual([])
  })
})

describe('a pose drawn pregnant', () => {
  it('is the same pose, built on her nude with what her pregnant nude adds to it', async () => {
    const { nsfwPrompt } = await import('../../shared/comfy')
    const { NSFW_POSES, NSFW_PREGNANT_POSES, isPregnantPose, pregnantPoseId } = await import('../../shared/model')
    const who = {
      appearance: 'A woman with brown skin.',
      outfits: [
        { id: 'nude', name: 'Nude', description: 'nothing at all', sprites: {}, pregnant: false },
        { id: 'nude-pregnant', name: 'Nude, pregnant', description: 'She has a round, pregnant belly.', inherits: 'nude', sprites: {}, pregnant: true }
      ]
    }
    const plain = nsfwPrompt(who, 'She lies on her back.', 'wide shot')
    const pregnant = nsfwPrompt(who, 'She lies on her back.', 'wide shot', true)
    expect(plain).not.toContain('pregnant belly')
    expect(pregnant).toContain('She has a round, pregnant belly.')
    // Everything of the plain one is still there: it is built on it.
    for (const part of plain.split('\n\n')) expect(pregnant).toContain(part)

    expect(NSFW_PREGNANT_POSES.map((pose) => pose.id)).toEqual(NSFW_POSES.map((pose) => pregnantPoseId(pose.id)))
    expect(NSFW_PREGNANT_POSES.every((pose, i) => pose.draws === NSFW_POSES[i].draws && pose.base === NSFW_POSES[i].id)).toBe(true)
    expect(isPregnantPose('pregnant-missionary')).toBe(true)
    expect(isPregnantPose('missionary')).toBe(false)
  })
})

describe('a video workflow', () => {
  // The one the game ships with: its prompt is on the video node itself, and nothing in it has a sampler's usual shape.
  const shipped = readFileSync(join(__dirname, '../../../content/default/comfy/minimax h3 eros.json'), 'utf8')
  const graph = parseGraph(shipped).graph!
  const analysis = analyse(graph)
  const { bindings } = effectiveBindings(graph, analysis, undefined)

  it('is read for its prompt, its seed, the pictures it starts from and ends on, and where the clip comes out', () => {
    expect(analysis.sampler).toBeNull()
    expect(analysis.detected).toEqual({
      positive: { node: '7', field: 'prompt' },
      negative: null,
      width: null,
      height: null,
      seed: { node: '13', field: 'noise_seed' },
      // Each through the resize between the video node and the picture's file.
      firstFrame: { node: '8', field: 'image' },
      lastFrame: { node: '22', field: 'image' },
      // The number the workflow's author titled "Length (in Seconds)", and not the video node's count of frames.
      length: { node: '55', field: 'value' },
      output: { node: '20', field: 'images' }
    })
    expect(analysis.problems).toEqual([])
  })

  it('has the picture written in as its first frame, and as its last only when that is asked for', () => {
    const inputs = (prompt: Record<string, unknown>, id: string) => (prompt[id] as { inputs: Record<string, unknown> }).inputs
    const both = applyBindings(graph, bindings, { positive: 'she breathes', seed: 7, firstFrame: 'frame.png', lastFrame: 'frame.png', length: 6 })
    expect(both.skipped).toEqual([])
    expect(inputs(both.prompt, '55').value).toBe(6)
    expect(inputs(both.prompt, '7').prompt).toBe('she breathes')
    expect(inputs(both.prompt, '13').noise_seed).toBe(7)
    expect(inputs(both.prompt, '8').image).toBe('frame.png')
    expect(inputs(both.prompt, '22').image).toBe('frame.png')
    expect(inputs(both.prompt, '7').last_frame).toEqual(['69', 0])

    // Not asked to end on it, the video node is unplugged from the picture the workflow was saved with.
    const first = applyBindings(graph, bindings, { positive: 'she breathes', firstFrame: 'frame.png' })
    unplugLastFrame(first.prompt)
    expect(inputs(first.prompt, '7').first_frame).toEqual(['67', 0])
    expect('last_frame' in inputs(first.prompt, '7')).toBe(false)
    // The export itself is never changed.
    expect((graph.source['7'] as { inputs: Record<string, unknown> }).inputs.last_frame).toEqual(['69', 0])
  })

  it('is the one a clip is made with, and never the one a picture is drawn with', () => {
    const dir = mkdtempSync(join(tmpdir(), 'video-'))
    writeFileSync(join(dir, 'a-clips.json'), shipped)
    expect(resolveWorkflow(loadWorkflows(dir, {}).loaded, '', 'video', {}).workflow?.name).toBe('a-clips')
    expect(resolveWorkflow(loadWorkflows(dir, {}).loaded, '', 'nsfw', {}).problem).toContain('makes clips')
    writeFileSync(join(dir, 'pictures.json'), JSON.stringify(BASIC))
    const { loaded } = loadWorkflows(dir, {})
    expect(resolveWorkflow(loaded, '', 'nsfw', {}).workflow?.name).toBe('pictures')
    expect(resolveWorkflow(loaded, '', 'video', { video: 'pictures.json' }).workflow?.name).toBe('a-clips')
    writeFileSync(join(dir, 'a-clips.json'), JSON.stringify(BASIC))
    expect(resolveWorkflow(loadWorkflows(dir, {}).loaded, '', 'video', {}).problem).toContain('first frame')
  })

  it('finds the frames of a workflow that does have a sampler, by what the video node calls them', () => {
    const wan = {
      ...BASIC,
      '5': { class_type: 'WanFirstLastFrameToVideo', inputs: { width: 832, height: 480, positive: ['6', 0], negative: ['7', 0], start_image: ['20', 0], end_image: ['21', 0] } },
      '20': { class_type: 'LoadImage', inputs: { image: 'a.png' } },
      '21': { class_type: 'LoadImage', inputs: { image: 'b.png' } }
    }
    const found = analyse(read(wan)).detected
    expect(found.positive).toEqual({ node: '6', field: 'text' })
    expect(found.firstFrame).toEqual({ node: '20', field: 'image' })
    expect(found.lastFrame).toEqual({ node: '21', field: 'image' })
  })

  it('is asked for with the prompt kept for the pose, which a pose drawn pregnant shares', () => {
    const settings = ComfySettingsSchema.parse({ videoPrompts: { doggy: 'she rocks back and forth' } })
    expect(settings.videoLastFrame).toBe(false)
    expect(settings.videoSeconds).toBe(10)
    expect(videoPromptFor(settings, 'doggy')).toBe('she rocks back and forth')
    expect(videoPromptFor(settings, 'pregnant-doggy')).toBe('she rocks back and forth')
    expect(videoPromptFor(settings, 'cowgirl')).toBe(DEFAULT_VIDEO_PROMPT)
    expect(videoPromptFor(settings, 'her-own')).toBe(DEFAULT_VIDEO_PROMPT)
  })
})
