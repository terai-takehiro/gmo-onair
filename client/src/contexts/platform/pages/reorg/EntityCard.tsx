/**
 * 計上会社の1枚（会社と切替 ⑧・Section A）
 *
 * SCS／GSS（`kind==='revenue'`）は発行者情報（住所・登録番号・振込先・ロゴ）を
 * 編集できる。GMO はコストセンター（`kind==='cost_center'`）なので請求書を
 * 出さず、フォームそのものを出さない（§4.2「売上系の UI・登録口を閉じる判定」）。
 *
 * ── 振込先は4つの入力欄に分けて JSON に詰める ──────────────────
 * `bank_account` は JSONB でサーバーは中身を検査しない。1個のテキストエリアに
 * JSON を書かせるより、**銀行名・支店名・口座番号・口座名義**の4欄に分けたほうが
 * 打ち間違いが起きにくい（指示書の「なるべくきれいな UX でもよい」を採用）。
 *
 * ── 空欄は null にして送る ──────────────────────────────────
 * `DiscountLimits.tsx` と同じ考え方（「空欄は上限なし＝null。0 は別の意味」）。
 * ここでは「決めていない」を表す null と、空文字を区別して送る。
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { LegalEntity } from './types';

interface EntityDraft {
  issuer_address1: string;
  issuer_address2: string;
  invoice_registration_number: string;
  bank_name: string;
  branch_name: string;
  account_number: string;
  account_holder: string;
  logo_ref: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function fromEntity(e: LegalEntity): EntityDraft {
  const bank = (e.bankAccount ?? {}) as Record<string, unknown>;
  return {
    issuer_address1: e.issuerAddress1 ?? '',
    issuer_address2: e.issuerAddress2 ?? '',
    invoice_registration_number: e.invoiceRegistrationNumber ?? '',
    bank_name: str(bank.bank_name),
    branch_name: str(bank.branch_name),
    account_number: str(bank.account_number),
    account_holder: str(bank.account_holder),
    logo_ref: e.logoRef ?? '',
  };
}

/** 空欄は null にする（0 と違って「決めていない」を表す） */
function blank(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

export function EntityCard({ entity, canEdit }: { entity: LegalEntity; canEdit: boolean }) {
  const qc = useQueryClient();
  const isRevenue = entity.kind === 'revenue';
  const [draft, setDraft] = useState<EntityDraft>(() => fromEntity(entity));

  useEffect(() => setDraft(fromEntity(entity)), [entity]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(fromEntity(entity));
  const set = <K extends keyof EntityDraft>(k: K, v: EntityDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const bankEmpty = !draft.bank_name.trim() && !draft.branch_name.trim()
        && !draft.account_number.trim() && !draft.account_holder.trim();
      const body = {
        issuer_address1: blank(draft.issuer_address1),
        issuer_address2: blank(draft.issuer_address2),
        invoice_registration_number: blank(draft.invoice_registration_number),
        bank_account: bankEmpty ? null : {
          bank_name: blank(draft.bank_name),
          branch_name: blank(draft.branch_name),
          account_number: blank(draft.account_number),
          account_holder: blank(draft.account_holder),
        },
        logo_ref: blank(draft.logo_ref),
      };
      return (await api.put(`/legal-entities/${entity.code}`, body)).data.data as LegalEntity;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['legal-entities'] });
      notifySuccess(`${entity.shortName}の発行者情報を保存しました`, {
        description: 'これから作る見積・請求書から使われます。',
      });
    },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  return (
    <div className="rounded-card flex flex-col overflow-hidden border border-border bg-card">
      <div className="border-b border-border-faint px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-cardtitle">{entity.shortName}</span>
          <span className="rounded-note text-note font-number bg-surface-subtle px-2 py-0.5 font-bold text-muted-foreground">
            {entity.numberPrefix}
          </span>
          <span className={cn(
            'rounded-note text-note px-2 py-0.5 font-bold',
            isRevenue ? 'bg-success-surface text-success' : 'bg-muted text-muted-foreground',
          )}
          >
            {isRevenue ? '売上' : 'コスト'}
          </span>
        </div>
        <p className="text-note mt-1 truncate text-muted-foreground">{entity.name}</p>
        {entity.formerName && (
          <p className="text-note text-muted-foreground">旧: {entity.formerName}</p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 py-3.5">
        {!isRevenue ? (
          <p className="text-sub text-muted-foreground">
            コストセンターです。請求書を発行しないため、発行者情報は使いません。
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-note flex flex-col gap-1">
                住所1
                <Input disabled={!canEdit} value={draft.issuer_address1} placeholder="東京都渋谷区…"
                  onChange={(e) => set('issuer_address1', e.target.value)} />
              </label>
              <label className="text-note flex flex-col gap-1">
                住所2
                <Input disabled={!canEdit} value={draft.issuer_address2} placeholder="ビル名・階数など"
                  onChange={(e) => set('issuer_address2', e.target.value)} />
              </label>
            </div>

            <label className="text-note flex flex-col gap-1">
              登録番号
              <Input disabled={!canEdit} value={draft.invoice_registration_number}
                placeholder="T1234567890123（適格請求書発行事業者登録番号）"
                onChange={(e) => set('invoice_registration_number', e.target.value)} />
            </label>

            <div className="border-t border-border-faint pt-3">
              <p className="text-sub mb-2 font-bold">振込先</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-note flex flex-col gap-1">
                  銀行名
                  <Input disabled={!canEdit} value={draft.bank_name}
                    onChange={(e) => set('bank_name', e.target.value)} />
                </label>
                <label className="text-note flex flex-col gap-1">
                  支店名
                  <Input disabled={!canEdit} value={draft.branch_name}
                    onChange={(e) => set('branch_name', e.target.value)} />
                </label>
                <label className="text-note flex flex-col gap-1">
                  口座番号
                  <Input disabled={!canEdit} inputMode="numeric" value={draft.account_number}
                    onChange={(e) => set('account_number', e.target.value)} />
                </label>
                <label className="text-note flex flex-col gap-1">
                  口座名義
                  <Input disabled={!canEdit} value={draft.account_holder}
                    onChange={(e) => set('account_holder', e.target.value)} />
                </label>
              </div>
            </div>

            <label className="text-note flex flex-col gap-1">
              ロゴ（任意）
              <Input disabled={!canEdit} value={draft.logo_ref} placeholder="画像の URL や BOX の参照"
                onChange={(e) => set('logo_ref', e.target.value)} />
            </label>
          </>
        )}
      </div>

      {isRevenue && canEdit && (
        <div className="border-t border-border-faint px-4 py-3">
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            保存する
          </Button>
        </div>
      )}
    </div>
  );
}
