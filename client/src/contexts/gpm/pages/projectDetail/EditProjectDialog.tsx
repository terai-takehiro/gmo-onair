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
 * ── 依頼元はここでは変えられない ────────────────────────────
 *
 * migration 179 でプロジェクトは GLS-B の案件になり、依頼元は
 * **お客様マスターへの参照**になりました（自由入力ではなくなった）。
 * ここに文字を打つ欄を残すと、打った名前がどこにも保存されません。
 * 付け替えは案件の「直す」画面（お客様の選択欄）で行います。
 *
 * ── 直す画面をダイアログにした理由 ──────────────────────────
 *
 * 案件管理は「読む画面」と「直す画面（`/edit`）」を分けていますが、
 * あちらは 2,178 行のフォームを持っていたからです。ここは項目が9つなので、
 * 別ページにすると**戻る操作が増えるだけ**になります。
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useGpmUsers, useInvalidateGpm } from '../../queries';
import { KIND_LABEL, ymd, type GpmKind, type GpmProjectDetail } from '../../types';

const KINDS: GpmKind[] = ['self_build', 'group_order'];

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
      notifySuccess('プロジェクトを直しました');
      onClose();
    },
    onError: (err) => notifyApiError('プロジェクトを直せませんでした', err),
  });

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="プロジェクトを直す"
      size="lg"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>やめる</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            直す
          </Button>
        </FormDialogFooter>
      }
    >
    <div className="space-y-3">
      <div>
        <Label htmlFor="ep-name">プロジェクト名</Label>
        <Input id="ep-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="ep-kind">区分</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as GpmKind)}>
            <SelectTrigger id="ep-kind"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="ep-pm">自社担当（PM）</Label>
          <Select value={pmUserId || '_none_'} onValueChange={(v) => setPmUserId(v === '_none_' ? '' : v)}>
            <SelectTrigger id="ep-pm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none_">未定</SelectItem>
              {(users.data ?? []).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>依頼元</Label>
          {/* **読むだけ。** お客様マスターへの参照なので、ここで打っても保存されない */}
          <p className="text-list min-h-tap flex items-center lg:min-h-[36px]">
            {project.customer_name ?? '未設定'}
          </p>
          <p className="text-note text-muted-foreground">
            付け替えは案件の「直す」画面から行います
          </p>
        </div>
        <div>
          <Label htmlFor="ep-pmco">PM会社</Label>
          <Input
            id="ep-pmco"
            value={pmCompany}
            onChange={(e) => setPmCompany(e.target.value)}
            placeholder="自社PM のときは空のまま"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="ep-start">着手日</Label>
          <Input id="ep-start" type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ep-end">完了予定日</Label>
          <Input id="ep-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </div>
      </div>
      <p className="text-sub-sm text-muted-foreground">
        着手日を直しても、すでに入っている工程の日付は動きません。工程の日付は工程ごとに直します。
      </p>
      <div>
        <Label htmlFor="ep-notes">メモ</Label>
        <Textarea id="ep-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      </div>
    </FormDialog>
  );
}
