import { useState } from 'react'
import { signInWithPopup } from 'firebase/auth'
import './Login.css'
import { auth, firebaseConfigError, googleProvider } from './firebase-config'

export type AuthUser = {
  email: string
  name: string
  picture?: string
}

type LoginProps = {
  onLogin?: (user: AuthUser) => void
}

export function Login({ onLogin }: LoginProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleLogin = async () => {
    setError(null)
    setLoading(true)
    try {
      if (firebaseConfigError || !auth || !googleProvider) {
        throw new Error(
          firebaseConfigError ?? 'Firebase is not configured. Check your VITE_FIREBASE_* env vars.',
        )
      }
      const result = await signInWithPopup(auth, googleProvider)
      const u = result.user
      const user: AuthUser = {
        email: u.email ?? '',
        name: u.displayName ?? u.email ?? 'User',
        picture: u.photoURL ?? undefined,
      }
      if (user.email) onLogin?.(user)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      // Also log for easier debugging in DevTools
      // eslint-disable-next-line no-console
      console.error('Firebase sign-in failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Food Log Calendar</h1>
        <p className="login-subtitle">Sign in with your Google account to continue</p>
        <div className="login-button-wrap">
          <button
            type="button"
            className="google-login-button"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in with Google'}
          </button>
        </div>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
