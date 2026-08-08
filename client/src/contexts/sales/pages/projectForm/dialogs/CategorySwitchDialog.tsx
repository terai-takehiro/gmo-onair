/**
 * 案件分類 A↔B の切替（発番済みの採り直し）(v4)
 *
 * GLS 番号は分類ごとに別の連番なので、分類を変えると**番号を採り直します**。
 * 回のコードと BOX フォルダ名も追いかけて変わります。
 * **すでに出した見積書・請求書の PDF は変わりません** — 手元のファイルは
 * 古い番号のままなので、そのことも書いてあります。
 */
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

// **呼び名は「案件」と「プロジェクト」** (migration 179・決め⑪)。
// 「ビジネス案件」はもう使わない — プロジェクト管理へ移ったものを指す言葉が2つあると迷う
const LABEL = { A: '案件（GLS-A）', B: 'プロジェクト（GLS-B）' } as const;

export function CategorySwitchDialog({
  state, setState, currentCategory, currentGls, busy, onConfirm,
}: {
  state: { open: boolean; target: 'A' | 'B' };
  setState: React.Dispatch<React.SetStateAction<{ open: boolean; target: 'A' | 'B' }>>;
  currentCategory: '' | 'A' | 'B';
  currentGls: string | null | undefined;
  busy: boolean;
  onConfirm: (target: 'A' | 'B') => void;
}) {
  return (
    <Dialog open={state.open} onOpenChange={(open) => setState((s) => ({ ...s, open }))}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>案件分類を変えますか？</DialogTitle>
          <DialogDescription>
            {currentCategory === 'A' ? LABEL.A : LABEL.B} → {LABEL[state.target]} に切り替えます。
          </DialogDescription>
        </DialogHeader>

        <div className="py-3">
          <div className="rounded-note border border-warning-border bg-warning-surface p-3 text-warning-foreground">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="space-y-1.5">
                <p className="text-list">この案件は GLS 発番済みです（{currentGls}）</p>
                <p className="text-sub">切り替えると、次のものが自動で変わります:</p>
                <ul className="text-note list-inside list-disc space-y-0.5">
                  <li>GLS 番号を新しい分類で<strong>採り直します</strong></li>
                  <li>回のコード（例: <code>{currentGls}-001</code>）も新しい番号に書き換わります</li>
                  <li>BOX フォルダ名（社内限り / 社外共有可）も新しい番号になります</li>
                  <li>すでに出した見積書・請求書の PDF は<strong>変わりません</strong></li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setState({ open: false, target: 'A' })} disabled={busy}>
            やめる
          </Button>
          <Button onClick={() => onConfirm(state.target)} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            採り直して変える
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
