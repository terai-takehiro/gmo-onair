import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { audienceApi } from '@/lib/api';
import { getSocket, disconnectSocket } from '@/lib/socket';

interface Stamp {
  id: string;
  label: string;
  emoji: string;
  color: string;
  animation: string;
}

interface FloatingStamp {
  id: number;
  emoji: string;
  color: string;
  x: number;
  animation: string;
}

export default function OverlayPage() {
  const { eventId } = useParams();
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [stampCounts, setStampCounts] = useState<Record<string, number>>({});
  const [floatingStamps, setFloatingStamps] = useState<FloatingStamp[]>([]);
  const [eventStatus, setEventStatus] = useState<string>('');
  const [nextFloatId, setNextFloatId] = useState(0);

  // Load event data
  useEffect(() => {
    if (!eventId) return;
    audienceApi.get(`/events/${eventId}`).then(r => {
      setStamps(r.data.data.stamps || []);
      setEventStatus(r.data.data.status);
    }).catch(() => {});
  }, [eventId]);

  // Add floating stamp animation
  const addFloat = useCallback((emoji: string, color: string, animation: string, count: number) => {
    const newFloats: FloatingStamp[] = [];
    const spawns = Math.min(count, 10); // Max 10 simultaneous animations
    for (let i = 0; i < spawns; i++) {
      newFloats.push({
        id: nextFloatId + i,
        emoji,
        color,
        x: 10 + Math.random() * 80, // random X position (10-90%)
        animation,
      });
    }
    setNextFloatId(prev => prev + spawns);
    setFloatingStamps(prev => [...prev, ...newFloats].slice(-50)); // Keep max 50

    // Remove after animation
    setTimeout(() => {
      setFloatingStamps(prev => prev.filter(f => !newFloats.some(n => n.id === f.id)));
    }, 1500);
  }, [nextFloatId]);

  // Socket.IO for real-time stamps
  useEffect(() => {
    if (!eventId) return;
    const socket = getSocket(eventId);

    socket.on('stamp:update', (data: { stampId: string; count: number }) => {
      setStampCounts(prev => ({
        ...prev,
        [data.stampId]: (prev[data.stampId] || 0) + data.count,
      }));

      // Trigger floating animation
      const stamp = stamps.find(s => s.id === data.stampId);
      if (stamp) {
        addFloat(stamp.emoji, stamp.color, stamp.animation, data.count);
      }
    });

    socket.on('event:status', (data: { status: string }) => {
      setEventStatus(data.status);
    });

    return () => { disconnectSocket(); };
  }, [eventId, stamps, addFloat]);

  // Transparent background for OBS
  return (
    <div className="overlay-transparent fixed inset-0 overflow-hidden" style={{ background: 'transparent' }}>
      {/* Floating stamps */}
      {floatingStamps.map(f => (
        <div
          key={f.id}
          className="absolute float-up pointer-events-none"
          style={{
            left: `${f.x}%`,
            bottom: '10%',
            fontSize: '2.5rem',
            filter: `drop-shadow(0 0 8px ${f.color})`,
          }}
        >
          {f.emoji}
        </div>
      ))}

      {/* Bottom stamp bar */}
      {stamps.length > 0 && eventStatus === 'live' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 bg-black/40 backdrop-blur-sm rounded-full px-6 py-3">
          {stamps.map(stamp => (
            <div key={stamp.id} className="flex items-center gap-2 text-white">
              <span className="text-2xl">{stamp.emoji}</span>
              <span className="text-lg font-bold tabular-nums" style={{ color: stamp.color }}>
                {(stampCounts[stamp.id] || 0).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Status indicator */}
      {eventStatus === 'ended' && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-xl bg-black/50 px-6 py-3 rounded-lg">
          イベント終了
        </div>
      )}
    </div>
  );
}
