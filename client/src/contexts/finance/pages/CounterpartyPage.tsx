/**
 * ⑧ 取引先（財務） (v4)
 *
 * **仕入先とパートナーを1画面のタブにまとめました。** 旧実装は
 * `/budget/vendors`（208行）と `/budget/partners`（224行）の2画面で、
 * **中身はほぼ同じ**（名前・担当・電話・メール・もう1項目）でした。
 * 別画面だと、探すときにどちらにいるか思い出す必要があります。
 *
 * ── 請求先（顧客）はここに入れていません ────────────────────
 *
 * モックは仕入先・請求先・パートナーの3つを並べますが、請求先は
 * **案件管理の「取引先マスター」（`/sales/companies`）で編集します**。
 * 同じものを2か所から直せるようにすると、片方だけ直された相手ができます。
 * ここからは**その画面へ送るだけ**にしました。
 *
 * ── 取引額は「今年度」で出します ────────────────────────────
 *
 * モックの「取引額」列です。**期間は今年度（暦年）に決めました** —
 * 全期間にすると、5年前に1回だけ使った相手が上に来て、いま使っている相手が
 * 埋もれます。切り替えは後から足せます（まず1つに決めるのが先）。
 *
 * 額は**仕入と販管費の両方**を足しています。仕入だけだと、家賃や通信費の
 * 相手が「取引ゼロ」に見えます。
 *
 * **パートナーには出しません。** `partners` は仕入にも販管費にも紐づかず
 * （`vendor_id` を持つのは `vendors`）、0 と書くと「取引が無い」と読まれます。
 */
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Truck, Users, Building2, ArrowRight, BarChart3 } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { EmptyState, NoSearchResults, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Pagination } from '@gmo-onair/shared/src/client/ui/pagination';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { CrudFormDialog } from '@gmo-onair/shared/src/client/ui/crud-form-dialog';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/platform/AuthContext';
import { useCrudPage } from '@/hooks/useCrudPage';
import ExcelToolbar from '@/components/ExcelToolbar';
import { LedgerTabs } from './ledger/LedgerTabs';
import { LedgerSearch } from './ledger/LedgerParts';
import { CounterpartyCards } from './counterparty/CounterpartyCards';

export type Kind = 'vendor' | 'partner';

export interface Party {
  id: string;
  name: string;
  contact_name?: string;
  role_title?: string;
  email?: string;
  phone?: string;
  invoice_registration_number?: string;
  specialties?: string[];
  /** 今年度の取引額（仕入 + 販管費）。仕入先だけが持つ */
  ytd_amount?: number | string | null;
  ytd_count?: number | null;
}

interface PartyForm {
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  /** 仕入先＝インボイス登録番号 ／ パートナー＝得意分野（カンマ区切り） */
  extra: string;
}

const EMPTY: PartyForm = { name: '', contact_name: '', email: '', phone: '', extra: '' };

const DEF: Record<Kind, {
  label: string; endpoint: string; queryKey: string; icon: JSX.Element;
  extraLabel: string; extraHint: string; searchPh: string; excelName: string;
}> = {
  vendor: {
    label: '仕入先', endpoint: '/vendors', queryKey: 'vendors',
    icon: <Truck className="h-4 w-4" aria-hidden="true" />,
    extraLabel: 'インボイス登録番号', extraHint: '例 T1234567890123（適格請求書発行事業者の番号）',
    searchPh: '仕入先名で検索', excelName: '仕入先',
  },
  partner: {
    label: 'パートナー', endpoint: '/partners', queryKey: 'partners',
    icon: <Users className="h-4 w-4" aria-hidden="true" />,
    extraLabel: '得意分野', extraHint: 'カンマ区切り。例 映像, スイッチング',
    searchPh: 'お名前で検索', excelName: 'パートナー',
  },
};

/** 相手の「もう1項目」を取り出す。種類で入っている列が違う */
function extraOf(p: Party, kind: Kind): string {
  if (kind === 'vendor') return p.invoice_registration_number ?? '';
  return (p.specialties ?? []).join(', ');
}

export default function CounterpartyPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  const isMobile = useIsMobile();

  const kind: Kind = params.get('tab') === 'partner' ? 'partner' : 'vendor';
  const def = DEF[kind];

  const setKind = (k: Kind) => {
    const next = new URLSearchParams(params);
    if (k === 'partner') next.set('tab', 'partner'); else next.delete('tab');
    setParams(next, { replace: true });
  };

  // **タブごとに別のフックを持たない。** `endpoint` を切り替えるだけにする
  // （2つ持つと、片方だけ検索が残る・件数が古いままになる）
  const crud = useCrudPage<Party>({ endpoint: def.endpoint, queryKey: [def.queryKey] });

  const form = useForm<PartyForm>({ defaultValues: EMPTY });

  useEffect(() => {
    const it = crud.editingItem;
    form.reset(it
      ? {
          name: it.name || '',
          contact_name: it.contact_name || it.role_title || '',
          email: it.email || '',
          phone: it.phone || '',
          extra: extraOf(it, kind),
        }
      : EMPTY);
  }, [crud.editingItem, kind, form]);

  const items = useMemo(() => crud.items ?? [], [crud.items]);

  const submit = form.handleSubmit((v) => {
    // 送る列が種類で違う。**サーバーが知らない列を送らない**
    const payload: Record<string, unknown> = {
      name: v.name, email: v.email || null, phone: v.phone || null,
    };
    if (kind === 'vendor') {
      payload.contact_name = v.contact_name || null;
      payload.invoice_registration_number = v.extra || null;
    } else {
      payload.role_title = v.contact_name || null;
      payload.specialties = v.extra ? v.extra.split(',').map((x) => x.trim()).filter(Boolean) : [];
    }
    crud.save.mutate(payload);
  });

  const onDelete = async (p: Party) => {
    const ok = await confirmAction({
      title: `「${p.name}」を削除しますか`,
      description: `${def.label}の登録を削除します。過去の仕入や予定に付いている記録は残りますが、次から選べなくなります。`,
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (ok) crud.remove.mutate(p.id);
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="取引先"
        sub="仕入先とパートナーをここで管理します。請求先（顧客）は案件管理の「取引先マスター」です"
        primaryAction={
          canEdit ? (
            <Button type="button" onClick={crud.openAdd}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />{def.label}を追加
            </Button>
          ) : undefined
        }
      >
        {/*
          **スマホでは道具を出しません**（M10）。この画面をスマホから開けるように
          したのは「電話の前に相手を調べる」ためで、
          ・Excel の取込・出力 … 書き出したファイルを開く相手が端末に無い
          ・仕入先集計 … **行き先が PC 専用**なので、押すと案内に着いて行き止まりになる
          どちらも押せても何も片づかないので、外します。
        */}
        {!isMobile && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <ExcelToolbar resource={def.endpoint} name={def.excelName} queryKey={[def.queryKey]} />
            {kind === 'vendor' && (
              <Button type="button" variant="outline" onClick={() => navigate('/budget/reports/vendors')}>
                <BarChart3 className="mr-1.5 h-4 w-4" aria-hidden="true" />仕入先集計
              </Button>
            )}
          </div>
        )}
      </PageHeader>

      <LedgerTabs
        value={kind}
        onChange={(k) => setKind(k as Kind)}
        items={[
          { key: 'vendor', label: '仕入先', icon: DEF.vendor.icon },
          { key: 'partner', label: 'パートナー', icon: DEF.partner.icon },
        ]}
      />

      {/*
        請求先はここで編集しない。**同じものを2か所から直せるようにしない**。

        **スマホでは押せる形にしません**（M10）。行き先の「取引先マスター」は
        PC 専用のままなので、押しても案内に着くだけです。ここで要るのは
        「ここには居ません」と分かることなので、1行の注記に落とします。
      */}
      {isMobile ? (
        <p className="text-note text-muted-foreground">
          <strong className="font-bold">請求先（顧客）はここにはありません。</strong>
          {' '}案件管理の「取引先マスター」で管理しています（PC で開いてください）。
        </p>
      ) : (
        <button
          type="button"
          onClick={() => navigate('/sales/companies')}
          className="rounded-card min-h-tap flex items-center gap-2.5 border border-border px-4 py-2.5 text-left hover:border-primary-border-strong"
        >
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-sub min-w-0 flex-1 text-secondary-foreground">
            <strong className="font-bold">請求先（顧客）は案件管理の「取引先マスター」で管理します。</strong>
            {' '}同じ相手を2か所から直せるようにすると、片方だけ直された相手ができます。
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        </button>
      )}

      <LedgerSearch value={crud.search} onChange={crud.setSearch} placeholder={def.searchPh} />

      {crud.isError ? (
        <ErrorPanel title={`${def.label}を読み込めませんでした`} error={crud.error} onRetry={() => crud.refetch()} />
      ) : crud.isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : items.length === 0 ? (
        crud.appliedSearch ? (
          <NoSearchResults keyword={crud.appliedSearch} onClearFilters={() => crud.setSearch('')} />
        ) : (
          <EmptyState
            title={`まだ${def.label}がありません`}
            description={`「${def.label}を追加」から登録すると、仕入や予定の登録で選べるようになります。`}
          />
        )
      ) : (
        <>
          {isMobile ? (
            <CounterpartyCards
              items={items}
              kind={kind}
              extraLabel={def.extraLabel}
              canEdit={canEdit}
              onEdit={crud.openEdit}
              onDelete={onDelete}
              extraOf={extraOf}
            />
          ) : (
            <div className="flex flex-col">
              {/*
                **固定列は中身が入る最小の段まで落とす。** 主キーである社名が
                伸びる `RowMain` にしか幅が残らないので、固定列を広く取ると
                1280px でも社名が 148px（「ケータリングデリシ…」）まで潰れる。
                担当者（氏名 ≒ 6字）・電話（12字 ≒ 110px）・インボイス登録番号
                （14字 ≒ 130px）はいずれも中身より広かった。
              */}
              <RowHeader>
                <RowMain>{kind === 'vendor' ? '仕入先' : 'お名前'}</RowMain>
                <RowSlot w={128}>{kind === 'vendor' ? '担当者' : '役割'}</RowSlot>
                <RowSlot w={128}>電話</RowSlot>
                <RowSlot w={160}>{def.extraLabel}</RowSlot>
                {/* 取引額は仕入先だけ。**パートナーの列に 0 を並べない** */}
                {kind === 'vendor' && <RowSlot w={128} align="right">今年度の取引</RowSlot>}
                <RowSlot w={96}>{canEdit ? '操作' : ''}</RowSlot>
              </RowHeader>

              {items.map((p) => (
                <Row key={p.id} interactive={canEdit} onClick={canEdit ? () => crud.openEdit(p) : undefined}>
                  <RowMain>
                    <RowTitle>{p.name}</RowTitle>
                    <RowSub>{p.email || 'メールなし'}</RowSub>
                  </RowMain>
                  <RowSlot w={128}>
                    <span className="truncate text-sub text-secondary-foreground">
                      {p.contact_name || p.role_title || '—'}
                    </span>
                  </RowSlot>
                  <RowSlot w={128}>
                    <span className="font-number truncate text-sub text-secondary-foreground">{p.phone || '—'}</span>
                  </RowSlot>
                  <RowSlot w={160}>
                    <span className="truncate text-sub text-muted-foreground">{extraOf(p, kind) || '—'}</span>
                  </RowSlot>
                  {kind === 'vendor' && (
                    Number(p.ytd_amount ?? 0) > 0
                      ? <MoneyCell width={128} value={Number(p.ytd_amount)} className="text-sub" />
                      : (
                        <RowSlot w={128} align="right">
                          {/* **0 円と「今年は取引なし」は別物。** 0 と書くと 0 円の取引があるように読める */}
                          {/* ⚠️ `text-fg-disabled` は白地で 2.61:1 しか無く、読ませる文字には使わない
                              決めごと（`shared/CLAUDE.md`）。ここは実際の値を伝える文字なので
                              `text-muted-foreground` に直した（`verify:ui` の「薄すぎる文字」で検出）。 */}
                          <span className="text-sub-sm text-muted-foreground">今年はなし</span>
                        </RowSlot>
                      )
                  )}
                  <RowSlot w={96}>
                    {canEdit && (
                      <span className="flex gap-0.5">
                        <Button
                          type="button" variant="ghost" size="icon" aria-label="編集"
                          onClick={(e) => { e.stopPropagation(); crud.openEdit(p); }}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button" variant="ghost" size="icon" aria-label="削除" className="text-destructive"
                          onClick={(e) => { e.stopPropagation(); onDelete(p); }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </span>
                    )}
                  </RowSlot>
                </Row>
              ))}
            </div>
          )}

          <Pagination
            page={crud.page}
            totalPages={crud.pagination?.totalPages ?? 1}
            total={crud.pagination?.total ?? 0}
            onChange={crud.setPage}
            disabled={crud.isLoading}
          />
        </>
      )}

      <CrudFormDialog
        crud={crud}
        title={{ create: `${def.label}を追加`, edit: `${def.label}を編集` }}
        description={{
          create: `${def.label}を登録すると、仕入や予定の登録で選べるようになります。`,
          edit: '登録済みの内容を直します。',
        }}
        onSubmit={submit}
      >
        <div className="space-y-1">
          <Label>{kind === 'vendor' ? '仕入先名' : 'お名前'} *</Label>
          <Input {...form.register('name', { required: true })} />
        </div>
        <div className="space-y-1">
          <Label>{kind === 'vendor' ? '担当者' : '役割'}</Label>
          <Input {...form.register('contact_name')} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>メール</Label>
            <Input type="email" {...form.register('email')} />
          </div>
          <div className="space-y-1">
            <Label>電話</Label>
            <Input {...form.register('phone')} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>{def.extraLabel}</Label>
          <Input {...form.register('extra')} />
          <p className="text-note text-muted-foreground">{def.extraHint}</p>
        </div>
      </CrudFormDialog>
    </div>
  );
}
