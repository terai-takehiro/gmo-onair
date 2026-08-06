/**
 * 受付の右「読み取ったこと」と「きめる」(v4 ②)
 *
 * ── 確信度ではなく「入っている / 入っていない」を出します ──────
 *
 * モックは項目ごとに AI の確信度 (高 / 中 / 低) を出しますが、
 * **いまの起票にその値はありません** (MCP の `create_project` は確信度を渡さない)。
 * 無い数字をそれらしく出すより、**必須なのに空**を赤で名指しするほうが、
 * この画面でやることが決まります。
 *
 * ── 直した差分はサーバーが自動で残します ──────────────────────
 *
 * AI が起票した案件をここから直すと、`projects` の保存時に
 * 「どの項目を・何から何に」変えたかが `ai_corrections` に入ります
 * (`server/.../project-ai-feedback.service.ts`)。**人に入力させません。**
 * だから画面には「直すと記録が残る」とだけ書いてあります。
 */
import { FolderPlus, Pencil, XCircle, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { ProjectTypeLabels } from '@/types';
import { internalTodos, blockedReason, type IntakeProject } from './ask';

/**
 * 案件種類の名前。**`@/types` の対応表をそのまま使う。**
 *
 * ここに4つ（`live` / `recording` / `event` / `other`）だけ書き写していたので、
 * 実際の値（`live_broadcast` / `offline_event` / `hybrid_event` / `gmo_project` /
 * `consulting`）は名前が見つからず、**`recording` 以外は生のキーが画面に出ていました**。
 * 書き写すと、種類を足したときに必ず片方だけ古くなります。
 */
const typeLabel = (key: string) =>
  ProjectTypeLabels[key as keyof typeof ProjectTypeLabels] ?? key;

interface FieldRow {
  label: string;
  value: React.ReactNode;
  /** 案件にするのに要る項目。空なら赤で出す */
  required?: boolean;
  filled: boolean;
}

function fieldsOf(p: IntakeProject): FieldRow[] {
  const amount = Number(p.expected_amount ?? 0);
  return [
    { label: 'お客様', value: p.customer_name, required: true, filled: !!p.customer_name },
    { label: '案件名', value: p.name, required: true, filled: !!p.name },
    {
      label: '実施日',
      value: p.event_start ? <DateRange start={p.event_start} end={p.event_end} /> : null,
      required: true, filled: !!p.event_start,
    },
    {
      label: '想定金額',
      value: amount > 0 ? <Money value={amount} /> : null,
      filled: amount > 0,
    },
    {
      label: '種別',
      value: p.project_type && p.project_type !== 'other' ? typeLabel(p.project_type) : null,
      filled: !!p.project_type && p.project_type !== 'other',
    },
    {
      label: '案件分類',
      value: p.gls_category === 'A' ? 'A スタジオ' : p.gls_category === 'B' ? 'B ビジネス' : null,
      required: true, filled: !!p.gls_category,
    },
    { label: '社内の担当', value: p.assigned_to_name, required: true, filled: !!p.assigned_to_name },
    { label: '入口', value: p.source_channel, filled: !!p.source_channel },
  ];
}

export function DecidePanel({
  project, onPromote, onKeep, onDrop, busy,
}: {
  project: IntakeProject;
  onPromote: () => void;
  onKeep: () => void;
  onDrop: () => void;
  busy: boolean;
}) {
  const navigate = useNavigate();
  const todos = internalTodos(project);
  const blocked = blockedReason(project);

  return (
    <div className="flex flex-col gap-3.5">
      <section className="rounded-card overflow-hidden border border-border bg-card">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 p-4 pb-2.5 lg:px-5">
          <h2 className="text-cardtitle">読み取ったこと</h2>
          <p className="text-note text-muted-foreground">項目は登録画面と同じです</p>
        </div>
        <dl>
          {fieldsOf(project).map((f) => (
            <div key={f.label} className="flex items-center gap-3 border-t border-border-subtle px-4 py-2 lg:px-5">
              <dt className="text-sub w-24 shrink-0 text-muted-foreground">
                {f.label}
                {f.required && !f.filled && (
                  <span className="text-sub-sm ml-1 font-bold text-destructive">必須</span>
                )}
              </dt>
              <dd className={`text-list min-w-0 flex-1 truncate ${f.filled ? '' : 'font-normal text-muted-foreground'}`}>
                {f.filled ? f.value : '未入力'}
              </dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-border-subtle p-4 lg:px-5">
          <Button variant="outline" className="w-full" onClick={() => navigate(`/sales/projects/${project.id}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />ここを直す
          </Button>
          {project.is_ai_created && (
            <p className="text-note mt-2 text-muted-foreground">
              この案件は<strong className="font-bold">AI が起こしました</strong>。直した内容は
              「どこを・何から何に」まで記録され、AI の直しに使われます（入力は要りません）。
            </p>
          )}
        </div>
      </section>

      <section className="rounded-card border border-border bg-card p-4 lg:px-5">
        {project.ai_reviewed_at && (
          <p className="rounded-note text-sub mb-2.5 flex items-start gap-2 bg-success-surface px-3 py-2 text-success">
            <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            内容は確認済みです
          </p>
        )}
        <p className="text-note text-secondary-foreground">
          日程か見積が動いたら案件にします。押すと <strong className="font-bold">GLS 番号が発番</strong>され、
          ステージが「B 口頭決定」に上がります。
        </p>

        {todos.length > 0 && (
          <ul className="text-note mt-2 flex flex-col gap-1 text-destructive">
            {todos.map((t) => <li key={t.key}>・{t.q}（{t.why}）</li>)}
          </ul>
        )}

        <Button
          className="mt-2.5 h-12 w-full text-[15px]"
          disabled={busy || !!blocked}
          onClick={onPromote}
        >
          <FolderPlus className="mr-2 h-[18px] w-[18px]" aria-hidden="true" />案件にする
        </Button>
        {blocked && <p className="text-note mt-1.5 text-destructive">{blocked}</p>}

        <div className="mt-2.5 flex gap-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={onKeep}>
            ネタのまま置く
          </Button>
          <Button variant="outline" className="flex-1" disabled={busy} onClick={onDrop}>
            <XCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />見送りにする
          </Button>
        </div>
      </section>
    </div>
  );
}
