import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { transcripts as api } from '../utils/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [individual, setIndividual] = useState([]);
  const [bulk, setBulk] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(searchParams.get('tab') === 'bulk' ? 'bulk' : 'individual');
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    Promise.all([
      api.getIndividual().catch(() => ({ transcripts: [] })),
      api.getBulk().catch(() => ({ transcripts: [] }))
    ]).then(([ind, blk]) => {
      setIndividual(ind.transcripts || []);
      setBulk(blk.transcripts || []);
      setLoading(false);
    });
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this transcript?')) return;
    setDeleting(id);
    try {
      await api.delete(id);
      setIndividual((prev) => prev.filter((t) => t._id !== id));
      setBulk((prev) => prev.filter((t) => t._id !== id));
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  const items = tab === 'individual' ? individual : bulk;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Library</h1>
          <p className="text-sm text-gray-500">Your saved transcripts</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          {[
            { key: 'individual', label: 'Videos', count: individual.length },
            { key: 'bulk', label: 'Channels', count: bulk.length }
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs ${tab === t.key ? 'text-indigo-600' : 'text-gray-400'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="font-medium text-gray-900 mb-1">No transcripts yet</h3>
          <p className="text-sm text-gray-500 mb-4">Extract a transcript to get started</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Extract transcript
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const title = item.title || item.videos?.[0]?.title || item.channelName || 'Untitled';
            const channel = item.channelName || '';
            const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '';
            const videoCount = item.videos?.length;

            return (
              <div
                key={item._id}
                className="group bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer relative"
                onClick={() => navigate(`/transcript/${item._id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-gray-900 text-sm truncate">{title}</h3>
                    {channel && <p className="text-xs text-gray-500 mt-0.5 truncate">{channel}</p>}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item._id);
                    }}
                    disabled={deleting === item._id}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                  {date && <span>{date}</span>}
                  {videoCount && (
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium">
                      {videoCount} videos
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
