/**
 * 番組情報 — 番組種別 / 配信媒体 (v4)
 *
 * **スタジオ案件 (A) を GLS 発番したあとだけ**出ます。発番のときに選ぶので、
 * 発番前に出すと同じことを2回訊くことになります。
 * ビジネス案件 (B) には番組という考え方がありません。
 */
import type { UseFormReturn } from 'react-hook-form';
import { ToggleButtonGroup } from '@gmo-onair/shared/src/client/ui/toggle-button-group';
import { BroadcastTypeLabels, MediaPlatformLabels } from '@/types';
import { FormSection, Field } from './FormSection';
import type { FormValues } from './types';

const asList = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

export function BroadcastSection({ form }: { form: UseFormReturn<FormValues> }) {
  const { setValue, watch } = form;

  return (
    <FormSection title="番組情報">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Field label="番組種別（いくつでも）">
          <div className="mt-2">
            <ToggleButtonGroup
              options={(Object.entries(BroadcastTypeLabels) as [string, string][])
                .map(([value, label]) => ({ value, label }))}
              value={asList(watch('broadcast_type') || '')}
              onChange={(next) => setValue('broadcast_type', next.join(','))}
              multi
              cols={{ base: 2 }}
            />
          </div>
        </Field>
        <Field label="配信媒体（いくつでも）">
          <div className="mt-2">
            <ToggleButtonGroup
              options={(Object.entries(MediaPlatformLabels) as [string, string][])
                .map(([value, label]) => ({ value, label }))}
              value={asList(watch('media_platform') || '')}
              onChange={(next) => setValue('media_platform', next.join(','))}
              multi
              cols={{ base: 2, sm: 3 }}
            />
          </div>
        </Field>
      </div>
    </FormSection>
  );
}
