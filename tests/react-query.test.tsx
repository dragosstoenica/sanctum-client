import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { createSanctumClient } from '../src/client'
import { SanctumProvider } from '../src/react/SanctumProvider'
import {
  bindSanctumToQueryClient,
  SANCTUM_USER_QUERY_KEY,
  useSanctumQuery,
} from '../src/react-query'
import { makeRouter } from './helpers/make-fetch'

const USER = { id: 1, email: 'a@b.c' }

function wrapper(client: ReturnType<typeof createSanctumClient>, qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <SanctumProvider client={client}>{children}</SanctumProvider>
      </QueryClientProvider>
    )
  }
}

describe('react-query integration', () => {
  it('useSanctumQuery fetches user and exposes it', async () => {
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      autoFetchUser: false,
      fetch: makeRouter({ '/api/user': { body: USER } }),
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const Wrapper = wrapper(client, qc)

    function Body() {
      const q = useSanctumQuery()
      if (q.isPending) return <div>loading</div>
      return <div>got:{(q.data as { email: string } | null)?.email ?? 'none'}</div>
    }

    const { getByText } = render(<Body />, { wrapper: Wrapper })
    await waitFor(() => getByText('got:a@b.c'))
  })

  it('bindSanctumToQueryClient invalidates user query on login event', async () => {
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      autoFetchUser: false,
      fetch: makeRouter({ '/api/user': { body: USER } }),
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    qc.setQueryData(SANCTUM_USER_QUERY_KEY, { id: 99, email: 'old' })
    const unsub = bindSanctumToQueryClient(client, qc)

    expect(qc.getQueryState(SANCTUM_USER_QUERY_KEY)?.isInvalidated).toBe(false)
    await act(async () => {
      client.emit('login', { user: USER })
    })
    expect(qc.getQueryState(SANCTUM_USER_QUERY_KEY)?.isInvalidated).toBe(true)

    unsub()
  })

  it('logout event also invalidates', async () => {
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      autoFetchUser: false,
      fetch: makeRouter({}),
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(SANCTUM_USER_QUERY_KEY, USER)
    bindSanctumToQueryClient(client, qc)

    await act(async () => {
      client.emit('logout', undefined)
    })
    expect(qc.getQueryState(SANCTUM_USER_QUERY_KEY)?.isInvalidated).toBe(true)
  })

  it('unsubscribe stops invalidation', async () => {
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      autoFetchUser: false,
      fetch: makeRouter({}),
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(SANCTUM_USER_QUERY_KEY, USER)
    const unsub = bindSanctumToQueryClient(client, qc)
    unsub()
    await act(async () => {
      client.emit('login', { user: USER })
    })
    expect(qc.getQueryState(SANCTUM_USER_QUERY_KEY)?.isInvalidated).toBe(false)
  })
})
