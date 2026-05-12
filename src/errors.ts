export class SanctumHttpError extends Error {
  readonly status: number
  readonly response: Response
  readonly data: unknown

  constructor(response: Response, data: unknown) {
    const message = extractMessage(data) ?? `HTTP ${response.status} ${response.statusText}`.trim()
    super(message)
    this.name = 'SanctumHttpError'
    this.status = response.status
    this.response = response
    this.data = data
  }

  /** Laravel validation error map ({ field: string[] }) if present. */
  get errors(): Record<string, string[]> | null {
    if (this.data && typeof this.data === 'object' && 'errors' in this.data) {
      const errs = (this.data as { errors: unknown }).errors
      if (errs && typeof errs === 'object') return errs as Record<string, string[]>
    }
    return null
  }
}

export class SanctumNetworkError extends Error {
  override readonly cause: unknown
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Network request failed')
    this.name = 'SanctumNetworkError'
    this.cause = cause
  }
}

export class SanctumConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SanctumConfigError'
  }
}

function extractMessage(data: unknown): string | null {
  if (data && typeof data === 'object' && 'message' in data) {
    const msg = (data as { message: unknown }).message
    if (typeof msg === 'string') return msg
  }
  return null
}
