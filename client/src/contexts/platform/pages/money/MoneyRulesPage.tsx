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
 *
 * ── 会社（計上会社）タブ ─────────────────────────────────────
 *
 * 2026年10月の事業再編（`docs/reorg-2026-10-plan.md` §4.5・§4.6・§6 P2 Round 1）で、
 * 締め日・支払月/日・税率・税丸めなど**お金のルール本体は会社（`entity_code`）ごとの
 * 別設定**になった（`money_rules` は migration 288 で SCS/GSS/GMO の3行に）。
 * タブで選んだ会社の分だけを `GET /money-rules?entity_code=` で取得・
 * `PUT /money-rules` の本文の `entity_code` で保存する。
 *
 * **値引きの上限（`DiscountLimits`）とステージごとの受注確度（`StageProbabilities`）は
 * 会社に依存しない全社共通の設定**（`role_discount_limits`／`project_stage_probabilities`
 * とも `entity_code` 列を持たない。サーバーの `discountLimits()` は entity_code を
 * 見ずに返す）。**この2つはタブと無関係な react-query の鍵**
 * （`['money-rules-limits']`／`['stage-probabilities']`）で持ち、会社タブを
 * 切り替えても再取得・再描画しない——誤って会社ごとに分けると存在しない区分を作ることになる。
 */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, Lock, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useAuth } from '@/contexts/platform/AuthContext';
import { localDateStr } from '@/lib/format';
import { DiscountLimits } from './DiscountLimits';
import { StageProbabilities } from './StageProbabilities';
import { MoneyRulesEntityTabs } from './EntityTabs';
import { RulesBody } from './RulesBody';
import { MonthlyBudgets } from './MonthlyBudgets';
import { UtilizationRule } from './UtilizationRule';
import type { LegalEntity, LegalEntityCode } from '../reorg/types';
import {
  DEFAULT_ENTITY_CODE,
  type MoneyResponse, type MoneyRules, type StageProbabilityRow, type DiscountLimitRow,
} from './rules';

export default function MoneyRulesPage() {
  const qc = useQueryClient();
  const { currentUser, permissions, hasPermission } = useAuth();
  /**
   * 隔週キープの目標と数え方は**サーバーの縛りと同じ**にする（押せるのに 403 にしない）:
   * 月次予算・経理の補正値は `sales: editor`（`PUT /keep/monthly-budget/:ym`）、
   * 稼働率の数え方は `sales: manager`（`PUT /keep/utilization-settings`）。
   * お金のルール本体（財務の管理者）とは別の縛りなので、別の変数で持つ
   */
  const canEditKeepBudgets = hasPermission('sales', 'editor');
  const canManageUtilization = hasPermission('sales', 'manager');
  const [entityCode, setEntityCode] = useState<LegalEntityCode>(DEFAULT_ENTITY_CODE);
  const [draft, setDraft] = useState<MoneyRules | null>(null);
  // **日付と説明文を一緒に持つ。** 日付だけ下見にして説明文を保存済みの値から
  // 描くと、締め日を変えたのに「末日締め」と出たままになる（実際にそうなっていた）
  const [preview, setPreview] = useState<{ due: string | null; describe: string } | null>(null);

  // 会社タブの並び。**`GET /legal-entities` が返した順（`sort_order`）にそのまま従う**
  // （並べ替えない）。`ReorgPage.tsx` と同じ鍵にして、キャッシュを共有する
  const entitiesQ = useQuery<LegalEntity[]>({
    queryKey: ['legal-entities'],
    queryFn: async () => (await api.get('/legal-entities')).data.data,
  });

  // お金のルール本体は会社ごとに別設定。鍵に entityCode を含め、タブを切り替えたら
  // 選んだ会社の分だけ取り直す
  const q = useQuery<MoneyResponse>({
    queryKey: ['money-rules', entityCode],
    queryFn: async () => (await api.get('/money-rules', { params: { entity_code: entityCode } })).data.data,
  });

  // **値引きの上限は会社タブと無関係の鍵。** `/money-rules` のレスポンスに同梱されて
  // 返ってくるが、entity_code に依らない全社共通ポリシーなので、
  // 会社タブを切り替えても再取得しない専用クエリで受け取る（ファイル冒頭の説明）
  const limitsQ = useQuery<DiscountLimitRow[]>({
    queryKey: ['money-rules-limits'],
    queryFn: async () => (await api.get('/money-rules')).data.data.limits,
  });

  // ステージごとの受注確度も別 API・会社に依存しない別クエリ（`StageProbabilities.tsx` 冒頭を参照）。
  // 失敗してもお金のルール本体・値引き上限は表示できる
  const stageQ = useQuery<StageProbabilityRow[]>({
    queryKey: ['stage-probabilities'],
    queryFn: async () => (await api.get('/stage-probabilities')).data.data,
  });

  useEffect(() => { if (q.data) setDraft({ ...q.data.rules }); }, [q.data]);

  const canEdit = currentUser?.role === 'system_admin'
    || ['manager', 'owner'].includes(permissions?.budget ?? '');

  const set = <K extends keyof MoneyRules>(k: K, v: MoneyRules[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const dirty = !!draft && !!q.data && JSON.stringify(draft) !== JSON.stringify(q.data.rules);

  const entityName = (code: LegalEntityCode) => entitiesQ.data?.find((e) => e.code === code)?.shortName ?? code;

  /**
   * タブを切り替える。**保存していない変更は黙って捨てない** — `draft` は
   * `entityCode` を切り替えても即座には空にならず（次の `q.data` が届くまで前の会社の
   * 値を持ったまま）、確認なしに切り替えると編集中の内容が静かに消える。
   */
  const changeEntity = async (code: LegalEntityCode) => {
    if (code === entityCode) return;
    if (dirty) {
      const ok = await confirmAction({
        title: '保存していない変更があります',
        description: `${entityName(entityCode)}のお金のルールへの変更を保存せずに、${entityName(code)}に切り替えます。よろしいですか？`,
        confirmLabel: '切り替える',
        cancelLabel: 'このまま留まる',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setPreview(null); // 前の会社の下見を残さない（新しい会社の分が届くまで「—」に戻す）
    setEntityCode(code);
  };

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
      entity_code: entityCode,
      rule: { closingDay, paymentMonths, paymentDay, payment_holiday_shift: holidayShift },
    }).then((r) => { if (alive) setPreview({ due: r.data.data.due_date, describe: r.data.data.describe }); })
      .catch(() => { if (alive) setPreview(null); });
    return () => { alive = false; };
  }, [closingDay, paymentMonths, paymentDay, holidayShift, today, entityCode]);

  const save = useMutation({
    mutationFn: async () => (await api.put('/money-rules', { ...draft, entity_code: entityCode })).data.data,
    onSuccess: () => {
      // 会社タブごとの鍵をまとめて落とす（`['money-rules', 'SCS']` など全部にマッチする
      // プレフィックス）。**`['money-rules-limits']` は別の鍵なのでここでは触らない**
      qc.invalidateQueries({ queryKey: ['money-rules'] });
      notifySuccess(`${entityName(entityCode)}のお金のルールを保存しました`, {
        description: 'これから作る見積・請求から効きます。すでに出した書類の金額は変わりません。',
      });
    },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  if (entitiesQ.isError) {
    return (
      <ErrorPanel
        title="会社の一覧を読み込めませんでした"
        error={entitiesQ.error}
        onRetry={() => entitiesQ.refetch()}
      />
    );
  }
  if (!entitiesQ.data) return <Delayed><SkeletonRows rows={8} /></Delayed>;

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

      {/* 締め日・支払月/日・税率・税丸めは会社（計上会社）ごとの別設定。
          値引きの上限・受注確度はこのタブの影響を受けない（下の DiscountLimits/StageProbabilities 参照） */}
      <MoneyRulesEntityTabs entities={entitiesQ.data} value={entityCode} onChange={changeEntity} />

      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          {q.isError ? (
            <ErrorPanel title="お金のルールを読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />
          ) : !draft || !q.data ? (
            <Delayed><SkeletonRows rows={6} /></Delayed>
          ) : (
            <RulesBody draft={draft} canEdit={canEdit} set={set} />
          )}

          {/* 値引きの上限は会社では分かれない（全社共通ポリシー）。
              会社タブ（entityCode）とは無関係な limitsQ から描く */}
          {limitsQ.isError ? (
            <p className="rounded-card text-note border border-border bg-card px-4 py-3 text-muted-foreground">
              値引きの上限を読み込めませんでした。
            </p>
          ) : limitsQ.data ? (
            <DiscountLimits limits={limitsQ.data} canEdit={canEdit} />
          ) : (
            <Delayed><SkeletonRows rows={4} /></Delayed>
          )}

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
            `docs/design/v4/keep-report.md` §8）。月次予算は会社タブの会社ぶん
            （`entity_code`・migration 288）を出し、稼働率の数え方は全社共通
          */}
          <MonthlyBudgets entityCode={entityCode} canEdit={canEditKeepBudgets} />
          <UtilizationRule canManage={canManageUtilization} />
        </div>

        {draft && q.data && (
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
              { t: '隔週キープの数字', d: '月次予算が着地表・見込表の「目標」になります', on: true },
              { t: '取り込み（精算PDF）', d: '税抜への直しが同じ端数になります', on: true },
              { t: '入金の消し込み', d: '期日から遅れを判定します', on: true },
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
        )}
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
