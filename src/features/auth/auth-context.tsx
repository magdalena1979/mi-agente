/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { supabase } from '@/integrations/supabase/client'

type AuthCredentials = {
  email: string
  password: string
}

type AuthContextValue = {
  session: Session | null
  user: User | null
  isLoading: boolean
  isConfigured: boolean
  signIn: (credentials: AuthCredentials) => Promise<void>
  signUp: (credentials: AuthCredentials) => Promise<{
    requiresEmailConfirmation: boolean
  }>
  resetPasswordForEmail: (email: string, redirectTo: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function getMissingConfigError() {
  return new Error(
    'Supabase no esta configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
  )
}

function isBlockedEmail(email: string): boolean {
  const lowerEmail = email.toLowerCase()
  
  // Patrones de emails bloqueados
  const blockedPatterns = [
    /@jjsolutions/, // Cualquier email con dominio @jjsolutions
    /srossi/, // Emails que contengan "srossi"
    /zantiagorossi/, // Emails que contengan "zantiagorossi"
  ]
  
  return blockedPatterns.some(pattern => pattern.test(lowerEmail))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) {
      return
    }

    let isMounted = true

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error
        if (isMounted) {
          setSession(data.session)
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (isMounted) {
          setSession(null)
          setIsLoading(false)
        }
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsLoading(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isConfigured: Boolean(supabase),
      async signIn({ email, password }) {
        if (!supabase) throw getMissingConfigError()

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error
      },
      async signUp({ email, password }) {
        if (!supabase) throw getMissingConfigError()

        // Validar que el email no esté bloqueado
        if (isBlockedEmail(email)) {
          throw new Error(
            'Ni te preocupes, ya tengo pila de personas que me quieren y me valoran que prueben mi app y se alegren conmigo'
          )
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        })

        if (error) throw error

        return {
          requiresEmailConfirmation: !data.session,
        }
      },
      async resetPasswordForEmail(email, redirectTo) {
        if (!supabase) throw getMissingConfigError()

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        })

        if (error) throw error
      },
      async updatePassword(password) {
        if (!supabase) throw getMissingConfigError()

        const { error } = await supabase.auth.updateUser({
          password,
        })

        if (error) throw error
      },
      async signOut() {
        if (!supabase) throw getMissingConfigError()

        const { error } = await supabase.auth.signOut()

        if (error) throw error
      },
    }),
    [isLoading, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider.')
  }

  return context
}
