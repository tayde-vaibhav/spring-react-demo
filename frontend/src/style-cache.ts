import createCache from '@emotion/cache'

export function readStyleNonce(values: readonly string[], development: boolean): string | undefined {
  if (development) return undefined
  if (values.length !== 1 || values[0].length !== 32 || !/^[A-Za-z0-9+/]{32}$/.test(values[0])) {
    throw new Error('Frontend security metadata is missing or invalid')
  }
  return values[0]
}

export function createAppStyleCache(values: readonly string[], development: boolean) {
  const nonce = readStyleNonce(values, development)
  return createCache({ key: 'css', ...(nonce ? { nonce } : {}) })
}
