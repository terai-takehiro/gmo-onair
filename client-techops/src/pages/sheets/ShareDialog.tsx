// 進行台本の一覧 — 共有先ユーザーの選択ダイアログ。旧 DashboardPage.tsx の ShareDialog をそのまま分割。
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Check } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { notifySuccess, notifyError } from "@/lib/notify";
import { type QsheetDocument } from "./types";

interface ShareUser {
  id: string;
  name: string;
  email: string;
}
interface ShareEntry {
  user_id: string;
  name: string | null;
  email: string | null;
}

export function ShareDialog({
  doc,
  onClose,
  onSaved,
}: {
  doc: QsheetDocument | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = !!doc;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [userSearch, setUserSearch] = useState("");

  const { data: users } = useQuery({
    queryKey: ["qsheet-share-users"],
    queryFn: async () => (await api.get("/techops/share-users")).data.data as ShareUser[],
    enabled: open,
  });

  const { data: currentShares } = useQuery({
    queryKey: ["qsheet-shares", doc?.id],
    queryFn: async () => (await api.get(`/techops/documents/${doc!.id}/shares`)).data.data as ShareEntry[],
    enabled: open,
  });

  useEffect(() => {
    if (currentShares) setSelected(new Set(currentShares.map((s) => s.user_id)));
  }, [currentShares]);

  useEffect(() => {
    if (open) setUserSearch("");
  }, [open, doc?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put(`/techops/documents/${doc!.id}/shares`, { user_ids: Array.from(selected) });
    },
    onSuccess: () => {
      notifySuccess("共有設定を保存しました");
      onSaved();
      onClose();
    },
    onError: () => notifyError("共有設定の保存に失敗しました"),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const filtered = (users || []).filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        // **1カラムの選択リストなので `md`（640px）。** 中身は検索欄と、
        // 「チェック＋名前＋メール」を縦に積むだけの一覧で、横に並べる列も
        // 2列の入力も無い。`lg`（840px）にすると名前の右にメールまでの
        // 空白が広がるだけで、1画面に入る人数は1人も増えない。
        // ⚠️ 旧実装が指していた Tailwind の最大幅の `md` 段は **448px** で、
        // この段の `md`（640px）とは別物（448px では名前とメールが折り返して
        // 狭すぎたので、戻さずこの段の `md` に上げてある）。
        size="md"
      >
        <DialogHeader>
          <DialogTitle>共有設定</DialogTitle>
          <DialogDescription>
            「{doc?.data?.meta?.title || doc?.title || "無題"}」を閲覧できるユーザーを選びます。選んだユーザーは一覧に表示され、台本を開けるようになります（管理者は常に全件閲覧できます）。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="名前・メールで検索..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="pl-10"
              aria-label="共有ユーザー検索"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {filtered.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">ユーザーが見つかりません</p>
            ) : (
              filtered.map((u) => {
                const on = selected.has(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggle(u.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    role="checkbox"
                    aria-checked={on}
                  >
                    <span className={`size-5 rounded-md flex items-center justify-center border flex-shrink-0 ${on ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                      {on && <Check size={13} aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{u.name}</span>
                      <span className="block text-xs text-muted-foreground truncate">{u.email}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <p className="text-xs text-muted-foreground">{selected.size} 名を選択中</p>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
