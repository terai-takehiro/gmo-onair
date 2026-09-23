// ⑥ 技術人員の「追加」ダイアログと「会社を追加」ダイアログ。
// 編集は表の中で行うので、ここは新しく足すときだけ使う（設計 §6⑥）。
// モック: mockups/native/tech-docs/People.dc.html
import { useEffect, useState } from "react";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import type { TechCompany } from "@gmo-onair/shared/src/tech/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import BufferedInput from "@/components/editor/BufferedInput";
import { notifyError } from "@/lib/notify";
import { TECH_ROLES, roleName } from "@gmo-onair/shared/src/tech/roles";
import { X } from "lucide-react";
import type { TechCompanyPayload, TechPersonPayload } from "@/lib/techApi";

const fieldClass =
  "h-11 w-full rounded-control-lg border border-border bg-card px-3 text-list font-normal text-foreground outline-none placeholder:text-fg-disabled";

/** 主な役職（複数）。バッジの × で削除、「役職を追加」で足す。⑥の追加ダイアログと編集の行で使う */
export function RoleBadges({ roles, onChange }: { roles: string[]; onChange: (next: string[]) => void }) {
  const rest = TECH_ROLES.filter((r) => !roles.includes(r));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {roles.map((r) => (
        <span
          key={r}
          className="flex items-center gap-1 rounded-control border border-primary-border bg-card py-0.5 pl-2 pr-1 font-number text-badge text-primary"
        >
          {r}
          <button
            type="button"
            aria-label={`${r} を削除`}
            onClick={() => onChange(roles.filter((x) => x !== r))}
            className="rounded-badge-xs p-0.5 text-muted-foreground hover:bg-accent"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      <select
        value=""
        aria-label="役職を追加"
        onChange={(e) => {
          if (e.target.value) onChange([...roles, e.target.value]);
        }}
        className="h-8 rounded-control border border-border bg-card px-1.5 text-badge text-muted-foreground"
      >
        <option value="">役職を追加</option>
        {rest.map((r) => (
          <option key={r} value={r} title={roleName(r) || undefined}>
            {roleName(r) ? `${r}（${roleName(r)}）` : r}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TechPersonDialog({
  open,
  onOpenChange,
  companies,
  defaultCompanyId,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies: TechCompany[];
  defaultCompanyId: string;
  /** 送れたら `true`（`useTechMasters` の契約）。`false` のときはダイアログを閉じない */
  onSubmit: (input: TechPersonPayload) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [kana, setKana] = useState("");
  const [companyId, setCompanyId] = useState(defaultCompanyId);
  const [roles, setRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setKana("");
    setCompanyId(defaultCompanyId);
    setRoles([]);
    setSaving(false);
  }, [open, defaultCompanyId]);

  const save = async () => {
    if (name.trim() === "") {
      notifyError("名前を入力してください。");
      return;
    }
    if (companyId === "") {
      notifyError("会社を選択してください。");
      return;
    }
    setSaving(true);
    try {
      // ⚠️ 失敗は投げずに `false` で返る。閉じてしまうと入力が消えるので、送れたときだけ閉じる
      if (await onSubmit({ company_id: companyId, name: name.trim(), kana: kana.trim(), main_roles: roles })) {
        onOpenChange(false);
      }
    } catch {
      notifyError("技術人員を追加できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="技術人員を追加"
      sub="技術資料の名前の候補に表示されます"
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            キャンセル
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tech-person-name">名前</Label>
          <BufferedInput id="tech-person-name" value={name} onCommit={setName} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tech-person-kana">ふりがな</Label>
          <BufferedInput id="tech-person-kana" value={kana} onCommit={setKana} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tech-person-company">会社</Label>
          <select
            id="tech-person-company"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className={fieldClass}
          >
            <option value="">選んでください</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>主な役職</Label>
          <RoleBadges roles={roles} onChange={setRoles} />
        </div>
      </div>
    </FormDialog>
  );
}

export function TechCompanyDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 送れたら `true`（`useTechMasters` の契約）。`false` のときはダイアログを閉じない */
  onSubmit: (input: TechCompanyPayload) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setShortName("");
    setSaving(false);
  }, [open]);

  const save = async () => {
    if (name.trim() === "") {
      notifyError("会社の名前を入力してください。");
      return;
    }
    setSaving(true);
    try {
      if (await onSubmit({ name: name.trim(), short_name: shortName.trim() })) {
        onOpenChange(false);
      }
    } catch {
      notifyError("会社を追加できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="会社を追加"
      sub="取引先に追加されます。同じ名前の取引先がある場合は、その取引先を使用します"
      size="sm"
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            キャンセル
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tech-company-name">名前</Label>
          <BufferedInput id="tech-company-name" value={name} onCommit={setName} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tech-company-short">短い名前</Label>
          <BufferedInput
            id="tech-company-short"
            value={shortName}
            onCommit={setShortName}
            placeholder="候補や表に表示する短い名前"
            className={fieldClass}
          />
        </div>
      </div>
    </FormDialog>
  );
}
