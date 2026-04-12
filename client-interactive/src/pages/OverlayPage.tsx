import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { audienceApi } from '@/lib/api';
import { getSocket, disconnectSocket } from '@/lib/socket';

interface Stamp {
  id: string;
  label: string;
  emoji: string;
  color: string;
  image_url?: string;
}

interface FloatingStamp {
  id: number;
  emoji: string;
  image_url?: string;
  color: string;
  x: number;           // horizontal position (%)
  wobbleAmp: number;    // wobble amplitude (px)
  wobbleFreq: number;   // wobble speed
  duration: number;     // animation duration (ms)
  size: number;         // font size multiplier
  delay: number;        // stagger delay (ms)
}

// ──────────────────────────────────────────────
// 相対密度制御
// 大量のスタンプが来ても画面上の表示数を制限。
// ただし多い/少ないの差が視覚的にわかるように
// 「密度スコア」に応じてspawn数を調整する。
// ──────────────────────────────────────────────
const MAX_ON_SCREEN = 30;         // 画面上の最大同時表示数
const MAX_SPAWN_PER_EVENT = 6;    // 1回のSocket.IOイベントで生成する最大数
const RATE_WINDOW_MS = 3000;      // レート計測ウィンドウ

export default function OverlayPage() {
  const { eventId } = useParams();
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [stampCounts, setStampCounts] = useState<Record<string, number>>({});
  const [floats, setFloats] = useState<FloatingStamp[]>([]);
  const [eventStatus, setEventStatus] = useState<string>('');

  const nextIdRef = useRef(0);
  const rateLogRef = useRef<number[]>([]);  // timestamps of recent stamp events
  const stampsRef = useRef(stamps);
  stampsRef.current = stamps;

  // Load event data
  useEffect(() => {
    if (!eventId) return;
    audienceApi.get(`/events/${eventId}`).then(r => {
      setStamps(r.data.data.stamps || []);
      setEventStatus(r.data.data.status);
    }).catch(() => {});
  }, [eventId]);

  // Calculate how many to spawn based on relative rate
  const calcSpawnCount = useCallback((incomingCount: number): number => {
    const now = Date.now();
    rateLogRef.current.push(now);
    // Clean old entries
    rateLogRef.current = rateLogRef.current.filter(t => now - t < RATE_WINDOW_MS);

    const recentRate = rateLogRef.current.length; // events in last N seconds

    // Scale: low traffic (1-5) → spawn 1-3, high traffic (50+) → spawn 4-6
    // This makes the visual density proportional but capped
    if (recentRate <= 3) return Math.min(incomingCount, 3);
    if (recentRate <= 10) return Math.min(incomingCount, 2);
    if (recentRate <= 30) return 2;
    return 1; // Very high traffic: only 1 per event but events are frequent
  }, []);

  // Spawn floating stamps
  const spawnFloats = useCallback((stamp: Stamp, count: number) => {
    const spawnCount = calcSpawnCount(count);
    const newFloats: FloatingStamp[] = [];

    for (let i = 0; i < spawnCount; i++) {
      newFloats.push({
        id: nextIdRef.current++,
        emoji: stamp.emoji,
        image_url: stamp.image_url,
        color: stamp.color,
        x: 5 + Math.random() * 90,
        wobbleAmp: 15 + Math.random() * 30,   // 15-45px wobble
        wobbleFreq: 0.8 + Math.random() * 1.2, // 0.8-2.0 cycles
        duration: 2500 + Math.random() * 2000,  // 2.5-4.5s travel time
        size: 0.8 + Math.random() * 0.6,        // 0.8-1.4x size variation
        delay: i * 80,                           // stagger within batch
      });
    }

    setFloats(prev => {
      const combined = [...prev, ...newFloats];
      // Hard cap to prevent memory issues
      return combined.slice(-MAX_ON_SCREEN);
    });

    // Remove after animation completes
    const maxDuration = Math.max(...newFloats.map(f => f.duration + f.delay)) + 200;
    setTimeout(() => {
      const ids = new Set(newFloats.map(f => f.id));
      setFloats(prev => prev.filter(f => !ids.has(f.id)));
    }, maxDuration);
  }, [calcSpawnCount]);

  // Socket.IO
  useEffect(() => {
    if (!eventId) return;
    const socket = getSocket(eventId);

    socket.on('stamp:update', (data: { stampId: string; count: number }) => {
      setStampCounts(prev => ({
        ...prev,
        [data.stampId]: (prev[data.stampId] || 0) + data.count,
      }));

      const stamp = stampsRef.current.find(s => s.id === data.stampId);
      if (stamp) {
        spawnFloats(stamp, data.count);
      }
    });

    socket.on('event:status', (data: { status: string }) => {
      setEventStatus(data.status);
    });

    return () => { disconnectSocket(); };
  }, [eventId, spawnFloats]);

  const isLive = eventStatus === 'live' || eventStatus === 'rehearsal';

  return (
    <div className="overlay-transparent fixed inset-0 overflow-hidden" style={{ background: 'transparent' }}>
      {/* Floating stamps — rising with wobble */}
      {floats.map(f => (
        <div
          key={f.id}
          className="overlay-float pointer-events-none"
          style={{
            left: `${f.x}%`,
            fontSize: `${f.size * 2.5}rem`,
            filter: `drop-shadow(0 0 6px ${f.color}40)`,
            animationDuration: `${f.duration}ms`,
            animationDelay: `${f.delay}ms`,
            ['--wobble-amp' as any]: `${f.wobbleAmp}px`,
            ['--wobble-freq' as any]: f.wobbleFreq,
          }}
        >
          {f.image_url ? (
            <img src={f.image_url} alt="" style={{ width: `${f.size * 2.5}rem`, height: `${f.size * 2.5}rem`, objectFit: 'contain' }} />
          ) : (
            f.emoji
          )}
        </div>
      ))}

      {/* Bottom counter bar */}
      {stamps.length > 0 && isLive && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 bg-black/40 backdrop-blur-sm rounded-full px-6 py-3">
          {stamps.map(stamp => (
            <div key={stamp.id} className="flex items-center gap-2 text-white">
              {stamp.image_url ? (
                <img src={stamp.image_url} alt="" className="w-7 h-7 object-contain" />
              ) : (
                <span className="text-2xl">{stamp.emoji}</span>
              )}
              <span className="text-lg font-bold tabular-nums" style={{ color: stamp.color }}>
                {(stampCounts[stamp.id] || 0).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {eventStatus === 'ended' && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-xl bg-black/50 px-6 py-3 rounded-lg">
          イベント終了
        </div>
      )}
    </div>
  );
}
