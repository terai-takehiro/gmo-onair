/**
 * 見積タブ / タイトル・見積全体の備考カード（`EstimateTab.tsx` から分離・400行の是正）
 *
 * **下書きのときだけ直せる**（サーバーが強制。ここは出し分けだけ）。
 * 明細と同じ画面に置くと保存のタイミングを迷うので、**別に保存できる**（`onBlur`）。
 */
import { useState } from 'react';
import { Input as TextInput } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Estimate } from './EstimateTab';

export function EstimateMetaCard({
  estimate, onSave,
}: { estimate: Estimate; onSave: (patch: Partial<Pick<Estimate, 'title' | 'notes'>>) => void }) {
  const [title, setTitle] = useState(estimate.title ?? '');
  const [notes, setNotes] = useState(estimate.notes ?? '');
  // **サーバーは下書き以外の中身を全部拒否する**（`update` の `CONTENT` 判定）。
  // ここが `sent`/`accepted`/`superseded` だけを見ていると、`rejected`（失注）の見積は
  // 直せるように見えて blur で 400 が返る（Codex の指摘 P2）
  const locked = estimate.status !== 'draft';

  return (
    <div className="rounded-card border border-border bg-card p-4">
      <label className="text-sub mb-1 block text-muted-foreground">タイトル</label>
      <TextInput
        value={title}
        disabled={locked}
        placeholder="お客様に出す見積のタイトル"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => { if (title !== (estimate.title ?? '')) onSave({ title }); }}
      />
      <label className="text-sub mb-1 mt-3 block text-muted-foreground">見積全体の備考</label>
      <Textarea
        value={notes}
        disabled={locked}
        rows={2}
        placeholder="お客様への注記など（行ごとの備考は明細の各行に入れてください）"
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => { if (notes !== (estimate.notes ?? '')) onSave({ notes }); }}
      />
    </div>
  );
}
