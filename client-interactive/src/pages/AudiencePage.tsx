import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { audienceApi } from '@/lib/api';
import { getSocket, disconnectSocket } from '@/lib/socket';

interface Stamp {
  id: string;
  label: string;
  emoji: string;
  color: string;
  animation: string;
}

interface FloatingEmoji {
  id: number;
  emoji: string;
  x: number;
  scale: number;
}

export default function AudiencePage() {
  const { eventId } = useParams();
  const [eventTitle, setEventTitle] = useState('');
  const [eventStatus, setEventStatus] = useState('');
  const [stamps, setStamps] = useState<Stamp[]>([]);
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
      setEventTitle(data.title);
      setEventStatus(data.status);
      setStamps(data.stamps || []);

      // Join event
      return audienceApi.post(`/events/${eventId}/join`, {});
    }).then(r => {
      setSessionToken(r.data.data.session_token);
    }).catch(err => {
      const msg = err.response?.data?.message || 'イベントに接続できません';
      setError(msg);
    });

    return () => {
      if (sessionToken) {
        audienceApi.post(`/events/${eventId}/leave`, { session_token: sessionToken }).catch(() => {});
      }
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
      setEventStatus(data.status);
    });

    return () => { disconnectSocket(); };
  }, [eventId, sessionToken]);

  const addFloatingEmoji = useCallback((emoji: string) => {
    const id = floatIdRef.current++;
    const newEmoji: FloatingEmoji = {
      id,
      emoji,
      x: 20 + Math.random() * 60,
      scale: 0.8 + Math.random() * 0.6,
    };
    setFloatingEmojis(prev => [...prev, newEmoji].slice(-30));
    setTimeout(() => {
      setFloatingEmojis(prev => prev.filter(f => f.id !== id));
    }, 1500);
  }, []);

  const handleStamp = useCallback((stamp: Stamp) => {
    if (!sessionToken || eventStatus !== 'live') return;

    // Send via Socket.IO
    const socket = getSocket(eventId!, { sessionToken });
    socket.emit('stamp', { stampId: stamp.id, count: 1 });

    // Visual feedback
    setPressAnimations(prev => ({ ...prev, [stamp.id]: true }));
    setTimeout(() => setPressAnimations(prev => ({ ...prev, [stamp.id]: false })), 300);

    // Floating emoji
    addFloatingEmoji(stamp.emoji);
  }, [sessionToken, eventStatus, eventId, addFloatingEmoji]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#1c1c1a] flex items-center justify-center text-white p-4">
        <div className="text-center">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary" />
          <p className="text-lg">{error}</p>
        </div>
      </div>
    );
  }

  if (eventStatus === 'ended') {
    return (
      <div className="min-h-screen bg-[#1c1c1a] flex items-center justify-center text-white p-4">
        <div className="text-center">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-[#8a8983]" />
          <h1 className="text-xl font-bold mb-2">{eventTitle}</h1>
          <p className="text-[#b5b3ab]">このイベントは終了しました</p>
          <p className="text-[#8a8983] text-sm mt-4">ご参加ありがとうございました！</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1c1c1a] text-white flex flex-col relative overflow-hidden">
      {/* Floating emojis */}
      {floatingEmojis.map(f => (
        <div
          key={f.id}
          className="absolute float-up pointer-events-none"
          style={{
            left: `${f.x}%`,
            bottom: '30%',
            fontSize: `${f.scale * 2}rem`,
          }}
        >
          {f.emoji}
        </div>
      ))}

      {/* Header */}
      <div className="text-center py-6 px-4">
        <div className="flex items-center justify-center gap-2 text-primary/80 mb-2">
          <Sparkles className="h-5 w-5" />
          <span className="text-sm font-medium">EventStamp</span>
        </div>
        <h1 className="text-lg font-bold">{eventTitle}</h1>
        {eventStatus === 'draft' && (
          <p className="text-sm text-[#b5b3ab] mt-2">イベント開始を待っています...</p>
        )}
        {eventStatus === 'live' && (
          <div className="flex items-center justify-center gap-1 mt-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-primary/80">LIVE</span>
          </div>
        )}
      </div>

      {/* Stamp buttons */}
      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className={`grid gap-4 w-full max-w-md ${stamps.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {stamps.map(stamp => (
            <button
              key={stamp.id}
              className={`relative flex flex-col items-center justify-center rounded-2xl p-6 transition-all active:scale-95 select-none touch-manipulation ${
                eventStatus === 'live'
                  ? 'hover:brightness-110 cursor-pointer'
                  : 'opacity-50 cursor-not-allowed'
              } ${pressAnimations[stamp.id] ? `stamp-${stamp.animation}` : ''}`}
              style={{
                background: `${stamp.color}22`,
                border: `2px solid ${stamp.color}66`,
                boxShadow: pressAnimations[stamp.id] ? `0 0 20px ${stamp.color}44` : 'none',
              }}
              onClick={() => handleStamp(stamp)}
              disabled={eventStatus !== 'live'}
            >
              <span className="text-4xl mb-2">{stamp.emoji}</span>
              <span className="text-xs font-medium text-[#b5b3ab]">{stamp.label}</span>
              <span className="text-lg font-bold mt-1 tabular-nums" style={{ color: stamp.color }}>
                {(stampCounts[stamp.id] || 0).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-4 text-xs text-[#5c5b57]">
        Powered by GMO EventStamp
      </div>
    </div>
  );
}
