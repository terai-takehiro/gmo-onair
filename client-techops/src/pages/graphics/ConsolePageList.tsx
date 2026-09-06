// テロップCG — 送出コンソールの出す順一覧（段B・モック②の下段。全面書き換え）。
//
// 旧「PVWへ」ボタンは廃止し、**行そのものが NEXT の切り替え操作**になった
// （graphics-redesign.md §8「行を押す＝NEXTにする（今の「PVWへ」ボタンと同じ操作）」）。
// テンキー→Enterでの番号呼出（GraphicsConsolePage.tsx の commitCall）は今までどおり別経路
// として残っている——ここが唯一の入口ではない。
//
// 列も「番号／スロット／ページ／校正／操作」から「番号／確認／種類・文言／状態」に
// 作り直した——スロット札はもう画面に出さない語（帯〈ConsoleSlotLanes.tsx〉側で見せる）。
// 校正の3値バッジ（ProofBadge）は段Aと同じ✓/○の2値表示に寄せた（行の中の✓/○は
// 「そのページの確認状態」を表すだけの表示——TAKE時の警告ダイアログ〈guardTake・
// GraphicsConsolePage.tsx〉とは役割を分ける。段Aの実装は TelopListSection.tsx の
// TelopRow を参照・同じアイコン／バッジの出し方に揃えてある）。
//
// 安全装置（設計書§8。壊さないこと）:
//   ③文言が空のページは押しても NEXT にならない（isPageContentEmpty で判定。押せない
//     ことは行を薄く・not-allowed カーソルで伝えるだけで、押すたびにトーストは出さない。
//     ただし OA/NEXT の配色は文言が空でも優先して見せる——「放送中なのに薄く非活性風に
//     見える」という事故対応中の視認性事故を避けるため。レビュー指摘対応）
//   ④ドラッグ&ドロップの並べ替えは今回も追加しない（①一覧の @dnd-kit 並べ替えとは
//     別物。ここに実装してはいけない）
//
// OA中（そのスロットの cue.pageId と一致）の行にだけ、部品ごとの「進める」操作
// （設計書§8「進める」）を行の中に足す: vote=出題→締切→開票／ranking=次の順位 または
// Final Pitch パネル／list=次の項目／score=±クイック調整。この操作エリアは
// stopPropagation を付け、押しても行クリック（NEXT化）に巻き込まれないようにしてある。
//
// コーナー見出し（段C）: ①一覧（`TelopListSection.tsx`）と同じ `groupPagesBySection` で
// 束ね、シンプルな小見出し（テキストだけ）を挟む。**「台本と違います」バッジはここには
// 足さない**——本番中の一覧を必要以上に賑やかにしないための意図的な非対称（①だけの機能）。
// 見出しの配色もこのファイルの既存トーンのまま（②本体のダーク配色は `GraphicsConsolePage.tsx`
// 側の話で、このファイルはその対象外——既存のまま変えない）。
import { Fragment } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import {
  PART_LABELS,
  type GraphicsCueRow, type GraphicsPageRow, type GraphicsSlot,
} from '@/lib/graphicsApi';
import { isPageContentEmpty } from './pageFields';
import { pageSupportsReveal } from './outputParts';
import { readRankingStep } from './rankingFields';
import { readVoteState } from './voteState';
import { RankingControlPanel } from './RankingControlPanel';
import { ScoreQuickAdjust } from './ScoreQuickAdjust';
import { groupPagesBySection } from './telopGrouping';

export function ConsolePageList({ pages, cues, pvwPageId, onSelectPvw, sendContinue }: {
  /** 表示順（送出リスト順＝sortOrder）に並べ替え済みのページ */
  pages: GraphicsPageRow[];
  cues: Partial<Record<GraphicsSlot, GraphicsCueRow>>;
  /** NEXT に立っているページID（null＝未設定） */
  pvwPageId: string | null;
  /**
   * 行クリックでの NEXT 切り替え（null＝選択解除）。旧「PVWへ」ボタンの
   * `onSelectPvw(inPvw ? null : p.id)` をそのまま行クリックへ引き継いだだけで、
   * シグネチャ・呼び出し元（GraphicsConsolePage.tsx の setPvwPageId）は変えていない。
   */
  onSelectPvw: (pageId: string | null) => void;
  /**
   * OA中の行内操作（投票の出題/締切/開票・ランキングの次の順位・一覧の次の項目）が
   * 押されたときに呼ぶ。useConsoleContinue.ts の sendContinue をそのまま渡す想定
   * （score は自己完結の ScoreQuickAdjust を使うのでこれを経由しない）。
   */
  sendContinue: (page: GraphicsPageRow) => void;
}) {
  return (
    <section className="mt-4 overflow-hidden rounded-card border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border-faint bg-surface-subtle px-4 py-2 text-th text-muted-foreground">
        <span className="font-number w-11 shrink-0 text-right">番号</span>
        <span className="w-9 shrink-0 text-center">確認</span>
        <span className="min-w-0 flex-1">種類・文言</span>
        <span className="w-20 shrink-0 text-right">状態</span>
      </div>
      {pages.length === 0 ? (
        <EmptyState
          title="ページがまだありません"
          description="ハブ画面（ページと送出リスト）で本番前にページを作っておきます。"
        />
      ) : groupPagesBySection(pages).map((group) => (
        <Fragment key={group.pages[0].id}>
          {group.section != null && (
            <div className="border-b border-border-faint bg-surface-subtle px-4 py-1 text-note font-bold text-muted-foreground">
              {group.section}
            </div>
          )}
          {group.pages.map((p) => (
            <ConsoleRow
              key={p.id}
              page={p}
              onAir={cues[p.slot]?.pageId === p.id}
              isNext={p.id === pvwPageId}
              onSelectPvw={onSelectPvw}
              sendContinue={sendContinue}
            />
          ))}
        </Fragment>
      ))}
    </section>
  );
}

function ConsoleRow({ page, onAir, isNext, onSelectPvw, sendContinue }: {
  page: GraphicsPageRow;
  /** cues[page.slot]?.pageId === page.id（このページがそのスロットで送出中＝OA） */
  onAir: boolean;
  isNext: boolean;
  onSelectPvw: (pageId: string | null) => void;
  sendContinue: (page: GraphicsPageRow) => void;
}) {
  const contentEmpty = isPageContentEmpty(page.partKey, page.fields);
  const showInlineAction = onAir && pageSupportsReveal(page);

  return (
    <div
      onClick={() => { if (!contentEmpty) onSelectPvw(isNext ? null : page.id); }}
      title={contentEmpty ? '文言が未入力のため NEXT にできません' : undefined}
      className={`flex flex-col gap-2 border-b border-border-faint px-4 py-2 last:border-b-0 ${
        contentEmpty ? 'cursor-not-allowed' : 'cursor-pointer'
      } ${
        onAir
          ? 'bg-destructive-surface'
          : isNext
            ? 'bg-warning-surface'
            : contentEmpty
              ? 'opacity-50'
              : 'hover:bg-surface-subtle'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="font-number w-11 shrink-0 text-right text-list font-bold">{page.callNo}</span>
        <span className="flex w-9 shrink-0 justify-center" aria-hidden="true">
          {page.proofState === 'proofed' ? (
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-sub text-muted-foreground">{PART_LABELS[page.partKey]}</span>
          <span className="min-w-0 truncate text-list">{page.name}</span>
          {contentEmpty && (
            <span className="shrink-0 rounded-badge-xs bg-destructive-surface px-1.5 py-0.5 text-badge font-bold text-destructive">未完成</span>
          )}
        </span>
        <span className="w-20 shrink-0 text-right text-sub font-bold">
          {onAir ? (
            <span className="text-destructive">● OA</span>
          ) : isNext ? (
            <span className="text-warning">▶ NEXT</span>
          ) : null}
        </span>
      </div>
      {/* OA中の「進める」操作。stopPropagation で行クリック（NEXT化）に巻き込まれないようにする */}
      {showInlineAction && (
        <div className="pl-[6.5rem]" onClick={(e) => e.stopPropagation()}>
          <OaInlineAction page={page} sendContinue={sendContinue} />
        </div>
      )}
    </div>
  );
}

/**
 * OA中の行にだけ出す「進める」操作。対象は pageSupportsReveal(page) が true の4種
 * （outputParts.tsx参照）——score・ranking(final-pitch) は既存の自己完結部品を
 * そのまま埋め込み、vote・ranking(それ以外)・list は sendContinue を叩くだけの
 * 小さなボタン1つ。
 */
function OaInlineAction({ page, sendContinue }: {
  page: GraphicsPageRow;
  sendContinue: (page: GraphicsPageRow) => void;
}) {
  if (page.partKey === 'score') {
    // ScoreQuickAdjust は自己完結部品（PGM/PVW帯でも使っている既存部品をそのまま流用）。
    // label は「オンエア中」等の文脈ラベル用だが、行の中では種類・文言列が既にその役目を
    // 果たしているので空文字を渡す（ScoreQuickAdjust自体の見た目・動作ロジックは変えない）
    return <ScoreQuickAdjust page={page} label="" />;
  }
  if (page.partKey === 'ranking') {
    if (readRankingStep(page.fields) === 'final-pitch') {
      return <RankingControlPanel page={page} />;
    }
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => sendContinue(page)}>
        次の順位を発表
      </Button>
    );
  }
  if (page.partKey === 'vote') {
    const state = readVoteState(page.fields);
    const label = state === 'open' ? '締切にする' : state === 'closed' ? '開票する' : '出題に戻す';
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => sendContinue(page)}>
        {label}
      </Button>
    );
  }
  if (page.partKey === 'list') {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => sendContinue(page)}>
        次の項目
      </Button>
    );
  }
  return null;
}
