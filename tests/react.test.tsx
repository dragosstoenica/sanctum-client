import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createSanctumClient } from '../src/client'
import { RequireAuth } from '../src/react/RequireAuth'
import { RequireGuest } from '../src/react/RequireGuest'
import { SanctumProvider } from '../src/react/SanctumProvider'
import { useAuth, useLogin, useUser } from '../src/react/hooks'

type TestUser = { id: number; email: string }

function makeFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
}

describe('SanctumProvider + hooks', () => {
  it('hydrates with initialUser and exposes via useUser', () => {
    const client = createSanctumClient<TestUser>({
      baseURL: 'https://api.example.com',
      autoFetchUser: false,
      fetch: makeFetch({}),
    })
    function Body() {
      const user = useUser<TestUser>()
      return <div>user:{user?.email ?? 'none'}</div>
    }
    render(
      <SanctumProvider client={client} initialUser={{ id: 1, email: 'a@b.c' }}>
        <Body />
      </SanctumProvider>,
    )
    expect(screen.getByText('user:a@b.c')).toBeTruthy()
  })

  it('RequireAuth gates content; RequireGuest is inverse', () => {
    const client = createSanctumClient<TestUser>({
      baseURL: 'https://api.example.com',
      autoFetchUser: false,
      fetch: makeFetch({}),
    })
    function Tree() {
      return (
        <>
          <RequireAuth fallback={<span>NA</span>}><span>YA</span></RequireAuth>
          <RequireGuest fallback={<span>NG</span>}><span>YG</span></RequireGuest>
        </>
      )
    }
    render(
      <SanctumProvider client={client} initialUser={null}>
        <Tree />
      </SanctumProvider>,
    )
    expect(screen.getByText('NA')).toBeTruthy()
    expect(screen.getByText('YG')).toBeTruthy()

    act(() => {
      client.setUser({ id: 1, email: 'a@b.c' })
    })
    expect(screen.getByText('YA')).toBeTruthy()
    expect(screen.getByText('NG')).toBeTruthy()
  })

  it('useAuth tracks status transitions', () => {
    const client = createSanctumClient<TestUser>({
      baseURL: 'https://api.example.com',
      autoFetchUser: false,
      fetch: makeFetch({}),
    })
    function Body() {
      const { status, isAuthenticated } = useAuth()
      return <div>{status}:{String(isAuthenticated)}</div>
    }
    const { rerender } = render(
      <SanctumProvider client={client} initialUser={null}>
        <Body />
      </SanctumProvider>,
    )
    expect(screen.getByText('unauthenticated:false')).toBeTruthy()
    act(() => {
      client.setUser({ id: 1, email: 'a@b.c' })
    })
    rerender(
      <SanctumProvider client={client}>
        <Body />
      </SanctumProvider>,
    )
    expect(screen.getByText('authenticated:true')).toBeTruthy()
  })

  it('useLogin throws if no provider', () => {
    function Body() {
      useLogin()
      return null
    }
    expect(() => render(<Body />)).toThrow(/SanctumProvider/)
  })
})
