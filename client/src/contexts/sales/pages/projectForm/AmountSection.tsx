/**
 * お金と担当 — 想定金額 / 料金シミュレーション / AI の見積下書き / 主担当 (v4)
 *
 * ── AI の下書きは「確定する」まで想定金額に入りません ─────────────
 *
 * AI（MCP の `set_project_simulation`）が作った見積は `draft` のまま置かれます。
 * 人が中身を見て「確定する」を押したときだけ想定金額に入ります。
 * **いつ作られたかは出しますが、誰の指示かは出しません** — `requested_by` は
 * AI が名簿と突き合わせず自由記述で書く値で、実在する方の名前が別の字で
 * 記録されていたことがあるためです（`docs/wording.md`）。
 *
 * ── 主担当を空にできる（送らないだけ） ────────────────────────
 *
 * `SearchableSelect` の × を押すと空になります。空のまま保存しても
 * サーバーは**いまの主担当を保ちます**（列が NOT NULL の外部キーのため）。
 */
import type { UseFormReturn } from 'react-hook-form';
import type { UseMutationResult } from '@tanstack/react-query';
import { Calculator, Check, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { relativeTime } from '@/lib/aiFeed';
import { FormSection, Field } from './FormSection';
import type { FormValues } from './types';

export function AmountSection({
  form, users, isEdit, isCategoryA,
  hasDraftSimulation, draftSimulationTotal, aiDraftCreatedAt, finalizeSim, onOpenSimulation,
}: {
  form: UseFormReturn<FormValues>;
  users: { id: string; name: string }[];
  isEdit: boolean;
  isCategoryA: boolean;
  hasDraftSimulation: boolean;
  draftSimulationTotal: number;
  aiDraftCreatedAt: string | null;
  finalizeSim: UseMutationResult<unknown, unknown, void, unknown>;
  onOpenSimulation: () => void;
}) {
  const { setValue, watch } = form;

  return (
    <FormSection title="金額と担当">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Field label="想定金額（税別）">
            <CurrencyInput
              value={watch('expected_amount')}
              onChange={(v) => setValue('expected_amount', v)}
            />
          </Field>
          {isEdit && isCategoryA && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="text-sub mt-1 h-auto p-0"
              onClick={onOpenSimulation}
            >
              <Calculator className="mr-1 h-3 w-3" aria-hidden="true" />
              料金シミュレーション
            </Button>
          )}

          {hasDraftSimulation && (
            <div className="mt-2 rounded-card border border-ai-border bg-ai-surface p-3">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ai" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-list">AI が作った見積の下書きがあります</p>
                  <p className="text-sub mt-0.5 flex flex-wrap items-baseline gap-1">
                    合計
                    <Money value={draftSimulationTotal} className="inline-flex gap-1 font-bold" />
                    。「確定する」を押すと想定金額に入ります。
                  </p>
                  {aiDraftCreatedAt && (
                    <p className="text-sub-sm mt-0.5 text-muted-foreground">
                      {relativeTime(aiDraftCreatedAt)}に AI が作りました
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => finalizeSim.mutate()}
                      disabled={finalizeSim.isPending}
                    >
                      {finalizeSim.isPending
                        ? <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                        : <Check className="mr-1 h-3 w-3" aria-hidden="true" />}
                      確定する
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={onOpenSimulation}>
                      <Calculator className="mr-1 h-3 w-3" aria-hidden="true" />
                      中身を見て直す
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <Field
          label="主担当"
          hint="空にしたまま保存すると、いまの主担当がそのまま残ります。"
        >
          <SearchableSelect
            options={users.map((u) => ({ value: u.id, label: u.name }))}
            value={watch('assigned_to')}
            onChange={(v) => setValue('assigned_to', v)}
            placeholder="主担当を探す..."
          />
        </Field>
      </div>
    </FormSection>
  );
}
