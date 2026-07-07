import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api';

export interface YoutubeDetail { label: string; url: string; count: number | null }

export type PlatformKey = 'youtube' | 'jstream' | 'zoom' | 'teams';

export type PlatformToggles = Record<PlatformKey, boolean>;

export const ALL_PLATFORMS_ON: PlatformToggles = {
  youtube: true, jstream: true, zoom: true, teams: true,
};

export interface ViewerCounts {
  youtube: number;
  jstream: number;
  zoom: number;
  teams: number;
  total: number;
  ytDetails: YoutubeDetail[];
  lastUpdated: Date | null;
  error: string | null;
}

const ZERO_COUNTS: ViewerCounts = {
  youtube: 0, jstream: 0, zoom: 0, teams: 0, total: 0,
  ytDetails: [], lastUpdated: null, error: null,
};

export function useViewer(
  programId: string | null,
  pollingIntervalSec = 10,
  enabledPlatforms: PlatformToggles = ALL_PLATFORMS_ON,
) {
  const [counts, setCounts] = useState<ViewerCounts>(ZERO_COUNTS);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<Array<{ type: 'success' | 'error' | 'info'; message: string; time: Date }>>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const programRef = useRef(programId);
  programRef.current = programId;
  // OFF にしたプラットフォームは API を叩かない (ref 経由で最新のトグル状態を参照)
  const enabledRef = useRef(enabledPlatforms);
  enabledRef.current = enabledPlatforms;

  const addLog = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setLogs(prev => [{ type, message, time: new Date() }, ...prev].slice(0, 100));
  }, []);

  const pollOnce = useCallback(async () => {
    const pid = programRef.current;
    if (!pid) return;
    const enabled = enabledRef.current;

    try {
      const progRes = await api.get(`/liveops/programs/${pid}`);
      const prog = progRes.data.data;

      let ytTotal = 0;
      const ytDetails: YoutubeDetail[] = [];

      // YouTube
      const ytUrls: Array<{ label: string; url: string }> = prog.youtube_urls || [];
      if (enabled.youtube && ytUrls.length > 0) {
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
      if (enabled.jstream && prog.jstream_lpid) {
        try {
          const jsRes = await api.get('/liveops/proxy/jstream', { params: { lpid: prog.jstream_lpid } });
          jsCount = jsRes.data.data.count;
          addLog('success', `Jstream: ${jsCount.toLocaleString()} connections`);
        } catch (e: any) {
          addLog('error', `Jstream error: ${e?.response?.data?.message || e.message}`);
        }
      }

      // Zoom Meeting
      let zoomCount = 0;
      if (enabled.zoom && prog.zoom_meeting_id) {
        try {
          const zRes = await api.get('/liveops/proxy/zoom', { params: { type: 'meeting', meetingId: prog.zoom_meeting_id } });
          zoomCount += zRes.data.data.count ?? 0;
        } catch (e: any) {
          addLog('error', `Zoom meeting error: ${e?.response?.data?.message || e.message}`);
        }
      }
      // Zoom Webinar
      if (enabled.zoom && prog.zoom_webinar_id) {
        try {
          const zRes = await api.get('/liveops/proxy/zoom', { params: { type: 'webinar', webinarId: prog.zoom_webinar_id } });
          zoomCount += zRes.data.data.count ?? 0;
        } catch (e: any) {
          addLog('error', `Zoom webinar error: ${e?.response?.data?.message || e.message}`);
        }
      }
      if (enabled.zoom && (prog.zoom_meeting_id || prog.zoom_webinar_id)) {
        addLog('success', `Zoom: ${zoomCount.toLocaleString()} participants`);
      }

      // Teams
      let teamsCount = 0;
      if (enabled.teams && prog.teams_meeting_url) {
        try {
          const tRes = await api.get('/liveops/proxy/teams', { params: { programId: pid } });
          teamsCount = tRes.data.data.count ?? 0;
          addLog('success', `Teams: ${teamsCount.toLocaleString()} participants`);
        } catch (e: any) {
          addLog('error', `Teams error: ${e?.response?.data?.message || e.message}`);
        }
      }

      const total = ytTotal + jsCount + zoomCount + teamsCount;
      setCounts({
        youtube: ytTotal, jstream: jsCount, zoom: zoomCount, teams: teamsCount,
        total, ytDetails, lastUpdated: new Date(), error: null,
      });

      // Save snapshot
      await api.post('/liveops/snapshots', {
        programId: pid,
        youtubeCount: ytTotal, jstreamCount: jsCount,
        zoomCount, teamsCount,
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
    setCounts(ZERO_COUNTS);
  }, [programId]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  return { counts, running, logs, startPolling, stopPolling, pollOnce };
}
