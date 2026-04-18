import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Copy, Loader2, Wrench, ArrowRightLeft, Package, QrCode, Printer, Link2, X,
} from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const statusLabels: Record<string, string> = {
  active: "稼働中", in_repair: "修理中", retired: "引退", disposed: "廃棄", lost: "紛失",
};
const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800", in_repair: "bg-amber-100 text-amber-800",
  retired: "bg-gray-100 text-gray-600", disposed: "bg-red-100 text-red-800",
  lost: "bg-red-200 text-red-900",
};
const conditionLabels: Record<string, string> = {
  excellent: "優良", good: "良好", fair: "可", poor: "不良",
};
const maintenanceTypeLabels: Record<string, string> = {
  breakdown: "故障", repair: "修理", maintenance: "メンテナンス", inspection: "点検",
};
const maintenanceStatusLabels: Record<string, string> = {
  reported: "報告済", in_progress: "対応中", completed: "完了", cancelled: "キャンセル",
};

const TYPE_LABELS: Record<string, string> = { V: '映像', C: 'カメラ', A: '音声', IC: 'インカム', NW: 'ネットワーク', L: '照明', XR: 'LED/XR', E: '設備' };
const ASSET_CLASS_LABELS: Record<string, string> = {
  fixed_asset: '固定資産', consumable: '消耗品', leased: 'リース', transferred: '譲渡',
};
const SECTION_LABELS: Record<string, string> = { equipment: '設備', rental: '貸出' };
function sectionLabel(typeCode: string | null, section: string | null) {
  return `${TYPE_LABELS[typeCode || ''] || ''}${SECTION_LABELS[section || ''] || ''}` || '-';
}

export default function EquipmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [qrOpen, setQrOpen] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["equipment-item", id],
    queryFn: async () => (await api.get(`/equipment/items/${id}`)).data.data,
    enabled: !!id,
  });

  const { data: allItemsData } = useQuery({
    queryKey: ["equipment-items-all"],
    queryFn: async () => (await api.get("/equipment/items")).data.data,
  });
  const allItems: any[] = allItemsData ?? [];

  const attachMutation = useMutation({
    mutationFn: (childId: string) => api.put(`/equipment/items/${childId}`, { parent_id: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-item", id] });
      qc.invalidateQueries({ queryKey: ["equipment-items-all"] });
      setSelectedChildId("");
    },
  });

  const detachMutation = useMutation({
    mutationFn: (childId: string) => api.put(`/equipment/items/${childId}`, { parent_id: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-item", id] });
      qc.invalidateQueries({ queryKey: ["equipment-items-all"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-muted-foreground">機材が見つかりません</div>
    );
  }

  const item = data;

  const copyEqCode = () => {
    navigator.clipboard.writeText(item.eq_code);
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/equipment/items")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[item.status] || ""}`}>
              {statusLabels[item.status]}
            </span>
            <Badge variant="outline">{item.equipment_section === "rental" ? "貸出" : "設備"}</Badge>
            {item.category_name && (
              <span className="text-xs text-muted-foreground">{item.category_name}</span>
            )}
          </div>
          <h1 className="heading-page text-xl mt-1">
            {item.name}
            {item.unit_number && <span className="text-primary ml-2">No.{item.unit_number}</span>}
          </h1>
          <button
            onClick={copyEqCode}
            className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground mt-1 transition-colors"
            title="IDをコピー"
          >
            <QrCode className="h-3 w-3" />
            {item.eq_code}
            <Copy className="h-2.5 w-2.5 opacity-40" />
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
          <Printer className="h-4 w-4 mr-1" />
          QRコード
        </Button>
      </div>

      {/* QRコード表示・印刷ダイアログ */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QRコード — {item.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            <img
              src={`/api/v1/internal/equipment/items/${id}/qr`}
              alt="QRコード"
              className="w-56 h-56 border rounded bg-white p-2"
            />
            <p className="font-mono text-sm">{item.eq_code}</p>
            <p className="text-xs text-muted-foreground text-center">{item.name}</p>
            <Button onClick={() => window.print()} className="w-full">
              <Printer className="h-4 w-4 mr-1" />
              印刷
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 基本情報 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" />
              基本情報
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {item.branch_code && <InfoRow label="所管" value={item.branch_code} />}
            <InfoRow label="資産管理" value={ASSET_CLASS_LABELS[item.asset_class] || item.asset_class} />
            <InfoRow label="機材セクション" value={sectionLabel(item.equipment_type_code, item.equipment_section)} />
            <InfoRow label="メーカー" value={item.manufacturer_name || item.manufacturer} />
            <InfoRow label="機材名 (型番)" value={item.model_number} />
            <InfoRow label="シリアルNo" value={item.serial_number} />
            <InfoRow label="設置場所" value={item.location_name || item.location_detail} />
            <InfoRow label="コンディション" value={conditionLabels[item.condition]} />
            {item.notes && <InfoRow label="備考" value={item.notes} />}
          </CardContent>
        </Card>

        {/* Asset info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">資産情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="固定資産コード" value={item.fixed_asset_code || '(消耗品)'} />
            <InfoRow label="償却年数" value={item.depreciation_years != null ? `${item.depreciation_years}年` : null} />
            <InfoRow label="購入年月" value={item.purchased_at?.slice(0, 10)} />
            <InfoRow label="保証期間" value={item.warranty_years ? `${item.warranty_years}年` : null} />
            <InfoRow label="保証終了" value={item.warranty_end?.slice(0, 10)} />
            {item.asset_number && <InfoRow label="管理番号" value={item.asset_number} />}
            {item.acquisition_cost && <InfoRow label="取得価額" value={`¥${item.acquisition_cost.toLocaleString()}`} />}
          </CardContent>
        </Card>

        {/* Lending history (rental only) */}
        {item.equipment_section === "rental" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              貸出履歴
              {item.is_lendable ? (
                <Badge variant="outline" className="text-xs">貸出可</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(item.lendings || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">履歴なし</p>
            ) : (
              <div className="space-y-2">
                {item.lendings.map((l: any) => (
                  <div key={l.id} className="text-sm border rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{l.borrower_name}</span>
                      <span className={`text-xs rounded-full px-2 py-0.5 ${l.status === "lent" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                        {l.status === "lent" ? "貸出中" : "返却済"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {l.lent_at?.split("T")[0]} → {l.returned_at?.split("T")[0] || l.due_date || "未定"}
                    </div>
                    {l.purpose && <div className="text-xs text-muted-foreground">{l.purpose}</div>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Maintenance records */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              メンテナンス記録
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(item.maintenance || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">記録なし</p>
            ) : (
              <div className="space-y-2">
                {item.maintenance.map((m: any) => (
                  <div key={m.id} className="text-sm border rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{m.title}</span>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs">
                          {maintenanceTypeLabels[m.record_type]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {maintenanceStatusLabels[m.status]}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {m.reported_at?.split("T")[0]}
                      {m.repair_cost ? ` / 費用: ¥${m.repair_cost.toLocaleString()}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 関連機材 / オプション品 */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              関連機材 / オプション品
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 付属品リスト（children） */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">付属品 / オプション品（この機材に紐付いているもの）</p>
              {(item.children ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">なし</p>
              ) : (
                <div className="space-y-1">
                  {item.children.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <button
                        className="flex items-center gap-2 hover:underline text-left"
                        onClick={() => navigate(`/equipment/items/${c.id}`)}
                      >
                        <span className="font-mono text-xs text-muted-foreground">{c.eq_code}</span>
                        <span>{c.name}</span>
                      </button>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="取り外す"
                        onClick={() => detachMutation.mutate(c.id)}
                        disabled={detachMutation.isPending}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* 機材追加コンボボックス */}
              <div className="flex gap-2 mt-3">
                <Select value={selectedChildId || "none"} onValueChange={(v) => setSelectedChildId(v === "none" ? "" : v)}>
                  <SelectTrigger className="flex-1 text-sm">
                    <SelectValue placeholder="機材を選択して追加..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— 機材を選択 —</SelectItem>
                    {allItems
                      .filter((it: any) => it.id !== id && it.parent_id !== id && it.id !== item.parent_id)
                      .map((it: any) => (
                        <SelectItem key={it.id} value={it.id}>
                          {it.eq_code} — {it.name}{it.unit_number ? ` No.${it.unit_number}` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!selectedChildId || attachMutation.isPending}
                  onClick={() => attachMutation.mutate(selectedChildId)}
                >
                  追加
                </Button>
              </div>
            </div>

            {/* 親機材表示 */}
            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">親機材（この機材が付属している先）</p>
              {item.parent ? (
                <button
                  className="flex items-center gap-2 text-sm hover:underline"
                  onClick={() => navigate(`/equipment/items/${item.parent.id}`)}
                >
                  <span className="font-mono text-xs text-muted-foreground">{item.parent.eq_code}</span>
                  <span>{item.parent.name}</span>
                </button>
              ) : (
                <p className="text-sm text-muted-foreground">なし</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
