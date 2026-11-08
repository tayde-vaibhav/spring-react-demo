import { constants, lstatSync, openSync, fstatSync, readFileSync, closeSync, opendirSync, realpathSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { NONCE_MARKER } from './policy.mjs'

const TYPES = new Map([['js', 'text/javascript; charset=utf-8'], ['css', 'text/css; charset=utf-8'],
  ['svg', 'image/svg+xml'], ['png', 'image/png'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'], ['avif', 'image/avif'], ['ico', 'image/x-icon'], ['woff', 'font/woff'], ['woff2', 'font/woff2']])

// Startup-only indexing: request paths never become filesystem paths.
export function loadBuild(directory) {
  const root = resolve(directory)
  if (realpathSync(root) !== root || !lstatSync(root).isDirectory()) throw new Error('Invalid frontend build')
  let entries = 0
  let bytes = 0
  function read(path, limit) {
    const initial = lstatSync(path)
    if (initial.isSymbolicLink() || !initial.isFile()) throw new Error('Invalid frontend build')
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stat = fstatSync(fd)
      if (!stat.isFile() || stat.size > limit) throw new Error('Invalid frontend build')
      const body = readFileSync(fd)
      bytes += body.length
      if (body.length > limit || bytes > 64 * 1024 * 1024) throw new Error('Invalid frontend build')
      return body
    } finally { closeSync(fd) }
  }
  const template = read(join(root, 'index.html'), 256 * 1024).toString('utf8')
  if (template.split(NONCE_MARKER).length !== 2 || !template.includes('name="app-style-nonce"')) {
    throw new Error('Invalid frontend HTML build')
  }
  const assets = new Map()
  function walk(directory, prefix, depth) {
    if (depth > 8 || lstatSync(directory).isSymbolicLink()) throw new Error('Invalid frontend build')
    const handle = opendirSync(directory, { bufferSize: 1 })
    try {
      let entry
      while ((entry = handle.readSync()) !== null) {
        if (++entries > 1024 || entry.isSymbolicLink()) throw new Error('Invalid frontend build')
        if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(entry.name) || entry.name.endsWith('.map')) {
          throw new Error('Invalid frontend asset')
        }
        const file = join(directory, entry.name)
        const url = `${prefix}/${entry.name}`
        if (entry.isDirectory()) { walk(file, url, depth + 1); continue }
        const type = TYPES.get(entry.name.split('.').at(-1))
        if (!type) throw new Error('Invalid frontend asset')
        assets.set(url, { body: read(file, 8 * 1024 * 1024), type })
      }
    } finally {
      handle.closeSync()
    }
  }
  walk(join(root, 'assets'), '/assets', 0)
  return { template, assets }
}
