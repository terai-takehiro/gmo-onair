// テロップCG — 出力画面（`/techops/graphics/output/:projectId`）。
//
// **OBS・スイッチャーのブラウザソースに貼る、ログイン不要の公開URL**
// （docs/design/v4/graphics.md §7。旧 `client-awards/OutputPage.tsx` の運用契約を継承）:
//   ・認証なし（`App.tsx` でシェル・ProtectedRoute の外に置き、
//     `lib/api.ts` の `publicPaths` で 401 のログイン転送からも除外してある）
//   ・1920×1080 固定キャンバスをビューポートに合わせて transform: scale で縮尺
//   ・既定は透過（Browser Source の「透明度を許可」用）。`?bg=1` で不透明の黒
//   ・リアルタイムは Socket.IO `/graphics`（`cg:sync`）＋ 30秒ごとの公開エンドポイント
//     ポーリング（ソケットが切れていても最悪30秒で追いつくフォールバック）
//   ・時刻はサーバー基準（`cg:sync` の timestamp / output の serverNow で skew 補正）
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  fetchGraphicsOutput,
  type GraphicsCueRow, type GraphicsOutputBundle, type GraphicsSlot,
} from '@/lib/graphicsApi';
import { createGraphicsSocket, type CgSyncPayload } from '@/lib/graphicsSocket';
import { renderGraphicsPage } from './outputParts';

const CANVAS_W = 1920;
const CANVAS_H = 1080;

function cuesToMap(cues: GraphicsCueRow[]): Partial<Record<GraphicsSlot, GraphicsCueRow>> {
  const map: Partial<Record<GraphicsSlot, GraphicsCueRow>> = {};
  for (const c of cues) map[c.slot] = c;
  return map;
}

export default function GraphicsOutputPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const bgParam = (searchParams.get('bg') ?? '').toLowerCase();
  const withBg = bgParam === '1' || bgParam === 'on' || bgParam === 'true';

  const [bundle, setBundle] = useState<GraphicsOutputBundle | null>(null);
  const [cues, setCues] = useState<Partial<Record<GraphicsSlot, GraphicsCueRow>>>({});
  // サーバー時刻 − クライアント時刻（ms）。描画時に足して「サーバーのいま」を作る
  const serverOffsetRef = useRef(0);
  const [, forceTick] = useState(0);

  // 背景: 既定は透過（base.css の背景色が残ると OBS で抜けない）。?bg=1 は黒
  useEffect(() => {
    const prevBody = document.body.style.background;
    const prevHtml = document.documentElement.style.background;
    document.body.style.background = withBg ? '#000' : 'transparent';
    document.documentElement.style.background = withBg ? '#000' : 'transparent';
    return () => {
      document.body.style.background = prevBody;
      document.documentElement.style.background = prevHtml;
    };
  }, [withBg]);

  // 初回＋30秒ごとの公開エンドポイントポーリング（ソケット断のフォールバック）
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    const load = async () => {
      try {
        const data = await fetchGraphicsOutput(projectId);
        if (!alive || !data) return;
        setBundle(data);
        setCues(cuesToMap(data.cues));
        const serverNow = Date.parse(data.serverNow ?? '');
        if (Number.isFinite(serverNow)) serverOffsetRef.current = serverNow - Date.now();
      } catch { /* 次のポーリングで再試行 */ }
    };
    void load();
    const timer = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(timer); };
  }, [projectId]);

  // Socket.IO `/graphics`（認証なし）。cue の差し替えを即時反映する
  useEffect(() => {
    if (!projectId) return;
    const socket = createGraphicsSocket(projectId);
    socket.on('cg:sync', (payload: CgSyncPayload) => {
      if (Array.isArray(payload?.cues)) setCues(cuesToMap(payload.cues));
      if (typeof payload?.timestamp === 'number' && Number.isFinite(payload.timestamp)) {
        serverOffsetRef.current = payload.timestamp - Date.now();
      }
    });
    return () => { socket.disconnect(); };
  }, [projectId]);

  // ビューポートに合わせた縮尺（transform: scale — 旧 awards OutputPage と同じ手法）
  const [scale, setScale] = useState(() =>
    Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H));
  useEffect(() => {
    const onResize = () =>
      setScale(Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const pageById = useMemo(
    () => new Map((bundle?.pages ?? []).map((p) => [p.id, p])),
    [bundle],
  );
  const livePages = useMemo(
    () =>
      Object.values(cues)
        .filter((c): c is GraphicsCueRow => !!c && !!c.pageId)
        .map((c) => pageById.get(c.pageId as string))
        .filter((p): p is NonNullable<typeof p> => !!p),
    [cues, pageById],
  );

  // 時計・カウントダウンが出ている間だけ 250ms で描き直す（他のページでは回さない）
  const hasClock = livePages.some((p) => p.slot === 'clock' || p.partKey === 'countdown');
  useEffect(() => {
    if (!hasClock) return;
    const timer = setInterval(() => forceTick((n) => (n + 1) % 1_000_000), 250);
    return () => clearInterval(timer);
  }, [hasClock]);

  const serverNowMs = Date.now() + serverOffsetRef.current;

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: withBg ? '#000' : 'transparent' }}>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
          overflow: 'hidden',
        }}
      >
        {livePages.map((p) =>
          renderGraphicsPage(p, serverNowMs, { tickerLive: livePages.some((q) => q.slot === 'ticker') }))}
      </div>
    </div>
  );
}
