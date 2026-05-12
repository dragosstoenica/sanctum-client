import { createContext } from 'react'

import type { SanctumClient } from '../types'

export const SanctumContext = createContext<SanctumClient<unknown> | null>(null)
SanctumContext.displayName = 'SanctumContext'
