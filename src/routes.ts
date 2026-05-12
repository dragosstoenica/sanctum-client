import type { SanctumAuthRoutes, SanctumAuthRoutesInput } from './types'

export const DEFAULT_ROUTES: SanctumAuthRoutes = {
  csrf: '/sanctum/csrf-cookie',
  login: '/login',
  logout: '/logout',
  user: '/api/user',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  verifyEmail: '/email/verification-notification',
  confirmPassword: '/user/confirm-password',
  profile: '/user/profile-information',
  password: '/user/password',
  twoFactorEnable: '/user/two-factor-authentication',
  twoFactorDisable: '/user/two-factor-authentication',
  twoFactorConfirm: '/user/confirmed-two-factor-authentication',
  twoFactorChallenge: '/two-factor-challenge',
  twoFactorRecovery: '/user/two-factor-recovery-codes',
  twoFactorQrCode: '/user/two-factor-qr-code',
  twoFactorSecretKey: '/user/two-factor-secret-key',
}

export function resolveRoutes(input?: SanctumAuthRoutesInput): SanctumAuthRoutes {
  return { ...DEFAULT_ROUTES, ...input }
}
