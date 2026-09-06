/**
 * 値引きの上限（役割ごと）— お金のルール ⑤ の下半分
 *
 * ── ここだけは「決めていない」を目立たせる ──────────────────
 *
 * 上限を決めていない役割は**無制限に値引けます**。行が無いことを黙って
 * 「上限なし」と描くと、決め忘れに誰も気づけません。**「決めていません」と
 * 書きます**（「上限なし」と決めたのとは別の見た目にする）。
 *
 * ── 承認者を決めていないと詰む ──────────────────────────────
 *
 * 上限を決めて承認者を決めないと、超えた見積が**誰にも承認できず送れません**。
 * その組み合わせだけ警告を出します。
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Percent, AlertTriangle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { DiscountLimitRow } from './rules';

const pct = (v: string | number | null) => (v == null ? null : Math.round(Number(v) * 1000) / 10);

export function DiscountLimits({ limits, canEdit }: { limits: DiscountLimitRow[]; canEdit: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [rate, setRate] = useState('');
  const [amount, setAmount] = useState('');
  const [approver, setApprover] = useState('');

  const save = useMutation({
    mutationFn: async (roleId: string) => api.put(`/money-rules/limits/${roleId}`, {
      // **空欄は null（上限なし）。0 として送らない** — 0 は「1円も値引けない」
      max_rate: rate.trim() === '' ? null : Number(rate) / 100,
      max_amount: amount.trim() === '' ? null : Number(amount),
      approver_role_id: approver || null,
      can_estimate: true,
    }),
    onSuccess: () => {
      // **`['money-rules', entityCode]`（会社タブごとのお金のルール）ではなく
      // `['money-rules-limits']` を落とす。** 値引きの上限は会社に依存しない全社共通
      // ポリシーなので、専用の鍵で持っている（`MoneyRulesPage.tsx` 冒頭のコメント参照）。
      qc.invalidateQueries({ queryKey: ['money-rules-limits'] });
      setEditing(null);
      notifySuccess('値引きの上限を保存しました');
    },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  const open = (l: DiscountLimitRow) => {
    setEditing(l.role_id);
    setRate(l.max_rate == null ? '' : String(pct(l.max_rate)));
    setAmount(l.max_amount == null ? '' : String(Number(l.max_amount)));
    setApprover(l.approver_role_id ?? '');
  };

  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border-faint px-4 py-3">
        <span className="rounded-note inline-flex h-7 w-7 shrink-0 items-center justify-center bg-primary-surface">
          <Percent className="h-4 w-4 text-primary" aria-hidden="true" />
        </span>
        <span className="text-cardtitle shrink-0">値引きの上限</span>
        <span className="text-note min-w-0 flex-1 truncate text-muted-foreground">
          これを超える見積は承認待ちになり、お客様に出せません
        </span>
      </div>

      {/*
        表頭はスマホでは出さない。本文の行は `stackOnMobile` で縦積みになるのに
        表頭だけ横一列のままで、固定列 (96+160+72px) に押されて「役割」が
        幅 0px に潰れていた (verify-ui.mjs の潰れ検知で実測。休日・営業時間の
        休業日の表と同じ直し方)
      */}
      <RowHeader className="hidden sm:flex">
        <RowMain>役割</RowMain>
        <RowSlot w={96} align="right">値引き上限</RowSlot>
        <RowSlot w={160} align="right" hideOnMobile>承認なしで出せる額</RowSlot>
        <RowSlot w={160}>超えたときの承認者</RowSlot>
        {canEdit && <RowSlot w={72} align="right"> </RowSlot>}
      </RowHeader>

      {limits.map((l) => {
        const r = pct(l.max_rate);
        const undecided = l.max_rate == null && l.max_amount == null && l.can_estimate == null;
        const stuck = (l.max_rate != null || l.max_amount != null) && !l.approver_role_id;
        return (
          <div key={l.role_id}>
            <Row density="table" divider stackOnMobile>
              <RowMain>
                <span className="text-list block truncate">{l.role_name}</span>
                {undecided && (
                  <span className="text-note block text-warning">
                    上限を決めていません（この役割の人は無制限に値引けます）
                  </span>
                )}
              </RowMain>
              <RowSlot w={96} align="right">
                <span className={cn('text-sub font-number', r == null && 'text-muted-foreground')}>
                  {r == null ? '上限なし' : `${r} ％`}
                </span>
              </RowSlot>
              <RowSlot w={160} align="right" hideOnMobile>
                {l.max_amount == null
                  ? <span className="text-sub text-muted-foreground">上限なし</span>
                  : <Money value={Number(l.max_amount)} className="text-sub" />}
              </RowSlot>
              <RowSlot w={160}>
                {l.approver_name
                  ? <span className="text-sub truncate">{l.approver_name}</span>
                  : stuck
                    ? (
                      <span className="text-note inline-flex items-center gap-1 font-bold text-destructive">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />決めていません
                      </span>
                    )
                    : <span className="text-sub text-muted-foreground">—</span>}
              </RowSlot>
              {canEdit && (
                <RowSlot w={72} align="right">
                  <Button variant="outline" size="sm" onClick={() => open(l)}>編集</Button>
                </RowSlot>
              )}
            </Row>

            {editing === l.role_id && (
              <div className="flex flex-wrap items-end gap-3 border-b border-border-faint bg-surface-subtle px-4 py-3">
                {/* **注意文は入力欄の前。** 「空欄」と「0」で意味が正反対になる欄で、
                    打ち終わってから読ませても遅い（以前は保存ボタンより後ろの
                    DOM にあり、読み上げでも最後まで来ないと出なかった） */}
                <p className="text-note w-full text-muted-foreground">
                  <strong className="font-bold">空欄は「上限なし」</strong>です。
                  0 と入れると<strong className="font-bold">1 円も値引けなくなります</strong>ので気をつけてください。
                </p>
                <label className="text-note flex flex-col gap-1">
                  値引き率の上限（％）
                  <Input className="w-32" inputMode="decimal" value={rate} placeholder="空欄 = 上限なし"
                    onChange={(e) => setRate(e.target.value)} />
                </label>
                <label className="text-note flex flex-col gap-1">
                  承認なしで出せる額（円）
                  <Input className="w-40" inputMode="numeric" value={amount} placeholder="空欄 = 上限なし"
                    onChange={(e) => setAmount(e.target.value)} />
                </label>
                <label className="text-note flex flex-col gap-1">
                  超えたときの承認者
                  <select
                    className="rounded-control h-10 border border-border bg-card px-2 text-sub"
                    value={approver}
                    onChange={(e) => setApprover(e.target.value)}
                  >
                    <option value="">決めない</option>
                    {limits.filter((x) => x.role_id !== l.role_id).map((x) => (
                      <option key={x.role_id} value={x.role_id}>{x.role_name}</option>
                    ))}
                  </select>
                </label>
                {/* **承認者は上限の下**（上限を決めて初めて効く欄なので上には出せない）。
                    ただし既定が「決めない」なので、そのまま保存すると詰む —
                    何が起きるかをこの位置で言う（上の一覧では起きてから赤くなる） */}
                <p className="text-note w-full text-muted-foreground">
                  上限を入れて承認者を<strong className="font-bold">「決めない」のままにすると</strong>、
                  超えた見積を誰も承認できず<strong className="font-bold">送れなくなります</strong>。
                </p>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" onClick={() => setEditing(null)}>キャンセル</Button>
                  <Button disabled={save.isPending} onClick={() => save.mutate(l.role_id)}>
                    {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                    保存する
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <p className="text-note border-t border-border-faint bg-surface-subtle px-4 py-3 text-muted-foreground">
        上限を超えた見積は<strong className="font-bold">保存はできますが「承認待ち」</strong>になり、
        承認者が承認するまで送付済みにできません。
        <strong className="font-bold">システム管理者は上限に関係なく送れます</strong>（権限の仕組みと揃えています）。
      </p>
    </div>
  );
}
