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
 * ── 「教訓・学び」は列ごと削除した（2026-08-27・Phase B）─────────
 *
 * 欄はモックの時点から無く、`projects.lessons_learned` 列も MCP からしか
 * 書けない状態で表示側だけが残っていた（`docs/project-ledger-simplification-plan.md`
 * §5）。営業レビューの「教訓・学び」パネルごと削除し、失注の振り返りは
 * KPT・イベントレポートに一本化した。
 *
 * 失注の理由そのもの（`lost_reason` / `lost_reason_note`）はモックにも
 * あるので残しています。
 *
 * ── 「見送り」もこのダイアログで受ける（docs/core-redesign-plan.md §2-5）──
 *
 * ゴミが溜まる根本は**クローズが重い／失注扱いが心理的に不当**なことなので、
 * 「見送り（案件にならなかった）」を「失注（案件だったが取れなかった）」と
 * 別の入口にしました。`mode="pass"` で開くと、文言が見送りになり、
 * 理由に「見送り（案件化せず）」（migration 238 の lr_08）を先に選んでおきます。
 * DB 上はどちらも `e_lost` ＋理由で、**理由が違うだけ**です（失注分析で
 * ノイズにならないよう理由マスタ側で分けてある）。
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';

export interface LostPayload {
  lost_reason: string;
  lost_reason_note: string;
}

/** 「見送り（案件化せず）」。migration 238 の lr_08 と同じ文字列であること */
const PASS_REASON = '見送り（案件化せず）';

/** mode ごとの文言。**送り先はどちらも `e_lost`**（理由が違うだけ） */
const TEXTS = {
  lost: {
    title: '失注にする',
    sub: 'なぜ決まらなかったかを残してください。営業レビューの失注分析で使います。',
    warn: '失注は理由を残さないと次の案件に活かせません',
    confirm: '失注にする',
  },
  pass: {
    title: '失注にする（案件化せず）',
    sub: '案件にならなかったものを閉じます。理由は「見送り（案件化せず）」で残るので、失注分析のノイズになりません。',
    warn: 'いつでもステージ帯から戻せます',
    confirm: '失注にする',
  },
} as const;

export function LostDialog({
  open, onOpenChange, onConfirm, busy, mode = 'lost',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: LostPayload) => void;
  busy: boolean;
  /** `pass` = 見送り（案件化せず）。文言と理由の初期選択だけが変わる */
  mode?: 'lost' | 'pass';
}) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const texts = TEXTS[mode];

  // 見送りで開いたときは理由を先に選んでおく（1クリックで閉じられるように。変えてもよい）
  useEffect(() => {
    if (open) setReason(mode === 'pass' ? PASS_REASON : '');
  }, [open, mode]);

  // 理由の選択肢は DB のマスタ。画面に並べ直すと、増やしたときに片方だけ古くなる
  const { data } = useQuery({
    queryKey: ['lost-reason-categories'],
    queryFn: async () => (await api.get('/sales-analytics/lost-reason-categories')).data,
    enabled: open,
  });
  const categories: { id: string; name: string }[] = data?.data ?? [];

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) { setReason(''); setNote(''); }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title={texts.title}
      sub={texts.sub}
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>キャンセル</Button>
          <Button
            variant={mode === 'lost' ? 'destructive' : 'default'}
            disabled={!reason || busy}
            onClick={() => onConfirm({ lost_reason: reason, lost_reason_note: note })}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {texts.confirm}
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <p className={`flex items-center gap-1.5 text-sub font-bold ${mode === 'lost' ? 'text-destructive' : 'text-muted-foreground'}`}>
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {texts.warn}
        </p>

        <div>
          <Label>理由 *</Label>
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
      </div>
    </FormDialog>
  );
}
