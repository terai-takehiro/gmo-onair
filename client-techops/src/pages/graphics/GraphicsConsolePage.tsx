// テロップCG — 送出コンソール（`/techops/graphics/:ownerKey/live`・モック②）。
//
// モック②のオペレーター運転モデル（docs/design/v4/graphics.md §4）:
//   ・PGM / PVW の**本物のプレビュー**（出力画面と同じ renderGraphicsPage を縮尺表示）
//   ・番号呼出（テンキー → Enter で PVW に立てる）
//   ・5動詞: スタンバイ ／ TAKE ／ 続き（多段アニメ・後日）／ OUT ／ 次へ（Read Next）
//   ・キーボード運転: Space=TAKE ／ Enter=次へ ／ ↑↓=スタンバイ移動 ／ テンキー=番号呼出
//   ・スロットごとのオンエア状態レーン（現在ページ＋経過時間＋OUT）＝最終防衛線
//   ・校正「未完成」は TAKE をブロック・「未確認」は警告してから
// TAKE できるのは PVW に見えているものだけ — 一覧から直接オンエアするボタンは無い。
//
// リアルタイムは Socket.IO `/graphics`（`lib/graphicsSocket.ts`・`cg:*`。本番進行の
// `cue:*` とは別ネームスペース）。切断中は REST（`POST …/cue`）に落として操作を
// 失わせない。経過時間・時計はサーバー時刻基準（`cg:sync` の timestamp で skew 補正）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ChevronLeft, Eraser, Loader2, Type } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyError } from '@/lib/notify';
import {
  GRAPHICS_SLOTS, PROOF_LABELS, setGraphicsCue,
  type GraphicsBundle, type GraphicsCueRow, type GraphicsPageRow, type GraphicsSlot,
} from '@/lib/graphicsApi';
import { createGraphicsSocket, emitCgSet, type CgSyncPayload } from '@/lib/graphicsSocket';
import { useGraphicsProject } from './useGraphicsProject';
import { useConsolePages } from './useConsolePages';
import { useAutoOutHighlight } from './useAutoOutHighlight';
import { useConsoleKeyboard } from './useConsoleKeyboard';
import { useConsoleContinue } from './useConsoleContinue';
import { ProofBadge } from './badges';
import { resolveTelopTheme } from './telopTheme';
import { ConsolePreview } from './ConsolePreview';
import { ConsoleControls } from './ConsoleControls';
import { ConsoleSlotLanes } from './ConsoleSlotLanes';
import { ConsolePageList } from './ConsolePageList';
import { ScoreQuickAdjust } from './ScoreQuickAdjust';
import { RankingControlPanel } from './RankingControlPanel';
import { readRankingStep } from './rankingFields';

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
  /** テンキーで溜めている呼出番号（Enter / スタンバイで確定） */
  const [callBuffer, setCallBuffer] = useState('');
  const socketRef = useRef<Socket | null>(null);
  /** サーバー時刻 − クライアント時刻（ms）。経過時間・時計をサーバー基準にする */
  const serverOffsetRef = useRef(0);
  // 段6-4: 自動退出ルールで OUT になったスロットを一時的にハイライトする
  // （「衝突の解決をオペレーターの注意力に任せない」— 何が起きたか気づける形にする）
  const { highlight: autoOutHighlight, flash: flashAutoOut } = useAutoOutHighlight();
  const [, forceTick] = useState(0);
  // ページ一覧＋ cg:sync のページ差分上書き（±ボタンなど）。詳細は useConsolePages.ts
  const { pages, callOrder, pageById, applyPageSync } = useConsolePages(bundle);
  const pvwPage = pvwPageId ? pageById.get(pvwPageId) ?? null : null;

  useEffect(() => {
    const socket = createGraphicsSocket(projectId);
    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('cg:sync', (payload: CgSyncPayload) => {
      if (Array.isArray(payload?.cues)) setCues(cuesToMap(payload.cues));
      if (payload?.page) applyPageSync(payload.page);
      if (typeof payload?.timestamp === 'number' && Number.isFinite(payload.timestamp)) {
        serverOffsetRef.current = payload.timestamp - Date.now();
      }
      if (Array.isArray(payload?.autoOutSlots)) flashAutoOut(payload.autoOutSlots);
    });
    return () => {
      socketRef.current = null;
      socket.disconnect();
    };
    // applyPageSync は useConsolePages が毎レンダー新しい関数を返すため deps に
    // 入れない（入れると socket が張り直され続ける）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  /** いまオンエア中のページ（PGM 合成の材料） */
  const livePages = useMemo(
    () =>
      GRAPHICS_SLOTS
        .map((slot) => cues[slot]?.pageId)
        .filter((id): id is string => !!id)
        .map((id) => pageById.get(id))
        .filter((p): p is GraphicsPageRow => !!p),
    [cues, pageById],
  );

  // 経過時間は 1秒・時計/カウントダウンが見えている間は 250ms で描き直す。
  // 何も出ていない・選ばれていないときはタイマー自体を回さない
  const anyLive = livePages.length > 0;
  const clockVisible = [...livePages, ...(pvwPage ? [pvwPage] : [])]
    .some((p) => p.slot === 'clock' || p.partKey === 'countdown');
  useEffect(() => {
    if (!anyLive && !clockVisible) return;
    const timer = setInterval(() => forceTick((n) => (n + 1) % 1_000_000), clockVisible ? 250 : 1000);
    return () => clearInterval(timer);
  }, [anyLive, clockVisible]);
  const serverNowMs = Date.now() + serverOffsetRef.current;

  /** `cg:set` を1発送る。切断中は REST に落とし、返ってきた cue で画面をそろえる */
  const sendSet = async (slot: GraphicsSlot, pageId: string | null) => {
    const socket = socketRef.current;
    if (socket?.connected) {
      emitCgSet(socket, slot, pageId);
      return;
    }
    try {
      const next = await setGraphicsCue(projectId, slot, pageId);
      setCues(cuesToMap(next.cues));
      flashAutoOut(next.autoOutSlots);
    } catch {
      notifyError('送出の指示を送れませんでした', { description: 'サーバーとの接続を確認してください。' });
    }
  };

  // 「続き」ボタンの対象選定・実処理（list/score=reveal_phase・vote=fields.voteState、
  // どちらの経路かの説明は useConsoleContinue.ts 参照）。400行の目安のためのフック切り出し
  const { continueTarget, sendContinue, resetVoteStateForTake } = useConsoleContinue({
    projectId, livePages, socketRef, setCuesFromRows: (rows) => setCues(cuesToMap(rows)),
  });

  /** 校正の防衛線: 未完成はブロック・未確認は確認してから（TAKE と 次へ で共通） */
  const guardTake = async (page: GraphicsPageRow): Promise<boolean> => {
    if (page.proofState === 'draft') {
      notifyError('未完成のページは TAKE できません', { description: `「${page.name}」の中身を仕上げて校正に回してください。` });
      return false;
    }
    if (page.proofState === 'unproofed') {
      return await confirmAction({
        title: `校正が「${PROOF_LABELS.unproofed}」のページを出しますか？`,
        description: `「${page.name}」はまだ表記チェックが済んでいません。`,
        confirmLabel: 'TAKE する',
        tone: 'danger',
      });
    }
    return true;
  };

  const take = async (page: GraphicsPageRow) => {
    if (!(await guardTake(page))) return;
    await resetVoteStateForTake(page);
    await sendSet(page.slot, page.id);
    setPvwPageId(null);
  };

  /** 次へ（Read Next）= PVW を TAKE し、呼出番号順の次をスタンバイ（末尾では留まる） */
  const takeAndNext = async () => {
    const page = pvwPage;
    if (!page) return;
    if (!(await guardTake(page))) return;
    await resetVoteStateForTake(page);
    await sendSet(page.slot, page.id);
    const idx = callOrder.findIndex((p) => p.id === page.id);
    const next = idx >= 0 && idx + 1 < callOrder.length ? callOrder[idx + 1] : page;
    setPvwPageId(next.id);
  };

  /** OUT（動詞）= PVW と同じスロットのオンエアを下ろす */
  const outStandby = async () => {
    if (pvwPage) await sendSet(pvwPage.slot, null);
  };

  /** ↑↓ のスタンバイ移動（呼出番号順・端で止まる） */
  const movePvw = (dir: 1 | -1) => {
    if (callOrder.length === 0) return;
    const idx = pvwPageId ? callOrder.findIndex((p) => p.id === pvwPageId) : -1;
    const next = idx < 0
      ? (dir > 0 ? 0 : callOrder.length - 1)
      : Math.min(callOrder.length - 1, Math.max(0, idx + dir));
    setPvwPageId(callOrder[next].id);
  };

  /** 番号呼出の確定: 溜まった番号のページを PVW に立てる（無い番号は知らせるだけ） */
  const commitCall = () => {
    const buf = callBuffer;
    if (!buf) return;
    setCallBuffer('');
    const no = Number(buf);
    const page = callOrder.find((p) => p.callNo === no);
    if (!page) {
      notifyError(`番号 ${no} のページはありません`, { description: '一覧の「番号」列で呼出番号を確認してください。' });
      return;
    }
    setPvwPageId(page.id);
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

  // キーボード運転（Space=TAKE ／ Enter=次へ ／ ↑↓=スタンバイ移動 ／ テンキー=番号呼出）
  useConsoleKeyboard({
    pushDigit: (d) => setCallBuffer((b) => (b + d).slice(0, 4)),
    popDigit: () => setCallBuffer((b) => b.slice(0, -1)),
    clearDigits: () => setCallBuffer(''),
    hasDigits: callBuffer.length > 0,
    commitCall,
    take: () => { if (pvwPage) void take(pvwPage); },
    next: () => { void takeAndNext(); },
    move: movePvw,
  });

  const pvwContext = pvwPage
    ? livePages.filter((p) => p.slot !== pvwPage.slot && p.id !== pvwPage.id)
    : [];

  /** PGM/PVW に乗っているスコアボード（±クイック調整の対象）。同じページの二重表示はしない */
  const liveScorePages = livePages.filter((p) => p.partKey === 'score');
  const pvwScorePage = pvwPage && pvwPage.partKey === 'score' && !liveScorePages.some((p) => p.id === pvwPage.id)
    ? pvwPage
    : null;
  const scoreWidgets = [
    ...liveScorePages.map((page) => ({ page, label: 'オンエア中' })),
    ...(pvwScorePage ? [{ page: pvwScorePage, label: '次に出す（PVW）' }] : []),
  ];

  /** PGM のランキング発表が final-pitch のときだけ出す操作パネル（RankingControlPanel.tsx） */
  const rankingFinalPitchPage = livePages.find(
    (p) => p.partKey === 'ranking' && readRankingStep(p.fields) === 'final-pitch',
  ) ?? null;

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

      {/* PGM ／ PVW の本物のプレビュー ＋ 操作卓（番号呼出・5動詞） */}
      <div className="mt-4 flex flex-col items-stretch gap-3 lg:flex-row">
        <ConsolePreview
          tone="pgm"
          title="いま出ている絵（合成後）"
          right={<span className="font-number shrink-0 text-sub-sm text-muted-foreground">1920×1080</span>}
          items={livePages.map((page) => ({ page, revealPhase: cues[page.slot]?.revealPhase }))}
          emptyText="オンエアなし"
          serverNowMs={serverNowMs}
          ctx={{
            theme: resolveTelopTheme(bundle.project.theme),
            tickerLive: livePages.some((p) => p.slot === 'ticker'),
            flashLive: livePages.some((p) => p.slot === 'flash'),
          }}
        />
        <ConsolePreview
          tone="pvw"
          title={pvwPage ? (
            <>次に出す ・ <span className="font-number">{pvwPage.callNo}</span> {pvwPage.name}</>
          ) : '次に出す絵（未選択）'}
          right={pvwPage ? <ProofBadge state={pvwPage.proofState} w={null} /> : undefined}
          items={pvwPage ? [...pvwContext.map((page) => ({ page, dim: true })), { page: pvwPage }] : []}
          emptyText="番号呼出か「PVWへ」で選ぶと、ここに映ります"
          serverNowMs={serverNowMs}
          ctx={{ theme: resolveTelopTheme(bundle.project.theme) }}
        />
        <ConsoleControls
          callBuffer={callBuffer}
          pvwPage={pvwPage}
          onStandby={commitCall}
          onTake={() => { if (pvwPage) void take(pvwPage); }}
          onNext={() => { void takeAndNext(); }}
          onOut={() => { void outStandby(); }}
          continueTarget={continueTarget}
          onContinue={() => { if (continueTarget) void sendContinue(continueTarget); }}
        />
      </div>

      {/* スコアボードの±クイック調整（PGM/PVW に score パーツが乗っているときだけ出す） */}
      {scoreWidgets.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {scoreWidgets.map(({ page, label }) => (
            <ScoreQuickAdjust key={page.id} page={page} label={label} />
          ))}
        </div>
      )}

      {/* ランキング発表 Final Pitch の操作パネル（PGM が partKey==='ranking' かつ
          fields.step==='final-pitch' のときだけ出す） */}
      {rankingFinalPitchPage && (
        <div className="mt-3">
          <RankingControlPanel page={rankingFinalPitchPage} />
        </div>
      )}

      {/* スロットごとのオンエア状態（最終防衛線 — 今出ているもの＋経過時間が一目で分かる） */}
      <div className="mt-3">
        <ConsoleSlotLanes
          cues={cues}
          pageById={pageById}
          serverNowMs={serverNowMs}
          onOut={(slot) => { void sendSet(slot, null); }}
          autoOutHighlight={autoOutHighlight}
        />
      </div>

      {/* ページ一覧（送出リスト）。並び＝sortOrder・PGM/PVW の行は色で追える */}
      <ConsolePageList
        pages={pages}
        cues={cues}
        pvwPageId={pvwPageId}
        onSelectPvw={setPvwPageId}
      />
    </div>
  );
}
