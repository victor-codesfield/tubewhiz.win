const API = import.meta.env.VITE_API_URL || '';

function getToken() {
  return localStorage.getItem('tubewhiz_token');
}

export function setToken(token) {
  localStorage.setItem('tubewhiz_token', token);
}

export function clearToken() {
  localStorage.removeItem('tubewhiz_token');
}

async function request(method, path, body) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const res = await fetch(`${API}${path}`, opts);

  if (path.includes('/download') && res.ok) return res.blob();

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server error (${res.status})`);
  }

  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
  return data;
}

export const auth = {
  googleLogin: (token) => request('POST', '/api/auth/google', { token }),
  devLogin: () => request('POST', '/api/auth/dev', {}),
  getProfile: () => request('GET', '/api/auth/profile'),
  recordPurchaseIntent: (totalUSD) => request('POST', '/api/auth/purchase-intent', { totalUSD })
};

export const youtube = {
  fetchTranscript: (videoId, duration) => request('POST', '/api/youtube/fetch-transcript', { videoId, ...(duration ? { duration } : {}) }),
  getChannelVideos: (channelUrl) => request('POST', '/api/youtube/channel-videos', { channelUrl }),
  saveIndividual: (data) => request('POST', '/api/youtube/save-individual', data),
  saveBulk: (data) => request('POST', '/api/youtube/save-bulk', data)
};

export const transcripts = {
  getIndividual: () => request('GET', '/api/transcripts/individual'),
  getBulk: () => request('GET', '/api/transcripts/bulk'),
  getById: (id) => request('GET', `/api/transcripts/${id}`),
  delete: (id) => request('DELETE', `/api/transcripts/${id}`),
  chat: (id, message, videoId) => request('POST', `/api/transcripts/${id}/chat`, { message, videoId }),
  getChatHistory: (id, videoId) => request('GET', `/api/transcripts/${id}/chat/history?videoId=${videoId}`),
  getSuggestions: (id, videoId) => request('POST', `/api/transcripts/${id}/suggestions`, { videoId }),
  download: (id) => request('GET', `/api/transcripts/${id}/download`)
};
