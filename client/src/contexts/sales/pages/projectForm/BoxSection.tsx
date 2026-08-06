/**
 * BOX フォルダ (v4)
 *
 * 案件を作ると「社内限り（機密情報）」「社外共有可（顧客と共有）」の2つが
 * 自動で作られます。ここは**できているかを見る場所**で、URL は直接は直せません
 * （手で書き換えると BOX 側のフォルダと結びつきが切れるため）。
 *
 * **hidden で登録しているのは、保存のときに値を落とさないため**です。
 * 欄から外すとサーバーは「空が送られた」と受け取り、URL が消えます。
 */
import type { UseFormReturn } from 'react-hook-form';
import { ExternalLink, FolderPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormSection } from './FormSection';
import type { FormValues } from './types';

function BoxLink({ label, url }: { label: string; url: string }) {
  return (
    <div className="rounded-control-lg border border-border bg-background p-3">
      <div className="text-sub-sm mb-2 text-muted-foreground">{label}</div>
      {url ? (
        <a
          href={url} target="_blank" rel="noopener noreferrer"
          className="text-sub min-h-tap inline-flex items-center gap-1.5 text-primary hover:underline lg:min-h-[36px]"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          BOX で開く
        </a>
      ) : (
        <div className="text-sub text-muted-foreground">まだ作られていません</div>
      )}
    </div>
  );
}

export function BoxSection({
  form, isEdit, onCreate, creating,
}: {
  form: UseFormReturn<FormValues>;
  isEdit: boolean;
  onCreate: () => void;
  creating: boolean;
}) {
  const { register, watch } = form;
  const internal = watch('box_url_internal');
  const external = watch('box_url_external');
  const missing = !internal || !external;

  return (
    <FormSection
      title="BOX フォルダ"
      description="案件を作ると「社内限り（機密情報）」「社外共有可（顧客と共有）」の2つが自動で作られます。"
      action={isEdit && missing && (
        <Button type="button" variant="outline" size="sm" onClick={onCreate} disabled={creating}>
          {creating
            ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
            : <FolderPlus className="mr-1 h-4 w-4" aria-hidden="true" />}
          {internal || external ? '足りないほうを作る' : 'BOX フォルダを作る'}
        </Button>
      )}
    >
      {/* URL は表示だけ。**送信時に値を保つため hidden で登録する** */}
      <input type="hidden" {...register('box_url_internal')} />
      <input type="hidden" {...register('box_url_external')} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <BoxLink label="社内限り（機密情報）" url={internal} />
        <BoxLink label="社外共有可（顧客とも共有）" url={external} />
      </div>
    </FormSection>
  );
}
