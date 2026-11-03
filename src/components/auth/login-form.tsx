'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth/client'
import { Anchor, Eye, EyeOff } from 'lucide-react'

export default function LoginForm({ basicSignup }: { basicSignup: boolean }) {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<'signin' | 'signup'>(
    basicSignup && searchParams.get('tab') === 'signup' ? 'signup' : 'signin'
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)


  const switchTab = (next: 'signin' | 'signup') => {
    setTab(next)
    setError(null)
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (tab === 'signin') {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) setError(error.message ?? 'Sign in failed.');
        // Reset cached Better Auth/Convex state from the previous signed-out user.
        else { window.location.assign('/dashboard'); }
      } else {
        if (!basicSignup) { setError('Account creation is not enabled for this preview.'); return; }
        const { error } = await authClient.signUp.email({ email, password, name: email.split('@')[0] });
        if (error) setError(error.message ?? 'Account creation failed.');
        else { window.location.assign('/dashboard'); }
      }
    } catch { setError('Couldn’t connect. Please try again.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mb-8">
        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
          <Anchor className="w-5 h-5 text-white" />
        </div>
        <span className="text-2xl font-bold text-slate-900 tracking-tight">Berthwise</span>
      </Link>

      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          {/* Tab switcher */}
          <div className="flex bg-slate-100 rounded-xl p-1 mb-8">
            <button
              onClick={() => switchTab('signin')}
              className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${
                tab === 'signin'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => switchTab('signup')}
              disabled={!basicSignup}
              className={`flex-1 text-sm font-medium py-2 rounded-lg transition-all ${
                tab === 'signup'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Email / Password form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Password
                </label>

              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                  className="w-full px-4 py-2.5 pr-11 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 border border-red-100">
                {error}
              </div>
            )}


            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white font-medium py-2.5 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-sm"
            >
              {loading
                ? 'Please wait…'
                : tab === 'signin'
                ? 'Sign In'
                : 'Create Account'}
            </button>
          </form>
          <p className="mt-4 text-xs text-slate-500">Password recovery by email is not available yet.</p>
        </div>

        <p className="text-center text-sm text-slate-500 mt-6">
          By continuing, you agree to our{' '}
          <Link href="/terms" className="text-blue-600 hover:underline">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-blue-600 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
