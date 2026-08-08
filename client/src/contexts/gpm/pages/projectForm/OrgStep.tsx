/**
 * ④ プロジェクト新規作成 ／ 4段目「体制（組織図）」・5段目「メンバー・書類」(v4 GPM)
 *
 * ── 作る前に人は登録できない ────────────────────────────────
 *
 * `gpm_members` は `project_id` を必須にしているので、**プロジェクトを
 * 作るまで人を保存できません**。そこでこの段では**入力だけ画面で貯めて、
 * 「作る」を押したときにプロジェクトと一緒に登録**します
 * （`GpmProjectFormPage` の `create` が続けて `POST /members` を呼ぶ）。
 *
 * 作れなかったときに人だけ残る、ということは起きません（作ってから足すため）。
 * 逆に**人の登録で失敗してもプロジェクトは残します** — 作り直させるほうが害が
 * 大きく、人はあとから体制タブで足せます。
 *
 * ── 書類（BOX）はここで作らない ─────────────────────────────
 *
 * 押すと**本番の BOX に実際にフォルダができ、ONAiR からは消せません**。
 * 作るのを新規作成の流れに混ぜると、名前を間違えたまま作ってしまいます。
 * **作ったあとの「書類」タブ**で、何ができるかを見せてから押してもらいます。
 */
import { useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { SIDE_BORDER, SIDE_LABEL, TIER_LABEL, type MemberSide, type MemberTier } from '../../types';

/** 作るときに一緒に登録する人。**id はまだ無い**（プロジェクトを作ってから採る） */
export interface DraftMember {
  name: string;
  side: MemberSide;
  tier: MemberTier;
  group_label: string;
  role: string;
  org: string;
  email: string;
  badge: string;
}

const SIDES: MemberSide[] = ['client', 'pm', 'internal', 'vendor'];
const TIERS: MemberTier[] = ['top', 'lead', 'unit'];

const EMPTY: DraftMember = {
  name: '', side: 'internal', tier: 'unit',
  group_label: '', role: '', org: '', email: '', badge: '',
};

export function OrgStep({
  members, onChange,
}: {
  members: DraftMember[];
  onChange: (next: DraftMember[]) => void;
}) {
  const [draft, setDraft] = useState<DraftMember>(EMPTY);

  const add = () => {
    if (!draft.name.trim()) return;
    onChange([...members, { ...draft, name: draft.name.trim() }]);
    // 次の人は**同じ箱に続けて入れる**ことが多いので、まとまり・立場・段は残す
    setDraft({ ...EMPTY, side: draft.side, tier: draft.tier, group_label: draft.group_label });
  };

  const set = <K extends keyof DraftMember>(k: K, v: DraftMember[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="space-y-3.5">
      <section className="rounded-card border border-border bg-card p-4 lg:px-5">
        <h2 className="text-cardtitle">体制に入れる人</h2>
        <p className="text-note mt-1 text-muted-foreground">
          ここで入れた人は<strong className="font-bold">「作る」を押したときに一緒に登録</strong>されます。
          あとから体制タブで足す・直すこともできます。
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>名前</Label>
            <Input
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
              placeholder="井上 直樹"
            />
          </div>
          <div className="space-y-1">
            <Label>まとまりの名前</Label>
            <Input
              value={draft.group_label}
              onChange={(e) => set('group_label', e.target.value)}
              placeholder="設計ユニット"
            />
          </div>
          <div className="space-y-1">
            <Label>立場</Label>
            <Select value={draft.side} onValueChange={(v) => set('side', v as MemberSide)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SIDES.map((s) => <SelectItem key={s} value={s}>{SIDE_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>組織図の段</Label>
            <Select value={draft.tier} onValueChange={(v) => set('tier', v as MemberTier)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIERS.map((t) => <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>役割</Label>
            <Input value={draft.role} onChange={(e) => set('role', e.target.value)} placeholder="AV設計・機材選定" />
          </div>
          <div className="space-y-1">
            <Label>所属</Label>
            <Input value={draft.org} onChange={(e) => set('org', e.target.value)} placeholder="日建スペースデザイン" />
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <Button variant="outline" onClick={add} disabled={!draft.name.trim()}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />この人を入れる
          </Button>
        </div>
      </section>

      {members.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" aria-hidden="true" />}
          title="まだ誰も入れていません"
          description="空のままでも作れます。あとから体制タブで足せます。"
        />
      ) : (
        <section className="rounded-card overflow-hidden border border-border bg-card">
          <div className="border-b border-border-subtle bg-surface-subtle px-4 py-2.5">
            <h2 className="text-cardtitle">入れる人 {members.length}名</h2>
          </div>
          <ul>
            {members.map((m, i) => (
              <li
                key={`${m.name}-${i}`}
                className={cn('flex flex-wrap items-center gap-2 border-b border-border-faint border-l-4 px-4 py-2 last:border-b-0', SIDE_BORDER[m.side])}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-list block truncate">{m.name}</span>
                  <span className="text-sub-sm block truncate text-muted-foreground">
                    {[TIER_LABEL[m.tier], m.group_label || SIDE_LABEL[m.side], m.role].filter(Boolean).join(' ・ ')}
                  </span>
                </span>
                <Button
                  variant="ghost" size="icon-sm" className="text-destructive"
                  onClick={() => onChange(members.filter((_, j) => j !== i))}
                  aria-label={`${m.name} を外す`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-note text-muted-foreground">
        <strong className="font-bold">BOX のフォルダはここでは作りません。</strong>
        押すと本番の BOX に実際にフォルダができ、ONAiR からは消せないためです。
        作ったあとの「書類」タブで、何ができるかを見てから作ってください。
      </p>
    </div>
  );
}
