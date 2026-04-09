import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles, Youtube } from 'lucide-react';
import { audienceApi } from '@/lib/api';
import { getSocket, disconnectSocket } from '@/lib/socket';

interface Stamp {
  id: string;
  label: string;
  emoji: string;
  color: string;
  animation: string;
}

interface EventData {
  title: string;
  status: string;
  stamps: Stamp[];
  youtube_url?: string;
  banner_url?: string;
  admin_comment?: string;
}

interface FloatingEmoji {
  id: number;
  emoji: string;
  x: number;
  scale: number;
}

function getYoutubeEmbedId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export default function AudiencePage() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<EventData | null>(null);
  const [sessionToken, setSessionToken] = useState('');
  const [error, setError] = useState('');
  const [stampCounts, setStampCounts] = useState<Record<string, number>>({});
  const [pressAnimations, setPressAnimations] = useState<Record<string, boolean>>({});
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const floatIdRef = useRef(0);

  // Load event & join
  useEffect(() => {
    if (!eventId) return;

    audienceApi.get(`/events/${eventId}`).then(r => {
      const data = r.data.data;
      setEvent({
        title: data.title,
        status: data.status,
        stamps: data.stamps || [],
        youtube_url: data.youtube_url,
        banner_url: data.banner_url,
        admin_comment: data.admin_comment,
      });
      return audienceApi.post(`/events/${eventId}/join`, {});
    }).then(r => {
      setSessionToken(r.data.data.session_token);
    }).catch(err => {
      const msg = err.response?.data?.message || 'イベントに接続できません';
      setError(msg);
    });

    return () => {
      disconnectSocket();
    };
  }, [eventId]);

  // Socket.IO
  useEffect(() => {
    if (!eventId || !sessionToken) return;
    const socket = getSocket(eventId, { sessionToken });

    socket.on('stamp:update', (data: { stampId: string; count: number }) => {
      setStampCounts(prev => ({
        ...prev,
        [data.stampId]: (prev[data.stampId] || 0) + data.count,
      }));
    });

    socket.on('event:status', (data: { status: string }) => {
      setEvent(prev => prev ? { ...prev, status: data.status } : prev);
    });

    return () => { disconnectSocket(); };
  }, [eventId, sessionToken]);

  const addFloatingEmoji = useCallback((emoji: string) => {
    const id = floatIdRef.current++;
    const newEmoji: FloatingEmoji = {
      id,
      emoji,
      x: 15 + Math.random() * 70,
      scale: 0.8 + Math.random() * 0.7,
    };
    setFloatingEmojis(prev => [...prev, newEmoji].slice(-40));
    setTimeout(() => {
      setFloatingEmojis(prev => prev.filter(f => f.id !== id));
    }, 1800);
  }, []);

  const handleStamp = useCallback((stamp: Stamp) => {
    if (!sessionToken || event?.status !== 'live') return;

    const socket = getSocket(eventId!, { sessionToken });
    socket.emit('stamp', { stampId: stamp.id, count: 1 });

    setPressAnimations(prev => ({ ...prev, [stamp.id]: true }));
    setTimeout(() => setPressAnimations(prev => ({ ...prev, [stamp.id]: false })), 350);

    addFloatingEmoji(stamp.emoji);
  }, [sessionToken, event?.status, eventId, addFloatingEmoji]);

  if (error) {
    return (
      <div className="min-h-screen audience-bg flex items-center justify-center p-4">
        <div className="text-center text-white">
          <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg">{error}</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen audience-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (event.status === 'ended') {
    return (
      <div className="min-h-screen audience-bg flex items-center justify-center p-4">
        <div className="text-center text-white">
          <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <h1 className="text-xl font-bold mb-2">{event.title}</h1>
          <p className="text-white/60">このイベントは終了しました</p>
          <p className="text-white/40 text-sm mt-4">ご参加ありがとうございました！</p>
        </div>
      </div>
    );
  }

  const embedId = getYoutubeEmbedId(event.youtube_url || '');
  const stamps = event.stamps || [];

  return (
    <div className="min-h-screen audience-bg text-white flex flex-col relative overflow-hidden">
      {/* Floating emojis */}
      {floatingEmojis.map(f => (
        <div
          key={f.id}
          className="absolute float-up pointer-events-none select-none"
          style={{
            left: `${f.x}%`,
            bottom: '40%',
            fontSize: `${f.scale * 2.2}rem`,
            zIndex: 50,
          }}
        >
          {f.emoji}
        </div>
      ))}

      {/* Header */}
      <div className="text-center pt-6 pb-3 px-4">
        <div className="flex items-center justify-center gap-1.5 text-white/40 mb-2">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs font-medium tracking-wider uppercase">EventStamp</span>
        </div>
        <h1 className="text-base font-bold text-white">{event.title}</h1>
        {event.status === 'draft' && (
          <p className="text-sm text-white/50 mt-2">イベント開始を待っています...</p>
        )}
        {event.status === 'live' && (
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-xs text-red-400 font-semibold tracking-widest">LIVE</span>
          </div>
        )}
      </div>

      {/* YouTube embed */}
      {embedId && (
        <div className="px-4 pb-3">
          <div className="max-w-lg mx-auto rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40">
              <Youtube className="h-3.5 w-3.5 text-red-400" />
              <span className="text-xs text-white/50">ライブ配信中</span>
            </div>
            <div className="aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${embedId}?autoplay=0`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

      {/* Banner image (shown only if no YouTube) */}
      {!embedId && event.banner_url && (
        <div className="px-4 pb-3">
          <div className="max-w-lg mx-auto rounded-2xl overflow-hidden border border-white/10 shadow-xl">
            <img src={event.banner_url} alt="バナー" className="w-full object-cover max-h-48" />
          </div>
        </div>
      )}

      {/* Admin comment */}
      {event.admin_comment && (
        <div className="px-4 pb-3">
          <div className="max-w-lg mx-auto audience-comment-card rounded-xl px-4 py-3">
            <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{event.admin_comment}</p>
          </div>
        </div>
      )}

      {/* Stamp buttons */}
      <div className="flex-1 flex items-center justify-center px-4 pb-8 pt-2">
        <div className={`grid gap-3 w-full max-w-sm ${stamps.length <= 2 ? 'grid-cols-2' : stamps.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {stamps.map(stamp => (
            <button
              key={stamp.id}
              className={`stamp-btn relative flex flex-col items-center justify-center rounded-2xl p-5 transition-all select-none touch-manipulation ${
                event.status === 'live'
                  ? 'cursor-pointer active:scale-90'
                  : 'opacity-40 cursor-not-allowed'
              } ${pressAnimations[stamp.id] ? `stamp-${stamp.animation}` : ''}`}
              style={{
                background: `linear-gradient(135deg, ${stamp.color}18, ${stamp.color}30)`,
                border: `1.5px solid ${stamp.color}50`,
                boxShadow: pressAnimations[stamp.id]
                  ? `0 0 24px ${stamp.color}60, inset 0 0 16px ${stamp.color}20`
                  : `0 2px 12px ${stamp.color}20, inset 0 1px 0 ${stamp.color}20`,
              }}
              onClick={() => handleStamp(stamp)}
              disabled={event.status !== 'live'}
            >
              <span className="text-4xl mb-1.5 leading-none">{stamp.emoji}</span>
              <span className="text-[11px] font-medium text-white/60 leading-tight">{stamp.label}</span>
              <span
                className="text-base font-bold mt-1 tabular-nums leading-none"
                style={{ color: stamp.color }}
              >
                {(stampCounts[stamp.id] || 0).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-5 pt-2 text-[10px] text-white/20 tracking-wider">
        Powered by GMO EventStamp
      </div>
    </div>
  );
}
