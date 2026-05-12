import type { SanctumRequestBody } from './types'

/**
 * Encode a body for fetch, returning the encoded value and any Content-Type
 * that must be set. Returns `[null, null]` for null/undefined.
 *
 * - `BodyInit` values pass through; we never override their Content-Type.
 *   FormData, Blob, ReadableStream set their own headers via fetch.
 * - `URLSearchParams` is treated as `application/x-www-form-urlencoded`.
 * - Plain objects/arrays are JSON-serialized.
 */
export function encodeBody(
  body: SanctumRequestBody,
): { body: BodyInit | null; contentType: string | null } {
  if (body === null || body === undefined) return { body: null, contentType: null }

  if (typeof body === 'string') return { body, contentType: 'application/json' }

  if (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  ) {
    return { body: body as BodyInit, contentType: null }
  }

  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return { body, contentType: 'application/x-www-form-urlencoded;charset=UTF-8' }
  }

  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return { body, contentType: null }
  }

  return { body: JSON.stringify(body), contentType: 'application/json' }
}

const JSON_TYPES = /\bapplication\/(?:[^+\s;]+\+)?json\b/i

export async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return null
  const type = response.headers.get('content-type') ?? ''
  if (JSON_TYPES.test(type)) {
    const text = await response.text()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }
  return response.text()
}
