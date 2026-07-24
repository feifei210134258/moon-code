import type { RuntimeExternalConnectionInput } from '../../shared/contracts.js'

const MAX_ORIGIN_LENGTH = 2_048
const MAX_TOKEN_LENGTH = 4_096

export function validateRuntimeExternalConnection(value: unknown): RuntimeExternalConnectionInput {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid Kimi Runtime connection')
  }
  const input = value as Record<string, unknown>
  if (
    typeof input.origin !== 'string' || input.origin.length === 0 || input.origin.length > MAX_ORIGIN_LENGTH ||
    typeof input.token !== 'string' || input.token.length === 0 || input.token.length > MAX_TOKEN_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(input.token)
  ) throw new TypeError('Invalid Kimi Runtime connection')
  let url: URL
  try {
    url = new URL(input.origin)
  } catch {
    throw new TypeError('Invalid Kimi Runtime origin')
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username.length > 0 || url.password.length > 0 ||
    (url.pathname !== '/' && url.pathname.length > 0) || url.search.length > 0 || url.hash.length > 0
  ) throw new TypeError('Invalid Kimi Runtime origin')
  return { origin: url.origin, token: input.token }
}
