/**
 * ④ プロジェクト新規作成 (v4 GPM)
 *
 * ── モックどおり5段 ────────────────────────────────────────
 *
 * 基本情報 → 標準工程 → 着手日と工程 → 体制（組織図） → メンバー・書類。
 * 4段目と5段目は**同じ入力**（体制に入れる人）を扱うので1つの部品にし、
 * 5段目は「確かめて作る」段にしてあります。
 *
 * ── 人はプロジェクトを作ってから登録する ────────────────────
 *
 * `gpm_members` は `project_id` が必須なので、**作る前には保存できません**。
 * 入力は画面で貯めておき、「作る」を押したときに
 * **プロジェクト → 人 の順**で登録します。
 *
 * **人の登録で失敗してもプロジェクトは残します。** 作り直させるほうが害が大きく、
 * 人はあとから体制タブで足せます。そのときは「何人入らなかったか」を出します。
 *
 * ── 書類（BOX）はここで作らない ─────────────────────────────
 *
 * 押すと**本番の BOX に実際にフォルダができ、ONAiR からは消せません**。
 * 新規作成の流れに混ぜると、名前を間違えたまま作ってしまいます。
 * **作ったあとの「書類」タブ**で、何ができるかを見せてから押してもらいます。
 *
 * ── 段を「進む」だけにしない ────────────────────────────────
 *
 * 上の番号は押して直接行けます。ひな形を選び直したあとに着手日を見に行く、が
 * 普通に起きるので、順番に進むしかない形にすると戻る操作が増えます。
 * **作るのは最後の段でなくても押せます**（名前と依頼元さえ入っていればよい）。
 */
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useGpmCustomers, useGpmTemplates, useGpmUsers, useInvalidateGpm } from '../queries';
import type { GpmProjectDetail } from '../types';
import { BasicStep, type BasicValues } from './projectForm/BasicStep';
import { TemplateStep } from './projectForm/TemplateStep';
import { PreviewStep } from './projectForm/PreviewStep';
import { OrgStep, type DraftMember } from './projectForm/OrgStep';

const STEPS = [
  { n: 1, label: '基本情報' },
  { n: 2, label: 'ひな形を選ぶ' },
  { n: 3, label: '着手日と工程の確認' },
  { n: 4, label: '体制（組織図）' },
  { n: 5, label: 'メンバー・書類' },
] as const;

export default function GpmProjectFormPage() {
  const navigate = useNavigate();
  const invalidate = useInvalidateGpm();
  const [step, setStep] = useState(1);

  const [basic, setBasic] = useState<BasicValues>({
    name: '', kind: 'self_build', customerId: '', pmCompany: '', pmUserId: '',
    stage: 'a_won', notes: '',
  });
  const [templateId, setTemplateId] = useState('');
  const [startedOn, setStartedOn] = useState('');
  /** 4段目・5段目で貯める体制。**作ったあとに登録する**（id がまだ無いため） */
  const [members, setMembers] = useState<DraftMember[]>([]);

  const templates = useGpmTemplates();
  const users = useGpmUsers();
  const customers = useGpmCustomers();

  const template = useMemo(
    () => templates.data?.find((t) => t.id === templateId),
    [templates.data, templateId],
  );

  const create = useMutation({
    mutationFn: async () =>
      (await api.post<{ data: GpmProjectDetail }>('/gpm/projects', {
        name: basic.name.trim(),
        gpm_kind: basic.kind,
        // **自社構築と「未定」は送らない** — サーバーが自社の行に寄せる
        customer_id: basic.kind === 'group_order' ? (basic.customerId || null) : null,
        pm_company: basic.pmCompany.trim() || null,
        assigned_to: basic.pmUserId || null,
        stage: basic.stage,
        notes: basic.notes.trim() || null,
        started_on: startedOn || null,
        gpm_template_id: templateId || null,
      })).data.data,
    onSuccess: async (row) => {
      /**
       * 体制を続けて登録する。**1人ずつ**送るのは、途中で失敗しても
       * そこまでの人は残るようにするため（まとめて送って全部落とすより、
       * 「3人のうち2人入りました」のほうが直しやすい）。
       */
      let failed = 0;
      for (const m of members) {
        try {
          await api.post(`/gpm/projects/${row.id}/members`, {
            name: m.name, side: m.side, tier: m.tier,
            group_label: m.group_label || null, role: m.role || null,
            org: m.org || null, email: m.email || null, badge: m.badge || null,
          });
        } catch { failed += 1; }
      }

      invalidate(row.id);
      notifySuccess('プロジェクトを作りました', {
        description: [
          templateId
            ? 'ひな形から工程とタスクを入れました。ここから直せます。'
            : '工程はまだありません。詳細画面から追加できます。',
          members.length > 0 && failed === 0 ? `体制に ${members.length}名 を入れました。` : '',
          // **入らなかった人を黙らない。** 気づかないと体制が欠けたまま進む
          failed > 0 ? `体制の ${failed}名 は入れられませんでした。体制タブから足してください。` : '',
        ].filter(Boolean).join(' '),
      });
      navigate(`/gpm/projects/${row.id}`);
    },
    onError: (err) => notifyApiError('プロジェクトを作れませんでした', err),
  });

  /** 足りない項目。**押せなくするのではなく名指しする** */
  const missing = [
    basic.name.trim() ? null : 'プロジェクト名',
    // **自社構築に依頼元は要らない**（相手がいない）。グループ受託だけ名指しする
    basic.kind === 'group_order' && !basic.customerId ? '依頼元' : null,
  ].filter((m): m is string => m !== null);

  return (
    <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <PageHeader
        title="プロジェクトを作る"
        sub="発注が確定してから立ち上げます。売れるかどうかを追う段階のものはここに入りません（案件管理で扱います）"
        primaryAction={
          <Button onClick={() => create.mutate()} disabled={missing.length > 0 || create.isPending}>
            {create.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Check className="mr-2 h-4 w-4" aria-hidden="true" />}
            作る
          </Button>
        }
      >
        <Button variant="outline" onClick={() => navigate('/gpm/projects')}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />キャンセル
        </Button>
      </PageHeader>

      {/* 段。横に入りきらないときは折り返さず横スクロール（一覧のチップと同じ） */}
      <div className="flex gap-2 overflow-x-auto">
        {STEPS.map((s) => {
          const on = s.n === step;
          const done = s.n < step;
          return (
            <button
              key={s.n}
              type="button"
              aria-current={on ? 'step' : undefined}
              onClick={() => setStep(s.n)}
              className={cn(
                'min-h-tap rounded-control-lg flex shrink-0 items-center gap-2 border px-3.5 lg:min-h-[40px]',
                on ? 'border-primary-border-strong bg-primary-surface-weak' : 'border-border bg-card hover:bg-muted',
              )}
            >
              <span
                className={cn(
                  'text-badge font-number flex h-6 w-6 items-center justify-center rounded-chip',
                  on ? 'bg-primary text-primary-foreground'
                    : done ? 'bg-success-surface text-success' : 'bg-muted text-muted-foreground',
                )}
              >
                {s.n}
              </span>
              <span className={cn('text-sub', on ? 'font-bold text-primary' : 'text-muted-foreground')}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {step === 1 && (
        <BasicStep
          values={basic}
          onChange={(p) => setBasic((v) => ({ ...v, ...p }))}
          users={users.data ?? []}
          customers={customers.data ?? []}
        />
      )}
      {step === 2 && (
        <TemplateStep
          templates={templates.data ?? []}
          loading={templates.isLoading}
          value={templateId}
          onChange={setTemplateId}
        />
      )}
      {step === 3 && (
        <PreviewStep
          startedOn={startedOn}
          onStartedOn={setStartedOn}
          template={template}
          templateName={template?.name ?? null}
        />
      )}
      {(step === 4 || step === 5) && (
        <OrgStep members={members} onChange={setMembers} />
      )}

      <div className="flex flex-wrap items-center gap-3">
        {step > 1 && (
          <Button variant="outline" onClick={() => setStep(step - 1)}>前に戻る</Button>
        )}
        {step < STEPS.length && (
          <Button variant="outline" onClick={() => setStep(step + 1)}>
            次へ（{STEPS[step].label}）
          </Button>
        )}
        {missing.length > 0 && (
          <p className="text-sub text-destructive">
            {missing.join(' と ')} が入っていないので、まだ作れません（ステップ1）
          </p>
        )}
      </div>

      <p className="text-note text-muted-foreground">
        <strong className="font-bold">作るのは最後の段でなくても押せます</strong>
        （プロジェクト名と依頼元さえ入っていればよい）。
        体制は空のままでも作れて、あとから体制タブで足せます。
      </p>
    </div>
  );
}
