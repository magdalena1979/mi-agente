import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'
import { env } from '@/lib/env'

const authModes = {
  signIn: 'signIn',
  signUp: 'signUp',
} as const

const baseSchema = z.object({
  email: z.email('Ingresa un email valido.'),
  password: z.string().min(6, 'La contrasena debe tener al menos 6 caracteres.'),
  confirmPassword: z.string().optional(),
})

type AuthFormValues = z.infer<typeof baseSchema>
type AuthMode = (typeof authModes)[keyof typeof authModes]

type NavigationState = {
  from?: {
    pathname?: string
    search?: string
    hash?: string
  }
}

export function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, signUp, isConfigured } = useAuth()
  const [mode, setMode] = useState<AuthMode>(authModes.signIn)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const redirectState = (location.state as NavigationState | null)?.from
  const redirectTo = redirectState
    ? `${redirectState.pathname ?? '/'}${redirectState.search ?? ''}${redirectState.hash ?? ''}`
    : '/'

  const form = useForm<AuthFormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  async function onSubmit(values: AuthFormValues) {
    setErrorMessage(null)
    setFeedback(null)

    if (mode === authModes.signUp && values.password !== values.confirmPassword) {
      form.setError('confirmPassword', {
        message: 'Las contrasenas no coinciden.',
      })
      return
    }

    setIsSubmitting(true)

    try {
      if (mode === authModes.signIn) {
        await signIn({
          email: values.email,
          password: values.password,
        })
        navigate(redirectTo, { replace: true })
      } else {
        const result = await signUp({
          email: values.email,
          password: values.password,
        })

        if (result.requiresEmailConfirmation) {
          setFeedback(
            'Te enviamos un email de confirmacion. Cuando actives la cuenta, ya podras entrar.',
          )
        } else {
          navigate(redirectTo, { replace: true })
        }
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos completar la autenticacion.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="page">
      <div className="section-title">
        <h1>The Things We STILL Share</h1>
        <p>
          Tu archivo personal de capturas, recomendaciones, recetas, peliculas, libros y cosas para volver a mirar.
        </p>
      </div>

      <div className="card-grid card-grid--two">
        <article className="card">
          <div className="auth-toggle" role="tablist" aria-label="Modo de acceso">
            <button
              type="button"
              className={mode === authModes.signIn ? 'auth-toggle__item auth-toggle__item--active' : 'auth-toggle__item'}
              onClick={() => {
                setMode(authModes.signIn)
                setFeedback(null)
                setErrorMessage(null)
              }}
            >
              Iniciar sesion
            </button>
            <button
              type="button"
              className={mode === authModes.signUp ? 'auth-toggle__item auth-toggle__item--active' : 'auth-toggle__item'}
              onClick={() => {
                setMode(authModes.signUp)
                setFeedback(null)
                setErrorMessage(null)
              }}
            >
              Crear cuenta
            </button>
          </div>

          <form className="auth-form" onSubmit={form.handleSubmit(onSubmit)}>
            <label className="form-field">
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                placeholder="tu@email.com"
                {...form.register('email')}
              />
              {form.formState.errors.email ? (
                <small className="form-error">
                  {form.formState.errors.email.message}
                </small>
              ) : null}
            </label>

            <label className="form-field">
              <span>Contrasena</span>
              <input
                type="password"
                autoComplete={
                  mode === authModes.signUp ? 'new-password' : 'current-password'
                }
                placeholder="Minimo 6 caracteres"
                {...form.register('password')}
              />
              {form.formState.errors.password ? (
                <small className="form-error">
                  {form.formState.errors.password.message}
                </small>
              ) : null}
            </label>

            {mode === authModes.signUp ? (
              <label className="form-field">
                <span>Repetir contrasena</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repite la contrasena"
                  {...form.register('confirmPassword')}
                />
                {form.formState.errors.confirmPassword ? (
                  <small className="form-error">
                    {form.formState.errors.confirmPassword.message}
                  </small>
                ) : null}
              </label>
            ) : null}

            {errorMessage ? <p className="feedback feedback--error">{errorMessage}</p> : null}
            {feedback ? <p className="feedback feedback--success">{feedback}</p> : null}

            <button
              type="submit"
              className="button"
              disabled={!isConfigured || isSubmitting}
            >
              {isSubmitting
                ? 'Procesando...'
                : mode === authModes.signIn
                  ? 'Entrar'
                  : 'Crear cuenta'}
            </button>
          </form>
        </article>

        <article className="card">
          <h2>Para que sirve</h2>
          <div className="steps">
            {[
              'Guardar capturas antes de mandarlas a WhatsApp y perderlas.',
              'Leer texto desde imagenes con OCR.',
              'Dejar que la IA sugiera tipo, titulo y datos clave.',
              'Revisar y guardar todo en tu propio archivo.',
            ].map((step, index) => (
              <div className="step" key={step}>
                <span className="step__index">{index + 1}</span>
                <p>{step}</p>
              </div>
            ))}
          </div>

          <div className="auth-note">
            <strong>Estado de conexion</strong>
            <p>
              {isConfigured
                ? 'La app ya puede conectarse con tu proyecto de Supabase.'
                : !env.hasValidSupabaseUrl && env.supabaseUrl
                  ? 'La URL de Supabase no parece ser la URL API del proyecto.'
                  : !env.hasValidSupabaseAnonKey && env.supabaseAnonKey
                    ? 'La anon key no tiene formato valido de Supabase.'
                    : 'Todavia falta configurar las variables publicas de Supabase.'}
            </p>
          </div>
        </article>
      </div>
    </section>
  )
}
