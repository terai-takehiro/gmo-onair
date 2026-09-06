/**
 * ⑤ お金のルール（v4 設定・モックの5枚目）
 *
 * ── 「設定した気になるだけ」にしない ────────────────────────
 *
 * 14 項目を並べるだけなら簡単ですが、**それだと何も変わりません**。
 * この画面で決めた値は次の3つに**実際に効きます**:
 *
 *   1. **支払期日** … 締め日＋サイトから逆算して入る（取引先の例外が優先）
 *   2. **消費税の端数** … 見積・請求・取込のすべてが同じ丸め方になる
 *   3. **値引きの上限** … 超えた見積は「承認待ち」になり、**送れない**
 *
 * 効かないものは「これから」と画面に書きます（**請求書の自動下書きは作りません**）。
 *
 * ── 端数を四捨五入から切り捨てに変えた ──────────────────────
 *
 * モックの指定です。**今後つくる書類の税額が最大 1 円下がります**が、
 * すでに出した書類の金額は 1 円も動きません（保存済みの値を読むだけ）。
 * 画面にもそう書いてあります — 経理が気づかないまま数字が変わるのが一番困る。
 */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Calculator, JapaneseYen, Info, Lock, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useAuth } from '@/contexts/platform/AuthContext';
import { localDateStr } from '@/lib/format';
import { DiscountLimits } from './DiscountLimits';
import { StageProbabilities } from './StageProbabilities';
import { MonthlyBudgets } from './MonthlyBudgets';
import { UtilizationRule } from './UtilizationRule';
import {
  DAY_CHOICES, MONTH_CHOICES, ROUNDING_CHOICES, TAX_UNIT_CHOICES, DISPLAY_CHOICES,
  ISSUE_CHOICES, HOLIDAY_SHIFT_CHOICES, LABOR_UNIT_CHOICES, TAX_RATE_CHOICES,
  type Choice, type MoneyResponse, type MoneyRules, type StageProbabilityRow,
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

export default function MoneyRulesPage() {
  const qc = useQueryClient();
  const { currentUser, permissions, hasPermission } = useAuth();
  const [draft, setDraft] = useState<MoneyRules | null>(null);
  // **日付と説明文を一緒に持つ。** 日付だけ下見にして説明文を保存済みの値から
  // 描くと、締め日を変えたのに「末日締め」と出たままになる（実際にそうなっていた）
  const [preview, setPreview] = useState<{ due: string | null; describe: string } | null>(null);

  const q = useQuery<MoneyResponse>({
    queryKey: ['money-rules'],
    queryFn: async () => (await api.get('/money-rules')).data.data,
  });

  // ステージごとの受注確度は別 API（`StageProbabilities.tsx` 冒頭を参照）。
  // 別クエリにしてあるので、こちらが失敗してもお金のルール本体は表示できる
  const stageQ = useQuery<StageProbabilityRow[]>({
    queryKey: ['stage-probabilities'],
    queryFn: async () => (await api.get('/stage-probabilities')).data.data,
  });

  useEffect(() => { if (q.data) setDraft({ ...q.data.rules }); }, [q.data]);

  const canEdit = currentUser?.role === 'system_admin'
    || ['manager', 'owner'].includes(permissions?.budget ?? '');
  /**
   * 隔週キープの目標と数え方は**サーバーの縛りと同じ**にする（押せるのに 403 にしない）:
   * 月次予算・経理の補正値は `sales: editor`（`PUT /keep/monthly-budget/:ym`）、
   * 稼働率の数え方は `sales: manager`（`PUT /keep/utilization-settings`）。
   * お金のルール本体（財務の管理者）とは別の縛りなので、別の変数で持つ
   */
  const canEditKeepBudgets = hasPermission('sales', 'editor');
  const canManageUtilization = hasPermission('sales', 'manager');

  const set = <K extends keyof MoneyRules>(k: K, v: MoneyRules[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const dirty = !!draft && !!q.data && JSON.stringify(draft) !== JSON.stringify(q.data.rules);

  // **期日の計算はサーバーが持つ。** 画面で同じ式を書くと必ず食い違うので、
  // 保存前の値を渡して結果だけ訊く（`server が shared を import しない構成`のため）
  const today = localDateStr(new Date());
  // **3つの値だけを取り出してから effect に渡す。** `draft` ごと依存に入れると
  // 端数や税率を触るたびに訊きに行くことになる（期日には関係ない）
  const closingDay = draft?.closing_day;
  const paymentMonths = draft?.payment_months;
  const paymentDay = draft?.payment_day;
  // **寄せ方も一緒に送る。** 送らないと、いま選んでいる「前の営業日へ」が
  // 下見に反映されず、**見せた日と入る日が食い違う**
  const holidayShift = draft?.payment_holiday_shift;
  useEffect(() => {
    if (closingDay === undefined || paymentMonths === undefined || paymentDay === undefined) return;
    let alive = true;
    api.post('/money-rules/preview', {
      recognition_date: today,
      rule: { closingDay, paymentMonths, paymentDay, payment_holiday_shift: holidayShift },
    }).then((r) => { if (alive) setPreview({ due: r.data.data.due_date, describe: r.data.data.describe }); })
      .catch(() => { if (alive) setPreview(null); });
    return () => { alive = false; };
  }, [closingDay, paymentMonths, paymentDay, holidayShift, today]);

  const save = useMutation({
    mutationFn: async () => (await api.put('/money-rules', draft)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['money-rules'] });
      notifySuccess('お金のルールを保存しました', {
        description: 'これから作る見積・請求から効きます。すでに出した書類の金額は変わりません。',
      });
    },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  if (q.isError) return <ErrorPanel title="お金のルールを読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />;
  if (!draft || !q.data) return <Delayed><SkeletonRows rows={8} /></Delayed>;

  return (
    <div className="flex flex-col gap-3.5 p-3 lg:gap-4 lg:p-6">
      <PageHeader
        title="お金のルール"
        sub="見積・請求の計算のもとになる決めごとです。案件ごとに書き換えず、例外は取引先ごとの設定で持ちます。"
        primaryAction={canEdit ? (
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            保存する
          </Button>
        ) : undefined}
      />

      {!canEdit && (
        <p className="rounded-note text-note flex items-center gap-2 border border-border bg-surface-subtle px-3.5 py-2.5 text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          編集できるのは<strong className="font-bold">財務管理の管理者</strong>だけです。中身は見られます。
        </p>
      )}

      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
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

          <DiscountLimits limits={q.data.limits} canEdit={canEdit} />

          {stageQ.isError ? (
            <p className="rounded-card text-note border border-border bg-card px-4 py-3 text-muted-foreground">
              受注確度を読み込めませんでした。
            </p>
          ) : stageQ.data ? (
            <StageProbabilities rows={stageQ.data} canEdit={canEdit} />
          ) : null}

          {/*
            隔週キープ（業績報告）の材料。**目標はここでしか入れられない**
            （v4 で `/sales/keep-report` を削除したあと入力画面が無くなっていた。
            `docs/design/v4/keep-report.md` §8）。どちらも別のクエリなので、
            お金のルール本体が読めなくても、こちらは出せる
          */}
          <MonthlyBudgets canEdit={canEditKeepBudgets} />
          <UtilizationRule canManage={canManageUtilization} />
        </div>

        <div className="rounded-card w-full shrink-0 overflow-hidden border border-border bg-card lg:w-[240px]">
          <p className="text-cardtitle border-b border-border-faint px-4 py-3">この設定が効く場所</p>

          <div className="border-b border-border-faint px-4 py-3">
            <p className="text-note text-muted-foreground">いま試すと</p>
            <p className="text-sub mt-1">
              {today.replace(/-/g, '/')} に計上した売上の<br />
              支払期日は{' '}
              <strong className="font-bold text-primary">
                {preview?.due ? preview.due.replace(/-/g, '/') : '—'}
              </strong>
            </p>
            <p className="text-note mt-1.5 text-muted-foreground">{preview?.describe ?? q.data.describe.payment}</p>
          </div>

          {[
            { t: '見積の作成', d: '税率・端数・値引き上限がそのまま効きます', on: true },
            { t: '売上の登録', d: '締め日と支払サイトから期日が入ります', on: true },
            { t: '取り込み（精算PDF）', d: '税抜への直しが同じ端数になります', on: true },
            { t: '入金の消し込み', d: '期日から遅れを判定します', on: true },
            { t: '隔週キープの数字', d: '月次予算が着地表・見込表の「目標」になります', on: true },
            { t: '請求書の下書き', d: '自動では作りません（手で出します）', on: false },
          ].map((u) => (
            <div key={u.t} className="flex items-start gap-2 border-b border-border-faint px-4 py-2.5 last:border-b-0">
              <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', u.on ? 'bg-success' : 'bg-border')} />
              <span className="min-w-0 flex-1">
                <span className="text-sub block">{u.t}</span>
                <span className="text-note block text-muted-foreground">{u.d}</span>
              </span>
            </div>
          ))}

          <p className="text-note bg-surface-subtle px-4 py-3 text-muted-foreground">
            ここを直しても、<strong className="font-bold">すでに出した見積・請求の金額はそのまま</strong>です。
            作り直すと新しいルールで計算されます。
          </p>
        </div>
      </div>

      <p className="rounded-note text-note flex items-start gap-2 border border-info-border bg-info-surface px-3.5 py-3 text-secondary-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        <span>
          端数の既定を<strong className="font-bold">四捨五入から切り捨てに変えました</strong>。
          これから作る見積・請求の税額が<strong className="font-bold">最大 1 円下がります</strong>
          （<Money value={1000000} className="inline-flex" /> の 10％ なら変わりません。
          端数が出る金額のときだけ差が出ます）。すでに出した書類は 1 円も動きません。
        </span>
      </p>
    </div>
  );
}
