import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { youtube } from '../utils/api';

function parseYouTubeUrl(input) {
  const trimmed = input.trim();
  // Video ID directly
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return { type: 'video', videoId: trimmed };

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace('www.', '').replace('m.', '');

    if (host === 'youtube.com' || host === 'youtu.be') {
      // Video
      if (url.pathname === '/watch' && url.searchParams.has('v')) {
        return { type: 'video', videoId: url.searchParams.get('v') };
      }
      if (host === 'youtu.be' && url.pathname.length > 1) {
        return { type: 'video', videoId: url.pathname.slice(1) };
      }
      if (url.pathname.startsWith('/shorts/')) {
        return { type: 'video', videoId: url.pathname.split('/')[2] };
      }
      // Channel
      if (url.pathname.startsWith('/@') || url.pathname.startsWith('/channel/') || url.pathname.startsWith('/c/')) {
        return { type: 'channel', channelUrl: `${url.origin}${url.pathname}` };
      }
    }
  } catch {
    // Not a URL
  }
  return null;
}

export default function Extract({ user, onCreditsChange }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [minutesCharged, setMinutesCharged] = useState(0);

  // Bulk state
  const [channelVideos, setChannelVideos] = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [bulkMinutesUsed, setBulkMinutesUsed] = useState(0);
  const completionRef = useRef(null);

  const creditMinutes = user?.creditMinutes ?? 0;

  useEffect(() => {
    if (saved && completionRef.current) {
      completionRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [saved]);

  const handleExtract = async () => {
    setError(null);
    setResult(null);
    setChannelVideos(null);
    setSaved(false);
    setMinutesCharged(0);
    setBulkMinutesUsed(0);

    const parsed = parseYouTubeUrl(url);
    if (!parsed) {
      setError('Please enter a valid YouTube video URL, channel URL, or video ID');
      return;
    }

    setLoading(true);
    try {
      if (parsed.type === 'video') {
        const data = await youtube.fetchTranscript(parsed.videoId);
        setResult({
          videoId: parsed.videoId,
          transcript: data.transcript,
          language: data.language,
          videoTitle: data.videoTitle,
          videoChannelName: data.videoChannelName,
          videoChannelId: data.videoChannelId,
          duration: data.duration,
        });
        setMinutesCharged(data.minutesCharged || 1);
        if (onCreditsChange) onCreditsChange();
      } else {
        const data = await youtube.getChannelVideos(parsed.channelUrl);
        setChannelVideos(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const saveResult = await youtube.saveIndividual({
        videoId: result.videoId,
        title: result.videoTitle || `Video ${result.videoId}`,
        channelName: result.videoChannelName || undefined,
        channelId: result.videoChannelId || undefined,
        duration: result.duration || undefined,
        transcript: result.transcript,
        language: result.language
      });
      setSaved(true);
      if (onCreditsChange) onCreditsChange();
      // Navigate to transcript detail after short delay
      const id = saveResult.transcriptId || saveResult.transcript?._id || saveResult._id;
      if (id) setTimeout(() => navigate(`/transcript/${id}`), 600);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkExtract = async () => {
    if (!channelVideos?.videos?.length) return;
    const videos = channelVideos.videos;
    setBulkProgress({ total: videos.length, completed: 0, results: [] });
    setBulkMinutesUsed(0);
    let totalMins = 0;

    const results = [];
    for (let i = 0; i < videos.length; i++) {
      try {
        const data = await youtube.fetchTranscript(videos[i].videoId, videos[i].duration);
        const mins = data.minutesCharged || 1;
        totalMins += mins;
        setBulkMinutesUsed(totalMins);
        results.push({ ...videos[i], transcript: data.transcript, language: data.language, minutesCharged: mins, error: null });
      } catch (err) {
        results.push({ ...videos[i], transcript: null, error: err.message });
      }
      setBulkProgress({ total: videos.length, completed: i + 1, results: [...results] });
      if (onCreditsChange) onCreditsChange();
    }

    // Save bulk
    try {
      const successful = results.filter((r) => r.transcript);
      if (successful.length > 0) {
        await youtube.saveBulk({
          channelName: channelVideos.channelName || 'Unknown Channel',
          channelId: channelVideos.channelId || 'unknown',
          channelUrl: channelVideos.channelUrl || url,
          channelProfilePictureUrl: channelVideos.channelProfilePictureUrl || null,
          videos: successful.map((v) => ({
            videoId: v.videoId,
            title: v.title,
            transcript: v.transcript,
            language: v.language,
            transcriptStatus: 'success',
            duration: v.duration || null,
            viewCount: v.viewCount || null,
            publishedAt: v.publishedAt || null
          }))
        });
        setSaved(true);
        if (onCreditsChange) onCreditsChange();
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) handleExtract();
  };

  const lineCount = result?.transcript?.split('\n').length || 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* URL input */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Extract transcript</h1>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
            creditMinutes > 50 ? 'bg-indigo-50 text-indigo-700' : creditMinutes > 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              creditMinutes > 50 ? 'bg-indigo-500' : creditMinutes > 0 ? 'bg-amber-500' : 'bg-red-500'
            }`} />
            {creditMinutes} min remaining
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-4">Paste a YouTube video URL, channel URL, or video ID</p>

        <div className="flex gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://youtube.com/watch?v=... or @channelname"
              className="w-full px-4 py-3 pl-11 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow placeholder:text-gray-400"
            />
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <button
            onClick={handleExtract}
            disabled={!url.trim() || loading}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-indigo-200 flex items-center gap-2 shrink-0"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            Extract
          </button>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}
      </div>

      {/* Single video result */}
      {result && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-900">{result.videoTitle || 'Transcript extracted'}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {lineCount} lines &middot; {result.language || 'en'}{result.videoChannelName && <> &middot; {result.videoChannelName}</>}
                {minutesCharged > 0 && <> &middot; <span className="text-indigo-600 font-medium">{minutesCharged} min charged</span></>}
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                saved
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md'
              } disabled:opacity-70`}
            >
              {saved ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Saved
                </>
              ) : saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  Save to Library
                </>
              )}
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto px-5 py-4 font-mono text-sm leading-relaxed text-gray-700">
            {result.transcript.split('\n').map((line, i) => {
              const m = line.match(/^(\[[^\]]+\])(.*)/);
              if (m) {
                return (
                  <div key={i} className="flex gap-3 py-0.5">
                    <span className="text-indigo-500 font-medium shrink-0">{m[1]}</span>
                    <span>{m[2]}</span>
                  </div>
                );
              }
              return <div key={i} className="py-0.5">{line}</div>;
            })}
          </div>
        </div>
      )}

      {/* Channel videos list */}
      {channelVideos && !bulkProgress && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-900">{channelVideos.channelName || 'Channel'}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{channelVideos.videos?.length || 0} videos found</p>
            </div>
            <button
              onClick={handleBulkExtract}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-all hover:shadow-md flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Extract All
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {channelVideos.videos?.map((v) => (
              <div key={v.videoId} className="px-5 py-3 flex items-center gap-3">
                {v.thumbnail && (
                  <img src={v.thumbnail} alt="" className="w-20 h-12 object-cover rounded-lg shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{v.title}</p>
                  <p className="text-xs text-gray-500">{v.videoId}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bulk progress */}
      {bulkProgress && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-900">
                {saved ? 'Extraction complete' : 'Extracting transcripts...'}
              </h2>
              <span className="text-sm text-gray-500 font-medium">
                {bulkProgress.completed}/{bulkProgress.total}
                {bulkMinutesUsed > 0 && <> &middot; <span className="text-indigo-600">{bulkMinutesUsed} min used</span></>}
              </span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                style={{ width: `${(bulkProgress.completed / bulkProgress.total) * 100}%` }}
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
            {bulkProgress.results.map((r, i) => (
              <div key={i} className="px-5 py-2 flex items-center justify-between">
                <p className="text-sm text-gray-700 truncate flex-1">{r.title || r.videoId}</p>
                {r.transcript ? (
                  <span className="text-xs text-emerald-600 font-medium ml-2 shrink-0">Done</span>
                ) : (
                  <span className="text-xs text-red-500 ml-2 shrink-0">Failed</span>
                )}
              </div>
            ))}
          </div>
          {saved && (
            <div ref={completionRef} className="px-5 py-4 border-t border-gray-100 bg-emerald-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium text-emerald-800">
                  {bulkProgress.results.filter(r => r.transcript).length} transcripts saved
                </span>
              </div>
              <button
                onClick={() => navigate('/library?tab=bulk')}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-all hover:shadow-md flex items-center gap-2"
              >
                View Transcripts
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !channelVideos && !loading && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="font-medium text-gray-900 mb-1">Paste a YouTube URL above</h3>
          <p className="text-sm text-gray-500">
            Supports video URLs, channel URLs, short URLs, and video IDs
          </p>
        </div>
      )}
    </div>
  );
}
