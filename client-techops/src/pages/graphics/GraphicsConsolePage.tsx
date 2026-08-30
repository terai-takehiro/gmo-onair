// テロップCG — 送出コンソール（`/techops/graphics/:ownerKey/live`・モック②）。
//
// 段2の最小機能形（docs/design/v4/graphics.md §4・§9）:
//   ・スロットごとのオンエア状態レーン（現在ページ＋OUT）＝最終防衛線
//   ・ページ一覧から「PVWへ」（ローカル選択）→ TAKE（`cg:set` を送出）
//   ・オールクリア（確認つき）
//   ・校正「未完成」は TAKE をブロック・「未確認」は警告してから
// まだ無いもの: PGM/PVW の本物のレンダリング・番号呼出・次へ（Read Next）・
// キーボード運転 — モック②の完成形はこの上に足す。
//
// リアルタイムは Socket.IO `/graphics`（`lib/graphicsSocket.ts`・`cg:*` を新設。
// 本番進行の `cue:*` とは別ネームスペース）。切断中は REST（`POST …/cue`）に
// 落として操作を失わせない。
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ChevronLeft, Eraser, Loader2, Radio, Type } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyError } from '@/lib/notify';
import {
  GRAPHICS_SLOTS, SLOT_LABELS, PROOF_LABELS, setGraphicsCue,
  type GraphicsBundle, type GraphicsCueRow, type GraphicsPageRow, type GraphicsSlot,
} from '@/lib/graphicsApi';
import { createGraphicsSocket, emitCgSet, type CgSyncPayload } from '@/lib/graphicsSocket';
import { useGraphicsProject } from './useGraphicsProject';
import { SlotBadge, ProofBadge } from './badges';

export default function GraphicsConsolePage() {
  const { ownerKey } = useParams<{ ownerKey: string }>();
  const { state } = useGraphicsProject(ownerKey);

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }

  if (state.status === 'not-found') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState icon={<Type />} title="見つかりませんでした" description="GLS番号・案件ID・番組IDを確認してください。" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState icon={<AlertCircle />} title="開けませんでした" description={state.message} />
      </div>
    );
  }

  return <ConsoleContent ownerKey={ownerKey ?? ''} bundle={state.bundle} />;
}

function cuesToMap(cues: GraphicsCueRow[]): Partial<Record<GraphicsSlot, GraphicsCueRow>> {
  const map: Partial<Record<GraphicsSlot, GraphicsCueRow>> = {};
  for (const c of cues) map[c.slot] = c;
  return map;
}

function ConsoleContent({ ownerKey, bundle }: { ownerKey: string; bundle: GraphicsBundle }) {
  const projectId = bundle.project.id;
  const [cues, setCues] = useState(() => cuesToMap(bundle.cues));
  const [connected, setConnected] = useState(false);
  const [pvwPageId, setPvwPageId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = createGraphicsSocket(projectId);
    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('cg:sync', (payload: CgSyncPayload) => {
      if (Array.isArray(payload?.cues)) setCues(cuesToMap(payload.cues));
    });
    return () => {
      socketRef.current = null;
      socket.disconnect();
    };
  }, [projectId]);

  const pages = [...bundle.pages].sort((a, b) => (a.sortOrder - b.sortOrder) || (a.callNo - b.callNo));
  const pageById = new Map(pages.map((p) => [p.id, p]));
  const pvwPage = pvwPageId ? pageById.get(pvwPageId) ?? null : null;

  /** `cg:set` を1発送る。切断中は REST に落とし、返ってきた cue で画面をそろえる */
  const sendSet = async (slot: GraphicsSlot, pageId: string | null) => {
    const socket = socketRef.current;
    if (socket?.connected) {
      emitCgSet(socket, slot, pageId);
      return;
    }
    try {
      const next = await setGraphicsCue(projectId, slot, pageId);
      setCues(cuesToMap(next));
    } catch {
      notifyError('送出の指示を送れませんでした', { description: 'サーバーとの接続を確認してください。' });
    }
  };

  const take = async (page: GraphicsPageRow) => {
    if (page.proofState === 'draft') {
      notifyError('未完成のページは TAKE できません', { description: `「${page.name}」の中身を仕上げて校正に回してください。` });
      return;
    }
    if (page.proofState === 'unproofed') {
      if (!(await confirmAction({
        title: `校正が「${PROOF_LABELS.unproofed}」のページを出しますか？`,
        description: `「${page.name}」はまだ表記チェックが済んでいません。`,
        confirmLabel: 'TAKE する',
        tone: 'danger',
      }))) return;
    }
    await sendSet(page.slot, page.id);
    setPvwPageId(null);
  };

  const allClear = async () => {
    if (!(await confirmAction({
      title: 'すべてのスロットをクリアしますか？',
      description: 'いま出ているテロップ・CGが全部下ります（放送に出ます）。',
      confirmLabel: 'オールクリア',
      tone: 'danger',
    }))) return;
    for (const slot of GRAPHICS_SLOTS) {
      if (cues[slot]?.pageId) await sendSet(slot, null);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to={`/techops/graphics/${encodeURIComponent(ownerKey)}`}
        className="mb-2 inline-flex min-h-tap items-center gap-1 rounded-control-md px-1.5 text-sub font-bold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />ページと送出リスト
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-h1">送出コンソール ／ {bundle.project.name}</h1>
          <p className="mt-1 text-sub text-muted-foreground">
            TAKE できるのは PVW に選んだものだけ。スロットは<strong>1枠1枚</strong>で、同じスロットに TAKE すると前のページは自動で下ります。
          </p>
        </div>
        <div className="flex-1" />
        <span className={`inline-flex items-center gap-2 rounded-control-md border px-3 py-1.5 text-sub font-bold ${
          connected
            ? 'border-success-border bg-success-surface text-foreground'
            : 'border-warning-border bg-warning-surface text-foreground'
        }`}
        >
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-success' : 'bg-warning'}`} aria-hidden="true" />
          {connected ? '同期中' : '再接続中（操作はサーバー経由で届きます）'}
        </span>
        <Button type="button" variant="outline" onClick={allClear}>
          <Eraser className="mr-1 h-4 w-4 text-destructive" aria-hidden="true" />オールクリア
        </Button>
      </div>

      {/* スロットごとのオンエア状態（最終防衛線 — 今出ているものが一目で分かる） */}
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {GRAPHICS_SLOTS.map((slot) => {
          const cue = cues[slot];
          const page = cue?.pageId ? pageById.get(cue.pageId) ?? null : null;
          const live = !!cue?.pageId;
          return (
            <div key={slot} className={`flex flex-col gap-1.5 rounded-card border p-2.5 ${live ? 'border-destructive-border bg-destructive-surface' : 'border-border bg-card'}`}>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${live ? 'bg-destructive' : 'bg-border-disabled'}`} aria-hidden="true" />
                <span className="truncate text-th text-muted-foreground">{SLOT_LABELS[slot]}</span>
              </div>
              <div className="flex min-h-[28px] items-center gap-1.5">
                <span className={`min-w-0 flex-1 truncate text-sub ${live ? 'font-bold' : 'text-muted-foreground'}`}>
                  {page ? page.name : live ? '（不明なページ）' : '—'}
                </span>
                {live && (
                  <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => sendSet(slot, null)}>
                    OUT
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* PVW（次に出すもの）と TAKE。本物のレンダリングは後の段 — いまは文字情報だけ */}
      <div className="mt-4 flex flex-col gap-3 rounded-card border border-border bg-card p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <span className="text-th text-muted-foreground">PVW（次に出す）</span>
          {pvwPage ? (
            <div className="mt-1 flex items-center gap-2.5">
              <span className="font-number text-list font-bold">{pvwPage.callNo}</span>
              <SlotBadge slot={pvwPage.slot} w={null} />
              <span className="min-w-0 truncate text-list font-bold">{pvwPage.name}</span>
              <ProofBadge state={pvwPage.proofState} w={null} />
            </div>
          ) : (
            <p className="mt-1 text-sub text-muted-foreground">下の一覧から「PVWへ」で選ぶと、ここに乗ります。</p>
          )}
        </div>
        <Button
          type="button"
          size="lg"
          className="min-h-[56px] px-8 text-h2"
          disabled={!pvwPage}
          onClick={() => { if (pvwPage) void take(pvwPage); }}
        >
          <Radio className="mr-2 h-5 w-5" aria-hidden="true" />TAKE
        </Button>
      </div>

      {/* ページ一覧（送出リスト）。段2では並び＝sortOrder のまま */}
      <section className="mt-4 overflow-hidden rounded-card border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border-faint bg-surface-subtle px-4 py-2 text-th text-muted-foreground">
          <span className="font-number w-11 shrink-0 text-right">番号</span>
          <span className="w-24 shrink-0 text-center">スロット</span>
          <span className="min-w-0 flex-1">ページ</span>
          <span className="hidden w-[72px] shrink-0 text-center sm:block">校正</span>
          <span className="w-[96px] shrink-0 text-center">操作</span>
        </div>
        {pages.length === 0 ? (
          <EmptyState
            title="ページがまだありません"
            description="ハブ画面（ページと送出リスト）で本番前にページを作っておきます。"
          />
        ) : pages.map((p) => {
          const onAir = cues[p.slot]?.pageId === p.id;
          const inPvw = p.id === pvwPageId;
          return (
            <div
              key={p.id}
              className={`flex items-center gap-3 border-b border-border-faint px-4 py-2 last:border-b-0 ${
                onAir ? 'bg-destructive-surface' : inPvw ? 'bg-primary-surface-weak' : 'hover:bg-surface-subtle'
              }`}
            >
              <span className="font-number w-11 shrink-0 text-right text-list font-bold">{p.callNo}</span>
              <span className="flex w-24 shrink-0 justify-center"><SlotBadge slot={p.slot} w={null} /></span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0 truncate text-list">{p.name}</span>
                {onAir && (
                  <span className="shrink-0 rounded-badge-xs bg-destructive px-1.5 py-0.5 text-badge font-bold text-destructive-foreground">ON AIR</span>
                )}
              </span>
              <span className="hidden w-[72px] shrink-0 justify-center sm:flex"><ProofBadge state={p.proofState} w={null} /></span>
              <span className="flex w-[96px] shrink-0 justify-end">
                <Button
                  type="button"
                  variant={inPvw ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPvwPageId(inPvw ? null : p.id)}
                >
                  {inPvw ? '選択中' : 'PVWへ'}
                </Button>
              </span>
            </div>
          );
        })}
      </section>
    </div>
  );
}
