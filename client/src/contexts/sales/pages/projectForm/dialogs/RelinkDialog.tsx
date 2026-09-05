/**
 * 別の GLS の回へ付け替える (v4)
 *
 * 発番済みの案件を、別の番組の回として付け替えます。**何が一緒に動くかを
 * 全部並べてから**訊きます（番号・回のコード・BOX フォルダ名・概算見積）。
 * 押したあとに気づいても戻せません。
 */
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { GlsProject } from '../types';

export function RelinkDialog({
  state, setState, projectId, currentGls, glsProjects, busy, onConfirm,
}: {
  state: { open: boolean; target_project_id: string };
  setState: React.Dispatch<React.SetStateAction<{ open: boolean; target_project_id: string }>>;
  projectId: string | undefined;
  currentGls: string | null | undefined;
  glsProjects: GlsProject[];
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <FormDialog
      open={state.open}
      onOpenChange={(open) => setState((s) => ({ ...s, open }))}
      title="別の GLS の回へ付け替える"
      sub={`この案件（いま ${currentGls}）を、選んだ GLS 案件の回として付け替えます。`}
      footer={(
        <FormDialogFooter>
          <Button variant="outline" onClick={() => setState({ open: false, target_project_id: '' })}>
            キャンセル
          </Button>
          <Button disabled={!state.target_project_id || busy} onClick={onConfirm}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            付け替える
          </Button>
        </FormDialogFooter>
      )}
    >
      <div className="space-y-3">
        <div>
          <Label>付け替え先の GLS 案件</Label>
          <SearchableSelect
            options={glsProjects
              .filter((p) => p.id !== projectId)
              .map((p) => ({ value: p.id, label: `${p.gls_number}　${p.name}`, subLabel: p.customer_name }))}
            value={state.target_project_id}
            onChange={(v) => setState((s) => ({ ...s, target_project_id: v }))}
            placeholder="GLS 番号で探す…"
          />
        </div>
        <div className="text-note space-y-1 rounded-note border border-warning-border bg-warning-surface p-3 text-secondary-foreground">
          <p>押すと、次のことが起きます:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>GLS 番号が付け替え先のものになり、回のコードは新しい番号で採り直します</li>
            <li>いまの GLS 番号（{currentGls}）は履歴に残ります</li>
            <li>BOX フォルダ名・Qシートの回のコードも新しい番号に変わります</li>
            <li>想定金額が残っていれば確定売上に変わります（売上・仕入の実績はそのまま）</li>
          </ul>
        </div>
      </div>
    </FormDialog>
  );
}
