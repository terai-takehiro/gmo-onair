/**
 * お金のルール本体（締めと支払・消費税・通貨と単位）— `MoneyRulesPage.tsx` から分離。
 *
 * **会社（計上会社）タブで選んだ会社の分だけを描く。** 値引きの上限・受注確度は
 * ここには含まない（会社に依存しない別セクション。`MoneyRulesPage.tsx` が
 * `DiscountLimits`/`StageProbabilities` を直接置く）。
 *
 * 1ファイル400行の上限（`client/CLAUDE.md`）に触れたための分割
 * （`node scripts/check-file-size.mjs` の指示どおり「表の列定義とフォーム」相当）。
 * JSX・ロジックは移しただけで変えていない。
 */
import { CalendarCheck, Calculator, JapaneseYen } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  DAY_CHOICES, MONTH_CHOICES, ROUNDING_CHOICES, TAX_UNIT_CHOICES, DISPLAY_CHOICES,
  ISSUE_CHOICES, HOLIDAY_SHIFT_CHOICES, LABOR_UNIT_CHOICES, TAX_RATE_CHOICES,
  type Choice, type MoneyRules,
} from './rules';

/** 選択肢を横に並べる。**選べる値がその場で全部見える**ので、開いて探さずに済む */
function Pick({ value, choices, onChange, disabled }: {
  value: string | number; choices: Choice[]; onChange: (v: string | number) => void; disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {choices.map((c) => (
        <button
          key={String(c.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(c.value)}
          className={cn(
            'text-note min-h-tap rounded-note border px-2.5 font-bold lg:min-h-[32px]',
            String(value) === String(c.value)
              ? 'border-transparent bg-primary-surface text-primary'
              : 'border-border bg-card text-muted-foreground',
            disabled && 'opacity-60',
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

function Line({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border-faint px-4 py-2.5 last:border-b-0">
      <span className="text-sub w-full shrink-0 sm:w-[160px]">{label}</span>
      <span className="shrink-0">{children}</span>
      {/*
        **375pxで実測して見つけた崩れ（このタスクで修正）**: 選択肢が3つ以上ある行
        （例:「支払日が休業日のとき」）では `children`（選べる値のボタン群）だけで
        1行の大半を使い切り、`hint` に残る幅が数px しかなくなる。`min-w-0 flex-1`
        のままだと、そのわずかな幅に和文を1文字ずつ縦に折り返して描いてしまい
        （「見出し」と同じ現象）、説明文が読めない縦長の帯になっていた。
        `label` と同じく**スマホでは常に単独の行**にして、この崩れ方を避ける
      */}
      <span className="text-note w-full text-muted-foreground sm:min-w-0 sm:w-auto sm:flex-1">{hint}</span>
    </div>
  );
}

function Group({ icon, tone, title, desc, children }: {
  icon: React.ReactNode; tone: string; title: string; desc: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border-faint px-4 py-3">
        <span className={cn('rounded-note inline-flex h-7 w-7 shrink-0 items-center justify-center', tone)}>{icon}</span>
        <span className="text-cardtitle shrink-0">{title}</span>
        <span className="text-note min-w-0 flex-1 truncate text-muted-foreground">{desc}</span>
      </div>
      {children}
    </div>
  );
}

export function RulesBody({ draft, canEdit, set }: {
  draft: MoneyRules;
  canEdit: boolean;
  set<K extends keyof MoneyRules>(k: K, v: MoneyRules[K]): void;
}) {
  return (
    <>
      <Group
        icon={<CalendarCheck className="h-4 w-4 text-success" aria-hidden="true" />}
        tone="bg-success-surface" title="締めと支払" desc="請求書を出す日と、入金を待つ期間"
      >
        {/*
          並びは **もらう（売上）→ はらう（仕入）→ 両方に効くもの** の3かたまり。
          以前は 締め日 → 入金2つ → 仕入2つ → 休業日 → 請求書の発行日 の順で、
          **もらう話とはらう話が行き来し**、もらう側の「請求書の発行日」だけが
          仕入の後ろに取り残されていた。もらう側は
          締める → 出す → もらう の時間順に並べてある。
        */}
        <Line label="売上の締め日" hint="月内に納品した分をまとめて請求します">
          <Pick value={draft.closing_day} choices={DAY_CHOICES} disabled={!canEdit}
            onChange={(v) => set('closing_day', Number(v))} />
        </Line>
        <Line label="請求書の発行日" hint="いつ出すかの目安です。自動で下書きは作りません">
          <Pick value={draft.invoice_issue_rule} choices={ISSUE_CHOICES} disabled={!canEdit}
            onChange={(v) => set('invoice_issue_rule', v as MoneyRules['invoice_issue_rule'])} />
        </Line>
        {/* 「入金の期限」ではなく**支払サイト**（締めから何か月後か）。
            日付の期限だと読まれて、月末を入れられていた */}
        <Line label="入金は締めの何か月後か" hint="取引先ごとに例外があればそちらが優先します">
          <Pick value={draft.payment_months} choices={MONTH_CHOICES} disabled={!canEdit}
            onChange={(v) => set('payment_months', Number(v))} />
        </Line>
        <Line label="その月の何日か" hint="上で決めた月の、この日までに入金してもらいます">
          <Pick value={draft.payment_day} choices={DAY_CHOICES} disabled={!canEdit}
            onChange={(v) => set('payment_day', Number(v))} />
        </Line>

        {/* ここから「はらう」側 */}
        <Line label="仕入の支払日（月）" hint="こちらが払う側">
          <Pick value={draft.purchase_payment_months} choices={MONTH_CHOICES} disabled={!canEdit}
            onChange={(v) => set('purchase_payment_months', Number(v))} />
        </Line>
        <Line label="仕入の支払日（日）" hint="休業日のときの寄せ方は下で決めます">
          <Pick value={draft.purchase_payment_day} choices={DAY_CHOICES} disabled={!canEdit}
            onChange={(v) => set('purchase_payment_day', Number(v))} />
        </Line>

        {/* **もらう・はらうの両方に効く**ので最後に置く（どちらか一方の
            かたまりの中に入れると、他方には効かないように読める） */}
        <Line
          label="支払日が休業日のとき"
          hint="土日・祝日と、全社の休業日（「休日・営業時間」の表）に当たったとき。入金・支払の両方に効きます"
        >
          <Pick value={draft.payment_holiday_shift} choices={HOLIDAY_SHIFT_CHOICES} disabled={!canEdit}
            onChange={(v) => set('payment_holiday_shift', v as MoneyRules['payment_holiday_shift'])} />
        </Line>
      </Group>

      <Group
        icon={<Calculator className="h-4 w-4 text-primary" aria-hidden="true" />}
        tone="bg-primary-surface" title="消費税" desc="端数と税の載せ方"
      >
        <Line label="標準の税率" hint="軽減税率の品目は料金表側で指定します">
          <Pick value={draft.standard_tax_rate} choices={TAX_RATE_CHOICES} disabled={!canEdit}
            onChange={(v) => set('standard_tax_rate', Number(v))} />
        </Line>
        <Line label="税の計算単位" hint="明細ごとではなく合計に対して計算します">
          <Pick value={draft.tax_unit} choices={TAX_UNIT_CHOICES} disabled={!canEdit}
            onChange={(v) => set('tax_unit', v as MoneyRules['tax_unit'])} />
        </Line>
        <Line label="端数の扱い" hint="1 円未満をどうするか。見積・請求・取込のすべてに効きます">
          <Pick value={draft.tax_rounding} choices={ROUNDING_CHOICES} disabled={!canEdit}
            onChange={(v) => set('tax_rounding', v as MoneyRules['tax_rounding'])} />
        </Line>
        <Line label="見積の表示" hint="合計欄にのみ税込を併記します">
          <Pick value={draft.estimate_display} choices={DISPLAY_CHOICES} disabled={!canEdit}
            onChange={(v) => set('estimate_display', v as MoneyRules['estimate_display'])} />
        </Line>
      </Group>

      <Group
        icon={<JapaneseYen className="h-4 w-4 text-warning" aria-hidden="true" />}
        tone="bg-warning-surface" title="通貨と単位" desc="見積・請求に出る書き方"
      >
        <Line label="通貨" hint="外貨の見積は当面作成しません">
          <span className="text-sub font-bold">日本円（￥）</span>
        </Line>
        <Line label="金額の丸め" hint="小計・合計とも同じ単位">
          <span className="text-sub font-bold">1 円単位</span>
        </Line>
        <Line label="人件費の単位" hint="見積の明細で使います">
          <Pick value={draft.labor_unit} choices={LABOR_UNIT_CHOICES} disabled={!canEdit}
            onChange={(v) => set('labor_unit', v as MoneyRules['labor_unit'])} />
        </Line>
      </Group>
    </>
  );
}
