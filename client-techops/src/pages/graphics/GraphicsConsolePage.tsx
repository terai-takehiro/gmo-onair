// テロップCG — 送出コンソール（`/techops/graphics/:ownerKey/live`・モック②）。
//
// 段B（docs/design/v4/graphics-redesign.md §8）で本番モードの動詞を TAKE と CLEAR の
// 2つに戻した——旧アプリ（client-awards）の「NEXT → TAKE → CLEAR」に倣い、TAKE すると
// NEXT が自動で次へ進むため「TAKE 連打で1本回せる」。旧5動詞（スタンバイ／TAKE／続き／
// OUT／次へ）のうち撤去した3つの行き先:
//   ・スタンバイ・次へ → 行を押すと NEXT（ConsolePageList.tsx）＋ TAKE 自体の自動前進
//     （useConsoleTake.ts の take()。旧 take()/takeAndNext() を1つに統合した）
//   ・続き（進める）   → OA 中の行の中へ移した（ConsolePageList.tsx の担当）
//   ・OUT             → ConsoleSlotLanes.tsx の「消す」ボタンが操作対象そのままで引き継ぐ
//
// 運転モデル:
//   ・OA（いま出ている）／ NEXT（次に出す）の**本物のプレビュー**（出力画面と同じ
//     renderGraphicsPage を縮尺表示・ConsolePreview.tsx）
//   ・番号呼出（テンキー → Enter で NEXT に）／ 一覧の行を押しても NEXT になる
//   ・TAKE = NEXT を OA へ出し、出す順（sortOrder＝useConsolePages の `pages`。呼出番号順の
//     `callOrder` ではない — callNo は並べ替えても変わらない固定値で表示順と一致しない）の
//     次の行へ NEXT を自動で進める（末尾では動かない）
//   ・CLEAR = 最後に TAKE したもの（`lastTaken` で覚えておく）を消す
//   ・キーボード運転: Space=TAKE ／ Backspace=CLEAR（数字が溜まっていれば1桁消す）／
//     ↑↓=NEXT移動 ／ テンキー=番号呼出 ／ Esc=何もしない（useConsoleKeyboard.ts）
//   ・スロットごとのオンエア状態レーン（現在ページ＋経過時間＋消す）＝最終防衛線
//   ・校正「未完成」は TAKE をブロック・「未確認」は警告してから（guardTake・変更なし）
// TAKE できるのは NEXT に見えているものだけ — 一覧から直接オンエアするボタンは無い。
//
// リアルタイムは Socket.IO `/graphics`（`lib/graphicsSocket.ts`・`cg:*`。本番進行の
// `cue:*` とは別ネームスペース）。切断中は REST（`POST …/cue`）に落として操作を
// 失わせない。経過時間・時計はサーバー時刻基準（`cg:sync` の timestamp で skew 補正）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronLeft, Circle, Eraser, Loader2, Type } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { PageShell } from '@gmo-onair/shared/src/client/ui/pageShell';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
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
import { useConsoleTake } from './useConsoleTake';
import { useScriptFollow } from './useScriptFollow';
import { isPageContentEmpty } from './pageFields';
import { resolveTelopTheme } from './telopTheme';
import { ConsolePreview } from './ConsolePreview';
import { ConsoleControls } from './ConsoleControls';
import { ConsoleSlotLanes } from './ConsoleSlotLanes';
import { ConsolePageList } from './ConsolePageList';
import { readVoteState } from './voteState';

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
      <PageShell>
        <EmptyState icon={<Type />} title="案件・番組が見つかりません" description="管理番号が合っているか確かめてください。" />
      </PageShell>
    );
  }

  if (state.status === 'error') {
    return (
      <PageShell>
        <EmptyState icon={<AlertCircle />} title="テロップCGを開けませんでした" description={state.message} />
      </PageShell>
    );
  }

  return <ConsoleContent ownerKey={ownerKey ?? ''} bundle={state.bundle} />;
}

function cuesToMap(cues: GraphicsCueRow[]): Partial<Record<GraphicsSlot, GraphicsCueRow>> {
  const map: Partial<Record<GraphicsSlot, GraphicsCueRow>> = {};
  for (const c of cues) map[c.slot] = c;
  return map;
}

/**
 * NEXT プレビュー右上の確認状態。3値の ProofBadge（badges.tsx・未完成／未確認／確認済の
 * 旧語彙をそのまま表示する）は退役させた表現なのでここでは使わない——出す順一覧
 * （ConsolePageList.tsx）の行と同じ、段Aに揃えた✓確認済み／○未確認の2値表示に、
 * 文言が空のときだけ「未完成」の自動バッジを添える（レビュー指摘対応）。
 */
function NextProofStatus({ page }: { page: GraphicsPageRow }) {
  const empty = isPageContentEmpty(page.partKey, page.fields);
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {empty && (
        <span className="rounded-badge-xs bg-destructive-surface px-1.5 py-0.5 text-badge font-bold text-destructive">未完成</span>
      )}
      {page.proofState === 'proofed' ? (
        <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
      ) : (
        <Circle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      )}
    </span>
  );
}

function ConsoleContent({ ownerKey, bundle }: { ownerKey: string; bundle: GraphicsBundle }) {
  const projectId = bundle.project.id;
  const [cues, setCues] = useState(() => cuesToMap(bundle.cues));
  const [connected, setConnected] = useState(false);
  const [pvwPageId, setPvwPageId] = useState<string | null>(null);
  /** テンキーで溜めている呼出番号（Enter または「NEXTにする」ボタンで確定） */
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
  // 段E①「台本に追従」。ONの番組では進行台本の現在行が進むと NEXT だけが自動で移る（詳細は useScriptFollow.ts）
  useScriptFollow({ enabled: bundle.project.followScript, pages, onAdvanceNext: setPvwPageId });
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

  // 「進める」（旧「続き」）の実処理（list/score=reveal_phase・vote=fields.voteState・
  // ranking=fields.step、どの経路かの説明は useConsoleContinue.ts 参照）。呼び出しは
  // ConsolePageList.tsx の OA 中の行がページごとに直接行う（continueTarget はもう使わない）。
  // 400行の目安のためのフック切り出し
  const { sendContinue, resetVoteStateForTake } = useConsoleContinue({
    projectId, livePages, socketRef, setCuesFromRows: (rows) => setCues(cuesToMap(rows)),
  });

  /** 確認の防衛線: 未完成はブロック・未確認は確認してから（TAKE 時に毎回通す。useConsoleTake.ts の take() から呼ぶ） */
  const guardTake = async (page: GraphicsPageRow): Promise<boolean> => {
    if (page.proofState === 'draft') {
      notifyError('未完成のテロップは TAKE できません', { description: `「${page.name}」に文言を入れてから、確認済みにしてください。` });
      return false;
    }
    if (page.proofState === 'unproofed') {
      return await confirmAction({
        title: `${PROOF_LABELS.unproofed}のテロップを出しますか？`,
        description: `「${page.name}」はまだ表記の確認が済んでいません。`,
        confirmLabel: 'TAKE する',
        tone: 'danger',
      });
    }
    return true;
  };

  // TAKE（自動前進込み）／CLEAR／↑↓NEXT移動の実処理は useConsoleTake.ts へ切り出した
  // （400行の目安のため。useConsoleContinue.ts と同じ思想）。「次へ」を統合した理由・
  // pages（出す順）を使う理由はそちらのファイル冒頭のコメント参照
  const { take, canClear, clearLastTaken, moveNext, resetLastTaken } = useConsoleTake({
    pages, cues, pvwPageId, setPvwPageId, guardTake, resetVoteStateForTake, sendSet,
  });

  /**
   * 番号呼出の確定: 溜まった番号のページを PVW に立てる（無い番号は知らせるだけ）。
   * 安全装置③（文言が空のものは NEXT に立てられない）は行クリック（ConsolePageList.tsx）
   * だけでなくここでも効かせる——テンキー→Enter は「口頭『5番出して』の運用」で引き続き
   * 残す経路であり、行クリックだけ弾いて番号呼出は素通りでは③が経路によって不揃いになる
   * （レビュー指摘対応）。
   */
  const commitCall = () => {
    const buf = callBuffer;
    if (!buf) return;
    setCallBuffer('');
    const no = Number(buf);
    const page = callOrder.find((p) => p.callNo === no);
    if (!page) {
      notifyError(`番号 ${no} のテロップはありません`, { description: '出す順の「番号」列で確認してください。' });
      return;
    }
    if (isPageContentEmpty(page.partKey, page.fields)) {
      notifyError(`「${page.name}」は文言が未入力です`, { description: '文言を入れてから、もう一度番号を押してください。' });
      return;
    }
    setPvwPageId(page.id);
  };

  /**
   * 全部消す（旧オールクリア）。トリガーボタン・確認ダイアログの見出し・実行ボタンの
   * 3つを「全部消す」で揃える——どれか1つだけ改名すると、押した本人の目に見慣れない
   * 語（オールクリア・スロット）が出るという新しい不整合になるため（レビュー指摘対応）。
   * ロジック（対象の位置・確認の要否）自体は変えていない。
   * 全部消したら CLEAR の対象（lastTaken）もクリアする——消した後は canClear が自然に
   * false になるが、念のため明示的に外しておく。
   */
  const allClear = async () => {
    if (!(await confirmAction({
      title: 'いま出ているテロップを全部消しますか？',
      description: 'どの位置のテロップも全部下ります（放送に出ます）。',
      confirmLabel: '全部消す',
      tone: 'danger',
    }))) return;
    for (const slot of GRAPHICS_SLOTS) {
      if (cues[slot]?.pageId) await sendSet(slot, null);
    }
    resetLastTaken();
  };

  // キーボード運転（Space=TAKE ／ Backspace=CLEAR（数字が溜まっていれば1桁消す）／
  // ↑↓=NEXT移動 ／ テンキー=番号呼出）。「次へ」は無くなった——TAKE 自体が自動前進する
  useConsoleKeyboard({
    pushDigit: (d) => setCallBuffer((b) => (b + d).slice(0, 4)),
    popDigit: () => setCallBuffer((b) => b.slice(0, -1)),
    clearDigits: () => setCallBuffer(''),
    hasDigits: callBuffer.length > 0,
    commitCall,
    take: () => { if (pvwPage) void take(pvwPage); },
    clear: () => { void clearLastTaken(); },
    move: moveNext,
  });

  /** NEXT のプレビューに「他スロットの現在オンエア」を薄く重ねるための文脈（変更なし） */
  const pvwContext = pvwPage
    ? livePages.filter((p) => p.slot !== pvwPage.slot && p.id !== pvwPage.id)
    : [];

  // スコアボードの±クイック調整・ランキング Final Pitch パネルは OA 中の行の中へ移した
  // （ConsolePageList.tsx の OaInlineAction）ので、ここでの算出・専用 JSX ブロックは廃止した。

  /** OA の投票・クイズページ（段6-6・締切連動の残り時間表示用・ConsoleControls.tsx） */
  const openVotePage = livePages.find(
    (p) => p.partKey === 'vote' && readVoteState(p.fields) === 'open',
  ) ?? null;

  return (
    <PageShell>
      <Link
        to={`/techops/graphics/${encodeURIComponent(ownerKey)}`}
        className="inline-flex min-h-tap w-fit items-center gap-1 rounded-control-md px-1.5 text-sub font-bold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />テロップ一覧
      </Link>

      <PageHeader
        title={`本番モード ／ ${bundle.project.name}`}
        sub={(<>
          行を押す（またはテンキー→Enter）で <strong>NEXT</strong> に立ち、TAKE で <strong>OA</strong> に出します。
          TAKE すると NEXT は出す順の次の行へ自動で進みます。同じ位置には<strong>1枚だけ</strong>出せるので、
          同じ位置に TAKE すると前のテロップは自動で下ります。
        </>)}
      >
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
          <Eraser className="mr-1 h-4 w-4 text-destructive" aria-hidden="true" />全部消す
        </Button>
      </PageHeader>

      {/* OA ／ NEXT の本物のプレビュー ＋ 操作卓（番号呼出・TAKE／CLEARの2動詞） */}
      <div className="flex flex-col items-stretch gap-3 lg:flex-row">
        <ConsolePreview
          tone="pgm"
          title="いま出ている（合成後）"
          right={<span className="font-number shrink-0 text-sub-sm text-muted-foreground">1920×1080</span>}
          items={livePages.map((page) => ({ page, revealPhase: cues[page.slot]?.revealPhase }))}
          emptyText="何も出ていません（透過）"
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
            <><span className="font-number">{pvwPage.callNo}</span> {pvwPage.name}</>
          ) : '次に出す'}
          right={pvwPage ? <NextProofStatus page={pvwPage} /> : undefined}
          items={pvwPage ? [...pvwContext.map((page) => ({ page, dim: true })), { page: pvwPage }] : []}
          emptyText="出す順から行を押すと、ここに立ちます（テンキー→Enter でも）"
          serverNowMs={serverNowMs}
          ctx={{ theme: resolveTelopTheme(bundle.project.theme) }}
        />
        <ConsoleControls
          callBuffer={callBuffer}
          nextPage={pvwPage}
          onCommitCall={commitCall}
          onTake={() => { if (pvwPage) void take(pvwPage); }}
          canClear={canClear}
          onClear={() => { void clearLastTaken(); }}
          votePage={openVotePage}
        />
      </div>

      {/* 「いま出ているもの」帯。ConsoleSlotLanes 自身は見出しを描かない（グリッドのみ）ので
          ここで見出しを添える。0件で帯が丸ごと消える（ConsoleSlotLanes.tsx参照）ときに
          見出しだけ独りで残らないよう、同じ条件（cueが有る・または自動退出の一時ハイライト中）
          で見出しごと隠す */}
      {(GRAPHICS_SLOTS.some((slot) => !!cues[slot]?.pageId) || autoOutHighlight.size > 0) && (
        <div className="mt-3">
          <h2 className="mb-1.5 text-th font-bold text-muted-foreground">いま出ているもの</h2>
          <ConsoleSlotLanes
            cues={cues}
            pageById={pageById}
            serverNowMs={serverNowMs}
            onOut={(slot) => { void sendSet(slot, null); }}
            autoOutHighlight={autoOutHighlight}
          />
        </div>
      )}

      {/* ページ一覧（送出リスト）。並び＝sortOrder・OA/NEXT の行は色で追える。行を押すと
          NEXT（テンキー→Enter と同じ結果）。OA 中の行には「進める」操作が埋め込まれる */}
      <ConsolePageList
        pages={pages}
        cues={cues}
        pvwPageId={pvwPageId}
        onSelectPvw={setPvwPageId}
        sendContinue={sendContinue}
      />
    </PageShell>
  );
}
