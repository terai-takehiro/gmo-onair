/**
 * 「サムライスタジオへ社内発注」フォーム（作成・編集共通）
 * （2026年10月の事業再編・GJV⇄GSS・P2 Round 2・`IntercompanySection.tsx` から分離）
 *
 * ── 金額の初期値は「下見」───────────────────────────────────
 *
 * `GET /intercompany/suggest-amount` がその案件の最新の見積の原価行の合計を
 * 返す（見積が無ければ `suggested_amount: 0`）。**新規作成のときだけ**引き、
 * ユーザーが金額欄を一度でも直したら以後は上書きしない（`amountTouched`）。
 * 編集のときは既存の金額をそのまま初期値にする（下見はしない）。
 *
 * ── 空欄で保存 = 明示的に null を送る ──────────────────────────
 *
 * `PUT /intercompany/:id` は「渡したフィールドだけ更新」（部分更新の原則・
 * `client/CLAUDE.md`）。計上日・備考を空欄のまま保存すると空文字がそのまま
 * 送られて「消す」つもりが変な値のまま残る事故になるので、**空欄は `null` に
 * 変換してから送る**（`recognitionDate || null` — 財務台帳のダイアログ群と
 * 同じ書き方）。
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { CurrencyInput } from '@gmo-onair/shared/src/client/ui/currency-input';
import { FormDialog, FormDialogFooter, formGrid2 } from '@gmo-onair/shared/src/client-v4/formDialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { Episode } from '@gmo-onair/shared/src/types';
import type { IntercompanyDetail } from './IntercompanySection';

export function IntercompanyDialog({
  projectId, episodes, detail, onClose, onSaved,
}: {
  projectId: string;
  /** 案件の回一覧（`IntercompanySection` が既に引いている分をそのまま渡す） */
  episodes: Episode[];
  /** `null` なら新規作成 */
  detail: IntercompanyDetail | null;
  onClose: () => void;
  /** 保存できたら呼ばれる（一覧の invalidate・ダイアログを閉じるのは呼び出し側の役目） */
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!detail;

  const [episodeId, setEpisodeId] = useState(detail?.revenue.episode_id ?? (episodes.length === 1 ? episodes[0].id : ''));
  const [amount, setAmount] = useState<number>(Number(detail?.revenue.amount ?? 0));
  const [amountTouched, setAmountTouched] = useState(isEdit);
  const [recognitionDate, setRecognitionDate] = useState(detail?.revenue.recognition_date?.slice(0, 10) ?? '');
  const [notes, setNotes] = useState(detail?.revenue.notes ?? '');

  // 金額欄の下見（§4.12）。**新規作成のときだけ**引く
  const suggestion = useQuery<{ suggested_amount: number; estimate_id: string | null }>({
    queryKey: ['intercompany-suggest-amount', projectId],
    queryFn: async () => (await api.get('/intercompany/suggest-amount', { params: { project_id: projectId } })).data.data,
    enabled: !isEdit,
  });
  // 下見が届いた時点でまだ金額欄を直していなければ、そのまま初期値にする
  useEffect(() => {
    if (!isEdit && suggestion.data && !amountTouched) {
      setAmount(suggestion.data.suggested_amount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion.data, isEdit]);

  const invalidateList = () => qc.invalidateQueries({ queryKey: ['intercompany', projectId] });

  const create = useMutation({
    mutationFn: () => api.post('/intercompany', {
      project_id: projectId,
      episode_id: episodeId,
      amount,
      recognition_date: recognitionDate || undefined,
      notes: notes || undefined,
    }),
    onSuccess: () => {
      invalidateList();
      notifySuccess('社内発注を登録しました');
      onSaved();
    },
    onError: (err) => notifyApiError('社内発注を登録できませんでした', err, '選んだ回と金額を確かめて、もう一度お試しください。'),
    meta: { action: '社内取引の登録' },
  });

  const update = useMutation({
    mutationFn: () => api.put(`/intercompany/${detail!.link.id}`, {
      amount,
      recognition_date: recognitionDate || null,
      episode_id: episodeId,
      notes: notes || null,
    }),
    onSuccess: () => {
      invalidateList();
      notifySuccess('社内取引を更新しました');
      onSaved();
    },
    onError: (err) => notifyApiError('社内取引を更新できませんでした', err, '請求書発行・検収・入金が済んでいる場合は直せません。'),
    meta: { action: '社内取引の更新' },
  });

  const saving = create.isPending || update.isPending;
  const canSubmit = !!episodeId && amount > 0;
  const noEpisodes = episodes.length === 0;

  return (
    <FormDialog
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={isEdit ? '社内取引を編集' : 'サムライスタジオへ社内発注'}
      sub="GJV が受けた案件を GSS のスタジオ・人員・機材で作るときの、GSS→GJV の社内売上・仕入を1組登録します。"
      onSubmit={(e) => { e.preventDefault(); if (isEdit) update.mutate(); else create.mutate(); }}
      footer={(
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
          <Button type="submit" disabled={saving || !canSubmit}>{saving ? '保存中…' : '保存する'}</Button>
        </FormDialogFooter>
      )}
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-sub mb-1 block text-muted-foreground" htmlFor="intercompany-episode">
            回<span className="text-destructive"> *</span>
          </label>
          {noEpisodes ? (
            <p className="text-sub text-muted-foreground">
              この案件にはまだ回がありません。先に回を追加してから社内発注を登録してください。
            </p>
          ) : (
            <Select value={episodeId} onValueChange={setEpisodeId}>
              <SelectTrigger id="intercompany-episode"><SelectValue placeholder="回を選ぶ" /></SelectTrigger>
              <SelectContent>
                {episodes.map((ep) => (
                  <SelectItem key={ep.id} value={ep.id}>
                    {ep.episode_code}（第{ep.episode_number}話）{ep.title ? ` ${ep.title}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className={formGrid2}>
          <div>
            <label className="text-sub mb-1 block text-muted-foreground" htmlFor="intercompany-amount">
              金額<span className="text-destructive"> *</span>
            </label>
            <CurrencyInput
              id="intercompany-amount"
              value={amount}
              onChange={(v) => { setAmount(v); setAmountTouched(true); }}
            />
            {!isEdit && suggestion.isSuccess && (
              <p className="text-sub-sm mt-1 text-muted-foreground">
                {suggestion.data.suggested_amount > 0
                  ? '見積の原価行の合計（下見）を初期値にしています。必要に応じて直してください。'
                  : '見積が無いため金額を自動では出せません。手入力してください。'}
              </p>
            )}
          </div>
          <div>
            <label className="text-sub mb-1 block text-muted-foreground" htmlFor="intercompany-date">計上日（任意）</label>
            <Input id="intercompany-date" type="date" value={recognitionDate} onChange={(e) => setRecognitionDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="text-sub mb-1 block text-muted-foreground" htmlFor="intercompany-notes">備考（任意）</label>
          <Textarea id="intercompany-notes" rows={3} value={notes ?? ''} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </FormDialog>
  );
}
