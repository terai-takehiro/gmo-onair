/**
 * 確認画面の 1 行（投入口の1本化）
 *
 * ── 1行目は必ず「行き先の札」──────────────────────────────
 *
 * 投入口を 1 つにした以上、**押した人が最初に確かめたいのは
 * 「これはどこに入るのか」**です。だから札を先頭に置き、その横に
 * **どのデータに入るか**を小さく添えます（「案件（ネタ）」だけでは
 * 何が起きるのか分からない）。
 *
 * ── 行き先は人が変えられる ────────────────────────────────
 *
 * AI が読み違えたときの逃げ道であると同時に、**その付け替えが
 * いちばん価値のある教師データ**になります（`dest` は差分の先頭項目）。
 *
 * ── 足りないものは橙で名指しする ──────────────────────────
 *
 * 「要確認」とだけ出すと、何を埋めればよいのか分かりません。
 * 欄そのものを橙の枠にして、下に 1 文で理由を書きます。
 */
import { Check, Clock, User, CalendarClock, Building2, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { DEST_INFO, DEST_ORDER, destOf, type Dest, type IntakeProject, type IntakeUser, type Row } from './types';
import { fromLocalInput, isFarDue, quickDueOptions, toLocalInput } from './due';

const IMPORTANCE_LABEL: Record<number, string> = { 3: '高', 2: '中', 1: '低' };
const URGENCY_LABEL: Record<number, string> = { 3: '高', 2: '中', 1: '低' };

/** 9 マスの打ち手 (要件 D2)。同点でも打ち手が違うことを画面で示す */
const CELL_ACTION: Record<string, string> = {
  '3x3': '今すぐやる', '3x2': '今日中に着手', '3x1': '予定を取って守る',
  '2x3': '早めに片づける', '2x2': '順番にやる', '2x1': '空いた時間で',
  '1x3': '任せる・即片づけ', '1x2': 'まとめて処理', '1x1': 'やらない候補',
};

function scoreOf(r: Row): number {
  const imp = r.importance ?? 2;
  const urg = r.due_at ? (r.urgency ?? 2) : 1;
  return imp * urg;
}
function cellOf(r: Row): string {
  const imp = r.importance ?? 2;
  const urg = r.due_at ? (r.urgency ?? 2) : 1;
  return `${imp}x${urg}`;
}

const ACTIVITY_LABEL: Record<string, string> = {
  meeting: '打合せ', call: '電話', email: 'メール', other: 'その他',
};

/** 足りていない欄の枠。**橙は「登録の前に決めてください」の色** */
const NEED = 'border-warning-border-strong';
const needNote = 'mt-0.5 text-[11px] font-bold text-warning';

export function DraftRow({
  r, users, projects, onChange,
}: {
  r: Row;
  users: IntakeUser[];
  projects: IntakeProject[];
  onChange: (patch: Partial<Row>) => void;
}) {
  const dest = destOf(r);
  const info = DEST_INFO[dest];

  return (
    <li
      className={cn(
        'rounded-card border p-3 transition-colors',
        r.checked ? 'border-primary-border bg-primary-surface-weak/40' : 'border-border bg-muted/20 opacity-70',
      )}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          aria-label={r.checked ? '登録しない' : '登録する'}
          onClick={() => onChange({ checked: !r.checked })}
          className={cn(
            'v4-tap mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-control border transition-colors',
            r.checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background',
          )}
        >
          {r.checked && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          {/* ── 1行目: 行き先の札 ＋ どのデータに入るか ── */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded-badge border px-2 py-0.5 text-badge', info.tone)}>{info.label}</span>
            <span className="text-note flex items-center gap-1 text-muted-foreground">
              <ArrowRight className="h-3 w-3" aria-hidden="true" />{info.into}
            </span>
            <div className="flex-1" />
            {/* 行き先の付け替え。**AI が読み違えたときの逃げ道** */}
            <select
              value={dest}
              onChange={(e) => onChange({ dest: e.target.value as Dest })}
              aria-label="登録先を変更"
              className="h-8 rounded-control border border-input bg-background px-1.5 text-note"
            >
              {DEST_ORDER.map((d) => (
                <option key={d} value={d}>{DEST_INFO[d].label}にする</option>
              ))}
            </select>
          </div>

          <Input
            value={r.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="h-9 text-sm"
            placeholder={dest === 'neta' ? '案件名' : dest === 'log' ? '件名' : dest === 'minutes' ? '打合せの名前' : 'やること'}
          />

          {dest === 'task' && <TaskFields r={r} users={users} onChange={onChange} />}
          {dest === 'neta' && <NetaFields r={r} onChange={onChange} />}
          {dest === 'log' && <LogFields r={r} projects={projects} onChange={onChange} />}
          {dest === 'minutes' && <MinutesFields r={r} projects={projects} onChange={onChange} />}

          {r.quote && (
            <p className="truncate text-[11px] text-muted-foreground" title={r.quote}>
              元の文: {r.quote}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

// ── タスク（今までの中身をそのまま） ──────────────────────────

function TaskFields({ r, users, onChange }: { r: Row; users: IntakeUser[]; onChange: (p: Partial<Row>) => void }) {
  const needsAssignee = !r.assigned_to;
  const needsDue = !r.due_at;
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-[11px] text-muted-foreground">
            <User className="mr-1 inline h-3 w-3" aria-hidden="true" />誰が
          </Label>
          <select
            value={r.assigned_to ?? ''}
            onChange={(e) => onChange({ assigned_to: e.target.value || null })}
            className={cn(
              'mt-0.5 h-9 w-full rounded-control border bg-background px-2 text-sm',
              needsAssignee && r.checked ? NEED : 'border-input',
            )}
          >
            <option value="">（選んでください）</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {r.assignee_unclear && needsAssignee && (
            <p className={needNote}>誰に頼んだか読み取れませんでした</p>
          )}
        </div>

        <div>
          <Label className="text-[11px] text-muted-foreground">
            <Clock className="mr-1 inline h-3 w-3" aria-hidden="true" />何月何日何時何分まで
          </Label>
          <Input
            type="datetime-local"
            value={toLocalInput(r.due_at)}
            onChange={(e) => onChange({ due_at: fromLocalInput(e.target.value) })}
            className={cn('mt-0.5 h-9 text-sm', needsDue && r.checked && r.requester_id ? NEED : '')}
          />
          {/* 短い順のクイック選択 (イズム: 期限はできるだけ短く) */}
          <div className="mt-1 flex flex-wrap gap-1">
            {quickDueOptions().map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange({ due_at: fromLocalInput(o.value) })}
                className="rounded-chip border border-input px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
              >
                {o.label}
              </button>
            ))}
          </div>
          {r.due_unclear && needsDue && (
            <p className={needNote}>「今週中」などは期限になりません。日時を決めてください</p>
          )}
          {r.due_time_assumed && r.due_at && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-info">
              <CalendarClock className="h-3 w-3" aria-hidden="true" />
              時刻は 18:00 として入れました。合っていますか？
            </p>
          )}
          {isFarDue(r.due_at) && <p className="mt-0.5 text-[11px] text-muted-foreground">期限は短いほうが動きます</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([['importance', '重要度', IMPORTANCE_LABEL], ['urgency', '緊急度', URGENCY_LABEL]] as const).map(
          ([field, label, dict]) => (
            <div key={field} className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">{label}</span>
              <div className="inline-flex rounded-control border border-input p-0.5">
                {[3, 2, 1].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onChange({ [field]: v } as Partial<Row>)}
                    className={cn(
                      'rounded-control px-2 py-0.5 text-[11px] transition-colors',
                      (r[field] ?? 2) === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {dict[v]}
                  </button>
                ))}
              </div>
            </div>
          ),
        )}
        <span className="rounded-chip bg-muted px-2 py-0.5 text-[11px]">
          スコア {scoreOf(r)} · {CELL_ACTION[cellOf(r)]}
        </span>
        {r.requester_id && (
          <span className="rounded-chip border border-ai-border bg-ai-surface px-2 py-0.5 text-[11px] text-ai">依頼</span>
        )}
      </div>
    </>
  );
}

// ── ネタ案件 ────────────────────────────────────────────────

function NetaFields({ r, onChange }: { r: Row; onChange: (p: Partial<Row>) => void }) {
  const needsCustomer = !r.customer_name?.trim();
  const needsCat = r.gls_category !== 'A' && r.gls_category !== 'B';
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div>
        <Label className="text-[11px] text-muted-foreground">
          <Building2 className="mr-1 inline h-3 w-3" aria-hidden="true" />お客様
        </Label>
        <Input
          value={r.customer_name ?? ''}
          onChange={(e) => onChange({ customer_name: e.target.value })}
          placeholder="会社名"
          className={cn('mt-0.5 h-9 text-sm', needsCustomer && r.checked ? NEED : '')}
        />
        {/* **作ることを先に言う。** 押してから「知らない会社が増えた」は最悪 */}
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          同じ名前が無ければ、お客様も一緒に作ります
        </p>
        {needsCustomer && r.checked && <p className={needNote}>お客様が読み取れませんでした</p>}
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground">案件の分類</Label>
        <div className={cn('mt-0.5 inline-flex rounded-control border p-0.5', needsCat && r.checked ? NEED : 'border-input')}>
          {([['A', 'スタジオを使う'], ['B', 'それ以外']] as const).map(([v, lbl]) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange({ gls_category: v })}
              className={cn(
                'min-h-tap rounded-control px-2.5 text-[11px] transition-colors lg:min-h-0 lg:py-1',
                r.gls_category === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {lbl}
            </button>
          ))}
        </div>
        {needsCat && r.checked && <p className={needNote}>どちらか選んでください（GLS番号の採り方が変わります）</p>}
      </div>
      <div className="sm:col-span-2">
        <Label className="text-[11px] text-muted-foreground">要望・背景</Label>
        <Input
          value={r.detail ?? ''}
          onChange={(e) => onChange({ detail: e.target.value })}
          placeholder="読み取れた範囲で（空でも登録できます）"
          className="mt-0.5 h-9 text-sm"
        />
      </div>
    </div>
  );
}

// ── 活動記録 ────────────────────────────────────────────────

function LogFields({ r, projects, onChange }: { r: Row; projects: IntakeProject[]; onChange: (p: Partial<Row>) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div>
        <Label className="text-[11px] text-muted-foreground">やり取りの種類</Label>
        <select
          value={r.activity_type ?? 'other'}
          onChange={(e) => onChange({ activity_type: e.target.value })}
          className="mt-0.5 h-9 w-full rounded-control border border-input bg-background px-2 text-sm"
        >
          {Object.entries(ACTIVITY_LABEL).map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
        </select>
      </div>
      <ProjectPicker r={r} projects={projects} onChange={onChange} required={false} />
      <div>
        <Label className="text-[11px] text-muted-foreground">
          <Building2 className="mr-1 inline h-3 w-3" aria-hidden="true" />お客様（分かれば）
        </Label>
        <Input
          value={r.customer_name ?? ''}
          onChange={(e) => onChange({ customer_name: e.target.value })}
          placeholder="会社名"
          className="mt-0.5 h-9 text-sm"
        />
        {/* **ここでは作らない。** 済んだやり取りから会社を増やすと綴り違いが溜まる */}
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          同じ名前が無いときは、お客様を付けずに記録します
        </p>
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground">次のアクション（あれば）</Label>
        <Input
          value={r.next_action ?? ''}
          onChange={(e) => onChange({ next_action: e.target.value })}
          className="mt-0.5 h-9 text-sm"
        />
        <Input
          type="date"
          value={r.next_action_date ?? ''}
          onChange={(e) => onChange({ next_action_date: e.target.value || null })}
          aria-label="次のアクションの期日"
          className="mt-1 h-9 text-sm"
        />
      </div>
      <div className="sm:col-span-2">
        <Label className="text-[11px] text-muted-foreground">中身</Label>
        <Input
          value={r.detail ?? ''}
          onChange={(e) => onChange({ detail: e.target.value })}
          className="mt-0.5 h-9 text-sm"
        />
      </div>
    </div>
  );
}

// ── 議事録 ──────────────────────────────────────────────────

function MinutesFields({ r, projects, onChange }: { r: Row; projects: IntakeProject[]; onChange: (p: Partial<Row>) => void }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ProjectPicker r={r} projects={projects} onChange={onChange} required />
      </div>
      {r.summary && (
        <p className="rounded-note bg-surface-subtle px-2.5 py-2 text-[11px] text-secondary-foreground">{r.summary}</p>
      )}
      {/* **決定事項と持ち帰りはここで直させない。** 引用と突き合わせながら直す作業なので、
          案件の「やり取り」で腰を据えて確かめる（下書きのまま入ります） */}
      <p className="text-[11px] text-muted-foreground">
        決まったこと {r.decisions?.length ?? 0} 件 ・ 未解決事項 {r.open_items?.length ?? 0} 件を下書きで入れます。
        <span className="font-bold text-foreground">確かめるのは案件の「やり取り」で</span>
        （引用と突き合わせる作業なので、この画面では編集できません）
      </p>
    </div>
  );
}

function ProjectPicker({
  r, projects, onChange, required,
}: { r: Row; projects: IntakeProject[]; onChange: (p: Partial<Row>) => void; required: boolean }) {
  const missing = required && !r.project_id;
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground">案件{required ? '' : '（分かれば）'}</Label>
      <select
        value={r.project_id ?? ''}
        onChange={(e) => onChange({ project_id: e.target.value || null })}
        className={cn(
          'mt-0.5 h-9 w-full rounded-control border bg-background px-2 text-sm',
          missing && r.checked ? NEED : 'border-input',
        )}
      >
        <option value="">（付けない）</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {[p.code, p.name, p.customer_name].filter(Boolean).join(' / ')}
          </option>
        ))}
      </select>
      {missing && r.checked && <p className={needNote}>議事録は案件にぶら下がります。どの案件か選んでください</p>}
    </div>
  );
}
