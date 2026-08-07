/**
 * ④ 受付 ／ 案件の種類をきめる（スマホ・モックの端末枠 4枚目）
 *
 * ── モックの端末枠 ──────────────────────────────────────────
 *
 *   `2 / 3` の段表示 ／
 *   **「ここで標準工程テンプレートが決まります。あとから変えられます」** ／
 *   種類を選ぶ ／ `この種類で進む`（下端固定）
 *
 * ── なぜ段に分けるのか ──────────────────────────────────────
 *
 * PC の登録は**16項目の1枚もの**です。375px で縦に積むと、
 * 入力欄が16個続く長い巻物になり、**どこまで入れたか分からなくなります**。
 * モックは3段に切ってあり、1段に訊くのは「答えられる粒」だけです:
 *
 *   1 / 3  だれの・なんの話か（お客様・案件名）
 *   2 / 3  **どういう案件か**（種類 ＝ モックの ④ そのもの）
 *   3 / 3  いつ・いまどこ・だれが（実施日・ステージ・社内の担当）
 *
 * ── 「標準工程テンプレートが決まります」は書きません ────────────
 *
 * モックはこの1行を出しますが、**標準工程テンプレートはまだありません**
 * （`docs/v4-progress.md` の ⑦ は 🆕・社内で工程を整理中のため後回し）。
 * 決まらないものが「決まります」と書いてあると、
 * 案件を作った人が**工程が入っているつもりで待ちます**。
 *
 * 代わりに**いま本当に決まること**を書きます — 案件の種類は
 * `gls_category`（A=スタジオ / B=ビジネス）を決め、それで
 * **GLS 番号の採り方と、回（エピソード）を持てるかが変わります**。
 * モックの「あとから変えられます」は本当なので、そのまま残します。
 *
 * ── 送るところは PC と同じ ────────────────────────────────
 *
 * `useCreateProject`（`POST /projects` ＋ 引き合いへの書き戻し）を共用します。
 * 訊く順番だけが違います。**写すと、列が増えたとき片方だけ送らなくなります。**
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Info } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { ProjectStageLabels, ProjectTypeLabels, getProjectCategory, type ProjectStage, type ProjectType } from '@/types';
import { CREATABLE_STAGES, EMPTY_NEW_PROJECT, RECURRENCE_LABEL, type NewProjectValues } from './fields';
import { useInquirySeed } from './fromInquiry';
import { useCreateProject } from './useCreateProject';

interface Named { id: string; name: string; short_name?: string | null }

/**
 * 種類の並び。**モックの2群（ライブ / 収録）に、実際にある7種類を当てました。**
 *
 * モックは各項目に「工程 18」「使用中 12」を出しますが、
 * **工程テンプレートの表がまだ無い**ので数字は出しません（作り話をしない）。
 * 出すのは**いま本当に効くこと** — 有観客かどうか・放送/配信があるか・
 * そして **A（回を持てる）か B（持てない）か**です。
 */
const KIND_GROUPS: { group: string; note: string; items: { type: ProjectType; aud: string; cast: string }[] }[] = [
  {
    group: 'ライブ', note: 'その場で進行するもの',
    items: [
      { type: 'offline_event', aud: '有観客', cast: '放送・配信なし' },
      { type: 'hybrid_event', aud: '有観客', cast: '放送・配信あり' },
      { type: 'live_broadcast', aud: '無観客', cast: '放送・配信あり' },
    ],
  },
  {
    group: '収録', note: 'あとで使う映像をつくるもの',
    items: [{ type: 'recording', aud: '無観客', cast: '収録のみ' }],
  },
  {
    group: 'そのほか', note: '制作を伴わないもの（回を持ちません）',
    items: [
      { type: 'gmo_project', aud: '—', cast: 'グループ内' },
      { type: 'consulting', aud: '—', cast: '相談・助言' },
      { type: 'other', aud: '—', cast: '—' },
    ],
  },
];

const STEPS = ['だれの・なんの話か', 'どういう案件か', 'いつ・いまどこ・だれが'];

export function MobileNewProject() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);

  const [v, setV] = useState<NewProjectValues>(() => ({
    ...EMPTY_NEW_PROJECT,
    intake_channel: params.get('intake') ?? '',
  }));
  const set = <K extends keyof NewProjectValues>(k: K, value: NewProjectValues[K]) =>
    setV((f) => ({ ...f, [k]: value }));

  const { data: customersData } = useQuery({
    queryKey: ['customers-for-new-project'],
    queryFn: async () => (await api.get('/customers?limit=500')).data,
  });
  const customers: Named[] = customersData?.data ?? [];

  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => (await api.get('/users?limit=200')).data,
  });
  const users: Named[] = usersData?.data ?? [];

  const inquiryId = params.get('inquiry');
  useInquirySeed(inquiryId, setV);
  const create = useCreateProject(v, inquiryId);

  /**
   * その段で足りないもの。**押せなくするだけにしない** —
   * 押せないボタンだけだと「何が足りないのか」を探すことになります。
   */
  const missing = useMemo(() => {
    if (step === 0) return [v.customer_id ? null : 'お客様', v.name.trim() ? null : '案件名'].filter(Boolean) as string[];
    if (step === 1) return v.project_type ? [] : ['案件の種類'];
    return [v.assigned_to ? null : '社内の担当'].filter(Boolean) as string[];
  }, [step, v]);

  const last = step === STEPS.length - 1;
  const go = () => {
    if (missing.length > 0) return;
    if (last) create.mutate();
    else setStep((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-3.5 p-3">
      <PageHeader
        title="案件をつくる"
        sub={`${step + 1} / ${STEPS.length} ・ ${STEPS[step]}`}
        primaryAction={
          <Button className="w-full sm:w-auto" disabled={missing.length > 0 || create.isPending} onClick={go}>
            {last ? <Check className="mr-1.5 h-4 w-4" aria-hidden="true" /> : null}
            {last ? '案件をつくる' : step === 1 ? 'この種類で進む' : 'つぎへ'}
            {!last && <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />}
          </Button>
        }
      />

      {/* 段の目印。**押して飛べるようにしない** — 前の段が空のまま先に進めてしまう */}
      <div className="flex gap-1.5" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span key={s} className={cn('h-1 flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-border')} />
        ))}
      </div>

      {step === 0 && (
        <div className="flex flex-col gap-3.5">
          <div>
            <Label>お客様 <span className="text-destructive">*</span></Label>
            <div className="mt-1">
              <SearchableSelect
                value={v.customer_id}
                onChange={(id) => set('customer_id', id)}
                options={customers.map((c) => ({ value: c.id, label: c.short_name || c.name, subLabel: c.short_name ? c.name : undefined }))}
                placeholder="お客様をさがす"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="m-name">案件名 <span className="text-destructive">*</span></Label>
            <Input
              id="m-name"
              value={v.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="例）2026年 春の新製品発表会"
              className="mt-1 h-11"
            />
          </div>
          <div>
            <Label htmlFor="m-contact">ご担当</Label>
            <Input
              id="m-contact"
              value={v.contact_name}
              onChange={(e) => set('contact_name', e.target.value)}
              placeholder="お客様側の担当者"
              className="mt-1 h-11"
            />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-3.5">
          {KIND_GROUPS.map((g) => (
            <section key={g.group} className="flex flex-col gap-2">
              <h2 className="text-cardtitle flex flex-wrap items-baseline gap-2">
                {g.group}
                <span className="text-note font-normal text-muted-foreground">{g.note}</span>
              </h2>
              {g.items.map((it) => {
                const on = v.project_type === it.type;
                return (
                  <button
                    key={it.type}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      set('project_type', it.type);
                      // **A / B は種類から導く。** 別々に持たせると食い違い、
                      // GLS の採り方と回を持てるかが噛み合わなくなる
                      set('gls_category', getProjectCategory(it.type));
                    }}
                    className={cn(
                      'rounded-card flex w-full items-start gap-3 border p-3.5 text-left',
                      on ? 'border-primary-border-strong bg-primary-surface-weak' : 'border-border bg-card',
                    )}
                  >
                    <span className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                    )}>
                      {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-list block">{ProjectTypeLabels[it.type]}</span>
                      <span className="text-note mt-0.5 block text-muted-foreground">
                        {[it.aud, it.cast].filter((x) => x !== '—').join(' ・ ') || 'そのほか'}
                        {getProjectCategory(it.type) === 'A' ? ' ／ 回を持てます' : ' ／ 回は持ちません'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </section>
          ))}

          <p className="rounded-note flex items-start gap-2 border border-info-border bg-info-surface px-3.5 py-3 text-note text-secondary-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
            <span>
              種類で決まるのは<strong className="font-bold">GLS 番号の採り方と、回を持てるかどうか</strong>です。
              <strong className="font-bold">あとから変えられます</strong>（発番済みなら番号を採り直します）。
              標準工程テンプレートは<strong className="font-bold">まだありません</strong>ので、
              工程は入りません。
            </span>
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3.5">
          <div>
            <Label htmlFor="m-date">実施日</Label>
            {/* **端末のピッカーに任せる**（決めごと「入力は端末に任せる」）。
                飛び日は PC で足します — スマホで日付を何行も積むのは無理があります */}
            <Input
              id="m-date"
              type="date"
              value={v.dates[0] ?? ''}
              onChange={(e) => set('dates', e.target.value ? [e.target.value] : [])}
              className="mt-1 h-11"
            />
            <p className="text-note mt-1 text-muted-foreground">
              飛び日（複数の日）は PC から足せます。会場・スタジオを押さえるのもカレンダーからです。
            </p>
          </div>

          <div>
            <Label>いまどこ</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {CREATABLE_STAGES.map((s) => (
                <Chip key={s} on={v.stage === s} onClick={() => set('stage', s as ProjectStage)}>
                  {ProjectStageLabels[s]}
                </Chip>
              ))}
            </div>
            <p className="text-note mt-1 text-muted-foreground">
              受注はここで選べません（GLS 番号を採るので、番号を見せてから確認します）。
            </p>
          </div>

          <div>
            <Label>継続区分</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(['single', 'regular'] as const).map((r) => (
                <Chip key={r} on={v.recurrence === r} onClick={() => set('recurrence', r)}>
                  {RECURRENCE_LABEL[r]}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <Label>社内の担当 <span className="text-destructive">*</span></Label>
            <div className="mt-1">
              <SearchableSelect
                value={v.assigned_to}
                onChange={(id) => set('assigned_to', id)}
                options={users.map((u) => ({ value: u.id, label: u.name }))}
                placeholder="担当をさがす"
              />
            </div>
            <p className="text-note mt-1 text-muted-foreground">
              <strong className="font-bold">案件の担当者ではありません</strong> — この案件を最初に受けた人です。誰が何をするかはタスクで表します。
            </p>
          </div>
        </div>
      )}

      {/* 足りないものは**名指しする**。押せないボタンだけだと探すことになる */}
      {missing.length > 0 && (
        <p className="text-note text-destructive">
          あと <strong className="font-bold">{missing.join(' と ')}</strong> が要ります。
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => (step === 0 ? navigate(-1) : setStep((n) => n - 1))}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {step === 0 ? 'やめる' : 'もどる'}
        </Button>
      </div>

      <p className="text-note text-muted-foreground">
        規模・予算・やりたいこと・最初のタスクは <strong className="font-bold">PC の登録画面</strong>で入れられます。
        ここは<strong className="font-bold">外で案件を立ち上げるための最小限</strong>です（あとから足せます）。
      </p>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-chip min-h-tap border px-3.5 py-1.5 text-sub',
        on ? 'border-primary bg-primary text-primary-foreground font-bold' : 'border-border bg-card text-secondary-foreground',
      )}
    >
      {children}
    </button>
  );
}
