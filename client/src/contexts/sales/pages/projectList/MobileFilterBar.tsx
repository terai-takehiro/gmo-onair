/**
 * 案件一覧の絞り込み — **スマホ版**（指示書 4-6）
 *
 * ── 横スクロールのチップをやめた ────────────────────────────
 *
 * 旧実装は絞り込みを1行に畳んだうえで、ステージだけ**横スクロールのチップ列**で
 * 出していました。390px では 6 個のうち 3 個しか見えず、
 *
 *  ・**残りがあることに気づけない**（端が切れているだけに見える）
 *  ・**押したいものが画面外**なので、まず横に払ってから押すことになる
 *  ・払うつもりが押してしまい、絞り込みが変わる
 *
 * → **1行のボタン**（「ステージ｜すべて 6 ▾」）にして、押すと
 *   **下から出るシート**で選ばせます。シートなら6つとも同時に見えて、
 *   1タップで決まります。
 *
 * ── 3本の行 ─────────────────────────────────────────────────
 *
 *   ステージ ｜ すべて 6      ▾
 *   期間     ｜ 半年 ・ 2026年 下期 ▾     ← 単位 → 対象 の2段シート
 *   検索欄                    ｜ 並び順 ▾
 *
 * 検索欄の右は「絞り込み」ではなく **並び順**です。絞り込みは上の2行が
 * 持っているので、そこに畳むものがもうありません。
 */
import { useState } from 'react';
import { Search, ChevronDown, Check, Sparkles, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { STAGE_CHIPS } from './stages';
import { SORT_OPTIONS, type FilterBarProps } from './FilterBar';
import {
  PERIOD_MODES, options, toValue, fromValue, label, switchMode, defaultPeriod,
} from './period';

export interface MobileFilterBarProps extends FilterBarProps {
  stageKey: string;
  onStageKey: (v: string) => void;
  /** チップに出す件数（PC と同じ数え方）。まだ読み込んでいなければ null */
  stageCounts: Record<string, number | null>;
  /** 並びが変わる直前に呼ぶ（行を滑らせる）。シートは次のコマで閉じる */
  beforeChange?: (apply: () => void) => void;
}

/** 既定から動いている絞り込みの数。**既定と同じものは数えない** */
export function activeFilterCount(p: MobileFilterBarProps, now: Date): number {
  const d = defaultPeriod(now);
  let n = 0;
  if (p.stageKey !== 'all') n += 1;
  if (p.period.mode !== d.mode || p.period.year !== d.year || p.period.index !== d.index) n += 1;
  if (p.aiOnly) n += 1;
  return n;
}

/** 並び順の札の上限。これより広げると 390px で検索欄が2文字ぶんしか残らない */
const SORT_LABEL_W = 'max-w-[110px]';  // ui-tokens-ok: 検索欄を潰さないための上限

/** 52px の行。**シートの中も外も同じ高さ**にする（指の当たり所を変えない） */
function Row({
  label: text, value, onClick,
}: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[52px] w-full items-center gap-2 rounded-control border border-border bg-card px-3.5 text-left"
    >
      <span className="text-sub shrink-0 font-bold text-muted-foreground">{text}</span>
      <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
      <span className="text-list min-w-0 flex-1 truncate">{value}</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/** シートの中の1行。**チェックは右**（左に置くと文字の頭が揃わない） */
function Choice({
  label: text, sub, on, onClick,
}: { label: string; sub?: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'flex h-[52px] w-full items-center gap-2 border-b border-border-faint px-1 text-left last:border-b-0',
        on && 'font-bold text-primary',
      )}
    >
      <span className="text-list min-w-0 flex-1 truncate">{text}</span>
      {sub && <span className="text-sub font-number shrink-0 text-muted-foreground">{sub}</span>}
      {on
        ? <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        : <span className="h-5 w-5 shrink-0" aria-hidden="true" />}
    </button>
  );
}

export function MobileFilterBar(p: MobileFilterBarProps) {
  const [open, setOpen] = useState<null | 'stage' | 'period' | 'sort'>(null);
  /** 期間のシートは2段。単位を選んだら対象へ進む */
  const [periodStep, setPeriodStep] = useState<'mode' | 'target'>('mode');

  const close = () => setOpen(null);
  /**
   * **シートを閉じるのと同じコマで並びを測らない**（`beforeChange`）。
   * 閉じかけの高さが混ざって行が飛びます。閉じるのは次のコマに回します。
   */
  const apply = (fn: () => void) => {
    if (p.beforeChange) p.beforeChange(fn); else fn();
    close();
  };

  const stage = STAGE_CHIPS.find((c) => c.key === p.stageKey) ?? STAGE_CHIPS[0];
  const stageCount = p.stageCounts[p.stageKey];
  const periodLabel = p.period.mode === 'all'
    ? '全件'
    : `${PERIOD_MODES.find((m) => m.mode === p.period.mode)?.label} ・ ${label(p.period)}`;

  return (
    <div className="flex flex-col gap-2">
      <Row
        label="ステージ"
        value={stageCount != null ? `${stage.label} ${stageCount}` : stage.label}
        onClick={() => setOpen('stage')}
      />
      <Row
        label="期間"
        value={periodLabel}
        onClick={() => { setPeriodStep('mode'); setOpen('period'); }}
      />

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="案件名・お客様名で探す"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            className="pl-9"
            aria-label="案件を探す"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen('sort')}
          className="min-h-tap flex shrink-0 items-center gap-1.5 rounded-control border border-border bg-card px-3 text-sub"
        >
          {/* **選んでいる並び順を出す。** 「並び順」とだけ書くと、
              何順で並んでいるのかを知るのに毎回シートを開くことになる */}
          <span className={`${SORT_LABEL_W} truncate`}>
            {SORT_OPTIONS.find((s) => s.value === p.sort)?.label ?? SORT_OPTIONS[0].label}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>

      {/* **検索中は期間が効かないことを、その場に書く**（探したのに出ない、を防ぐ） */}
      {p.search && (
        <p className="text-note text-muted-foreground">
          探しているあいだは実施日の絞り込みを外して、全期間から当てます
        </p>
      )}

      {/* ── ステージ ─────────────────────────────────────── */}
      <Sheet open={open === 'stage'} onOpenChange={(v) => !v && close()} title="ステージ" rise>
        {STAGE_CHIPS.map((c) => (
          <Choice
            key={c.key}
            label={c.label}
            sub={p.stageCounts[c.key] != null ? String(p.stageCounts[c.key]) : undefined}
            on={c.key === p.stageKey}
            onClick={() => apply(() => p.onStageKey(c.key))}
          />
        ))}
        <p className="text-note pt-2 text-muted-foreground">
          ネタは「ネタ」の見え方で見ます。終了（完了・失注）は「終了」を選んだときだけ出ます。
        </p>
      </Sheet>

      {/* ── 期間（単位 → 対象 の2段）────────────────────── */}
      <Sheet
        open={open === 'period'}
        onOpenChange={(v) => !v && close()}
        title={periodStep === 'mode' ? '期間の単位' : '期間の対象'}
        sub={periodStep === 'target' ? PERIOD_MODES.find((m) => m.mode === p.period.mode)?.label : undefined}
        rise
      >
        {periodStep === 'mode'
          ? PERIOD_MODES.map(({ mode, label: text }) => (
            <Choice
              key={mode}
              label={text}
              on={mode === p.period.mode}
              onClick={() => {
                const next = switchMode(p.period, mode);
                // **全件は対象を選ばせない**（選ぶものが無い）。そのまま閉じる
                if (mode === 'all') { apply(() => p.onPeriod(next)); return; }
                p.onPeriod(next);
                setPeriodStep('target');
              }}
            />
          ))
          : options(p.period, p.now).map((o) => (
            <Choice
              key={o.value}
              label={o.label}
              on={o.value === toValue(p.period)}
              onClick={() => apply(() => p.onPeriod(fromValue(p.period, o.value)))}
            />
          ))}
        {periodStep === 'target' && (
          <button
            type="button"
            onClick={() => setPeriodStep('mode')}
            className="min-h-tap text-sub w-full pt-2 text-left text-primary"
          >
            単位を選び直す
          </button>
        )}
      </Sheet>

      {/* ── 並び順（AI と用語もここ）──────────────────── */}
      <Sheet open={open === 'sort'} onOpenChange={(v) => !v && close()} title="並び順" rise>
        {SORT_OPTIONS.map((s) => (
          <Choice
            key={s.value}
            label={s.label}
            on={s.value === p.sort}
            onClick={() => apply(() => p.onSort(s.value))}
          />
        ))}

        <div className="mt-3 border-t border-border pt-3">
          <label className="flex min-h-tap items-center gap-2.5">
            <input
              type="checkbox"
              checked={p.aiOnly}
              onChange={(e) => p.onAiOnly(e.target.checked)}
              className="v4-tap h-5 w-5 shrink-0 accent-primary"
            />
            <Sparkles className="h-4 w-4 shrink-0 text-ai" aria-hidden="true" />
            <span className="text-list">AI が起票した案件だけ出す</span>
          </label>
          {p.aiOnly && (
            <label className="flex min-h-tap items-center gap-2.5 pl-7">
              <input
                type="checkbox"
                checked={p.aiUnreviewedOnly}
                onChange={(e) => p.onAiUnreviewedOnly(e.target.checked)}
                className="v4-tap h-5 w-5 shrink-0 accent-primary"
              />
              <span className="text-list">まだ人が確認していないものだけ</span>
            </label>
          )}
          <button
            type="button"
            onClick={() => { close(); p.onTermOpen(!p.termOpen); }}
            className="min-h-tap flex w-full items-center gap-1.5 text-sub text-primary"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            ネタ・ヨミ・GLS などの言葉の意味
          </button>
        </div>
      </Sheet>
    </div>
  );
}

/** 並びが変わったときの「全部やめる」。**既定に戻す** */
export function clearFilters(p: MobileFilterBarProps, now: Date): void {
  p.onStageKey('all');
  p.onPeriod(defaultPeriod(now));
  p.onAiOnly(false);
}
