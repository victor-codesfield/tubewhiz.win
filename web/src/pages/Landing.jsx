import React, { useState } from 'react';
import { loginWithGoogle, loginDev } from '../utils/auth';

export default function Landing({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDevLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loginDev();
      onLogin(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
        throw new Error('Google login is not configured. Missing VITE_GOOGLE_CLIENT_ID.');
      }
      if (!window.google?.accounts?.oauth2) {
        throw new Error('Google Identity Services failed to load. Try refreshing the page.');
      }
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        scope: 'openid email profile',
        callback: async (response) => {
          if (response.access_token) {
            try {
              const result = await loginWithGoogle({ credential: response.access_token });
              onLogin(result);
            } catch (err) {
              setError(err.message);
              setLoading(false);
            }
          }
        }
      });
      client.requestAccessToken();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-white to-indigo-50/30 flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <span className="font-bold text-lg bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            TubeWhiz
          </span>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium mb-6">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            AI-powered transcript analysis
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 mb-4">
            Extract YouTube transcripts{' '}
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              in seconds
            </span>
          </h1>

          <p className="text-lg text-gray-600 mb-10 max-w-lg mx-auto">
            Paste any YouTube URL and get the full transcript instantly.
            Chat with AI about the content, save to your library, and extract entire channels.
          </p>

          {/* Login buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="inline-flex items-center gap-3 px-6 py-3 bg-white border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:shadow-md transition-all disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            {import.meta.env.DEV && (
              <button
                onClick={handleDevLogin}
                disabled={loading}
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-200 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                )}
                Dev Login
              </button>
            )}
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-600">{error}</p>
          )}

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-16 text-left">
            {[
              { icon: '⚡', title: 'Instant extraction', desc: 'Server-side fetching — no browser limitations' },
              { icon: '🤖', title: 'AI chat', desc: 'Ask questions about any transcript with AI' },
              { icon: '📦', title: 'Bulk extract', desc: 'Grab every transcript from a channel at once' }
            ].map((f) => (
              <div key={f.title} className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
                <div className="text-2xl mb-2">{f.icon}</div>
                <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
                <p className="text-sm text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="py-6 text-center text-xs text-gray-400">
        TubeWhiz &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
