import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ModelDownload } from '../../shared/comfy'
import { CivitaiKeyStore, downloadModel, downloadUrl, findModelsDir, hasModel, modelPath, readDownloads } from './downloads'

const bytes = Buffer.from('a small stand-in for a very large model')
const sha256 = createHash('sha256').update(bytes).digest('hex')
const model = (over: Partial<ModelDownload> = {}): ModelDownload => ({ file: 'style/one.safetensors', folder: 'loras', name: 'One', page: 'https://civitai.red/models/1/one', sizeMb: bytes.length / 1048576, sha256, ...over })
const comfy = () => {
  const root = mkdtempSync(join(tmpdir(), 'bh-models-'))
  for (const folder of ['checkpoints', 'loras', 'vae']) mkdirSync(join(root, 'ComfyUI', 'models', folder), { recursive: true })
  return root
}
const serving = (status: number, body: Buffer | null) => (async () => new Response(body as unknown as BodyInit | null, { status })) as unknown as typeof fetch

describe('the models the game ships a list of', () => {
  it('reads the shipped list: every file with a folder, a page and somewhere to come from', () => {
    const { models, nodes } = readDownloads(join(process.cwd(), 'content', 'default'))
    expect(models.length).toBeGreaterThan(0)
    for (const m of models) {
      expect(m.folder, m.file).not.toBe('')
      expect(m.page, m.file).toMatch(/^https:\/\//)
      expect(m.civitaiVersionId !== undefined || m.url !== undefined, m.file).toBe(true)
      expect(m.sha256, m.file).toMatch(/^[0-9a-f]{64}$/i)
    }
    expect(nodes.every((pack) => pack.page.startsWith('https://'))).toBe(true)
    expect(readDownloads(join(tmpdir(), 'no-such-pack'))).toEqual({ models: [], nodes: [] })
  })

  it('finds where ComfyUI keeps its models from the folder picked, and keeps every file inside it', () => {
    const root = comfy()
    const models = join(root, 'ComfyUI', 'models')
    expect(findModelsDir(root)).toBe(models)
    expect(findModelsDir(join(root, 'ComfyUI'))).toBe(models)
    expect(findModelsDir(models)).toBe(models)
    expect(findModelsDir(tmpdir())).toBeNull()
    expect(modelPath(models, model())).toBe(join(models, 'loras', 'style', 'one.safetensors'))
    expect(() => modelPath(models, model({ file: '../../outside.safetensors' }))).toThrow(/outside the models folder/)
  })

  it('asks Civitai with the key, on the site the page is on, and anything else at its own address', () => {
    expect(downloadUrl(model({ civitaiVersionId: 42 }), 'se cret')).toBe('https://civitai.red/api/download/models/42?token=se%20cret')
    expect(downloadUrl(model({ civitaiVersionId: 42 }), '')).toBe('https://civitai.red/api/download/models/42')
    expect(downloadUrl(model({ url: 'https://example.org/one.safetensors' }), 'secret')).toBe('https://example.org/one.safetensors')
  })

  it('downloads a file into its folder, and keeps nothing that is cut short, refused or not the file expected', async () => {
    const models = join(comfy(), 'ComfyUI', 'models')
    const target = join(models, 'loras', 'style', 'one.safetensors')
    const seen: number[] = []
    const never = new AbortController().signal

    // Refused for want of a key: said so, and nothing written.
    const refused = await downloadModel(model({ civitaiVersionId: 42 }), models, '', () => undefined, never, serving(401, null))
    expect(refused).toMatchObject({ ok: false })
    expect(refused.message).toContain('Add your Civitai API key')
    expect(existsSync(target)).toBe(false)

    // The wrong file: thrown away.
    const wrong = await downloadModel(model({ url: 'https://example.org/x' }), models, '', () => undefined, never, serving(200, Buffer.from('something else entirely')))
    expect(wrong.ok).toBe(false)
    expect(existsSync(target)).toBe(false)
    expect(existsSync(`${target}.part`)).toBe(false)

    // The right one: in its place, and seen arriving.
    const got = await downloadModel(model({ url: 'https://example.org/x' }), models, '', (p) => seen.push(p.received), never, serving(200, bytes))
    expect(got).toMatchObject({ ok: true, file: 'style/one.safetensors' })
    expect(readFileSync(target)).toEqual(bytes)
    expect(seen.at(-1)).toBe(bytes.length)
    expect(hasModel(models, model())).toBe(true)
    // Already there, it is not fetched again.
    expect((await downloadModel(model({ url: 'https://example.org/x' }), models, '', () => undefined, never, serving(500, null))).message).toBe('Already there.')
  })

  it('keeps the Civitai key on disk, encrypted where it can be, and forgets it when it is cleared', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bh-key-'))
    const cipher = { encrypt: (plain: string) => plain.split('').reverse().join(''), decrypt: (stored: string) => stored.split('').reverse().join('') }
    const store = new CivitaiKeyStore(join(dir, 'civitai.json'), cipher)
    expect(store.get()).toBe('')
    store.set('  abc123  ')
    expect(store.get()).toBe('abc123')
    expect(readFileSync(join(dir, 'civitai.json'), 'utf8')).not.toContain('abc123')
    expect(new CivitaiKeyStore(join(dir, 'civitai.json'), cipher).get()).toBe('abc123')
    store.set('')
    expect(store.get()).toBe('')
    // With no way to encrypt, it is kept as it is.
    const plain = new CivitaiKeyStore(join(dir, 'plain.json'))
    plain.set('xyz')
    expect(plain.get()).toBe('xyz')
    writeFileSync(join(dir, 'plain.json'), 'not json')
    expect(plain.get()).toBe('')
  })
})
