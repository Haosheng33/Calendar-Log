import { useState } from 'react'
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import './Login.css'
import { auth, firebaseConfigError, googleProvider } from './firebase-config'

export type AuthUser = {
  email: string
  name: string
  picture?: string
}

type AuthTab = 'signin' | 'signup'

type LoginProps = {
  onLogin?: (user: AuthUser) => void
  onGuestLogin?: () => void
}

export function Login({ onLogin, onGuestLogin }: LoginProps) {
  const [tab, setTab] = useState<AuthTab>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setDisplayName('')
    setError(null)
  }

  const switchTab = (next: AuthTab) => {
    resetForm()
    setTab(next)
  }

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
      setError(friendlyFirebaseError(err))
      console.error('Firebase sign-in failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }
    setLoading(true)
    try {
      if (firebaseConfigError || !auth) {
        throw new Error(
          firebaseConfigError ?? 'Firebase is not configured.',
        )
      }
      const result = await signInWithEmailAndPassword(auth, email.trim(), password)
      const u = result.user
      const user: AuthUser = {
        email: u.email ?? '',
        name: u.displayName ?? u.email ?? 'User',
        picture: u.photoURL ?? undefined,
      }
      if (user.email) onLogin?.(user)
    } catch (err) {
      setError(friendlyFirebaseError(err))
      console.error('Email sign-in failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      if (firebaseConfigError || !auth) {
        throw new Error(
          firebaseConfigError ?? 'Firebase is not configured.',
        )
      }
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password)
      const u = result.user
      if (displayName.trim()) {
        await updateProfile(u, { displayName: displayName.trim() })
      }
      const user: AuthUser = {
        email: u.email ?? '',
        name: displayName.trim() || (u.email ?? 'User'),
        picture: u.photoURL ?? undefined,
      }
      if (user.email) onLogin?.(user)
    } catch (err) {
      setError(friendlyFirebaseError(err))
      console.error('Email sign-up failed:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-hero">
          <span className="login-badge">Wellness tracker</span>
          <div className="login-logo" aria-hidden="true">🍽️</div>
          <h1 className="login-title">Food Log Calendar</h1>
          <p className="login-subtitle">
            Track meals, keep an eye on progress, explore recipes, and get a cleaner daily health
            routine in one place.
          </p>
          <div className="login-feature-list" aria-label="App highlights">
            <span className="login-feature-chip">Calorie calendar</span>
            <span className="login-feature-chip">Recipe videos</span>
            <span className="login-feature-chip">AI coach</span>
          </div>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${tab === 'signin' ? 'active' : ''}`}
            onClick={() => switchTab('signin')}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => switchTab('signup')}
          >
            Sign Up
          </button>
        </div>

        {tab === 'signin' && (
          <form className="auth-form" onSubmit={handleEmailSignIn}>
            <label className="auth-field">
              <span className="auth-label">Email</span>
              <input
                className="auth-input"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="auth-field">
              <span className="auth-label">Password</span>
              <input
                className="auth-input"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {tab === 'signup' && (
          <form className="auth-form" onSubmit={handleEmailSignUp}>
            <label className="auth-field">
              <span className="auth-label">Name (optional)</span>
              <input
                className="auth-input"
                type="text"
                autoComplete="name"
                placeholder="Your display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label className="auth-field">
              <span className="auth-label">Email</span>
              <input
                className="auth-input"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="auth-field">
              <span className="auth-label">Password</span>
              <input
                className="auth-input"
                type="password"
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="auth-field">
              <span className="auth-label">Confirm Password</span>
              <input
                className="auth-input"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        )}

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}

        <div className="auth-divider">
          <span className="auth-divider-line" />
          <span className="auth-divider-text">or</span>
          <span className="auth-divider-line" />
        </div>

        <button
          type="button"
          className="google-login-button"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <svg className="google-icon" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 010-9.18l-7.98-6.19a24.08 24.08 0 000 21.56l7.98-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        <button
          type="button"
          className="guest-login-button"
          onClick={onGuestLogin}
          disabled={loading}
        >
          Continue as Guest
        </button>

        <p className="login-trust-note">
          Sign in to sync your profile and logs, or use guest mode to try the app locally first.
        </p>

        <p className="login-footer">
          {tab === 'signin'
            ? "Don't have an account? "
            : 'Already have an account? '}
          <button
            type="button"
            className="auth-switch-link"
            onClick={() => switchTab(tab === 'signin' ? 'signup' : 'signin')}
          >
            {tab === 'signin' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  )
}

function friendlyFirebaseError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const code = (err as { code?: string }).code ?? ''
  switch (code) {
    case 'auth/user-not-found':
      return 'No account found with this email. Try signing up.'
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in.'
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 6 characters.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed. Please try again.'
    case 'auth/network-request-failed':
      return 'Network error. Check your internet connection.'
    default:
      return err.message
  }
}
