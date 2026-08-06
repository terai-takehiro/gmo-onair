/**
 * 失注にするときに理由を訊くダイアログ (v4 ⑥)
 *
 * ── なぜ確認ダイアログではなく専用の画面なのか ──────────────────
 *
 * 失注は**理由を残さないと意味が無い**終わり方です。理由が空のまま閉じられると
 * 営業レビューの失注分析が「不明」だらけになり、次の案件に活かせません。
 * だから `confirmAction`（はい / いいえ）ではなく、理由を選ばないと押せない
 * ボタンを持つダイアログにしてあります。
 *
 * ── どこから来たか ──────────────────────────────────────────
 *
 * 元は案件フォーム（`/sales/projects/:id/edit`）の中にありました。
 * v4 で「読む画面」と「直す画面」を分けたので、**ステージを変える操作は
 * 読む画面の見出し**（`DetailHeader`）に集約し、この理由入力も一緒に移しました。
 * フォーム側に残すと、ステージを変えるために編集画面を開くことになります。
 *
 * ── 「教訓・学び」を消していない ────────────────────────────
 *
 * v4 のモックはこの欄を落としていますが、**営業レビューの失注分析が読んでいる**
 * ため残しました（`projects.lessons_learned`）。消すかどうかは業務の決めごとなので、
 * 画面の作り直しと同じ回では決めません。
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

export interface LostPayload {
  lost_reason: string;
  lost_reason_note: string;
  lessons_learned: string;
}

export function LostDialog({
  open, onOpenChange, onConfirm, busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: LostPayload) => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [lessons, setLessons] = useState('');

  // 理由の選択肢は DB のマスタ。画面に並べ直すと、増やしたときに片方だけ古くなる
  const { data } = useQuery({
    queryKey: ['lost-reason-categories'],
    queryFn: async () => (await api.get('/sales-analytics/lost-reason-categories')).data,
    enabled: open,
  });
  const categories: { id: string; name: string }[] = data?.data ?? [];

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) { setReason(''); setNote(''); setLessons(''); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            失注にする
          </DialogTitle>
          <DialogDescription>
            なぜ決まらなかったかを残してください。営業レビューの失注分析で使います。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label>失注理由 *</Label>
            <div className="mt-2 space-y-2">
              {categories.length === 0 ? (
                <p className="text-sub text-muted-foreground">
                  理由の一覧を読み込んでいます。出てこないときは設定で失注理由を登録してください。
                </p>
              ) : categories.map((cat) => (
                <label key={cat.id} className="flex min-h-tap cursor-pointer items-center gap-2 lg:min-h-[36px]">
                  <input
                    type="radio"
                    name="lost_reason"
                    value={cat.name}
                    checked={reason === cat.name}
                    onChange={(e) => setReason(e.target.value)}
                    className="accent-destructive"
                  />
                  <span className="text-sub">{cat.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>補足メモ</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="失注に至った経緯など"
              rows={2}
            />
          </div>

          <div>
            <Label>教訓・学び</Label>
            <Textarea
              value={lessons}
              onChange={(e) => setLessons(e.target.value)}
              placeholder="次回に活かすべきポイント、改善すべき点など"
              rows={3}
            />
            <p className="text-note mt-1 text-muted-foreground">
              ここに書いた内容は営業レビューの失注分析で共有されます。
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>やめる</Button>
          <Button
            variant="destructive"
            disabled={!reason || busy}
            onClick={() => onConfirm({ lost_reason: reason, lost_reason_note: note, lessons_learned: lessons })}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            失注にする
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
