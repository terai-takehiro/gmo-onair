/**
 * ④ プロジェクト新規作成 (v4 GPM)
 *
 * ── モックどおり5段 ────────────────────────────────────────
 *
 * 基本情報 → 標準工程 → 着手日と工程 → 体制（組織図） → 確かめて作る。
 *
 * ⚠️ **5段目は以前「メンバー・書類」という名前で、4段目とまったく同じ
 * `OrgStep` を描いていた**（押しても1ピクセルも変わらない不具合）。
 * PR③（`gpm-format-alignment.html` 項目18）で直し、5段目を実際に
 * **入れた内容の確認**（`ReviewStep`）にした。体制は4段目だけで完結する。
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
 *
 * ── 足りない項目を名指しする（PR③・項目15）───────────────────
 *
 * 「作る」ボタンを押せなくするだけでは、何が足りないかを探すことになる。
 * 案件作成（`sales/pages/projectNew/NewProjectDialog.tsx`）と同じく、
 * **段の上に黄色い帯**を出し、**文面をボタンの名前（「作る」）に合わせる**。
 * どの段にいても見えるよう、段タブのすぐ下に置く（足りない項目そのものは
 * 1段目にしか無いが、「作る」はどの段からでも押せるため）。
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
import { ReviewStep } from './projectForm/ReviewStep';

const STEPS = [
  { n: 1, label: '基本情報' },
  { n: 2, label: '工程テンプレートを選ぶ' },
  { n: 3, label: '着手日と工程の確認' },
  { n: 4, label: '体制（組織図）' },
  { n: 5, label: '確かめて作る' },
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
            ? '工程テンプレートから工程とタスクを入れました。ここから編集できます。'
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

  const customerName = useMemo(
    () => customers.data?.find((c) => c.id === basic.customerId)?.name ?? null,
    [customers.data, basic.customerId],
  );
  const pmUserName = useMemo(
    () => users.data?.find((u) => u.id === basic.pmUserId)?.name ?? null,
    [users.data, basic.pmUserId],
  );

  return (
    <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <PageHeader
        title="プロジェクトを作成"
        // **見出しの左に戻るボタン**（PR③・項目19）。案件作成の `EditHeader.tsx` と
        // 同じ形——以前は右側の「キャンセル」ボタンだけが戻る手段だった
        icon={(
          <button
            type="button"
            onClick={() => navigate('/gpm/projects')}
            aria-label="プロジェクト一覧に戻る"
            title="プロジェクト一覧に戻る"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control-lg border border-border hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
          </button>
        )}
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
          キャンセル
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

      {/*
        **足りない項目を名指しする黄色い帯**（項目15）。「作る」がどの段からでも
        押せるので、段タブのすぐ下・どの段でも見える位置に置く。
        文面はボタンと同じ言い方（「作る」）にそろえる。
      */}
      {missing.length > 0 && (
        <p className="rounded-note border border-warning-border bg-warning-surface px-3.5 py-2 text-sub text-warning">
          {missing.join(' ・ ')} が入っていないので、まだ作れません
        </p>
      )}

      {step === 1 && (
        <BasicStep
          values={basic}
          onChange={(p) => setBasic((v) => ({ ...v, ...p }))}
          users={users.data ?? []}
          customers={customers.data ?? []}
          // 着手日は1段目と3段目の**両方から同じ state を触る**。
          // 3段目は「その着手日で工程がこう並ぶ」を見ながら直す場所として残す
          startedOn={startedOn}
          onStartedOn={setStartedOn}
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
      {step === 4 && (
        <OrgStep members={members} onChange={setMembers} />
      )}
      {step === 5 && (
        <ReviewStep
          basic={basic}
          customerName={customerName}
          pmUserName={pmUserName}
          templateName={template?.name ?? null}
          template={template}
          startedOn={startedOn}
          members={members}
        />
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
      </div>

      <p className="text-note text-muted-foreground">
        <strong className="font-bold">作るのは最後の段でなくても押せます</strong>
        （プロジェクト名と依頼元さえ入っていればよい）。
        体制は空のままでも作れて、あとから体制タブで足せます。
      </p>
    </div>
  );
}
