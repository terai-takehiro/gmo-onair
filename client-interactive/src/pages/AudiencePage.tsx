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
  image_url?: string;
}

interface EventData {
  title: string;
  status: string;
  stamps: Stamp[];
  youtube_url?: string;
  banner_url?: string;
  admin_comment?: string;
}

interface MiniStamp {
  id: number;
  emoji: string;
  image_url?: string;
  x: number;
  y: number;
  offsetX: number;
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
  const [miniStamps, setMiniStamps] = useState<MiniStamp[]>([]);
  const [tapCount, setTapCount] = useState(0);
  const [showTapCounter, setShowTapCounter] = useState(false);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const miniIdRef = useRef(0);

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

    return () => { disconnectSocket(); };
  }, [eventId]);

  // Socket.IO
  useEffect(() => {
    if (!eventId || !sessionToken) return;
    const socket = getSocket(eventId, { sessionToken });

    socket.on('stamp:update', (data: { stampId: string; count: number }) => {
      setStampCounts(prev => ({ ...prev, [data.stampId]: (prev[data.stampId] || 0) + data.count }));
    });

    socket.on('event:status', (data: { status: string }) => {
      setEvent(prev => prev ? { ...prev, status: data.status } : prev);
    });

    return () => { disconnectSocket(); };
  }, [eventId, sessionToken]);

  // Mini stamp fly animation (from button position)
  const spawnMiniStamp = useCallback((stamp: Stamp, btnEl: HTMLElement) => {
    const rect = btnEl.getBoundingClientRect();
    const id = miniIdRef.current++;
    const mini: MiniStamp = {
      id,
      emoji: stamp.emoji,
      image_url: stamp.image_url,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      offsetX: -20 + Math.random() * 40,
    };
    setMiniStamps(prev => [...prev, mini].slice(-30));
    setTimeout(() => {
      setMiniStamps(prev => prev.filter(m => m.id !== id));
    }, 500);
  }, []);

  const handleStamp = useCallback((stamp: Stamp, e: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    if (!sessionToken || event?.status !== 'live') return;

    const socket = getSocket(eventId!, { sessionToken });
    socket.emit('stamp', { stampId: stamp.id, count: 1 });

    setPressAnimations(prev => ({ ...prev, [stamp.id]: true }));
    setTimeout(() => setPressAnimations(prev => ({ ...prev, [stamp.id]: false })), 250);

    spawnMiniStamp(stamp, e.currentTarget);

    // Tap counter
    setTapCount(prev => prev + 1);
    setShowTapCounter(true);
    clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => setShowTapCounter(false), 2000);
  }, [sessionToken, event?.status, eventId, spawnMiniStamp]);

  if (error) {
    return (
      <div className="user-page flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-lg text-[var(--text-primary)]">{error}</p>
          <p className="text-sm text-[var(--text-muted)] mt-2">QRコードを再度読み取ってください</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="user-page flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
      </div>
    );
  }

  if (event.status === 'ended') {
    return (
      <div className="user-page flex items-center justify-center p-4">
        <div className="text-center">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-[var(--accent)] opacity-40" />
          <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">{event.title}</h1>
          <p className="text-[var(--text-secondary)]">このイベントは終了しました</p>
          <p className="text-[var(--text-muted)] text-sm mt-4">ご参加ありがとうございました！</p>
        </div>
      </div>
    );
  }

  const embedId = getYoutubeEmbedId(event.youtube_url || '');
  const stamps = event.stamps || [];

  return (
    <div className="user-page">
      {/* Mini stamp fly animations */}
      {miniStamps.map(m => (
        <div
          key={m.id}
          className="mini-stamp-effect"
          style={{
            left: m.x - 16,
            top: m.y - 16,
            ['--fly-x' as any]: `${m.offsetX}px`,
          }}
        >
          {m.emoji}
        </div>
      ))}

      {/* Status bar */}
      <header className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
          event.status === 'live' ? 'bg-green-500' : 'bg-zinc-300'
        }`} />
        <span className="text-sm font-medium text-[var(--text-primary)] truncate">{event.title}</span>
        {event.status === 'live' && (
          <span className="text-xs font-bold text-red-500 tracking-wider ml-auto">LIVE</span>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-0">
        {/* YouTube embed */}
        {embedId && (
          <div className="flex-shrink-0 px-3 pb-2" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
            <div className="youtube-wrapper">
              <iframe
                src={`https://www.youtube.com/embed/${embedId}?autoplay=1&mute=1`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )}

        {/* Banner (if no YouTube) */}
        {!embedId && event.banner_url && (
          <div className="flex-shrink-0 px-3 pb-2" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
            <img src={event.banner_url} alt="バナー" className="w-full max-h-[200px] object-cover rounded-xl" />
          </div>
        )}

        {/* Admin comment */}
        {event.admin_comment && (
          <div className="flex-shrink-0 px-4 pb-2" style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
            <div className="comment-box">
              <p className="whitespace-pre-wrap">{event.admin_comment}</p>
            </div>
          </div>
        )}

        {/* Instruction */}
        {event.status === 'live' && (
          <p className="text-center text-xs text-[var(--text-muted)] py-1.5">スタンプをタップして送信しよう!</p>
        )}
        {event.status === 'draft' && (
          <div className="text-center py-6">
            <div className="text-3xl mb-2">⏳</div>
            <p className="text-sm text-[var(--text-secondary)]">まもなく開始します</p>
            <p className="text-xs text-[var(--text-muted)]">スタンプの受付開始までお待ちください</p>
          </div>
        )}

        {/* Stamp grid — 5 columns (original) */}
        <div className="stamp-grid flex-1">
          {stamps.map(stamp => (
            <button
              key={stamp.id}
              className={`stamp-button glass-card ${pressAnimations[stamp.id] ? 'stamp-pop' : ''}`}
              onClick={(e) => handleStamp(stamp, e)}
              disabled={event.status !== 'live'}
            >
              {stamp.image_url ? (
                <img src={stamp.image_url} alt={stamp.label} className="stamp-img" />
              ) : (
                <span className="stamp-emoji">{stamp.emoji}</span>
              )}
              <span className="stamp-label">{stamp.label}</span>
            </button>
          ))}
        </div>
      </main>

      {/* Tap counter */}
      {showTapCounter && (
        <div className="tap-counter">
          <span className="tap-count">{tapCount}</span>
        </div>
      )}

      {/* Footer */}
      <div className="text-center pb-4 pt-2 text-xs text-[var(--text-muted)] tracking-wider flex-shrink-0">
        Powered by GMO EventStamp
      </div>
    </div>
  );
}
