/**
 * ひとつづり（受領書類の束）の当て先を人が決めるダイアログ（migration 281）
 *
 * ── なぜ人が決めるのか ──────────────────────────────────────
 *
 * **どの案件の書類かは最終的に人が判断するもの**（ご指示）です。
 * AI は「仮」で候補を置くだけで、ここで人が確かめて確定します。
 *
 * ・合っていた → そのまま「この案件で確定」
 * ・違う案件だった → 案件を選び直す
 * ・案件に紐づかない経費だった → 「販管費」に切り替える
 * ・そもそもゴミだった → 束ごと削除（ダイアログではなく一覧から）
 *
 * ── 販管費のときだけ「何日サイト」「何月処理」を訊く ─────────
 *
 * 案件の仕入は書類に支払期日が書いてあります。販管費（家賃・回線・
 * ソフトの月額など）は**書いていないことのほうが多く**、実務は
 * 「締日から◯日サイト」で決まります。日数と処理月を持たせておけば、
 * 台帳へ渡すときに支払期日が自動で決まります（人は上書きできます）。
 *
 * 計算は `shared/src/utils/financeDocChain.ts`（サーバーと同じ関数）です。
 * **ここで計算式を書き直さないこと** — 画面が出す期日と台帳に入る期日が
 * 別の日になります。
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import api from '@/lib/api';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { paymentDueFromTerms } from '@gmo-onair/shared/src/utils/financeDocChain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { FinanceDocGroup } from './types';

export interface GroupPatch {
  title?: string;
  vendor_name?: string | null;
  expense_kind?: 'purchase' | 'sga' | null;
  project_id?: string | null;
  payment_terms_days?: number | null;
  processing_month?: string | null;
}

interface ProjectOption { id: string; name: string; gls_number: string | null }

/** よくある支払サイト。**選ぶだけで済むようにする**（毎回数字を打たせない） */
const COMMON_TERMS = [
  { days: 0, label: '当月末払い（0日）' },
  { days: 30, label: '30日サイト' },
  { days: 31, label: '31日サイト' },
  { days: 45, label: '45日サイト' },
  { days: 60, label: '60日サイト' },
  { days: 90, label: '90日サイト' },
];

export function GroupEditDialog({
  group, saving, onClose, onSubmit,
}: {
  group: FinanceDocGroup;
  saving: boolean;
  onClose: () => void;
  onSubmit: (patch: GroupPatch) => void;
}) {
  const [title, setTitle] = useState(group.title);
  const [vendor, setVendor] = useState(group.vendor_name ?? '');
  const [kind, setKind] = useState<'purchase' | 'sga'>(group.expense_kind ?? (group.project_id ? 'purchase' : 'purchase'));
  const [projectId, setProjectId] = useState<string>(group.project_id ?? '');
  const [terms, setTerms] = useState<string>(group.payment_terms_days === null ? '' : String(group.payment_terms_days));
  const [month, setMonth] = useState(group.processing_month ?? '');

  const projects = useQuery<{ data: ProjectOption[] }>({
    queryKey: ['projects', 'registerable'],
    queryFn: async () => (await api.get('/projects/registerable-projects')).data,
    enabled: kind === 'purchase',
  });

  const projectOptions = useMemo(
    () => (projects.data?.data ?? []).map((p) => ({
      value: p.id,
      label: p.gls_number ? `${p.gls_number} ${p.name}` : p.name,
    })),
    [projects.data],
  );

  const termsNum = terms.trim() === '' ? null : Number(terms);
  /** **人が入れた値でその場で期日を見せる。** 保存してから初めて分かるのでは遅い */
  const previewDue = kind === 'sga' && month && termsNum !== null
    ? paymentDueFromTerms(month, termsNum) : null;

  const submit = () => {
    onSubmit({
      title: title.trim() || group.title,
      vendor_name: vendor.trim() || null,
      expense_kind: kind,
      // **販管費に切り替えたら案件は外す**（サーバーも同じことをする）。
      // 案件が付いたままの販管費は、原価と販管費の二重計上に見える
      project_id: kind === 'purchase' ? (projectId || null) : null,
      payment_terms_days: kind === 'sga' ? termsNum : null,
      processing_month: kind === 'sga' ? (month || null) : null,
    });
  };

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="この取引の当て先を決める"
      sub="どの案件の書類か、案件に紐づかない販管費かを決めます。"
      footer={(
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>やめる</Button>
          <Button onClick={submit} disabled={saving}>{saving ? '保存中…' : '確定する'}</Button>
        </FormDialogFooter>
      )}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sub text-secondary-foreground">
          {group.title}
          {group.docs.length > 0 && `（書類 ${group.docs.length} 通）`}
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fdg-title">この取引の呼び名</Label>
          <Input id="fdg-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fdg-vendor">取引先</Label>
          <Input id="fdg-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="株式会社◯◯" />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sub-sm font-bold">行き先</legend>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={kind === 'purchase' ? 'default' : 'outline'}
              onClick={() => setKind('purchase')}
            >
              案件の仕入
            </Button>
            <Button
              type="button"
              variant={kind === 'sga' ? 'default' : 'outline'}
              onClick={() => setKind('sga')}
            >
              販管費（案件に紐づかない）
            </Button>
          </div>
        </fieldset>

        {kind === 'purchase' ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fdg-project">どの案件か</Label>
            <SearchableSelect
              value={projectId}
              onChange={setProjectId}
              options={projectOptions}
              placeholder={projects.isLoading ? '案件を読み込み中…' : '管理番号・案件名で探す'}
            />
            <p className="text-note text-muted-foreground">
              決まっていなければ空のままでかまいません。
              <strong className="font-bold">仕入に登録するときには必ず必要</strong>になります。
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fdg-month">何月処理か</Label>
              <Input
                id="fdg-month" type="month" value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sub-sm font-bold">支払サイト（締日から何日後か）</legend>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_TERMS.map((t) => (
                  <Button
                    key={t.days}
                    type="button"
                    variant={termsNum === t.days ? 'default' : 'outline'}
                    onClick={() => setTerms(String(t.days))}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
              <Input
                type="number" min={0} max={365} value={terms} inputMode="numeric"
                onChange={(e) => setTerms(e.target.value)}
                placeholder="日数（0〜365）"
                aria-label="支払サイトの日数"
              />
            </fieldset>
            <p className="text-sub-sm flex items-start gap-1.5 text-secondary-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {previewDue ? (
                <span>
                  この設定だと支払期日は <strong className="font-number font-bold">{previewDue}</strong> になります。
                  書類に期日が書いてあれば<strong className="font-bold">そちらが優先</strong>です。
                </span>
              ) : (
                <span>
                  処理月と日数の両方を入れると、支払期日の見込みがここに出ます。
                  「翌月末払い」は月によって日数が変わるので、
                  <strong className="font-bold">31日サイトとは同じになりません</strong>（登録時に直せます）。
                </span>
              )}
            </p>
          </>
        )}
      </div>
    </FormDialog>
  );
}
