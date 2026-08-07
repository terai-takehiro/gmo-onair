/**
 * 基本情報 — 案件名 / お客様 / 種類 / 分類 / グループ区分 / メモ (v4)
 *
 * ── 「案件分類」を消していない ──────────────────────────────
 *
 * 発番前は A（スタジオ）か B（ビジネス）を必ず選びます。GLS 番号の採り方が
 * 分類ごとに違うので、**発番したあとは押しただけでは変えられません**
 * （番号の採り直し・回のコード・BOX フォルダ名がまとめて動くため、確認を挟みます）。
 *
 * ── タグと「案件種類（その他）」は欄ごと外した（モックどおり）──────
 *
 * **列は残しています。** この UPDATE は送られた値でそのまま上書きするので、
 * 欄だけ消すと**保存のたびに既存の値が空になります**（本番データが黙って消える）。
 * 先に `project.service.ts` を「未指定なら今の値を保つ」形にしてから外しました。
 * 既存のタグは案件一覧の絞り込み（`filter.tag`）でこれまでどおり効きます。
 */
import type { UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ProjectTypeLabels } from '@/types';
import { cn } from '@/lib/utils';
import { FormSection, Field } from './FormSection';
import type { FormValues } from './types';

export function BasicSection({
  form, customers, hasGls, onNewCustomer, onSwitchCategory,
}: {
  form: UseFormReturn<FormValues>;
  customers: { id: string; name: string; short_name?: string }[];
  hasGls: boolean;
  onNewCustomer: () => void;
  onSwitchCategory: (target: 'A' | 'B') => void;
}) {
  const { register, setValue, watch, formState: { errors } } = form;
  const projectType = watch('project_type');
  const glsCategory = watch('gls_category');

  return (
    <FormSection title="基本情報">
      <Field label="案件名 *" htmlFor="pf-name" error={errors.name?.message}>
        <Input id="pf-name" {...register('name', { required: '必須です' })} />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={
            <span className="flex items-center justify-between gap-2">
              顧客 *
              <button type="button" className="text-sub text-primary hover:underline" onClick={onNewCustomer}>
                ＋ 新しいお客様
              </button>
            </span>
          }
        >
          <SearchableSelect
            options={customers.map((c) => ({ value: c.id, label: c.name, subLabel: c.short_name || '' }))}
            value={watch('customer_id')}
            onChange={(v) => setValue('customer_id', v)}
            placeholder="お客様を探す..."
          />
        </Field>
        <Field label="案件種類">
          <Select value={projectType} onValueChange={(v) => setValue('project_type', v)}>
            <SelectTrigger><SelectValue placeholder="選んでください" /></SelectTrigger>
            <SelectContent>
              {(Object.entries(ProjectTypeLabels) as [string, string][]).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="案件分類 *">
        {hasGls ? (
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <Badge variant="outline">
              {glsCategory === 'A' ? 'スタジオ案件 (GLS-A)' : 'ビジネス案件 (GLS-B)'}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onSwitchCategory(glsCategory === 'A' ? 'B' : 'A')}
            >
              {glsCategory === 'A' ? 'ビジネス案件 (B) に変える…' : 'スタジオ案件 (A) に変える…'}
            </Button>
            <p className="text-note w-full text-muted-foreground">
              GLS 発番済みなので、分類を変えると GLS 番号を採り直します
              （BOX フォルダ名・回のコードも一緒に変わります）。
            </p>
          </div>
        ) : (
          <>
            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(['A', 'B'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setValue('gls_category', cat, { shouldDirty: true })}
                  aria-pressed={glsCategory === cat}
                  className={cn(
                    'text-sub min-h-tap rounded-control-lg border px-3 py-2 lg:min-h-[44px]',
                    glsCategory === cat
                      ? 'border-primary-border-strong bg-primary-surface text-primary'
                      : 'border-input bg-background text-foreground hover:bg-muted',
                  )}
                >
                  {cat === 'A' ? 'スタジオ案件 (GLS-A)' : 'ビジネス案件 (GLS-B)'}
                </button>
              ))}
            </div>
            <p className="text-note mt-1 text-muted-foreground">
              スタジオ収録・配信・イベントは「スタジオ案件」、コンサル・GMO 内部の案件は「ビジネス案件」です。
            </p>
          </>
        )}
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="グループ区分">
          <Select value={watch('customer_type') || 'external'} onValueChange={(v) => setValue('customer_type', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="external">グループ外</SelectItem>
              <SelectItem value="internal">グループ内</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="メモ" htmlFor="pf-notes">
        <Textarea id="pf-notes" {...register('notes')} rows={3} />
      </Field>
    </FormSection>
  );
}
