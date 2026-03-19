import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { transcripts as api } from '../utils/api';

export default function TranscriptView() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Chat
  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);

  // Is this a bulk (multi-video) transcript?
  const videos = detail?.videos || [];
  const isBulk = videos.length > 1;
  const currentVideo = videos[selectedIdx] || videos[0];

  const videoId = currentVideo?.videoId || detail?.videoId || '';
  const title = currentVideo?.title || detail?.title || 'Transcript';
  const channelName = detail?.channelName || '';
  const transcriptText = currentVideo?.transcript || detail?.transcript || '';

  useEffect(() => {
    (async () => {
      try {
        const result = await api.getById(id);
        setDetail(result.transcript || result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Load chat history & suggestions when video changes
  useEffect(() => {
    if (!detail || !videoId) return;
    setMessages([]);
    setSuggestions([]);
    Promise.all([
      api.getChatHistory(id, videoId).catch(() => ({ messages: [] })),
      api.getSuggestions(id, videoId).catch(() => ({ suggestions: [] }))
    ]).then(([h, s]) => {
      setMessages(h.messages || []);
      setSuggestions(s.suggestions || []);
    });
  }, [detail, videoId, id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || sending) return;
    const userMsg = { role: 'user', content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const result = await api.chat(id, text.trim(), videoId);
      setMessages((prev) => [...prev, { role: 'assistant', content: result.message }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setSending(false);
    }
  }, [sending, id, videoId]);

  const handleDownload = async () => {
    try {
      const blob = await api.download(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${channelName || title}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <button onClick={() => navigate('/library')} className="text-sm text-indigo-600 hover:text-indigo-700 mb-4 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Library
        </button>
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/library')}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
          >
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="font-semibold text-gray-900 truncate">
              {isBulk ? channelName || 'Channel Transcripts' : title}
            </h1>
            {isBulk && (
              <p className="text-xs text-gray-500">{videos.length} videos &middot; Viewing: {title}</p>
            )}
            {!isBulk && channelName && <p className="text-xs text-gray-500">{channelName}</p>}
          </div>
        </div>
        <button
          onClick={handleDownload}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Video list sidebar (bulk only) */}
        {isBulk && (
          <div className="w-64 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col shrink-0">
            <div className="px-3 py-2.5 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wider shrink-0">
              Videos ({videos.length})
            </div>
            <div className="flex-1 overflow-y-auto">
              {videos.map((v, i) => (
                <button
                  key={v.videoId || i}
                  onClick={() => setSelectedIdx(i)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-50 transition-colors ${
                    i === selectedIdx
                      ? 'bg-indigo-50 border-l-2 border-l-indigo-500'
                      : 'hover:bg-gray-50 border-l-2 border-l-transparent'
                  }`}
                >
                  <p className={`text-sm truncate ${i === selectedIdx ? 'font-medium text-indigo-900' : 'text-gray-700'}`}>
                    {v.title || v.videoId || `Video ${i + 1}`}
                  </p>
                  {v.transcript ? (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {v.transcript.split('\n').length} lines
                    </p>
                  ) : (
                    <p className="text-xs text-red-400 mt-0.5">No transcript</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Transcript panel */}
        <div className="flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between shrink-0">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Transcript</span>
            {isBulk && (
              <span className="text-xs text-gray-400">{title}</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-sm leading-relaxed text-gray-700">
            {transcriptText ? (
              transcriptText.split('\n').map((line, i) => {
                const m = line.match(/^(\[[^\]]+\])(.*)/);
                if (m) {
                  return (
                    <div key={i} className="flex gap-3 py-0.5 hover:bg-indigo-50/50 rounded px-1 -mx-1 transition-colors">
                      <span className="text-indigo-500 font-medium shrink-0">{m[1]}</span>
                      <span>{m[2]}</span>
                    </div>
                  );
                }
                return <div key={i} className="py-0.5">{line}</div>;
              })
            ) : (
              <p className="text-gray-400 italic">No transcript text available</p>
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className="w-80 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col shrink-0">
          <div className="px-4 py-2.5 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wider shrink-0">
            AI Chat
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
            {/* Suggestions */}
            {suggestions.length > 0 && messages.length === 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s)}
                    className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Empty state */}
            {messages.length === 0 && suggestions.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-sm text-gray-400">Ask anything about this transcript</p>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm prose-chat'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-4 py-3 rounded-xl rounded-bl-sm flex gap-1">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 px-3 py-2 shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                placeholder="Ask about this transcript..."
                disabled={sending}
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400 disabled:opacity-50"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || sending}
                className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
