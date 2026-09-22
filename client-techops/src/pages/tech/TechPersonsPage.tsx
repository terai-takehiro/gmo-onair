// ⑥ 技術人員 `/techops/tech-persons`（PC専用・manager）。
// 会社ごとの技術スタッフ。技術資料③の名前の候補になる（設計 §6⑥）。
// 会社の並びは `TechCompanyRail.tsx`、追加ダイアログは `TechPersonDialog.tsx`。
// モック: mockups/native/tech-docs/People.dc.html
import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, Upload, UserX } from "lucide-react";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { Row, RowHeader, RowMain, RowSlot } from "@gmo-onair/shared/src/client/ui/row";
import { confirmAction } from "@gmo-onair/shared/src/client/ui/confirm";
import { FilterChips } from "@gmo-onair/shared/src/client/ui/filterChips";
import { TECH_ROLES } from "@gmo-onair/shared/src/tech/roles";
import type { TechPerson } from "@gmo-onair/shared/src/tech/types";
import { Button } from "@/components/ui/button";
import BufferedInput from "@/components/editor/BufferedInput";
import { useAuth } from "@/hooks/useAuth";
import { useTechMasters } from "@/hooks/useTechMasters";
import { notifyError } from "@/lib/notify";
import { TechCompanyRail } from "./TechCompanyRail";
import { RowMenu, RowMenuItem } from "./staffMenu";
import { RoleBadges, TechCompanyDialog, TechPersonDialog } from "./TechPersonDialog";
import { filterPersons, roleCountsOf } from "./staffMasters";

function formatWorkDate(value: string | null): string {
  if (!value) return "";
  return value.replace(/-/g, "/");
}

export default function TechPersonsPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("qsheet", "manager");
  const masters = useTechMasters();
  const companies = masters.companies;

  const [companyId, setCompanyId] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);

  useEffect(() => {
    if (companyId === "" && companies.length > 0) setCompanyId(companies[0].id);
  }, [companies, companyId]);

  const inCompany = masters.persons({ company: companyId || undefined, include_inactive: 1 });
  const rows = useMemo(
    () => filterPersons(inCompany, { q, role, includeInactive: true }),
    [inCompany, q, role],
  );
  const roleCounts = useMemo(() => roleCountsOf(inCompany), [inCompany]);

  // 保存・削除の失敗は `useTechMasters` が知らせて読み直すので、ここでは分岐しない
  const removePerson = async (person: TechPerson) => {
    const ok = await confirmAction({
      title: `「${person.name}」を削除しますか？`,
      description: "これまでの技術資料に入っている名前は残ります。",
      confirmLabel: "削除する",
      tone: "danger",
    });
    if (!ok) return;
    await masters.deletePerson(person.id);
  };

  return (
    <PageShell>
      <PageHeader
        title="技術人員"
        sub="会社ごとの技術スタッフ。技術資料の候補に表示されます"
        primaryAction={
          canEdit ? (
            <Button type="button" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              追加
            </Button>
          ) : undefined
        }
      >
        {canEdit && (
          <Button type="button" variant="outline" disabled title="今後の対応予定です。現在は手入力のみです">
            <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
            メンバー表から取り込む
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <TechCompanyRail
          companies={companies}
          value={companyId}
          onChange={setCompanyId}
          canEdit={canEdit}
          onAdd={() => setCompanyOpen(true)}
        />

        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex min-h-tap items-center gap-2 rounded-control-lg border border-border bg-card px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <BufferedInput
              value={q}
              onCommit={setQ}
              placeholder="名前・役職で検索"
              aria-label="名前・役職で検索"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-list font-normal text-foreground outline-none placeholder:text-fg-disabled"
            />
          </div>

          <FilterChips
            label="役職で絞り込む"
            value={role}
            onChange={setRole}
            items={[
              { key: "", label: "すべて", count: inCompany.length },
              ...TECH_ROLES.filter((r) => roleCounts[r]).map((r) => ({ key: r as string, label: r, count: roleCounts[r] })),
            ]}
          />

          <div className="overflow-hidden rounded-card border border-border bg-card">
            <RowHeader>
              <RowMain>名前</RowMain>
              <RowSlot w={160} hideOnMobile>主な役職</RowSlot>
              <RowSlot w={72} align="right">参加回数</RowSlot>
              <RowSlot w={96} align="right" hideOnMobile>最近の作業日</RowSlot>
              <RowSlot w={56}>状態</RowSlot>
              {canEdit && <RowSlot w={56} align="right" placeholder={null} />}
            </RowHeader>

            {rows.map((p) =>
              editId === p.id ? (
                <PersonEditRow
                  key={p.id}
                  person={p}
                  onCancel={() => setEditId(null)}
                  onSave={async (patch) => {
                    await masters.updatePerson(p.id, patch);
                    setEditId(null);
                  }}
                />
              ) : (
                <PersonRow
                  key={p.id}
                  person={p}
                  canEdit={canEdit}
                  onEdit={() => setEditId(p.id)}
                  onToggleActive={() => void masters.updatePerson(p.id, { active: !p.active })}
                  onDelete={() => void removePerson(p)}
                />
              ),
            )}

            {rows.length === 0 && (
              <p className="px-4 py-6 text-sub text-muted-foreground">
                この条件に合う人がいません。検索の言葉を減らすか、右上の「追加」で登録してください
              </p>
            )}

            <div className="flex items-center gap-2 px-4 py-2">
              <span className="font-number text-sub text-muted-foreground">{rows.length}人</span>
            </div>
          </div>
        </section>

        <aside className="w-full shrink-0 rounded-card border border-border bg-card p-4 lg:w-72">
          <div className="flex items-baseline gap-2">
            <span className="text-cardtitle text-foreground">役職の一覧</span>
            <span className="font-number text-sub-sm text-muted-foreground">{TECH_ROLES.length}</span>
          </div>
          <p className="mb-2 mt-1 text-sub-sm text-muted-foreground">
            数字はその役職で担当したことのある人数
          </p>
          {TECH_ROLES.map((r) => (
            <div key={r} className="flex items-center gap-2 border-b border-border-faint py-1.5 last:border-b-0">
              <span className="w-14 shrink-0 rounded-badge-xs bg-muted px-1.5 py-0.5 text-center font-number text-badge text-muted-foreground">
                {r}
              </span>
              <span className="flex-1" />
              <span className="font-number text-sub text-foreground">{roleCounts[r] ?? 0}</span>
            </div>
          ))}
        </aside>
      </div>

      <TechPersonDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        companies={companies}
        defaultCompanyId={companyId}
        onSubmit={(input) => masters.createPerson(input)}
      />
      <TechCompanyDialog
        open={companyOpen}
        onOpenChange={setCompanyOpen}
        onSubmit={(input) => masters.createCompany(input)}
      />
    </PageShell>
  );
}

function PersonRow({
  person,
  canEdit,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  person: TechPerson;
  canEdit: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <Row divider align="start">
      <RowMain>
        <div className="truncate text-list text-foreground">{person.name}</div>
        {person.kana && <div className="truncate text-sub-sm text-muted-foreground">{person.kana}</div>}
      </RowMain>
      <RowSlot w={160} hideOnMobile>
        <span className="flex flex-wrap gap-1">
          {person.main_roles.map((r) => (
            <span key={r} className="rounded-badge-xs bg-muted px-1.5 py-0.5 font-number text-badge text-muted-foreground">
              {r}
            </span>
          ))}
        </span>
      </RowSlot>
      <RowSlot w={72} align="right">
        <span className="font-number text-list text-foreground">{person.participation_count}回</span>
      </RowSlot>
      <RowSlot w={96} align="right" hideOnMobile>
        <span className="font-number text-sub text-muted-foreground">{formatWorkDate(person.last_work_date)}</span>
      </RowSlot>
      <RowSlot w={56}>
        <span
          className={[
            "rounded-badge-xs px-1.5 py-0.5 text-badge",
            person.active ? "bg-success-surface text-success" : "bg-muted text-muted-foreground",
          ].join(" ")}
        >
          {person.active ? "有効" : "無効"}
        </span>
      </RowSlot>
      {canEdit && (
        <RowSlot w={56} align="right" className="relative" placeholder={null}>
          <RowMenu label="この人の操作">
            {(close) => (
              <>
                <RowMenuItem icon={<Pencil className="h-3.5 w-3.5" />} label="編集" onClick={() => { close(); onEdit(); }} />
                <RowMenuItem
                  icon={<UserX className="h-3.5 w-3.5" />}
                  label={person.active ? "無効にする" : "有効にする"}
                  onClick={() => { close(); onToggleActive(); }}
                />
                <RowMenuItem icon={<Trash2 className="h-3.5 w-3.5" />} label="削除" danger onClick={() => { close(); onDelete(); }} />
              </>
            )}
          </RowMenu>
        </RowSlot>
      )}
    </Row>
  );
}

function PersonEditRow({
  person,
  onCancel,
  onSave,
}: {
  person: TechPerson;
  onCancel: () => void;
  onSave: (patch: { name: string; kana: string; main_roles: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState(person.name);
  const [kana, setKana] = useState(person.kana);
  const [roles, setRoles] = useState<string[]>(person.main_roles);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (name.trim() === "") {
      notifyError("名前を入力してください。");
      return;
    }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), kana: kana.trim(), main_roles: roles });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-b border-border-faint bg-primary-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <BufferedInput
          value={name}
          onCommit={setName}
          aria-label="名前"
          className="h-9 min-w-0 flex-1 rounded-control-md border border-primary-border bg-card px-2.5 text-list font-normal text-foreground outline-none"
        />
        <BufferedInput
          value={kana}
          onCommit={setKana}
          aria-label="ふりがな"
          placeholder="ふりがな"
          className="h-9 w-40 rounded-control-md border border-border bg-card px-2.5 text-sub font-normal text-muted-foreground outline-none placeholder:text-fg-disabled"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <RoleBadges roles={roles} onChange={setRoles} />
        <span className="flex-1" />
        <Button type="button" variant="outline" size="sm" className="min-h-tap" onClick={onCancel} disabled={saving}>
          キャンセル
        </Button>
        <Button type="button" size="sm" className="min-h-tap" onClick={() => void submit()} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );
}
