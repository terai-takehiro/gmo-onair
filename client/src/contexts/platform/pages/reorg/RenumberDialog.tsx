/**
 * 改番の確認ダイアログ（会社と切替 ⑧・移行センター・`docs/reorg-2026-10-plan.md` §4.8点4
 * 「改番（1件ずつ・確認2段階）」）
 *
 * ── 新番号のプレビュー → 理由 → 確定、の順 ─────────────────────
 *
 * 開いた瞬間に `GET /projects/:id/renumber-preview` で新番号だけを取る
 * （**採らない** — `entity-resolution.service.ts` の `previewRenumber` と同じ注意点。
 * ここで番号を消費すると、開いて閉じただけで番号が1つ飛ぶ）。理由は必須
 * （`renumberProject` が空文字を 400 で弾くのと同じ検査を、送信前に先回りして効かせる —
 * 400 を待たせない）。
 *
 * ── 改番されると一覧から自然に消える ───────────────────────────
 *
 * 成功したら `['renumber-candidates']` を invalidate するだけでよい。
 * `listRenumberCandidates()` は `project_numbers.scheme='gls'`（未改番）だけを
 * 対象にするので、改番済みの行は再取得のたびに自然に外れる
 * （別に「消す」処理を書かない）。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { ENTITY_BADGE_LABEL } from '@/contexts/sales/pages/projectList/stages';
import type { RenumberCandidate, RenumberPreview, RenumberResult } from './types';

export function RenumberDialog({
  candidate, open, onOpenChange,
}: {
  candidate: RenumberCandidate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');

  const previewQ = useQuery<RenumberPreview>({
    queryKey: ['renumber-preview', candidate.project_id, candidate.target_entity_code],
    queryFn: async () => (await api.get(`/projects/${candidate.project_id}/renumber-preview`, {
      params: { target_entity_code: candidate.target_entity_code },
    })).data.data,
    enabled: open,
  });

  const renumber = useMutation({
    mutationFn: async () => (await api.post(`/projects/${candidate.project_id}/renumber`, {
      target_entity_code: candidate.target_entity_code,
      reason: reason.trim(),
    })).data.data as RenumberResult,
    onSuccess: (result) => {
      // **`renumber-candidates` の invalidate だけで一覧からこの行が消える**
      // （上のコメント参照。専用の削除処理は書かない）
      qc.invalidateQueries({ queryKey: ['renumber-candidates'] });
      onOpenChange(false);
      setReason('');
      notifySuccess(`${result.old_number} を ${result.new_number} に改番しました`, {
        description: result.box_renamed
          ? 'BOX フォルダ名も付け替えました。'
          : result.box_reason
            ? `BOX フォルダの付け替えはできませんでした（${result.box_reason}）。改番自体は成立しています。`
            : undefined,
      });
    },
    onError: (e) => notifyApiError('改番できませんでした', e),
  });

  const closeAndReset = (v: boolean) => {
    onOpenChange(v);
    if (!v) setReason('');
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={closeAndReset}
      title="この案件を改番しますか"
      sub={`${candidate.name}（${candidate.current_number}）を${ENTITY_BADGE_LABEL[candidate.target_entity_code]}（${candidate.target_entity_code}）の番号へ改番します。旧番号は履歴に残り、引き続き検索できます。`}
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => closeAndReset(false)}>キャンセル</Button>
          <Button
            disabled={!reason.trim() || !previewQ.data || renumber.isPending}
            onClick={() => renumber.mutate()}
          >
            {renumber.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            改番する
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-note flex min-h-[52px] items-center justify-center gap-2.5 border border-border bg-surface-subtle px-3 py-3">
          {previewQ.isLoading ? (
            <span className="text-sub text-muted-foreground">新しい番号を確かめています…</span>
          ) : previewQ.isError ? (
            <span className="text-sub text-destructive">新しい番号を確かめられませんでした。</span>
          ) : previewQ.data ? (
            <>
              <span className="font-number text-sub text-muted-foreground line-through">{previewQ.data.old_number}</span>
              <span className="text-muted-foreground" aria-hidden="true">→</span>
              <span className="font-number text-cardtitle font-bold text-primary">{previewQ.data.new_number}</span>
            </>
          ) : null}
        </div>

        {candidate.has_invoiced_revenue && (
          <p className="text-note text-muted-foreground">
            発行済み・入金済みの売上があります。請求キーはこの改番では変わりません。
          </p>
        )}

        <label className="text-note flex flex-col gap-1">
          改番の理由 *
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例: 10月以降実施のため、コンテンツスタジオ（GJV）の番号に変更"
          />
        </label>
      </div>
    </FormDialog>
  );
}
