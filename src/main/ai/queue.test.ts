import { describe, expect, it } from 'vitest'
import { inTurn } from './queue'

/** A request that is going until it is let finish, and keeps count of how many are going at once. */
function requests() {
  let going = 0
  let most = 0
  const order: string[] = []
  const finish = new Map<string, () => void>()
  const send = (name: string) => () =>
    new Promise<string>((resolve) => {
      going++
      most = Math.max(most, going)
      order.push(name)
      finish.set(name, () => {
        going--
        resolve(name)
      })
    })
  return { send, finish: (name: string) => finish.get(name)!(), order, most: () => most }
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('requests to an endpoint that takes only so many at once', () => {
  it('wait their turn, first come first served, and never go more at once than it takes', async () => {
    const r = requests()
    const all = ['a', 'b', 'c'].map((name) => inTurn('https://one', 1, undefined, r.send(name)))
    await settle()
    expect(r.order).toEqual(['a'])
    r.finish('a')
    await settle()
    expect(r.order).toEqual(['a', 'b'])
    r.finish('b')
    await settle()
    r.finish('c')
    expect(await Promise.all(all)).toEqual(['a', 'b', 'c'])
    expect(r.most()).toBe(1)
  })

  it('go at once with no limit, and two at a time with a limit of two', async () => {
    const free = requests()
    const loose = ['a', 'b', 'c'].map((name) => inTurn('https://free', undefined, undefined, free.send(name)))
    await settle()
    expect(free.order).toEqual(['a', 'b', 'c'])
    for (const name of ['a', 'b', 'c']) free.finish(name)
    await Promise.all(loose)

    const two = requests()
    const paired = ['a', 'b', 'c'].map((name) => inTurn('https://two', 2, undefined, two.send(name)))
    await settle()
    expect(two.order).toEqual(['a', 'b'])
    two.finish('b')
    await settle()
    expect(two.order).toEqual(['a', 'b', 'c'])
    two.finish('a')
    two.finish('c')
    await Promise.all(paired)
    expect(two.most()).toBe(2)
  })

  it('leave the line when given up on while waiting, and the next goes in their place', async () => {
    const r = requests()
    const first = inTurn('https://three', 1, undefined, r.send('a'))
    const stop = new AbortController()
    const dropped = inTurn('https://three', 1, stop.signal, r.send('b'))
    const third = inTurn('https://three', 1, undefined, r.send('c'))
    stop.abort(new Error('stopped'))
    await expect(dropped).rejects.toThrow('stopped')
    r.finish('a')
    await settle()
    expect(r.order).toEqual(['a', 'c'])
    r.finish('c')
    await Promise.all([first, third])
  })

  it('let the next go when one fails', async () => {
    const r = requests()
    const failing = inTurn('https://four', 1, undefined, () => Promise.reject(new Error('down')))
    const next = inTurn('https://four', 1, undefined, r.send('b'))
    await expect(failing).rejects.toThrow('down')
    await settle()
    expect(r.order).toEqual(['b'])
    r.finish('b')
    expect(await next).toBe('b')
  })
})
