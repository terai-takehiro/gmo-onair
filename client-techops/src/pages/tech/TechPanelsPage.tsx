// ⑤ パッチ盤の管理画面 `/techops/tech-panels`（PC専用・manager が編集）（担当 C4）。
// 盤の一覧・盤の絵・番号の表・右の情報カードを束ねる親。
// 設計: docs/design/v4/tech-docs.md §6 ⑤・§9-1。モック: mockups/native/tech-docs/Panel.dc.html
//
// `useTechMasters()`（`src/hooks/useTechMasters.ts`・担当 C1）の実際の形に合わせてある:
// `panelDetail(id)` は**同期**で `PatchPanelDetail | undefined` を返す（要求だけ登録し、
// 届くと再描画される）。`updateJack` は内部で自分の失敗通知まで済ませて必ず解決するので、
// ここでは保存を試したあとに一律で「保存しました」を出す（保存に失敗した場合はフックの
// 側が別に失敗の帯を出す）。
import { useEffect, useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { Delayed, SkeletonRows, EmptyState } from "@gmo-onair/shared/src/client/states";
import { StatValue } from "@gmo-onair/shared/src/client/ui/numbers";
import { cn } from "@gmo-onair/shared/src/client/utils";
import type { PatchPanelListItem } from "@gmo-onair/shared/src/tech/types";
import { useTechMasters } from "@/hooks/useTechMasters";
import { useAuth } from "@/hooks/useAuth";
import { notifyInfo, notifySuccess } from "@/lib/notify";
import { TechPanelBoard, type TechPanelBoardSelection } from "./TechPanelBoard";
import { TechPanelJackTable } from "./TechPanelJackTable";

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" });
}

function panelSubLabel(panel: PatchPanelListItem): string {
  return panel.kind === "trunk" ? "TRK 32" : `${panel.jack_count}ch`;
}

export default function TechPanelsPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("qsheet", "manager");
  const masters = useTechMasters();

  const panels: PatchPanelListItem[] = masters.panels;

  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [selected, setSelected] = useState<TechPanelBoardSelection | null>(null);
  const [page, setPage] = useState(0);

  // 一覧が届いたら最初の盤を開く
  useEffect(() => {
    if (!selectedPanelId && panels.length > 0) setSelectedPanelId(panels[0].id);
  }, [panels, selectedPanelId]);

  // `panelDetail` は同期。要求していなければここで控えが積まれ、届くと再描画される
  const detail = selectedPanelId ? masters.panelDetail(selectedPanelId) : undefined;

  // 盤を変えたら選択とページを最初に戻す
  useEffect(() => {
    setSelected(null);
    setPage(0);
  }, [selectedPanelId]);

  useEffect(() => {
    if (!selected && detail) setSelected({ jackNo: 1, jackRow: "A" });
  }, [detail, selected]);

  const saveJack = async (
    jackId: string,
    patch: Partial<Record<"device_name" | "label" | "signal" | "area" | "note", string>>,
  ) => {
    if (!selectedPanelId) return;
    await masters.updateJack(selectedPanelId, jackId, patch);
    notifySuccess("保存しました");
  };

  const selectAndPage = (sel: TechPanelBoardSelection) => {
    setSelected(sel);
    setPage(Math.floor((sel.jackNo - 1) / 8));
  };

  const selectedPanel = panels.find((p) => p.id === selectedPanelId) ?? null;
  const progressPct =
    selectedPanel && selectedPanel.jack_count > 0
      ? Math.round((selectedPanel.filled_count / selectedPanel.jack_count) * 100)
      : 0;

  return (
    <PageShell>
      <PageHeader
        title="パッチ盤"
        sub="VJP100〜VJP1800 のパッチ番号ごとの機材と名称。完成図書から転記して編集します。"
        primaryAction={
          canEdit ? (
            <Button
              className="min-h-tap"
              onClick={() => notifyInfo("盤を追加", { description: "盤の名前・ch数・型番・場所を入れて追加します。" })}
            >
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />盤を追加
            </Button>
          ) : undefined
        }
      >
        <Button
          type="button"
          variant="outline"
          className="min-h-tap"
          onClick={() => notifyInfo("完成図書を開く", { description: "BOX のパッチ盤外観図（PDF）を別のタブで開きます。" })}
        >
          <ExternalLink className="mr-1 h-4 w-4" aria-hidden="true" />完成図書を開く
        </Button>
      </PageHeader>

      {masters.panelsLoading && panels.length === 0 && (
        <Delayed>
          <SkeletonRows rows={6} />
        </Delayed>
      )}

      {!masters.panelsLoading && panels.length === 0 && (
        <EmptyState
          title="パッチ盤がありません"
          description="盤を追加すると、番号ごとの機材と名称を転記できます。"
        />
      )}

      {panels.length > 0 && (
        <div className="flex items-start gap-3.5 overflow-x-auto">
          {/* 盤の一覧 */}
          <div
            className="shrink-0 overflow-hidden rounded-card border border-border bg-card"
            style={{ width: 248 }}
          >
            <div className="flex h-[38px] items-center gap-2 border-b border-border px-3">
              <span className="text-sub font-bold text-foreground">映像パッチ盤</span>
              <span className="font-number rounded-badge-xs bg-muted px-1.5 text-badge font-bold text-muted-foreground">
                {panels.length} 枚
              </span>
            </div>
            {panels.map((p) => {
              const isSel = p.id === selectedPanelId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPanelId(p.id)}
                  className={cn(
                    "flex h-10 w-full items-center gap-2 border-b border-l-[3px] border-border-faint px-3",
                    isSel ? "border-l-primary bg-primary/5" : "border-l-transparent hover:bg-accent",
                  )}
                >
                  <span className="min-w-0 flex-1 text-left">
                    <span
                      className={cn(
                        "font-number block truncate text-sub-sm font-bold",
                        isSel ? "text-primary" : "text-foreground",
                      )}
                    >
                      {p.name}
                    </span>
                    <span className="block truncate text-note text-muted-foreground">{panelSubLabel(p)}</span>
                  </span>
                  <span
                    className={cn(
                      "font-number inline-flex h-[19px] shrink-0 items-center justify-center rounded-badge-xs text-badge font-bold",
                      isSel ? "bg-primary-surface text-primary" : "bg-muted text-muted-foreground",
                    )}
                    style={{ width: 52 }}
                  >
                    使用中 {p.filled_count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 盤の絵 ＋ 番号の表 */}
          <div className="flex w-[596px] shrink-0 flex-col gap-3.5">
            {!detail && (
              <Delayed>
                <SkeletonRows rows={6} />
              </Delayed>
            )}
            {detail && (
              <>
                <TechPanelBoard panel={detail.panel} jacks={detail.jacks} selected={selected} onSelect={selectAndPage} />
                <TechPanelJackTable
                  panel={detail.panel}
                  jacks={detail.jacks}
                  page={page}
                  onPageChange={setPage}
                  selected={selected}
                  onSelectRow={selectAndPage}
                  canEdit={canEdit}
                  onSave={saveJack}
                />
              </>
            )}
          </div>

          {/* 右の欄 */}
          <div className="flex w-[264px] shrink-0 flex-col gap-3">
            {detail && (
              <>
                <div className="rounded-card border border-border bg-card p-3">
                  <div className="text-cardtitle text-foreground">盤の情報</div>
                  {(
                    [
                      ["型番", detail.panel.model],
                      [
                        "ch数",
                        detail.panel.kind === "trunk"
                          ? `TRK 1〜${detail.panel.jack_count}（多芯）`
                          : `${detail.panel.jack_count} ch（A段・B段）`,
                      ],
                      ["場所", detail.panel.location],
                      ["最終更新", formatUpdatedAt(detail.panel.updated_at)],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex items-start gap-2.5 border-b border-border-faint py-1.5 last:border-b-0">
                      <span
                        className="shrink-0 text-note leading-relaxed text-muted-foreground"
                        style={{ width: 62 }}
                      >
                        {k}
                      </span>
                      <span className="font-number min-w-0 flex-1 text-sub-sm font-bold leading-relaxed">{v || "—"}</span>
                    </div>
                  ))}
                </div>

                {selectedPanel && (
                  <div className="rounded-card border border-border bg-card p-3">
                    <div className="text-cardtitle text-foreground">転記の進捗</div>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <StatValue size="sm" className="text-primary">
                        {selectedPanel.filled_count}
                      </StatValue>
                      <span className="font-number text-sub font-bold text-muted-foreground">
                        ／ {selectedPanel.jack_count}
                      </span>
                    </div>
                    <div className="mt-0.5 text-note text-muted-foreground">機材と名称を入力したパッチ番号</div>
                    <div className="mt-2 flex h-2 overflow-hidden rounded-chip bg-muted">
                      <span className="bg-primary" style={{ width: `${progressPct}%` }} />
                    </div>
                    <div className="mt-2 text-note leading-relaxed text-muted-foreground">
                      残りは空きのままにしてあります。
                    </div>
                  </div>
                )}

                <div className="rounded-card border border-border bg-card p-3">
                  <div className="text-cardtitle text-foreground">転記のルール</div>
                  <p className="mt-1.5 text-note leading-relaxed text-muted-foreground">
                    番号と機材の対応は完成図書の外観図から人が転記します。転記した内容は技術資料の映像パッチでそのまま選べます。
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
