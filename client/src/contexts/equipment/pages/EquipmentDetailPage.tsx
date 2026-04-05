import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Package,
  Link as LinkIcon,
} from "lucide-react";

interface LendingRecord {
  id: string;
  borrower_name: string;
  project_name?: string;
  lent_date: string;
  due_date?: string;
  returned_date?: string;
  status: string;
}

interface MaintenanceRecord {
  id: string;
  maintenance_type: string;
  title: string;
  status: string;
  scheduled_date?: string;
  completed_date?: string;
}

interface Accessory {
  id: string;
  name: string;
  eq_code?: string;
}

interface ChildItem {
  id: string;
  eq_code: string;
  name: string;
  status: string;
}

interface ParentItem {
  id: string;
  eq_code: string;
  name: string;
}

interface EquipmentDetail {
  id: string;
  eq_code: string;
  name: string;
  category_id: string;
  category_name?: string;
  item_type: "facility" | "rental";
  status: string;
  condition?: string;
  location_name?: string;
  location_id?: string;
  manufacturer?: string;
  model_number?: string;
  serial_number?: string;
  description?: string;
  is_lendable?: boolean;
  asset_number?: string;
  acquisition_date?: string;
  acquisition_cost?: number;
  book_value?: number;
  depreciation?: number;
  parent?: ParentItem | null;
  children?: ChildItem[];
  lendings?: LendingRecord[];
  maintenance?: MaintenanceRecord[];
  accessories?: Accessory[];
}

interface Category {
  id: string;
  name: string;
}

const statusLabels: Record<string, string> = {
  active: "稼働中",
  in_repair: "修理中",
  retired: "退役",
  disposed: "廃棄",
  lost: "紛失",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  in_repair: "bg-yellow-100 text-yellow-700",
  retired: "bg-gray-100 text-gray-600",
  disposed: "bg-red-100 text-red-700",
  lost: "bg-red-100 text-red-700",
};

const lendingStatusLabels: Record<string, string> = {
  active: "貸出中",
  returned: "返却済",
  overdue: "延滞",
};

const lendingStatusColors: Record<string, string> = {
  active: "bg-blue-100 text-blue-700",
  returned: "bg-gray-100 text-gray-600",
  overdue: "bg-red-100 text-red-700",
};

const maintenanceStatusLabels: Record<string, string> = {
  open: "未対応",
  in_progress: "対応中",
  completed: "完了",
};

const maintenanceStatusColors: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

const itemTypeLabels: Record<string, string> = {
  facility: "設備",
  rental: "レンタル",
};

interface FormState {
  name: string;
  category_id: string;
  item_type: string;
  manufacturer: string;
  model_number: string;
  serial_number: string;
  status: string;
  condition: string;
  is_lendable: boolean;
}

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: "",
    category_id: "",
    item_type: "facility",
    manufacturer: "",
    model_number: "",
    serial_number: "",
    status: "active",
    condition: "",
    is_lendable: false,
  });

  const { data: item, isLoading } = useQuery<EquipmentDetail>({
    queryKey: ["equipment-item", id],
    queryFn: async () => {
      const res = await api.get(`/equipment/items/${id}`);
      return res.data.data ?? res.data;
    },
    enabled: !!id,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["equipment-categories"],
    queryFn: async () => (await api.get("/equipment/categories")).data,
    enabled: dialogOpen,
  });
  const categories: Category[] = categoriesData?.data ?? [];

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.put(`/equipment/items/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-item", id] });
      qc.invalidateQueries({ queryKey: ["equipment-items"] });
      setDialogOpen(false);
    },
  });

  const handleOpenEdit = () => {
    if (!item) return;
    setForm({
      name: item.name,
      category_id: item.category_id || "",
      item_type: item.item_type || "facility",
      manufacturer: item.manufacturer || "",
      model_number: item.model_number || "",
      serial_number: item.serial_number || "",
      status: item.status || "active",
      condition: item.condition || "",
      is_lendable: !!item.is_lendable,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name || !form.category_id) return;
    updateMutation.mutate({ ...form });
  };

  if (isLoading) {
    return (
      <PageTransition>
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageTransition>
    );
  }

  if (!item) {
    return (
      <PageTransition>
        <div className="p-3 lg:p-6 space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/equipment/items")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            戻る
          </Button>
          <p className="text-center text-muted-foreground py-8">機材が見つかりませんでした</p>
        </div>
      </PageTransition>
    );
  }

  const hasSetStructure = (item.children && item.children.length > 0) || item.parent;

  return (
    <PageTransition>
      <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
        {/* Back button */}
        <Button variant="ghost" size="sm" onClick={() => navigate("/equipment/items")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          機材一覧に戻る
        </Button>

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl lg:text-2xl font-bold">
            <span className="font-mono text-muted-foreground mr-2">{item.eq_code}</span>
            {item.name}
          </h1>
          <Badge className={statusColors[item.status] || "bg-gray-100 text-gray-600"}>
            {statusLabels[item.status] || item.status}
          </Badge>
          <Button variant="outline" size="sm" onClick={handleOpenEdit} className="ml-auto">
            <Pencil className="mr-1 h-4 w-4" />
            編集
          </Button>
        </div>

        {/* 基本情報 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">基本情報</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">メーカー</dt>
                <dd className="font-medium">{item.manufacturer || "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">型番</dt>
                <dd className="font-medium">{item.model_number || "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">シリアル番号</dt>
                <dd className="font-medium font-mono">{item.serial_number || "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">カテゴリ</dt>
                <dd className="font-medium">{item.category_name || "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">種別</dt>
                <dd className="font-medium">{itemTypeLabels[item.item_type] || item.item_type}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">コンディション</dt>
                <dd className="font-medium">{item.condition || "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">ロケーション</dt>
                <dd className="font-medium">{item.location_name || "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">貸出可能</dt>
                <dd className="font-medium">{item.is_lendable ? "○" : "×"}</dd>
              </div>
              {item.description && (
                <div className="col-span-2 sm:col-span-3 lg:col-span-4">
                  <dt className="text-muted-foreground text-xs">備考</dt>
                  <dd className="font-medium">{item.description}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* 資産情報 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">資産情報</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">資産番号</dt>
                <dd className="font-medium font-mono">{item.asset_number || "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">取得日</dt>
                <dd className="font-medium">{formatDate(item.acquisition_date)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">取得原価</dt>
                <dd className="font-medium font-number">
                  {item.acquisition_cost != null ? formatCurrency(item.acquisition_cost) : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">帳簿価額</dt>
                <dd className="font-medium font-number">
                  {item.book_value != null ? formatCurrency(item.book_value) : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">減価償却累計</dt>
                <dd className="font-medium font-number">
                  {item.depreciation != null ? formatCurrency(item.depreciation) : "-"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* セット構成 */}
        {hasSetStructure && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" />
                セット構成
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {item.parent && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">親機材</p>
                  <Link
                    to={`/equipment/items/${item.parent.id}`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    <LinkIcon className="h-3 w-3" />
                    <span className="font-mono">{item.parent.eq_code}</span>
                    {item.parent.name}
                  </Link>
                </div>
              )}
              {item.children && item.children.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    子機材 ({item.children.length}点)
                  </p>
                  <div className="space-y-1">
                    {item.children.map((child) => (
                      <div key={child.id} className="flex items-center gap-2 pl-4 border-l-2 border-muted py-1">
                        <Link
                          to={`/equipment/items/${child.id}`}
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <span className="font-mono text-xs">{child.eq_code}</span>
                          <span>{child.name}</span>
                        </Link>
                        <Badge className={`text-[10px] ${statusColors[child.status] || "bg-gray-100 text-gray-600"}`}>
                          {statusLabels[child.status] || child.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 貸出履歴 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">貸出履歴</CardTitle>
          </CardHeader>
          <CardContent>
            {!item.lendings || item.lendings.length === 0 ? (
              <p className="text-sm text-muted-foreground">貸出履歴はありません</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>借用者</TableHead>
                      <TableHead>案件</TableHead>
                      <TableHead>貸出日</TableHead>
                      <TableHead>返却期限</TableHead>
                      <TableHead>返却日</TableHead>
                      <TableHead>ステータス</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {item.lendings.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-sm">{l.borrower_name}</TableCell>
                        <TableCell className="text-sm">{l.project_name || "-"}</TableCell>
                        <TableCell className="text-sm">{formatDate(l.lent_date)}</TableCell>
                        <TableCell className="text-sm">{formatDate(l.due_date)}</TableCell>
                        <TableCell className="text-sm">{formatDate(l.returned_date)}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${lendingStatusColors[l.status] || "bg-gray-100 text-gray-600"}`}>
                            {lendingStatusLabels[l.status] || l.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* メンテナンス履歴 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">メンテナンス履歴</CardTitle>
          </CardHeader>
          <CardContent>
            {!item.maintenance || item.maintenance.length === 0 ? (
              <p className="text-sm text-muted-foreground">メンテナンス履歴はありません</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>種別</TableHead>
                      <TableHead>タイトル</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead>予定日</TableHead>
                      <TableHead>完了日</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {item.maintenance.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm">{m.maintenance_type}</TableCell>
                        <TableCell className="text-sm">{m.title}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${maintenanceStatusColors[m.status] || "bg-gray-100 text-gray-600"}`}>
                            {maintenanceStatusLabels[m.status] || m.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(m.scheduled_date)}</TableCell>
                        <TableCell className="text-sm">{formatDate(m.completed_date)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* アクセサリ */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">アクセサリ</CardTitle>
          </CardHeader>
          <CardContent>
            {!item.accessories || item.accessories.length === 0 ? (
              <p className="text-sm text-muted-foreground">アクセサリはありません</p>
            ) : (
              <div className="space-y-1">
                {item.accessories.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-md border p-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    {a.eq_code && (
                      <span className="font-mono text-xs text-muted-foreground">{a.eq_code}</span>
                    )}
                    <span className="text-sm font-medium">{a.name}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>機材編集</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>名称 *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="機材名"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>カテゴリ *</Label>
                  <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>種別 *</Label>
                  <Select value={form.item_type} onValueChange={(v) => setForm({ ...form, item_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="facility">設備</SelectItem>
                      <SelectItem value="rental">レンタル</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>メーカー</Label>
                  <Input
                    value={form.manufacturer}
                    onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                    placeholder="メーカー名"
                  />
                </div>
                <div>
                  <Label>型番</Label>
                  <Input
                    value={form.model_number}
                    onChange={(e) => setForm({ ...form, model_number: e.target.value })}
                    placeholder="型番"
                  />
                </div>
              </div>

              <div>
                <Label>シリアル番号</Label>
                <Input
                  value={form.serial_number}
                  onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                  placeholder="シリアル番号"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>ステータス</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(statusLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>コンディション</Label>
                  <Input
                    value={form.condition}
                    onChange={(e) => setForm({ ...form, condition: e.target.value })}
                    placeholder="良好 / 要注意 等"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit_is_lendable"
                  checked={form.is_lendable}
                  onCheckedChange={(checked) => setForm({ ...form, is_lendable: !!checked })}
                />
                <Label htmlFor="edit_is_lendable" className="cursor-pointer">貸出可能</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button
                disabled={!form.name || !form.category_id || updateMutation.isPending}
                onClick={handleSubmit}
              >
                {updateMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                更新
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
