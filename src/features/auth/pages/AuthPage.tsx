import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-context'
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
  const [searchParams] = useSearchParams()
  const { signIn, signUp, resetPasswordForEmail, isConfigured } = useAuth()
  const requestedMode = searchParams.get('mode')
  const invitedEmail = searchParams.get('email')?.trim().toLowerCase() ?? ''
  const [mode, setMode] = useState<AuthMode>(
    requestedMode === authModes.signUp ? authModes.signUp : authModes.signIn,
  )
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(false)
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
      email: invitedEmail,
      password: '',
      confirmPassword: '',
    },
  })

  useEffect(() => {
    if (requestedMode === authModes.signIn || requestedMode === authModes.signUp) {
      setMode(requestedMode)
    }
  }, [requestedMode])

  useEffect(() => {
    if (!invitedEmail) {
      return
    }

    form.setValue('email', invitedEmail, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    })
  }, [form, invitedEmail])

  async function handlePasswordReset() {
    const email = form.getValues('email').trim().toLowerCase()

    if (!email) {
      form.setError('email', {
        message: 'Ingresa tu email para recuperar la contrasena.',
      })
      return
    }

    const emailValidation = z.email('Ingresa un email valido.').safeParse(email)

    if (!emailValidation.success) {
      form.setError('email', {
        message: 'Ingresa un email valido.',
      })
      return
    }

    setIsRecoveringPassword(true)
    setErrorMessage(null)
    setFeedback(null)

    try {
      await resetPasswordForEmail(
        email,
        `${window.location.origin}/reset-password`,
      )
      setFeedback(
        'Te enviamos un email para restablecer tu contrasena. Revisa tu casilla y sigue el link.',
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No pudimos iniciar la recuperacion de contrasena.',
      )
    } finally {
      setIsRecoveringPassword(false)
    }
  }

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
    <section className="page page--auth">
      <div className="section-title auth-hero">
        
        <h1>Tu archivo de cosas en comun</h1>
        <p>
          {invitedEmail
            ? `Crea tu cuenta o inicia sesion con ${invitedEmail} para aceptar la invitacion.`
            : 'Guarda capturas, links, recomendaciones, recetas, peliculas, libros y esas cosas que queres volver a encontrar.'}
        </p>
        {!invitedEmail ? (
          <p className="auth-hero__subcopy">
            La idea no es solo tener tu archivo personal: tambien poder compartirlo
            con otra persona con la que tenes gustos, referencias y hallazgos en
            comun.
          </p>
        ) : null}
      </div>

      <div className="card-grid card-grid--two">
        <article className="card auth-card auth-card--form">
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

            <div className="entry-form__actions">
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

              {mode === authModes.signIn ? (
                <button
                  type="button"
                  className="button--ghost"
                  disabled={!isConfigured || isRecoveringPassword}
                  onClick={() => {
                    void handlePasswordReset()
                  }}
                >
                  {isRecoveringPassword ? 'Enviando...' : 'Olvide mi contrasena'}
                </button>
              ) : null}
            </div>
          </form>
        </article>

        <article className="card auth-card auth-card--story">
          <div className="section-title auth-story">
            <h2>No es solo guardar</h2>
            <p className="auth-story__intro">
              Tambien es armar un mapa compartido de intereses: peliculas, libros,
              lugares, recetas o posts que hablan de lo que tenes en comun.
            </p>
          </div>

          <div className="auth-story__grid">
            {[
              {
                title: 'Guardas',
                copy: 'Capturas y links antes de que se pierdan entre chats, pestanas o guardados sueltos.',
              },
              {
                title: 'Entendes',
                copy: 'La IA lee la captura, reconoce contexto y te deja una ficha mas util que una simple imagen.',
              },
              {
                title: 'Compartis',
                copy: 'Podes abrirle ese archivo a alguien con quien compartis gustos, ideas o referencias.',
              },
            ].map((item) => (
              <article key={item.title} className="field-card auth-story__card">
                <strong>{item.title}</strong>
                <p>{item.copy}</p>
              </article>
            ))}
          </div>
        </article>
      </div>

      <article className="card auth-card auth-card--steps">
        <div className="section-title">
          <h2>Como funciona</h2>
          <p>Un recorrido simple para pasar de una captura a algo util y compartible.</p>
        </div>

        <div className="steps auth-steps">
          {[
            'Cargas capturas o links que te queres guardar.',
            'OCR + IA entienden de que se trata y proponen una ficha.',
            'Revisas, editas y lo convertis en algo facil de volver a encontrar.',
            'Si queres, lo compartis con alguien con quien tenes cosas en comun.',
          ].map((step, index) => (
            <div className="step" key={step}>
              <span className="step__index">{index + 1}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
