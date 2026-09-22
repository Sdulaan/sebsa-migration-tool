'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '../../lib/auth'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    setTimeout(() => {
      const ok = login(email, password)
      setSubmitting(false)
      if (ok) router.replace('/')
      else setError('Incorrect email or password.')
    }, 350)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/sebsa-logo.png" alt="SEBSA" className="login-logo" />
        <h1>IFS Data Migration</h1>
        <p className="login-sub">Sign in to prepare and migrate master data.</p>

        <form className="form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@sebsa.com"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>

          {error && <div className="error">{error}</div>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-hint">
          Demo access &middot; <b>admin@sebsa.com</b> / <b>sebsa2026</b>
        </div>
      </div>
    </div>
  )
}
