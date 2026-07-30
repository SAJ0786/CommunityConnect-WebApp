import React, { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebase';

function formatDate(value) {
  if (!value) return '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(date);
}

export default function StreamedVideos({ isGuest }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadVideos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await httpsCallable(functions, 'listStreamVideos')();
      setVideos(result.data?.videos || []);
    } catch (err) {
      console.error('[StreamedVideos] Load failed:', err);
      setError('The streamed videos list could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadVideos(); }, [loadVideos]);

  const renderVideoCard = video => {
    const isLive = video.status === 'live' || video.status === 'active';
    const title = video.eventTitle || 'Community Event Stream';
    return (
      <article key={video.id} className="card" style={{ margin:0, padding:14, display:'grid', gap:12 }}>
        {!isGuest && video.videoId ? (
          <img
            src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            style={{ width:'100%', aspectRatio:'16 / 9', objectFit:'cover', borderRadius:6, background:'#e5e7eb' }}
          />
        ) : (
          <div aria-hidden="true" style={{ width:'100%', aspectRatio:'16 / 9', borderRadius:6,
            display:'grid', placeItems:'center', background:'#f1f5f4', color:'#64748b', fontSize:'2rem' }}>
            ▶
          </div>
        )}

        <div>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
            <h3 style={{ margin:0, fontSize:'1rem', lineHeight:1.35 }}>{title}</h3>
            <span style={{ flexShrink:0, padding:'3px 7px', borderRadius:99, fontSize:'0.6875rem', fontWeight:800,
              color:isLive ? '#991b1b' : '#475569', background:isLive ? '#fee2e2' : '#f1f5f9' }}>
              {isLive ? 'LIVE' : 'Completed'}
            </span>
          </div>
          {video.hostName && <p style={{ margin:'7px 0 0', fontSize:'0.8125rem', fontWeight:700 }}>{video.hostName}</p>}
          <p className="small" style={{ margin:'5px 0 0', color:'var(--muted)' }}>
            {[formatDate(video.eventDate || video.startedAt), video.privacyStatus === 'unlisted' ? 'Private' : 'Public'].filter(Boolean).join(' · ')}
          </p>
        </div>

        {video.watchUrl ? (
          <a href={video.watchUrl} target="_blank" rel="noreferrer"
            style={{ minHeight:44, display:'flex', alignItems:'center', justifyContent:'center',
              borderRadius:8, background:'#ff0000', color:'white', textDecoration:'none', fontWeight:900 }}>
            Watch on YouTube
          </a>
        ) : (
          <button type="button" disabled style={{ minHeight:44, borderRadius:8, opacity:.55, cursor:'not-allowed' }}>
            Sign in to watch
          </button>
        )}
      </article>
    );
  };

  return (
    <section style={{ padding:'8px 16px 32px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:14 }}>
        <div>
          <h2 style={{ margin:'0 0 4px' }}>Streamed Videos</h2>
          <p className="small" style={{ margin:0, color:'var(--muted)' }}>
            Community Events Australia live-stream archive
          </p>
        </div>
        <button className="btn-light" onClick={loadVideos} disabled={loading} aria-label="Refresh streamed videos">
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {isGuest && (
        <div style={{ padding:'12px 14px', marginBottom:14, border:'1px solid #99d5ce',
          borderRadius:8, background:'#effcf9', color:'#115e59', fontSize:'0.8125rem', lineHeight:1.5 }}>
          Sign in to open streamed videos on YouTube.
        </div>
      )}

      {error && (
        <div className="error" style={{ marginBottom:14 }}>
          {error} <button className="btn-light" onClick={loadVideos}>Retry</button>
        </div>
      )}

      {!loading && !error && videos.length === 0 && (
        <div className="card center" style={{ margin:0 }}>
          <h3 style={{ margin:'0 0 6px' }}>No streamed videos yet</h3>
          <p className="small" style={{ margin:0, color:'var(--muted)' }}>Completed app streams will appear here.</p>
        </div>
      )}

      {!loading && !error && videos.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap:12 }}>
          {videos.map(renderVideoCard)}
        </div>
      )}
    </section>
  );
}
