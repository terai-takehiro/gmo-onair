/**
 * 営業目標の設定ダイアログ (v4)
 *
 * ⚠️ **旧実装は保存できていなかった**（実装コードで確認・修正）。
 * サーバー（`sales-analytics.routes.ts` の `POST /targets`）は本文から
 * `target_year` / `target_month` を読むが、旧画面は `fiscal_year` / `fiscal_month`
 * を送っていた。`sales_targets.target_year` / `target_month` は `NOT NULL`
 * （デフォルト無し）なので、**保存を押すたびに毎回 500 で落ちていた**
 * （画面には失敗の理由が出ないので、押した人には「反映されない」としか見えない）。
 *
 * 「目標件数」欄も削除した。`sales_targets` に列が無く、サーバーも受け取らないため
 * 旧画面の入力はどこにも保存されていなかった（黙って捨てられる欄を残さない）。
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { StaffUser } from './types';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function TargetDialog({
  year, staffUsers, onClose,
}: { year: number; staffUsers: StaffUser[]; onClose: () => void }) {
  const qc = useQueryClient();
  const now = new Date();
  const [userId, setUserId] = useState('');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [amount, setAmount] = useState(0);

  const mutation = useMutation({
    mutationFn: async () => (await api.post('/sales-analytics/targets', {
      user_id: userId,
      target_year: year,
      target_month: month,
      target_amount: amount,
    })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-performance'] });
      notifySuccess('営業目標を保存しました');
      onClose();
    },
    onError: (err) => notifyApiError('営業目標の保存に失敗しました', err),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>営業目標の設定</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>担当者</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="選択…" /></SelectTrigger>
              <SelectContent>
                {staffUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>年度</Label>
              <p className="font-number flex h-10 items-center rounded-control border border-border bg-muted px-3">{year}年</p>
            </div>
            <div>
              <Label>月</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => <SelectItem key={m} value={String(m)}>{m}月</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>目標金額</Label>
            <CurrencyInput value={amount} onChange={setAmount} placeholder="10000000" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={() => mutation.mutate()} disabled={!userId || !amount || mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
