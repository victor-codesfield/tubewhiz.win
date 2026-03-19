import React, { useState, useEffect } from 'react';
import { auth } from '../utils/api';

export default function Account({ user, onLogout }) {
  const [profile, setProfile] = useState(user);
  const [qty, setQty] = useState(1);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    auth.getProfile()
      .then((res) => { if (res.user) setProfile(res.user); else setProfile(res); })
      .catch(() => {});
  }, []);

  const u = profile || user;
  const mins = u.creditMinutes ?? 0;
  const pricePerPack = 4.99;

  const handleCheckout = async () => {
    try { await auth.recordPurchaseIntent(+(qty * pricePerPack).toFixed(2)); } catch {}
    setShowModal(true);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Account</h1>

      {/* Profile card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4">
          {u.picture ? (
            <img src={u.picture} alt="" className="w-14 h-14 rounded-full" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl font-semibold">
              {(u.name || u.email || '?')[0].toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">{u.name || 'User'}</h2>
            <p className="text-sm text-gray-500">{u.email}</p>
          </div>
        </div>
      </div>

      {/* Credits card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Credit Minutes</h3>
          <span className={`text-2xl font-bold ${mins > 50 ? 'text-indigo-600' : mins > 0 ? 'text-amber-500' : 'text-red-500'}`}>
            {mins} <span className="text-base font-medium text-gray-400">min</span>
          </span>
        </div>

        {/* Credits bar */}
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all ${
              mins > 50 ? 'bg-indigo-500' : mins > 0 ? 'bg-amber-400' : 'bg-red-400'
            }`}
            style={{ width: `${Math.min(100, (mins / 250) * 100)}%` }}
          />
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Each video costs its duration in minutes (rounded up, minimum 1 min)
        </p>

        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">How it works</h4>
          <ul className="text-sm text-gray-500 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-indigo-500 mt-0.5">&#8226;</span>
              A 5-minute video costs 5 minutes
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-500 mt-0.5">&#8226;</span>
              A 25-minute video costs 25 minutes
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-500 mt-0.5">&#8226;</span>
              A 1-hour video costs 60 minutes
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-500 mt-0.5">&#8226;</span>
              Minutes are charged when you extract, not when you save
            </li>
          </ul>
        </div>
      </div>

      {/* Checkout card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Get More Minutes</h3>

        <div className="border border-gray-200 rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-gray-900">250 Credit Minutes</p>
              <p className="text-sm text-gray-500">Top up your balance</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">${pricePerPack.toFixed(2)}</p>
          </div>

          <div className="h-px bg-gray-100 mb-4" />

          {/* Quantity selector */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Quantity</span>
            <div className="flex items-center gap-0">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                className="w-9 h-9 flex items-center justify-center rounded-l-lg border border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg font-medium"
              >
                -
              </button>
              <div className="w-12 h-9 flex items-center justify-center border-t border-b border-gray-300 bg-white text-sm font-semibold text-gray-900">
                {qty}
              </div>
              <button
                onClick={() => setQty((q) => Math.min(10, q + 1))}
                disabled={qty >= 10}
                className="w-9 h-9 flex items-center justify-center rounded-r-lg border border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg font-medium"
              >
                +
              </button>
            </div>
          </div>

          <div className="h-px bg-gray-100 my-4" />

          {/* Total */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">{(qty * 250).toLocaleString()} minutes</span>
            <span className="text-lg font-bold text-gray-900">${(qty * pricePerPack).toFixed(2)}</span>
          </div>
        </div>

        {/* Checkout button */}
        <button
          onClick={handleCheckout}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors hover:shadow-lg hover:shadow-indigo-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Proceed to Checkout
        </button>
      </div>

      {/* Sign out */}
      <button
        onClick={onLogout}
        className="w-full px-4 py-3 bg-white border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition-colors"
      >
        Sign Out
      </button>

      {/* Thank you modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm mx-4 p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Thank you for your interest!</h3>
            <p className="text-sm text-gray-500 mb-6">
              We're currently in beta and gathering feedback. Purchases will be available soon — we'll notify you when they go live.
            </p>
            <button
              onClick={() => setShowModal(false)}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
