import { useCallback, useMemo } from 'react'

// Import via the public subpath (not relative) so consumer bundlers see a single
// module identity for `useSanctum` shared across all subpaths. With relative
// imports, tsup splitting plus Vite dep optimization can produce duplicate
// SanctumContext instances and break `useSanctum` inside Fortify hooks.
import { useMutation, useSanctum } from 'sanctum-client/react'
import {
  createSanctumFortify,
  type ConfirmPasswordPayload,
  type ForgotPasswordPayload,
  type RegisterPayload,
  type ResetPasswordPayload,
  type SanctumFortify,
  type TwoFactorChallengePayload,
  type TwoFactorConfirmPayload,
  type UpdatePasswordPayload,
  type UpdateProfilePayload,
} from './createSanctumFortify'

/**
 * Returns a memoized {@link SanctumFortify} bound to the current client.
 * Use this directly if you need the imperative API; otherwise prefer the
 * named hooks below (`useRegister`, `useForgotPassword`, etc).
 */
export function useSanctumFortify<TUser = unknown>(): SanctumFortify<TUser> {
  const client = useSanctum<TUser>()
  return useMemo(() => createSanctumFortify(client), [client])
}

/** Mutation hook for `POST /register`. Auto-logs the user in on success. */
export function useRegister<TUser = unknown>() {
  const fortify = useSanctumFortify<TUser>()
  return useMutation((p: RegisterPayload) => fortify.register(p))
}

/** Mutation hook for `POST /forgot-password`. Returns `{ status }`. */
export function useForgotPassword() {
  const fortify = useSanctumFortify()
  return useMutation((p: ForgotPasswordPayload) => fortify.forgotPassword(p))
}

/** Mutation hook for `POST /reset-password` with the token from the email. */
export function useResetPassword() {
  const fortify = useSanctumFortify()
  return useMutation((p: ResetPasswordPayload) => fortify.resetPassword(p))
}

/** Mutation hook for `PUT /user/profile-information`. Refetches the user on success. */
export function useUpdateProfile<TUser = unknown>() {
  const fortify = useSanctumFortify<TUser>()
  return useMutation((p: UpdateProfilePayload) => fortify.updateProfile(p))
}

/** Mutation hook for `PUT /user/password`. */
export function useUpdatePassword() {
  const fortify = useSanctumFortify()
  return useMutation((p: UpdatePasswordPayload) => fortify.updatePassword(p))
}

/** Mutation hook for `POST /email/verification-notification`. */
export function useResendEmailVerification() {
  const fortify = useSanctumFortify()
  return useMutation(() => fortify.resendEmailVerification())
}

/**
 * Mutation hook for `POST /user/confirm-password`. Required by Fortify before
 * enabling/disabling 2FA when `confirmPassword: true` is set in `config/fortify.php`.
 */
export function useConfirmPassword() {
  const fortify = useSanctumFortify()
  return useMutation((p: ConfirmPasswordPayload) => fortify.confirmPassword(p))
}

/**
 * Mutation hook for `POST /two-factor-challenge`. Submit either a TOTP `code`
 * or a `recovery_code`. Refetches the user on success.
 */
export function useTwoFactorChallenge<TUser = unknown>() {
  const fortify = useSanctumFortify<TUser>()
  return useMutation((p: TwoFactorChallengePayload) => fortify.twoFactor.challenge(p))
}

export interface UseTwoFactorResult {
  enable: () => Promise<void>
  disable: () => Promise<void>
  confirm: (payload: TwoFactorConfirmPayload) => Promise<void>
  qrCode: () => Promise<{ svg: string }>
  secretKey: () => Promise<{ secretKey: string }>
  recoveryCodes: () => Promise<string[]>
  regenerateRecoveryCodes: () => Promise<string[]>
}

export function useTwoFactor(): UseTwoFactorResult {
  const fortify = useSanctumFortify()
  const enable = useCallback(() => fortify.twoFactor.enable(), [fortify])
  const disable = useCallback(() => fortify.twoFactor.disable(), [fortify])
  const confirm = useCallback(
    (p: TwoFactorConfirmPayload) => fortify.twoFactor.confirm(p),
    [fortify],
  )
  const qrCode = useCallback(() => fortify.twoFactor.qrCode(), [fortify])
  const secretKey = useCallback(() => fortify.twoFactor.secretKey(), [fortify])
  const recoveryCodes = useCallback(() => fortify.twoFactor.recoveryCodes(), [fortify])
  const regenerateRecoveryCodes = useCallback(
    () => fortify.twoFactor.regenerateRecoveryCodes(),
    [fortify],
  )
  return { enable, disable, confirm, qrCode, secretKey, recoveryCodes, regenerateRecoveryCodes }
}
