/**
 * プロジェクトの中身を直す（③ 詳細の鉛筆から開く）
 *
 * ── 全部の項目を必ず送る ────────────────────────────────────
 *
 * `PUT /gpm/projects/:id` は名前・区分・ステージ・依頼元・担当だけが `COALESCE` で、
 * **PM会社・着手日・完了予定日・メモは素の代入**です。
 * 送らなかった項目は `null` で上書きされます（サーバーの SQL を読んで確認）。
 * だから**いま入っている値を初期値にして、必ず全部送ります** —
 * 「名前だけ直したら PM が消えた」を作らないため。
 *
 * ── 依頼元・ステージはここでは変えられない ──────────────────
 *
 * migration 179 でプロジェクトは GLS-B の案件になり、依頼元は
 * **お客様マスターへの参照**になりました（自由入力ではなくなった）。
 * ここに文字を打つ欄を残すと、打った名前がどこにも保存されません。
 * 付け替えは案件の「直す」画面（お客様の選択欄）で行います。
 * ステージ（いまの段）も同じ理由で読むだけ — 変えるのは案件詳細⑥と同じ
 * ヘッダーのステージ帯からです（`ProjectFields.tsx` の `StageField` 参照）。
 *
 * ── 直す画面をダイアログにした理由 ──────────────────────────
 *
 * 案件管理は「読む画面」と「直す画面（`/edit`）」を分けていますが、
 * あちらは 2,178 行のフォームを持っていたからです。ここは項目が9つなので、
 * 別ページにすると**戻る操作が増えるだけ**になります
 * （PR③・`gpm-format-alignment.html`「決めてほしいこと1」もこのままでよいとしている）。
 *
 * ── 「いま必要な4つ ＋ あとから足せるもの」（PR③・項目17）──────────
 *
 * 欄の部品（`RequiredFields`/`MoreFields`）は**新規作成（`BasicStep`）と共有**。
 * 以前は編集だけ「区分・依頼元・いまの段」を欄として持っていなかった
 * （区分・依頼元自体はあったが、独自markupで別の見た目だった）。
 * 共有部品にしたことで3つとも新規作成と同じ見た目・同じ並びになった。
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useGpmUsers, useInvalidateGpm } from '../../queries';
import { ymd, type GpmKind, type GpmProjectDetail } from '../../types';
import { RequiredFields } from '../projectForm/RequiredFields';
import { MoreFields, moreFieldCount } from '../projectForm/MoreFields';

export function EditProjectDialog({
  project, onClose,
}: {
  project: GpmProjectDetail;
  onClose: () => void;
}) {
  const invalidate = useInvalidateGpm();
  const users = useGpmUsers();

  const [name, setName] = useState(project.name);
  const [kind, setKind] = useState<GpmKind>(project.gpm_kind ?? 'self_build');
  const [pmCompany, setPmCompany] = useState(project.pm_company ?? '');
  const [pmUserId, setPmUserId] = useState(project.assigned_to ?? '');
  const [startedOn, setStartedOn] = useState(ymd(project.started_on) ?? '');
  const [endsOn, setEndsOn] = useState(ymd(project.ends_on) ?? '');
  const [notes, setNotes] = useState(project.notes ?? '');
  // **編集は開いた状態で始める。** 新規作成と違い、ここには既に入っている値
  // （PM会社・着手日・メモ等）があることが多く、畳んだままだと直しに来た人が
  // 「消えた」と読む。折りたためるのは画面をすっきりさせたいときのため
  const [more, setMore] = useState(true);

  const save = useMutation({
    mutationFn: () =>
      // **全項目を送る。** 送らないと null で上書きされる（冒頭の注記）
      api.put(`/gpm/projects/${project.id}`, {
        name: name.trim(),
        gpm_kind: kind,
        stage: project.stage,
        customer_id: project.customer_id,
        pm_company: pmCompany.trim() || null,
        assigned_to: pmUserId || null,
        started_on: startedOn || null,
        ends_on: endsOn || null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      invalidate(project.id);
      notifySuccess('プロジェクトを更新しました');
      onClose();
    },
    onError: (err) => notifyApiError('プロジェクトを更新できませんでした', err),
  });

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="プロジェクトを編集"
      size="lg"
      // Enter で保存する（繰り返し入力を持たないフォーム）。送信は `type="submit"` の1本だけ
      onSubmit={(e) => { e.preventDefault(); if (name.trim() && !save.isPending) save.mutate(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
          <Button type="submit" disabled={!name.trim() || save.isPending}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            編集
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-3.5">
        <RequiredFields
          mode="edit"
          name={name}
          onName={setName}
          kind={kind}
          onKind={(k) => { setKind(k); if (k !== 'group_order') setPmCompany(''); }}
          customerName={project.customer_name}
          users={users.data ?? []}
          pmUserId={pmUserId}
          onPmUserId={setPmUserId}
        />

        <div className="rounded-card overflow-hidden border border-border bg-card">
          <button
            type="button"
            onClick={() => setMore((o) => !o)}
            aria-expanded={more}
            className="min-h-tap flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-muted"
          >
            {more
              ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
            <span className="text-list font-bold">あとから足せるもの</span>
            <span className="text-badge font-number rounded-badge-xs bg-muted px-1.5 py-0.5 text-muted-foreground">
              {moreFieldCount('edit')}
            </span>
            <span className="flex-1" />
            <span className="text-note text-muted-foreground">PM会社 ・ 着手日 ・ 完了予定日 ・ いまの段 ・ メモ</span>
          </button>

          {more && (
            <div className="border-t border-border-faint px-4 pb-4 pt-4 lg:px-5">
              <MoreFields
                mode="edit"
                kind={kind}
                pmCompany={pmCompany}
                onPmCompany={setPmCompany}
                startedOn={startedOn}
                onStartedOn={setStartedOn}
                startedOnHint="着手日を直しても、すでに入っている工程の日付は動きません。工程の日付は工程ごとに直します。"
                endsOn={endsOn}
                onEndsOn={setEndsOn}
                stage={project.stage}
                notes={notes}
                onNotes={setNotes}
              />
            </div>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
