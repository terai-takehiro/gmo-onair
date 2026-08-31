/**
 * ⑤ 入ってきた情報 — ストックするときに**見直す日**を決める（migration 247）
 *
 * ── なぜ訊くか ──────────────────────────────────────────────
 *
 * それまでの「ストックする」は押した瞬間に行が消えるだけで、
 * **戻ってくる仕掛けが1つもありませんでした**（見直す日も通知も無し）。
 * 実質「見送り」と同じで、行き先が2つあるように見えて違うのは名前だけです。
 *
 * ここで日を1つ決めれば、その日に**未仕分けと同じ扱いで机に戻ります**
 * （見出し・ホームのタイル・左のバッジの3か所とも同じ判定）。
 *
 * ── 既定は1か月後。**訊くのは「日付」1つだけ** ────────────────
 *
 * 押す手を止めないために、開いた時点で1か月後が入っています。
 * よく使う3つ（1か月後 / 3か月後 / 半年後）は押すだけで、
 * それ以外は端末の日付入力に任せます（自作の日付ホイールは作らない）。
 *
 * ⚠️ **「決めない」も選べます。** 決められないときに保存できないと、
 * 「じゃあ見送りで」になって話が消えます。決めなかったものは
 * **翌日から机に出ます**（そう画面にも書いてあります）。
 */
import { useState } from 'react';
import { Loader2, Archive } from 'lucide-react';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { addMonthsIso, defaultStockReviewOn, stockReviewNote } from '@gmo-onair/shared/src/utils/inboxDesk';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { MiscInquiry } from '@/lib/types';

/** よく使う3つ。**月で数える**（「そのうち」と書かない・docs/wording.md ④） */
const PRESETS = [1, 3, 6] as const;

export function StockDialog({
  inquiry, today, saving, onClose, onSubmit,
}: {
  inquiry: MiscInquiry;
  /** `YYYY-MM-DD`。**呼ぶ側から渡す** — 部品の中で時計を読むと試験で固定できない */
  today: string;
  saving: boolean;
  onClose: () => void;
  /** `null` は「見直す日を決めない」 */
  onSubmit: (reviewOn: string | null) => void;
}) {
  const already = inquiry.state === 'stock';
  const [reviewOn, setReviewOn] = useState<string>(
    // 決め直すときは今入っている日を初期値にする（押し間違いで日が飛ばない）
    (already && inquiry.stock_review_on) || defaultStockReviewOn(today),
  );
  const note = stockReviewNote(reviewOn || null, today);

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={already ? '見直す日を決め直す' : 'ストックする'}
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>やめる</Button>
          <Button onClick={() => onSubmit(reviewOn || null)} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            <Archive className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {already ? '決め直す' : 'ストックする'}
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sub text-secondary-foreground">
          「{inquiry.summary}」を<strong className="font-bold">ストックします</strong>。
          決めた日が来ると、未仕分けと同じように「今日さばくもの」に出てきます。
        </p>

        <div>
          <Label>見直す日</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {PRESETS.map((m) => {
              const d = addMonthsIso(today, m);
              return (
                <Button
                  key={m}
                  variant={reviewOn === d ? 'default' : 'outline'}
                  onClick={() => setReviewOn(d)}
                >
                  {m}か月後
                </Button>
              );
            })}
            <Button
              variant={reviewOn === '' ? 'default' : 'outline'}
              onClick={() => setReviewOn('')}
            >
              決めない
            </Button>
          </div>
          <Input
            type="date"
            className="mt-2"
            value={reviewOn}
            min={today}
            onChange={(e) => setReviewOn(e.target.value)}
            aria-label="見直す日"
          />
          <p className="text-note mt-1 text-muted-foreground">
            {reviewOn
              ? note.text
              : '見直す日を決めないと、明日から「今日さばくもの」に出ます（ストックしたことにはなりますが、隠れはしません）。'}
          </p>
        </div>

        <p className="text-note text-muted-foreground">
          あとから引けるように<strong className="font-bold">タグ</strong>を付けておくと役に立ちます
          （「直す」から付けられます）。
        </p>
      </div>
    </FormDialog>
  );
}
