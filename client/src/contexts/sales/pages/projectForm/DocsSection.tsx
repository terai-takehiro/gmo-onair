/**
 * 書類 — 申込書 / ロゴ使用許諾 (v4)
 *
 * 申込書を入りにすると、ダッシュボードの「申込書がまだ」の一覧から外れます。
 * **請求書を出すときにサーバーが見ている印**でもあるので（`/budget/billing` の
 * 月次の締め）、実物を受け取ってから入りにしてください。
 */
import type { UseFormReturn } from 'react-hook-form';
import { Switch } from '@/components/ui/switch';
import { FormSection } from './FormSection';
import type { FormValues } from './types';

function DocToggle({
  label, description, checked, onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex min-h-tap items-center justify-between gap-2 lg:min-h-[44px]">
      <div className="min-w-0">
        <p className="text-sub text-secondary-foreground">{label}</p>
        <p className="text-note text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={(v) => onChange(!!v)} aria-label={label} />
    </div>
  );
}

export function DocsSection({ form }: { form: UseFormReturn<FormValues> }) {
  const { setValue, watch } = form;

  return (
    <FormSection
      title="書類"
      description="申込書を入りにすると、ダッシュボードの「申込書がまだ」の一覧から外れます。"
    >
      <DocToggle
        label="申込書 受け取り済み"
        description="先方から申込書を受け取って保管しています"
        checked={!!watch('application_form')}
        onChange={(v) => setValue('application_form', v, { shouldDirty: true })}
      />
      <DocToggle
        label="ロゴの使用許諾 取得済み"
        description="先方からロゴを使ってよいと許可をもらっています"
        checked={!!watch('logo_permission')}
        onChange={(v) => setValue('logo_permission', v, { shouldDirty: true })}
      />
    </FormSection>
  );
}
