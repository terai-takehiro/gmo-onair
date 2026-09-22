/**
 * 営業レビュー — 営業評価タブ (v4)
 *
 * 計算は旧実装のまま（`sales-analytics.service.ts` の `getPerformanceReview`）。
 * 表を `Row` / `RowSlot` / `MoneyCell` に置き換えた（列幅は7段から選ぶ・生パレット無し）。
 *
 * ── スマホ対応（2026-09・利用者からのご指摘）──────────────────
 *
 * **以前はここに「この画面は PC 専用なのでスマホ用カードは持たない」と書いていた。**
 * その前提は無くなった（`pcOnlyScreens.ts` から `/sales/activity-logs` を外し、
 * 画面の中の `PcOnlyPanel` の門も外した）ので、8列の表とは別に
 * **スマホ用の並び**を持たせる。
 *
 * 8列（担当者・目標・受注・達成率・ヨミ数・受注数・受注率・平均単価）は
 * 固定幅の合計だけで 128+128+160+72+72+72+128 = 760px あり、375px には
 * どう詰めても入らない。`_rules.md`「3. スマホ」の決めごとどおり
 * **縮小せずに出す情報を絞る**:
 *
 *   担当者名 ／ 達成率（大きい数字）／ 達成率のバー ／ 受注・目標・受注率
 *
 * 落としたのは **ヨミ数・受注数・平均単価**（受注率が出ていれば分母分子の
 * 生の件数は外でも要らない、という判断。PC の表には今までどおり全部出る）。
 * 金額は列が3つに割れるので `MoneyCell` の7段（96px〜）が入らず、
 * **万円に丸めた `ManYen`** を使う（桁をそろえる相手が横に居ないので丸めてよい）。
 *
 * **色帯のカードは使わない**（今回の設計方針）。達成率の良し悪しは
 * **文字の色とバーだけ**で見せ、面は塗らない。
 */
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { Row, RowHeader, RowMain, RowTitle, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { Num, StatValue, ManYen } from '@gmo-onair/shared/src/client/ui/numbers';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { Panel } from './Panel';
import type { PerformanceRow } from './types';

// ───────────────────────────────────────────────────────
// 達成率の段
// ───────────────────────────────────────────────────────

/**
 * 達成率の段。**しきい値をここ1か所にする** — 以前はバッジの色とバーの色が
 * それぞれ別の三項演算子で `>= 100` / `>= 70` を書いており、片方だけ直すと
 * 「バーは黄色なのに札は緑」のようにずれる形だった。
 */
type AchievementLevel = 'over' | 'near' | 'under';

function achievementLevel(rate: number): AchievementLevel {
  if (rate >= 100) return 'over';
  if (rate >= 70) return 'near';
  return 'under';
}

/** PC の表の札（面を塗るのは表の中の小さな札だけ・スマホでは使わない） */
const BADGE_TONE: Record<AchievementLevel, string> = {
  over: 'bg-success-surface text-success',
  near: 'bg-warning-surface text-warning',
  under: 'bg-destructive-surface text-destructive',
};

/** スマホの大きい数字。**文字にだけ色を使う**（面は塗らない） */
const TEXT_TONE: Record<AchievementLevel, string> = {
  over: 'text-success',
  near: 'text-warning',
  under: 'text-destructive',
};

const BAR_TONE: Record<AchievementLevel, string> = {
  over: 'bg-success',
  near: 'bg-warning',
  under: 'bg-destructive',
};

/**
 * 達成率のバー。
 * `showBadge` を偽にすると**バーだけ**になる（スマホは達成率を大きい数字で
 * 別に出しているので、同じ数字を札でもう一度出さない）。
 */
function AchievementBar({
  rate, showBadge = true, className,
}: { rate: number; showBadge?: boolean; className?: string }) {
  const level = achievementLevel(rate);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className={cn('v4-bar block h-full rounded-full', BAR_TONE[level])}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </span>
      {showBadge && (
        <span className={cn('rounded-badge shrink-0 px-2 py-0.5 text-note font-bold', BADGE_TONE[level])}>
          {rate}%
        </span>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────
// スマホの並び（1担当者 = 1つの並び）
// ───────────────────────────────────────────────────────

/** スマホの3項目（受注・目標・受注率）。**見出しは13px以上**（決めごと「本文は13px以上」） */
function MiniStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-note truncate text-muted-foreground">{label}</dt>
      <dd className="text-list truncate">{children}</dd>
    </div>
  );
}

/**
 * スマホの1担当者。白い面のまま、**細い罫線で区切るだけ**（色帯は使わない）。
 * `emphasis` はチーム合計の行で、担当者の並びと同じ組み方のまま
 * 上に太めの罫を1本引いて区切る（PC の表の `border-t-2` と同じ考え方）。
 */
function PerformanceStack({
  name, rate, wonAmount, targetAmount, winRate, emphasis = false,
}: {
  name: string;
  rate: number;
  wonAmount: number;
  targetAmount: number;
  winRate: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        'border-b border-border-faint py-3 last:border-b-0 last:pb-0',
        emphasis && 'border-t-2 border-t-border pt-3 font-bold',
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-list min-w-0 truncate">{name}</span>
        <span className="flex shrink-0 items-baseline gap-0.5">
          <StatValue size="sm" className={TEXT_TONE[achievementLevel(rate)]}>{rate}</StatValue>
          <span className="text-note text-muted-foreground">%</span>
        </span>
      </div>
      <AchievementBar rate={rate} showBadge={false} className="mt-1.5" />
      <dl className="mt-2 grid grid-cols-3 gap-2">
        <MiniStat label="受注"><ManYen value={wonAmount} /></MiniStat>
        <MiniStat label="目標"><ManYen value={targetAmount} /></MiniStat>
        <MiniStat label="受注率"><Num value={winRate} unit="%" /></MiniStat>
      </dl>
    </div>
  );
}

// ───────────────────────────────────────────────────────

export function PerformancePanel({
  performance, canSetTarget, onOpenTarget,
}: { performance: PerformanceRow[]; canSetTarget: boolean; onOpenTarget: () => void }) {
  const team = performance.reduce(
    (acc, p) => ({
      target_amount: acc.target_amount + p.target_amount,
      won_amount: acc.won_amount + p.won_amount,
      won_count: acc.won_count + p.won_count,
      total_count: acc.total_count + p.total_count,
    }),
    { target_amount: 0, won_amount: 0, won_count: 0, total_count: 0 },
  );
  const teamRate = team.target_amount > 0 ? Math.round((team.won_amount / team.target_amount) * 1000) / 10 : 0;
  const teamWinRate = team.total_count > 0 ? Math.round((team.won_count / team.total_count) * 1000) / 10 : 0;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {performance.length > 0 && (
          // **チーム合計の1行はスマホでは出さない。** スマホは下の並びの末尾に
          // 同じ組み方でチーム合計を置くので、ここに出すと同じ数字が2回出る
          <p className="text-sub hidden text-muted-foreground sm:block">
            チーム合計: <MoneyCell value={team.won_amount} width={96} className="inline-flex" /> /{' '}
            <MoneyCell value={team.target_amount} width={96} className="inline-flex" />（{teamRate}%）
          </p>
        )}
        {canSetTarget && (
          <Button size="sm" onClick={onOpenTarget} className="ml-auto">
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />目標設定
          </Button>
        )}
      </div>

      <Panel title="担当者別 営業評価">
        {performance.length === 0 ? (
          <EmptyState title="まだ担当者別の実績がありません" description="営業目標を決めるか、ヨミを登録すると出てきます。" />
        ) : (
          <>
            {/* スマホ（640px 未満）。1担当者 = 1つの並び */}
            <div className="sm:hidden">
              {performance.map((p) => (
                <PerformanceStack
                  key={p.user_id}
                  name={p.user_name}
                  rate={p.achievement_rate}
                  wonAmount={p.won_amount}
                  targetAmount={p.target_amount}
                  winRate={p.win_rate}
                />
              ))}
              <PerformanceStack
                name="チーム合計"
                rate={teamRate}
                wonAmount={team.won_amount}
                targetAmount={team.target_amount}
                winRate={teamWinRate}
                emphasis
              />
            </div>

            {/* PC。8列の表は今までどおり（`overflow-x-auto` も残す） */}
            <div className="hidden overflow-x-auto sm:block">
              <RowHeader>
                <RowMain>担当者</RowMain>
                <RowSlot w={128} align="right">目標金額</RowSlot>
                <RowSlot w={128} align="right">受注金額</RowSlot>
                <RowSlot w={160}>達成率</RowSlot>
                <RowSlot w={72} align="right">ヨミ数</RowSlot>
                <RowSlot w={72} align="right">受注数</RowSlot>
                <RowSlot w={72} align="right">受注率</RowSlot>
                <RowSlot w={128} align="right">平均単価</RowSlot>
              </RowHeader>
              {performance.map((p) => (
                <Row key={p.user_id} density="table" divider>
                  <RowMain><RowTitle>{p.user_name}</RowTitle></RowMain>
                  <MoneyCell value={p.target_amount} width={128} />
                  <MoneyCell value={p.won_amount} width={128} className="font-bold" />
                  <RowSlot w={160}><AchievementBar rate={p.achievement_rate} /></RowSlot>
                  <RowSlot w={72} align="right"><Num value={p.total_count} /></RowSlot>
                  <RowSlot w={72} align="right"><Num value={p.won_count} /></RowSlot>
                  <RowSlot w={72} align="right"><Num value={p.win_rate} unit="%" /></RowSlot>
                  <MoneyCell value={p.avg_deal_size} width={128} />
                </Row>
              ))}
              <Row density="table" className="border-t-2 border-border font-bold">
                <RowMain><RowTitle>チーム合計</RowTitle></RowMain>
                <MoneyCell value={team.target_amount} width={128} />
                <MoneyCell value={team.won_amount} width={128} />
                <RowSlot w={160}><AchievementBar rate={teamRate} /></RowSlot>
                <RowSlot w={72} align="right"><Num value={team.total_count} /></RowSlot>
                <RowSlot w={72} align="right"><Num value={team.won_count} /></RowSlot>
                <RowSlot w={72} align="right"><Num value={teamWinRate} unit="%" /></RowSlot>
                <RowSlot w={128} />
              </Row>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
