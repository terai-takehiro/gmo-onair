import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api';

export interface YoutubeDetail { label: string; url: string; count: number | null }

export interface ViewerCounts {
  youtube: number;
  jstream: number;
  total: number;
  ytDetails: YoutubeDetail[];
  lastUpdated: Date | null;
  error: string | null;
}

export function useViewer(programId: string | null, pollingIntervalSec = 10) {
  const [counts, setCounts] = useState<ViewerCounts>({
    youtube: 0, jstream: 0, total: 0, ytDetails: [], lastUpdated: null, error: null,
  });
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<Array<{ type: 'success' | 'error' | 'info'; message: string; time: Date }>>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const programRef = useRef(programId);
  programRef.current = programId;

  const addLog = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setLogs(prev => [{ type, message, time: new Date() }, ...prev].slice(0, 100));
  }, []);

  const pollOnce = useCallback(async () => {
    const pid = programRef.current;
    if (!pid) return;

    try {
      // Fetch program to get youtube URLs and jstream LPID
      const progRes = await api.get(`/liveops/programs/${pid}`);
      const prog = progRes.data.data;

      let ytTotal = 0;
      const ytDetails: YoutubeDetail[] = [];

      // YouTube
      const ytUrls: Array<{ label: string; url: string }> = prog.youtube_urls || [];
      if (ytUrls.length > 0) {
        const videoIds = ytUrls
          .map(u => { const m = u.url.match(/(?:v=|youtu\.be\/)([^&?/]+)/); return m?.[1] || ''; })
          .filter(Boolean);
        if (videoIds.length > 0) {
          try {
            const ytRes = await api.get('/liveops/proxy/youtube', { params: { videoIds: videoIds.join(',') } });
            const countMap: Record<string, number | null> = ytRes.data.data;
            for (const u of ytUrls) {
              const m = u.url.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
              const vid = m?.[1] || '';
              const count = vid ? (countMap[vid] ?? null) : null;
              ytDetails.push({ label: u.label, url: u.url, count });
              if (count != null) ytTotal += count;
            }
            addLog('success', `YouTube: ${ytTotal.toLocaleString()} viewers`);
          } catch (e: any) {
            addLog('error', `YouTube error: ${e?.response?.data?.message || e.message}`);
            for (const u of ytUrls) ytDetails.push({ label: u.label, url: u.url, count: null });
          }
        }
      }

      // Jstream
      let jsCount = 0;
      if (prog.jstream_lpid) {
        try {
          const jsRes = await api.get('/liveops/proxy/jstream', { params: { lpid: prog.jstream_lpid } });
          jsCount = jsRes.data.data.count;
          addLog('success', `Jstream: ${jsCount.toLocaleString()} connections`);
        } catch (e: any) {
          addLog('error', `Jstream error: ${e?.response?.data?.message || e.message}`);
        }
      }

      const total = ytTotal + jsCount;
      setCounts({ youtube: ytTotal, jstream: jsCount, total, ytDetails, lastUpdated: new Date(), error: null });

      // Save snapshot
      await api.post('/liveops/snapshots', {
        programId: pid, youtubeCount: ytTotal, jstreamCount: jsCount,
        details: { ytDetails },
      }).catch(() => {});

    } catch (e: any) {
      addLog('error', `Poll error: ${e.message}`);
      setCounts(prev => ({ ...prev, error: e.message }));
    }
  }, [addLog]);

  const startPolling = useCallback(() => {
    if (timerRef.current) return;
    setRunning(true);
    addLog('info', 'ポーリング開始');
    pollOnce();
    timerRef.current = setInterval(pollOnce, pollingIntervalSec * 1000);
  }, [pollOnce, pollingIntervalSec, addLog]);

  const stopPolling = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRunning(false);
    addLog('info', 'ポーリング停止');
  }, [addLog]);

  // Reset on programId change
  useEffect(() => {
    stopPolling();
    setCounts({ youtube: 0, jstream: 0, total: 0, ytDetails: [], lastUpdated: null, error: null });
  }, [programId]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  return { counts, running, logs, startPolling, stopPolling, pollOnce };
}
