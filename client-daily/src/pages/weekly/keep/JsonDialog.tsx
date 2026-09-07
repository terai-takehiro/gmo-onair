/**
 * 隔週キープの数字 — 「JSON を見る」
 *
 * パックは Slack の定例投稿・pptx・MCP（`get_keep_report_pack`）が**同じ形**を読む元データ。
 * 画面の数字が資料と食い違ったとき、どちらが違うかをここで突き合わせられるように、
 * 整形したままの全文を出してコピーできるようにしておく。
 */
import { useState } from 'react';
import { Braces, Copy } from 'lucide-react';
import { notifyError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import type { KeepReportPack } from '@gmo-onair/shared/src/keepReport/types';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export function JsonDialog({ pack, packId }: { pack: KeepReportPack; packId: string | null }) {
  const [open, setOpen] = useState(false);
  const text = JSON.stringify(pack, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notifySuccess('JSON をコピーしました');
    } catch {
      notifyError('コピーできませんでした。本文を選んでコピーしてください');
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Braces className="mr-1.5 h-4 w-4" aria-hidden="true" />JSON を見る
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle className="text-h2">定例報告パック（JSON）</DialogTitle>
            <DialogDescription>
              {pack.frozen_at ? `凍結した版（${packId ?? '—'}）` : 'いまの数字'} ・ 会議日 {pack.meeting_date}。
              資料・Slack の投稿・AI につなぐ口は、この JSON をそのまま読みます
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-control border border-border bg-muted p-3 font-mono text-sub-sm text-foreground">
            {text}
          </pre>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={copy}>
              <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />コピー
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>閉じる</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
