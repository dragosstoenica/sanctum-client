import type { SanctumClient } from '../types'

export interface RegisterPayload {
  name: string
  email: string
  password: string
  password_confirmation: string
  [extra: string]: unknown
}

export interface ForgotPasswordPayload {
  email: string
}

export interface ResetPasswordPayload {
  token: string
  email: string
  password: string
  password_confirmation: string
}

export interface UpdateProfilePayload {
  name?: string
  email?: string
  [extra: string]: unknown
}

export interface UpdatePasswordPayload {
  current_password: string
  password: string
  password_confirmation: string
}

export interface ConfirmPasswordPayload {
  password: string
}

export interface TwoFactorChallengePayload {
  code?: string
  recovery_code?: string
}

export interface TwoFactorConfirmPayload {
  code: string
}

export interface TwoFactorQrCodeResponse {
  svg: string
}

export interface TwoFactorRecoveryCodesResponse extends Array<string> {}

export function createSanctumFortify<TUser = unknown>(client: SanctumClient<TUser>) {
  const { fetch, raw, config } = client
  const { routes } = config

  async function register(payload: RegisterPayload): Promise<TUser> {
    await client.ensureCsrf()
    const response = await fetch<unknown>(routes.register, {
      method: 'POST',
      body: payload,
    })
    // Token mode: pull token from register response
    if (config.mode === 'token') {
      const token = config.tokenExtractor(response)
      if (token) await client.setToken(token)
    }
    const user = await client.fetchUser()
    if (!user) {
      throw new Error('Register: user fetch returned null after successful registration.')
    }
    client.emit('login', { user })
    return user
  }

  async function forgotPassword(payload: ForgotPasswordPayload): Promise<{ status: string }> {
    return fetch<{ status: string }>(routes.forgotPassword, {
      method: 'POST',
      body: payload,
    })
  }

  async function resetPassword(payload: ResetPasswordPayload): Promise<{ status: string }> {
    return fetch<{ status: string }>(routes.resetPassword, {
      method: 'POST',
      body: payload,
    })
  }

  async function updateProfile(payload: UpdateProfilePayload): Promise<TUser | null> {
    await fetch<unknown>(routes.profile, { method: 'PUT', body: payload })
    return client.fetchUser()
  }

  async function updatePassword(payload: UpdatePasswordPayload): Promise<void> {
    await fetch<unknown>(routes.password, { method: 'PUT', body: payload })
  }

  async function resendEmailVerification(): Promise<{ status?: string }> {
    return fetch<{ status?: string }>(routes.verifyEmail, { method: 'POST' })
  }

  async function confirmPassword(payload: ConfirmPasswordPayload): Promise<void> {
    await fetch<unknown>(routes.confirmPassword, { method: 'POST', body: payload })
  }

  async function enableTwoFactor(): Promise<void> {
    await fetch<unknown>(routes.twoFactorEnable, { method: 'POST' })
  }

  async function disableTwoFactor(): Promise<void> {
    await fetch<unknown>(routes.twoFactorDisable, { method: 'DELETE' })
  }

  async function confirmTwoFactor(payload: TwoFactorConfirmPayload): Promise<void> {
    await fetch<unknown>(routes.twoFactorConfirm, { method: 'POST', body: payload })
  }

  async function challengeTwoFactor(payload: TwoFactorChallengePayload): Promise<TUser | null> {
    await fetch<unknown>(routes.twoFactorChallenge, { method: 'POST', body: payload })
    return client.fetchUser()
  }

  async function getTwoFactorQrCode(): Promise<TwoFactorQrCodeResponse> {
    return fetch<TwoFactorQrCodeResponse>(routes.twoFactorQrCode)
  }

  async function getTwoFactorSecretKey(): Promise<{ secretKey: string }> {
    return fetch<{ secretKey: string }>(routes.twoFactorSecretKey)
  }

  async function getTwoFactorRecoveryCodes(): Promise<TwoFactorRecoveryCodesResponse> {
    return fetch<TwoFactorRecoveryCodesResponse>(routes.twoFactorRecovery)
  }

  async function regenerateTwoFactorRecoveryCodes(): Promise<TwoFactorRecoveryCodesResponse> {
    const { data } = await raw<TwoFactorRecoveryCodesResponse>(routes.twoFactorRecovery, {
      method: 'POST',
    })
    return data
  }

  return {
    register,
    forgotPassword,
    resetPassword,
    updateProfile,
    updatePassword,
    resendEmailVerification,
    confirmPassword,
    twoFactor: {
      enable: enableTwoFactor,
      disable: disableTwoFactor,
      confirm: confirmTwoFactor,
      challenge: challengeTwoFactor,
      qrCode: getTwoFactorQrCode,
      secretKey: getTwoFactorSecretKey,
      recoveryCodes: getTwoFactorRecoveryCodes,
      regenerateRecoveryCodes: regenerateTwoFactorRecoveryCodes,
    },
  }
}

export type SanctumFortify<TUser = unknown> = ReturnType<typeof createSanctumFortify<TUser>>
