import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Extract from './pages/Extract';
import Dashboard from './pages/Dashboard';
import TranscriptView from './pages/TranscriptView';
import Account from './pages/Account';
import { fetchProfile, logout as doLogout } from './utils/auth';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tubewhiz_token');
    if (!token) { setLoading(false); return; }

    fetchProfile()
      .then((res) => setUser(res.user || res))
      .catch(() => localStorage.removeItem('tubewhiz_token'))
      .finally(() => setLoading(false));
  }, []);

  const handleLogin = useCallback((userData) => {
    setUser(userData.user || userData);
  }, []);

  const refreshUser = useCallback(() => {
    fetchProfile()
      .then((res) => setUser(res.user || res))
      .catch(() => {});
  }, []);

  const handleLogout = useCallback(() => {
    doLogout();
    setUser(null);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Landing onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar user={user} onLogout={handleLogout} />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Extract user={user} onCreditsChange={refreshUser} />} />
          <Route path="/library" element={<Dashboard />} />
          <Route path="/transcript/:id" element={<TranscriptView />} />
          <Route path="/account" element={<Account user={user} onLogout={handleLogout} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
