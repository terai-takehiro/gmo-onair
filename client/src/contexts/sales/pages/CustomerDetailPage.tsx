/**
 * お客様の詳細（顧客360）(v4)
 *
 * 顧客360 (v2.9.218+) — お客様単位で全接点を1画面に集約。「この会社と今どうなっているか」を
 * 3秒で把握し、次に会う前に文脈を復元できる。上から: 取引実績サマリー → 統合タイムライン
 * (この場でインライン追記可能) → 案件リスト → 年次売上。**中身（見せている情報・API）は
 * v4化の前後で1つも変えていない** — v4のRow/Sheet/PageHeader等のトークンに載せ替えた
 * だけ (docs/v4-native-ui-audit-2026-08-20.md「お客様の詳細」の詳細監査結果)。
 *
 * ── PC / スマホの作り分け ────────────────────────────────────
 *
 * 参考にしたのは取引先マスター（`CompanyListPage.tsx` ＋ `company/CompanyCards.tsx`）
 * と案件詳細（`ProjectDetailPage.tsx` ＋ `projectDetail/overviewParts.tsx` の `Fact`）:
 * **薄い親（この画面）が `useIsMobile()` を1回だけ呼び**、各節（`TimelineSection` /
 * `ProjectsSection`）へ `mobile` を渡す。節の中で PC は `Row`/`RowMain`/`RowSlot`
 * の行表示（macOS のアプリのような密な一覧）、スマホは1件＝1枚のカード積み
 * （`company/CompanyCards.tsx` と同じ組み立て・iOS のアプリのような手触り）に
 * 出し分ける。**行を縮めているのではない** — 375px 幅で「案件・顧客のひも付け」
 * 列を隠すだけだった旧版の穴（監査で指摘）を、情報を作り直して埋めている。
 *
 * ── 「やり取りを記録」はダイアログに載せ替えた ──────────────────
 *
 * 旧実装は見出しの下に開閉するインラインフォームだったが、`<FormDialog>`
 * （PC=中央ダイアログ・スマホ=下シート）へ載せ替えた（`ActivityFormDialog.tsx`）。
 * `<PageHeader primaryAction>` に渡すと、スマホでは共通シェルの差し込み口
 * （下タブの上・幅いっぱい48px）に自動で置かれる。**送る中身は1つも変えていない**。
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, Mail, MapPin, Phone, Plus, Sparkles, User } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonKpi, SkeletonRows, ErrorPanel, NotFoundPanel } from '@gmo-onair/shared/src/client/states';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { useNextActionActions } from './activityLog/useNextActionActions';
import { SummaryTiles } from './customerDetail/SummaryTiles';
import { TimelineSection } from './customerDetail/TimelineSection';
import { ProjectsSection } from './customerDetail/ProjectsSection';
import { YearlySection } from './customerDetail/YearlySection';
import { ActivityFormDialog } from './customerDetail/ActivityFormDialog';
import type { CustomerOverview } from './customerDetail/types';

const COMPANIES_URL = '/sales/companies?role=customer';

export default function CustomerDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery<CustomerOverview>({
    queryKey: ['customer-overview', id],
    queryFn: async () => (await api.get(`/customers/${id}/overview`)).data.data,
    enabled: !!id,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });

  // **同じ「完了／延期」の口を営業活動記録の一覧と共有する**（`useNextActionActions.ts`）。
  // 顧客360が先にこの形（完了は即実行・延期は「明日／1週間」）を使い始めた画面なので、
  // 挙動そのものは変えない。追加で `customer-overview` も落とすのは、
  // 完了・延期を押した直後に上の「未完了アクション」件数が古いまま残らないようにするため
  const actions = useNextActionActions([['customer-overview', id], ['dashboard']]);

  const openProject = (projectId: string) => navigate(`/sales/projects/${projectId}`);

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <Button variant="ghost" size="sm" className="w-fit gap-1 -ml-2 text-muted-foreground" onClick={() => navigate(COMPANIES_URL)}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        取引先マスターへ
      </Button>

      {isError ? (
        (error as { response?: { status?: number } })?.response?.status === 404 ? (
          <NotFoundPanel path={`/sales/customers/${id}`} home={{ label: '取引先マスターへ戻る', onGo: () => navigate(COMPANIES_URL) }} />
        ) : (
          <ErrorPanel title="お客様の情報を読み込めませんでした" error={error} onRetry={() => refetch()} />
        )
      ) : isLoading || !data ? (
        <Delayed>
          <div className="flex flex-col gap-4">
            <SkeletonKpi count={4} />
            <SkeletonRows rows={5} />
          </div>
        </Delayed>
      ) : (
        <CustomerDetailBody
          data={data}
          mobile={isMobile}
          onRecordActivity={() => setFormOpen(true)}
          onOpenProject={openProject}
          actions={actions}
        />
      )}

      {data && (
        <ActivityFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          customerId={data.customer.id || id}
          customerQueryId={id}
          projects={data.projects}
        />
      )}
    </div>
  );
}

function CustomerDetailBody({
  data, mobile, onRecordActivity, onOpenProject, actions,
}: {
  data: CustomerOverview;
  mobile: boolean;
  onRecordActivity: () => void;
  onOpenProject: (id: string) => void;
  actions: ReturnType<typeof useNextActionActions>;
}) {
  const c = data.customer;

  return (
    <>
      <PageHeader
        icon={<Building2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.name}
            {!!c.is_ai_created && (
              <span
                className="text-badge inline-flex shrink-0 items-center gap-0.5 rounded-badge-xs bg-ai-surface px-1.5 py-0.5 font-bold text-ai"
                title={c.ai_requested_by ? `AI が登録しました（指示: ${c.ai_requested_by}）` : 'AI が登録しました'}
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />AI作成
              </span>
            )}
          </span>
        }
        primaryAction={
          <Button onClick={onRecordActivity}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />やり取りを記録
          </Button>
        }
      />

      {/* 連絡先。値が無い項目は出さない（原文どおり） */}
      {(c.contact_name || c.email || c.phone || c.address) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sub text-muted-foreground">
          {c.contact_name && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" aria-hidden="true" />{c.contact_name}</span>}
          {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" aria-hidden="true" />{c.email}</span>}
          {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" aria-hidden="true" />{c.phone}</span>}
          {c.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{c.address}</span>}
        </div>
      )}

      <SummaryTiles summary={data.summary} />

      <TimelineSection items={data.timeline} actions={actions} mobile={mobile} onOpenProject={onOpenProject} />
      <ProjectsSection items={data.projects} mobile={mobile} onOpen={onOpenProject} />
      <YearlySection items={data.sales_by_year} />
    </>
  );
}
