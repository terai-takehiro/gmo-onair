import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@gmo-onair/shared/src/client/ui/switch";
import { EnhancedCheckbox } from "@gmo-onair/shared/src/client/ui/enhanced-checkbox";
import { ToggleButtonGroup } from "@gmo-onair/shared/src/client/ui/toggle-button-group";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Plus, Search, Package, Pencil, Trash2, Upload, Download, Edit3, X,
  ChevronRight, ChevronDown, ChevronsUpDown, ArrowUp, ArrowDown, Copy, Printer, MapPin,
  SlidersHorizontal, Settings2, RotateCcw,
} from "lucide-react";
import ExcelImportDialog from "@/components/ExcelImportDialog";
import CustomColumnDialog, { type CustomColumn } from "@/components/CustomColumnDialog";
import BranchCodeInput from "@/components/ui/BranchCodeInput";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";
import {
  TYPE_CODES, ASSET_CLASS_OPTIONS, ASSET_CLASS_LABELS, SECTIONS, LOC_CODES,
  RACK_SLOT_OPTIONS, TYPE_BORDER_COLOR, CONDITION_LABELS,
} from "@/lib/constants";

const sectionDisplay = (typeCode: string | null, section: string | null) => {
  const t = TYPE_CODES.find((c) => c.code === typeCode)?.label || "";
  const s = SECTIONS.find((c) => c.value === section)?.label || "";
  return `${t}${s}`.trim() || "-";
};


const COL_DEFS = [
  { key: 'eq_code',          label: 'ID',        sortKey: 'eq_code',             default: true  },
  { key: 'equipment_type',   label: '種別',       sortKey: 'equipment_type_code', default: true  },
  { key: 'location',         label: '設置場所',   sortKey: 'location_name',       default: true  },
  { key: 'name',             label: '商品名',     sortKey: 'name',                default: true  },
  { key: 'manufacturer',     label: 'メーカー',   sortKey: 'manufacturer_name',   default: false },
  { key: 'model_number',     label: '型名',       sortKey: 'model_number',        default: true  },
  { key: 'serial_number',    label: 'シリアル',   sortKey: 'serial_number',       default: false },
  { key: 'unit_number',      label: 'No',         sortKey: 'unit_number',         default: true  },
  { key: 'condition',        label: '状態',       sortKey: 'condition',           default: false },
  { key: 'fixed_asset_code', label: '資産コード', sortKey: 'fixed_asset_code',    default: false },
  { key: 'notes',            label: '備考',       sortKey: 'notes',               default: true  },
] as const;
type ColKey = typeof COL_DEFS[number]['key'];

const PRINT_COLS = [
  { key: 'eq_code',           label: 'ID'        },
  { key: 'equipment_type',    label: '種別'       },
  { key: 'name',              label: '商品名'     },
  { key: 'manufacturer_name', label: 'メーカー'   },
  { key: 'model_number',      label: '型名'       },
  { key: 'unit_number',       label: 'No.'        },
  { key: 'serial_number',     label: 'serial'     },
  { key: 'location',          label: '設置場所'   },
  { key: 'fixed_asset_code',  label: '資産コード' },
  { key: 'purchased_at',      label: '購入年月'   },
  { key: 'warranty_years',    label: '保証'       },
  { key: 'notes',             label: '備考'       },
] as const;

const defaultForm = {
  name: "", model_number: "", unit_number: "", serial_number: "",
  branch_code: "GMO-IG", asset_class: "fixed_asset", fixed_asset_code: "", depreciation_years: "",
  equipment_section: "equipment", equipment_type_code: "V", location_code: "Y",
  manufacturer_id: "", purchased_at: "", warranty_years: "",
  location_id: "", status: "active", condition: "good", notes: "",
  parent_id: "",
  color_id: "",
  rack_position: "", rack_height: "1", rack_slot: "full", rack_side: "front",
};

type BulkField = 'branch_code' | 'asset_class' | 'equipment_section' | 'equipment_type_code' | 'location_id' | 'purchased_at' | 'warranty_years' | 'depreciation_years' | 'status' | 'notes' | 'name' | 'manufacturer_id' | 'model_number' | 'serial_number' | 'unit_number' | 'fixed_asset_code' | 'condition' | 'color_id' | 'location_detail' | 'rack_position' | 'rack_height' | 'rack_slot' | 'rack_side';

export default function EquipmentListPage({ embedded }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { currentUser, hasPermission } = useAuth();
  const canEdit   = hasPermission('equipment', 'editor');
  const canDelete = hasPermission('equipment', 'manager');
  const canBulkEdit = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === 'system_admin') return true;
    const lvl = currentUser.permissions?.equipment;
    return lvl === 'manager' || lvl === 'owner';
  }, [currentUser]);

  // タブ・ソート・検索は URL params で管理（詳細ページから戻ったとき状態を維持するため）
  const filterBlock = searchParams.get('tab') ?? '';
  const sortKey: string | null = searchParams.get('sort') || null;
  const sortDir: 'asc' | 'desc' = (searchParams.get('dir') as 'asc' | 'desc') || 'asc';
  const includeChildren = searchParams.get('children') === '1';
  const urlSearch = searchParams.get('q') ?? '';
  const filterSection = searchParams.get('sect') ?? '';
  const filterLocsParam = searchParams.get('locs') ?? '';
  const filterLocs = useMemo(() => new Set(filterLocsParam ? filterLocsParam.split(',') : []), [filterLocsParam]);

  // 検索入力はローカルで持ち、400ms デバウンス後に URL に反映
  const [search, setSearch] = useState(urlSearch);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchParams(p => {
        const n = new URLSearchParams(p);
        if (search) n.set('q', search); else n.delete('q');
        return n;
      }, { replace: true });
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // 詳細ページ遷移前にスクロール位置を保存
  const navigateToDetail = (id: string) => {
    sessionStorage.setItem('eq-list-scroll', String(window.scrollY));
    navigate(`/equipment/items/${id}`);
  };

  // 子機材展開
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [childrenCache, setChildrenCache] = useState<Record<string, any[]>>({});
  const [loadingChildren, setLoadingChildren] = useState<Set<string>>(new Set());

  const toggleExpand = async (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const id: string = item.id;
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      next.add(id);
      return next;
    });
    if (!childrenCache[id]) {
      setLoadingChildren(prev => new Set(prev).add(id));
      try {
        const res = await api.get('/equipment/items', { params: { parent_id: id } });
        setChildrenCache(prev => ({ ...prev, [id]: res.data.data ?? [] }));
      } finally {
        setLoadingChildren(prev => { const n = new Set(prev); n.delete(id); return n; });
      }
    }
  };

  // 商品名オートコンプリート用
  const [suggestItems, setSuggestItems] = useState<any[]>([]);
  const [suggestTimer, setSuggestTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleNameChange = (val: string) => {
    setForm(f => ({ ...f, name: val }));
    if (suggestTimer) clearTimeout(suggestTimer);
    if (!val.trim()) { setSuggestItems([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.get('/equipment/items', { params: { search: val, include_children: '1' } });
        const found: any[] = res.data.data ?? [];
        // 完全一致する商品名があれば自動入力
        const exact = found.filter((i: any) => i.name.toLowerCase() === val.toLowerCase());
        if (exact.length > 0) {
          const maxUnit = Math.max(0, ...exact.map((i: any) => Number(i.unit_number) || 0));
          // 型名が複数ある場合はドロップダウンで選ばせる、1種類なら即時自動入力
          const models = [...new Set(exact.map((i: any) => i.model_number ?? ''))];
          if (models.length === 1) {
            setForm(f => ({
              ...f,
              name: val,
              model_number: exact[0].model_number || f.model_number,
              manufacturer_id: exact[0].manufacturer_id || f.manufacturer_id,
              unit_number: String(maxUnit + 1),
            }));
            setSuggestItems([]);
          } else {
            // 同名で型名が複数 → 選択肢を出す
            setSuggestItems(exact);
          }
        } else {
          setSuggestItems([]);
        }
      } catch { setSuggestItems([]); }
    }, 400);
    setSuggestTimer(t);
  };

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCopyMode, setIsCopyMode] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState({ ...defaultForm });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkField, setBulkField] = useState<BulkField>('branch_code');
  const [bulkValue, setBulkValue] = useState<string>('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [tableEditMode, setTableEditMode] = useState(false);
  const [tableEdits, setTableEdits] = useState<Record<string, Record<string, string>>>({});
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!colPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setColPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colPickerOpen]);
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    try {
      const saved = localStorage.getItem('eq-visible-cols');
      if (saved) return new Set(JSON.parse(saved)) as Set<ColKey>;
    } catch {}
    return new Set(COL_DEFS.filter(c => c.default).map(c => c.key)) as Set<ColKey>;
  });
  const toggleCol = (key: ColKey) => setVisibleCols(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    localStorage.setItem('eq-visible-cols', JSON.stringify([...next]));
    return next;
  });

  // 列の表示順 (localStorage で永続化)
  const DEFAULT_COL_ORDER = COL_DEFS.map(c => c.key) as ColKey[];
  const [colOrder, setColOrder] = useState<ColKey[]>(() => {
    try {
      const saved = localStorage.getItem('eq-col-order');
      if (saved) {
        const parsed: ColKey[] = JSON.parse(saved);
        // 新しい列が追加されていれば末尾に追加して保持
        const allKeys = COL_DEFS.map(c => c.key) as ColKey[];
        const merged = [...parsed.filter(k => allKeys.includes(k)), ...allKeys.filter(k => !parsed.includes(k))];
        return merged;
      }
    } catch {}
    return DEFAULT_COL_ORDER;
  });
  const moveCol = (key: ColKey, dir: 'up' | 'down') => {
    setColOrder(prev => {
      const idx = prev.indexOf(key);
      if (idx < 0) return prev;
      const next = [...prev];
      if (dir === 'up' && idx > 0) [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      if (dir === 'down' && idx < next.length - 1) [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      localStorage.setItem('eq-col-order', JSON.stringify(next));
      return next;
    });
  };
  const resetColSettings = () => {
    localStorage.removeItem('eq-col-order');
    localStorage.removeItem('eq-visible-cols');
    localStorage.removeItem('eq-visible-custom-cols');
    localStorage.removeItem('eq-custom-col-order');
    localStorage.removeItem('eq-seen-custom-cols');
    setColOrder(DEFAULT_COL_ORDER);
    setVisibleCols(new Set(COL_DEFS.filter(c => c.default).map(c => c.key)) as Set<ColKey>);
    setVisibleCustomCols(new Set<string>());
    setCustomColOrder([]);
  };

  // カスタム列の表示/非表示
  const [visibleCustomCols, setVisibleCustomCols] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('eq-visible-custom-cols');
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set<string>();
  });
  const toggleCustomCol = (id: string) => setVisibleCustomCols(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    localStorage.setItem('eq-visible-custom-cols', JSON.stringify([...next]));
    return next;
  });

  // カスタム列の表示順
  const [customColOrder, setCustomColOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('eq-custom-col-order');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const moveCustomCol = (id: string, dir: 'up' | 'down', allIds: string[]) => {
    setCustomColOrder(prev => {
      const current = [...prev.filter(i => allIds.includes(i)), ...allIds.filter(i => !prev.includes(i))];
      const idx = current.indexOf(id);
      if (idx < 0) return prev;
      const next = [...current];
      if (dir === 'up' && idx > 0) [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      if (dir === 'down' && idx < next.length - 1) [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      localStorage.setItem('eq-custom-col-order', JSON.stringify(next));
      return next;
    });
  };

  const [customColDialogOpen, setCustomColDialogOpen] = useState(false);
  const [editingCustomCell, setEditingCustomCell] = useState<{ equipmentId: string; columnId: string } | null>(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printCols, setPrintCols] = useState<Set<string>>(
    new Set(['eq_code', 'equipment_type', 'name', 'manufacturer_name', 'model_number', 'unit_number', 'location', 'notes'])
  );
  const [printCheckbox, setPrintCheckbox] = useState(true);
  const [printTitle, setPrintTitle] = useState('機材一覧');
  const [printLandscape, setPrintLandscape] = useState(false);
  const [locFilterOpen, setLocFilterOpen] = useState(false);

  const toggleLocFilter = (locId: string) => {
    setSearchParams(p => {
      const n = new URLSearchParams(p);
      const cur = new Set((p.get('locs') ?? '').split(',').filter(Boolean));
      if (cur.has(locId)) cur.delete(locId); else cur.add(locId);
      if (cur.size > 0) n.set('locs', [...cur].join(',')); else n.delete('locs');
      return n;
    }, { replace: true });
  };

  const handlePrint = () => {
    if (printLandscape) document.body.classList.add('print-landscape');
    else document.body.classList.remove('print-landscape');
    setPrintDialogOpen(false);
    setTimeout(() => window.print(), 150);
  };

  // 連続登録時に引き継ぐフィールド
  const CARRY_OVER_KEYS = [
    'location_code', 'equipment_type_code', 'equipment_section',
    'branch_code', 'location_id', 'manufacturer_id', 'asset_class',
    'purchased_at', 'warranty_years', 'depreciation_years',
    'rack_side', 'color_id',
  ] as const;

  const downloadExcel = async () => {
    const res = await api.get('/equipment/items/export-xlsx', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `機材リスト_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { data: itemsData, isLoading, error: itemsError } = useQuery({
    queryKey: ["equipment-items", urlSearch, filterBlock, includeChildren],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (urlSearch) params.search = urlSearch;
      if (filterBlock) params.equipment_type_code = filterBlock;
      if (includeChildren) params.include_children = '1';
      return (await api.get("/equipment/items", { params })).data;
    },
  });
  const { data: locationsData } = useQuery({
    queryKey: ["equipment-locations"],
    queryFn: async () => (await api.get("/equipment/locations")).data.data,
  });
  const { data: manufacturersData } = useQuery({
    queryKey: ["equipment-manufacturers"],
    queryFn: async () => (await api.get("/equipment/manufacturers")).data.data,
  });
  const { data: colorsData } = useQuery({
    queryKey: ["equipment-colors"],
    queryFn: async () => (await api.get("/equipment/colors")).data.data,
  });
  const { data: customColumnsData } = useQuery<CustomColumn[]>({
    queryKey: ["equipment-custom-columns"],
    queryFn: async () => (await api.get("/equipment/custom-columns")).data.data,
  });

  const rawItems: any[] = itemsData?.data ?? [];
  const locations: any[] = locationsData ?? [];
  const manufacturers: any[] = manufacturersData ?? [];
  const colors: any[] = colorsData ?? [];
  const customColumns: CustomColumn[] = customColumnsData ?? [];

  // カスタム列を保存済み順で並べる (新列は末尾に追加)
  const orderedCustomCols = useMemo(() => {
    const colMap = new Map(customColumns.map(c => [c.id, c]));
    const ordered = customColOrder.filter(id => colMap.has(id)).map(id => colMap.get(id)!);
    const newOnes = customColumns.filter(c => !customColOrder.includes(c.id));
    return [...ordered, ...newOnes];
  }, [customColumns, customColOrder]);

  // カスタム値をまとめてフェッチ (表示中アイテムのIDで)
  const visibleItemIds = useMemo(() => rawItems.map((i: any) => i.id), [rawItems]);
  const { data: customValuesData } = useQuery({
    queryKey: ["equipment-custom-values", visibleItemIds.join(',')],
    queryFn: async () => {
      if (visibleItemIds.length === 0) return [];
      return (await api.get('/equipment/custom-values', { params: { equipment_ids: visibleItemIds.join(',') } })).data.data;
    },
    enabled: visibleItemIds.length > 0 && customColumns.length > 0,
  });
  // customValues: equipmentId → columnId → value（サーバー応答のキャッシュ集約用・読み取り専用）
  const serverCustomValues = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const row of (customValuesData ?? [])) {
      if (!map[row.equipment_id]) map[row.equipment_id] = {};
      map[row.equipment_id][row.column_id] = row.value ?? '';
    }
    return map;
  }, [customValuesData]);

  // ローカル state をカスタム列セル表示の「単一の真実の源」にする。
  // これで React Query のキャッシュ更新/refetch に関わらず UI は安定する。
  const [localValues, setLocalValues] = useState<Record<string, Record<string, string>>>({});
  // 書き込み中のキー (eq::col) を追跡。サーバーからの refetch が来ても上書きしない。
  const pendingKeysRef = useRef<Set<string>>(new Set());
  // カスタム列セルの保存失敗を残り続けるバナーとして表示するためのエラー一覧
  const [saveErrors, setSaveErrors] = useState<Array<{ id: number; msg: string }>>([]);
  const errorIdRef = useRef(0);
  const pendingKey = (equipmentId: string, columnId: string) => `${equipmentId}::${columnId}`;

  // サーバーから新しいデータが届いたらローカルにマージ。ただし書き込み中のセルは上書きしない。
  useEffect(() => {
    setLocalValues(prev => {
      const next: Record<string, Record<string, string>> = {};
      // サーバー値を基礎にセット
      for (const [eqId, colMap] of Object.entries(serverCustomValues)) {
        next[eqId] = { ...colMap };
      }
      // 書き込み中のキー（=ローカル値）で上書き
      for (const pk of pendingKeysRef.current) {
        const [eqId, colId] = pk.split('::');
        if (!next[eqId]) next[eqId] = {};
        const localVal = prev[eqId]?.[colId];
        if (localVal !== undefined) next[eqId][colId] = localVal;
      }
      return next;
    });
  }, [serverCustomValues]);

  // UIから参照する値: ローカル優先
  const customValues = localValues;

  const customValueMutation = useMutation({
    mutationFn: ({ equipmentId, columnId, value }: { equipmentId: string; columnId: string; value: string }) =>
      api.put(`/equipment/custom-values/${columnId}/${equipmentId}`, { value }),
    onError: (err: any, vars) => {
      // eslint-disable-next-line no-console
      console.error('[custom-value] save failed', err, vars);
      // ローカル state をサーバー値に戻す
      setLocalValues(prev => {
        const next = { ...prev };
        const serverVal = serverCustomValues[vars.equipmentId]?.[vars.columnId] ?? '';
        if (!next[vars.equipmentId]) next[vars.equipmentId] = {};
        next[vars.equipmentId] = { ...next[vars.equipmentId], [vars.columnId]: serverVal };
        return next;
      });
      const msg = err?.response?.data?.error?.message || err?.message || 'サーバーへの保存に失敗しました';
      const id = ++errorIdRef.current;
      setSaveErrors(prev => [...prev, { id, msg }]);
      // 15秒後に自動消去
      setTimeout(() => setSaveErrors(prev => prev.filter(e => e.id !== id)), 15000);
    },
    onSettled: (_data, _err, vars) => {
      const pk = pendingKey(vars.equipmentId, vars.columnId);
      pendingKeysRef.current.delete(pk);
    },
  });

  const writeCustomValue = (equipmentId: string, columnId: string, value: string) => {
    const pk = pendingKey(equipmentId, columnId);
    pendingKeysRef.current.add(pk);
    // ローカルを即座に更新（これが表示の真実の源）
    setLocalValues(prev => ({
      ...prev,
      [equipmentId]: { ...(prev[equipmentId] || {}), [columnId]: value },
    }));
    customValueMutation.mutate({ equipmentId, columnId, value });
  };

  // 新規カスタム列が追加されたら自動で表示ONにする
  // 「ユーザーが明示的に非表示にした列」と「まだ見たことがない新列」を区別するため、
  // 既知の列IDは別キーで追跡する
  useEffect(() => {
    if (customColumns.length === 0) return;
    const allIds = customColumns.map(c => c.id);
    const seenKey = 'eq-seen-custom-cols';
    const visKey = 'eq-visible-custom-cols';

    const savedSeen = localStorage.getItem(seenKey);
    const savedVis = localStorage.getItem(visKey);

    // 初回: 全列を表示＋既知として記録
    if (savedSeen === null && savedVis === null) {
      const idSet = new Set(allIds);
      setVisibleCustomCols(idSet);
      localStorage.setItem(visKey, JSON.stringify(allIds));
      localStorage.setItem(seenKey, JSON.stringify(allIds));
      return;
    }

    // 移行: 既知リストが未作成の場合、現在の可視リストを既知として記録
    // (ユーザーが以前に非表示にした列を"新列"として誤検出しないため)
    let seen: string[] = [];
    try {
      seen = savedSeen ? JSON.parse(savedSeen) : (savedVis ? JSON.parse(savedVis) : []);
    } catch { seen = []; }
    if (savedSeen === null) {
      localStorage.setItem(seenKey, JSON.stringify(seen));
    }

    // 既知リストに無い列だけが"新列"
    const seenSet = new Set(seen);
    const brandNewIds = allIds.filter(id => !seenSet.has(id));
    if (brandNewIds.length > 0) {
      setVisibleCustomCols(prev => {
        const next = new Set(prev);
        brandNewIds.forEach(id => next.add(id));
        localStorage.setItem(visKey, JSON.stringify([...next]));
        return next;
      });
      const nextSeen = [...seen, ...brandNewIds];
      localStorage.setItem(seenKey, JSON.stringify(nextSeen));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customColumns.length]);

  // データ読み込み完了後にスクロール位置を復元
  useEffect(() => {
    if (isLoading) return;
    const saved = sessionStorage.getItem('eq-list-scroll');
    if (!saved) return;
    sessionStorage.removeItem('eq-list-scroll');
    requestAnimationFrame(() => window.scrollTo({ top: +saved, behavior: 'instant' as ScrollBehavior }));
  }, [isLoading]);

  // カラムソート — URL params で管理（詳細→戻るでリセットされない）
  const onSort = (key: string) => {
    setSearchParams(p => {
      const n = new URLSearchParams(p);
      if (sortKey !== key) { n.set('sort', key); n.set('dir', 'asc'); }
      else if (sortDir === 'asc') { n.set('dir', 'desc'); }
      else { n.delete('sort'); n.delete('dir'); } // 3クリック目で既定に戻す
      return n;
    }, { replace: true });
  };
  const items = useMemo(() => {
    const sortFn = (a: any, b: any) => {
      if (!sortKey) return 0;
      const av = a?.[sortKey]; const bv = b?.[sortKey];
      const aNull = av == null || av === ''; const bNull = bv == null || bv === '';
      if (aNull && bNull) return 0; if (aNull) return 1; if (bNull) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      const cmp = String(av).localeCompare(String(bv), 'ja');
      return sortDir === 'asc' ? cmp : -cmp;
    };

    const matchesFilter = (item: any): boolean => {
      if (filterSection && item.equipment_section !== filterSection) return false;
      if (filterLocs.size > 0 && !filterLocs.has(item.location_id ?? '')) return false;
      return true;
    };

    if (!includeChildren) {
      const filtered = rawItems.filter(matchesFilter);
      if (sortKey) filtered.sort(sortFn);
      return filtered;
    }

    // 子機材も表示ON: 任意深度の親子ツリーを再帰的にグループ化
    const idMap = new Map<string, any>(rawItems.map((i: any) => [i.id, i]));
    const childrenByParent: Record<string, any[]> = {};
    for (const item of rawItems) {
      if (item.parent_id) {
        if (!childrenByParent[item.parent_id]) childrenByParent[item.parent_id] = [];
        childrenByParent[item.parent_id].push(item);
      }
    }
    // ルート = parent_id が null か rawItems に存在しないもの
    const roots = rawItems.filter((i: any) => !i.parent_id || !idMap.has(i.parent_id));

    // サブツリー内にフィルター一致があるか（再帰）
    const subtreeMatches = (item: any): boolean => {
      if (matchesFilter(item)) return true;
      return (childrenByParent[item.id] ?? []).some(subtreeMatches);
    };

    // 一致するサブツリーをフラットに展開（DFS）
    const flattenTree = (item: any): any[] => {
      const result: any[] = [item];
      const kids = [...(childrenByParent[item.id] ?? [])];
      if (sortKey) kids.sort(sortFn);
      for (const kid of kids) result.push(...flattenTree(kid));
      return result;
    };

    const sortedRoots = [...roots];
    if (sortKey) sortedRoots.sort(sortFn);
    return sortedRoots.filter(subtreeMatches).flatMap(flattenTree);
  }, [rawItems, sortKey, sortDir, includeChildren, filterSection, filterLocs]);

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editingId ? api.put(`/equipment/items/${editingId}`, payload) : api.post("/equipment/items", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-items"] });
      setSaveError(null);
      if (!editingId && continuousMode) {
        // 連続登録モード: 共通フィールドを引き継いで per-item フィールドだけリセット
        setForm(prev => ({
          ...defaultForm,
          ...Object.fromEntries(CARRY_OVER_KEYS.map(k => [k, prev[k]])),
        }));
        setSuggestItems([]);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      } else {
        setDialogOpen(false);
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || err?.message || 'サーバー内部エラーが発生しました';
      setSaveError(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment-items"] }),
  });

  const inlineEditMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, string> }) =>
      api.patch(`/equipment/items/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment-items"] }),
  });

  const handleInlineChange = (id: string, field: string, value: string) => {
    setTableEdits(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), [field]: value } }));
  };

  const saveInlineRow = (id: string) => {
    const edits = tableEdits[id];
    if (!edits || Object.keys(edits).length === 0) return;
    inlineEditMutation.mutate({ id, data: edits });
    setTableEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const bulkUpdateMutation = useMutation({
    mutationFn: (payload: { ids: string[]; fields: Record<string, unknown> }) =>
      api.put('/equipment/items/bulk-update', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment-items'] });
      setBulkOpen(false);
      setSelectedIds(new Set());
      setBulkValue('');
    },
  });

  const handleCheckboxClick = (id: string, index: number, shiftKey: boolean) => {
    if (shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const rangeIds = items.slice(start, end + 1).map((it: any) => it.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        rangeIds.forEach((rid: string) => next.add(rid));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      setLastSelectedIndex(index);
    }
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === items.length && items.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((it: any) => it.id)));
  };
  const clearSelection = () => { setSelectedIds(new Set()); setLastSelectedIndex(null); };

  const submitBulk = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !bulkField) return;
    let v: unknown = bulkValue;
    if (bulkField === 'warranty_years' || bulkField === 'depreciation_years' || bulkField === 'unit_number' || bulkField === 'rack_position' || bulkField === 'rack_height') {
      v = bulkValue === '' ? null : Number(bulkValue);
    }
    if ((bulkField === 'location_id' || bulkField === 'manufacturer_id' || bulkField === 'color_id') && bulkValue === 'none') v = null;
    bulkUpdateMutation.mutate({ ids, fields: { [bulkField]: v } });
  };

  const openNew = () => { setForm({ ...defaultForm }); setEditingId(null); setIsCopyMode(false); setSaveError(null); setSaveSuccess(false); setSuggestItems([]); setDialogOpen(true); };

  const openCopy = (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setSaveError(null); setSaveSuccess(false); setSuggestItems([]);
    setForm({
      name: item.name || "", model_number: item.model_number || "",
      unit_number: "", serial_number: "",  // No. と serial は個体固有なのでクリア
      branch_code: item.branch_code || "GMO-IG", asset_class: item.asset_class || "fixed_asset",
      fixed_asset_code: "",  // 資産コードも個体固有
      depreciation_years: item.depreciation_years?.toString() || "0",
      equipment_section: item.equipment_section || "equipment",
      equipment_type_code: item.equipment_type_code || "V",
      location_code: item.location_code || "Y",
      manufacturer_id: item.manufacturer_id || "",
      purchased_at: item.purchased_at?.slice(0, 10) || "",
      warranty_years: item.warranty_years?.toString() || "0",
      location_id: item.location_id || "", status: item.status || "active",
      condition: item.condition || "good", notes: item.notes || "",
      parent_id: item.parent_id || "",
      color_id: item.color_id || "",
      rack_position: "",  // ラック位置も個体ごとに設定
      rack_height: item.rack_height?.toString() || "1",
      rack_slot: item.rack_slot || "full",
      rack_side: item.rack_side || "front",
    });
    setEditingId(null);
    setIsCopyMode(true);
    setDialogOpen(true);
  };

  const openEdit = (item: any) => { setSaveError(null); setSaveSuccess(false); setSuggestItems([]); setIsCopyMode(false);
    setForm({
      name: item.name || "", model_number: item.model_number || "",
      unit_number: item.unit_number?.toString() || "", serial_number: item.serial_number || "",
      branch_code: item.branch_code || "GMO-IG", asset_class: item.asset_class || "fixed_asset",
      fixed_asset_code: item.fixed_asset_code || "",
      depreciation_years: item.depreciation_years?.toString() || "0",
      equipment_section: item.equipment_section || "equipment",
      equipment_type_code: item.equipment_type_code || "V",
      location_code: item.location_code || "Y",
      manufacturer_id: item.manufacturer_id || "",
      purchased_at: item.purchased_at?.slice(0, 10) || "",
      warranty_years: item.warranty_years?.toString() || "0",
      location_id: item.location_id || "", status: item.status || "active",
      condition: item.condition || "good", notes: item.notes || "",
      parent_id: item.parent_id || "",
      color_id: item.color_id || "",
      rack_position: item.rack_position?.toString() || "",
      rack_height: item.rack_height?.toString() || "1",
      rack_slot: item.rack_slot || "full",
      rack_side: item.rack_side || "front",
    });
    setEditingId(item.id);
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name) return;
    const selectedLocation = locations.find((l: any) => l.id === form.location_id);
    saveMutation.mutate({
      ...form,
      unit_number: form.unit_number ? Number(form.unit_number) : null,
      depreciation_years: form.depreciation_years ? Number(form.depreciation_years) : 0,
      warranty_years: form.warranty_years ? Number(form.warranty_years) : 0,
      manufacturer_id: form.manufacturer_id || null,
      location_id: form.location_id || null,
      parent_id: form.parent_id || null,
      color_id: form.color_id || null,
      rack_position: selectedLocation?.is_rack && form.rack_position ? Number(form.rack_position) : null,
      rack_height: selectedLocation?.is_rack ? (Number(form.rack_height) || 1) : 1,
      rack_slot: selectedLocation?.is_rack ? (form.rack_slot || 'full') : 'full',
      rack_side: selectedLocation?.is_rack ? (form.rack_side || 'front') : 'front',
    });
  };

  const filterLabel = [
    filterBlock ? TYPE_CODES.find(t => t.code === filterBlock)?.label : '',
    filterSection === 'equipment' ? '設備のみ' : filterSection === 'rental' ? '貸出のみ' : '',
    filterLocs.size > 0 ? `場所(${filterLocs.size}件)` : '',
    urlSearch ? `"${urlSearch}"` : '',
  ].filter(Boolean).join(' / ');

  const renderCustomCells = (item: any, py: string) =>
    orderedCustomCols.filter(c => visibleCustomCols.has(c.id)).map(col => {
      const val = customValues[item.id]?.[col.id] ?? '';
      const isEditing = editingCustomCell?.equipmentId === item.id && editingCustomCell?.columnId === col.id;
      const startEdit = (e: React.MouseEvent) => { e.stopPropagation(); setEditingCustomCell({ equipmentId: item.id, columnId: col.id }); };
      const commitEdit = (newVal: string) => {
        setEditingCustomCell(null);
        if (newVal !== val) writeCustomValue(item.id, col.id, newVal);
      };

      if (col.col_type === 'checkbox') {
        const checked = val === 'true' || val === '1';
        return (
          <td key={col.id} className={`px-3 ${py} text-center`} onClick={e => e.stopPropagation()}>
            <EnhancedCheckbox
              checked={checked}
              onCheckedChange={(v) => writeCustomValue(item.id, col.id, v ? 'true' : 'false')}
            />
          </td>
        );
      }
      if (isEditing) {
        return (
          <td key={col.id} className={`px-3 ${py}`} onClick={e => e.stopPropagation()}>
            <input
              type={col.col_type === 'number' ? 'number' : 'text'}
              className="w-full min-w-[80px] bg-transparent border-b border-primary/60 focus:border-primary focus:outline-none text-xs"
              defaultValue={val}
              autoFocus
              onBlur={e => commitEdit(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingCustomCell(null); }}
              onClick={e => e.stopPropagation()}
            />
          </td>
        );
      }
      return (
        <td
          key={col.id}
          className={`px-3 ${py} text-xs text-muted-foreground cursor-text hover:bg-primary/5 max-w-[8rem] truncate`}
          title={val || '（クリックして入力）'}
          onClick={startEdit}
        >
          {val || <span className="opacity-30">—</span>}
        </td>
      );
    });

  const renderTableCells = (item: any, { py, nameSuffix }: { py: string; nameSuffix?: React.ReactNode }) =>
    colOrder.filter(k => visibleCols.has(k)).map(key => {
      const col = COL_DEFS.find(c => c.key === key)!;
      if (!col) return null;
      switch (col.key) {
        case 'eq_code':
          return <td key="eq_code" className={`px-3 ${py}  text-xs text-muted-foreground whitespace-nowrap`}>{item.eq_code}</td>;
        case 'equipment_type':
          return <td key="equipment_type" className={`px-3 ${py} whitespace-nowrap`}><SectionBadge typeCode={item.equipment_type_code} section={item.equipment_section} /></td>;
        case 'location': {
          const locText = item.location_name || item.location_detail || '–';
          return <td key="location" className={`px-3 ${py} text-xs text-muted-foreground`}><div className="max-w-[7rem] truncate" title={locText}>{locText}</div></td>;
        }
        case 'name':
          return (
            <td key="name" className={`px-3 ${py} font-medium`}>
              {tableEditMode
                ? <input className="w-full min-w-[120px] bg-transparent border-b border-primary/40 focus:border-primary focus:outline-none text-sm font-medium"
                    value={tableEdits[item.id]?.name ?? item.name ?? ''}
                    onChange={e => handleInlineChange(item.id, 'name', e.target.value)}
                    onBlur={() => saveInlineRow(item.id)}
                    onClick={e => e.stopPropagation()}
                  />
                : <div className="max-w-[10rem] line-clamp-2 break-words leading-snug">{item.name}{nameSuffix}</div>
              }
            </td>
          );
        case 'manufacturer':
          return <td key="manufacturer" className={`px-3 ${py} text-xs text-muted-foreground whitespace-nowrap`}>{item.manufacturer_name || '–'}</td>;
        case 'model_number':
          return (
            <td key="model_number" className={`px-3 ${py} text-xs text-muted-foreground`}>
              {tableEditMode
                ? <input className="w-full min-w-[80px] bg-transparent border-b border-primary/40 focus:border-primary focus:outline-none text-xs "
                    value={tableEdits[item.id]?.model_number ?? item.model_number ?? ''}
                    onChange={e => handleInlineChange(item.id, 'model_number', e.target.value)}
                    onBlur={() => saveInlineRow(item.id)}
                    onClick={e => e.stopPropagation()}
                  />
                : <div className="max-w-[8rem] line-clamp-2 break-all leading-snug">{item.model_number || '–'}</div>}
            </td>
          );
        case 'serial_number':
          return (
            <td key="serial_number" className={`px-3 ${py} text-xs text-muted-foreground  whitespace-nowrap`}>
              {tableEditMode
                ? <input className="w-full min-w-[80px] bg-transparent border-b border-primary/40 focus:border-primary focus:outline-none text-xs "
                    value={tableEdits[item.id]?.serial_number ?? item.serial_number ?? ''}
                    onChange={e => handleInlineChange(item.id, 'serial_number', e.target.value)}
                    onBlur={() => saveInlineRow(item.id)}
                    onClick={e => e.stopPropagation()}
                  />
                : item.serial_number || '–'}
            </td>
          );
        case 'unit_number':
          return (
            <td key="unit_number" className={`px-3 ${py} text-xs text-right tabular-nums text-muted-foreground whitespace-nowrap`}>
              {tableEditMode
                ? <input type="number" className="w-12 bg-transparent border-b border-primary/40 focus:border-primary focus:outline-none text-xs text-right"
                    value={tableEdits[item.id]?.unit_number ?? item.unit_number ?? ''}
                    onChange={e => handleInlineChange(item.id, 'unit_number', e.target.value)}
                    onBlur={() => saveInlineRow(item.id)}
                    onClick={e => e.stopPropagation()}
                  />
                : item.unit_number ?? '–'}
            </td>
          );
        case 'condition':
          return <td key="condition" className={`px-3 ${py} text-xs text-muted-foreground whitespace-nowrap`}>{CONDITION_LABELS[item.condition] || '–'}</td>;
        case 'fixed_asset_code':
          return (
            <td key="fixed_asset_code" className={`px-3 ${py} text-xs text-muted-foreground  whitespace-nowrap`}>
              {tableEditMode
                ? <input className="w-full min-w-[80px] bg-transparent border-b border-primary/40 focus:border-primary focus:outline-none text-xs "
                    value={tableEdits[item.id]?.fixed_asset_code ?? item.fixed_asset_code ?? ''}
                    onChange={e => handleInlineChange(item.id, 'fixed_asset_code', e.target.value)}
                    onBlur={() => saveInlineRow(item.id)}
                    onClick={e => e.stopPropagation()}
                  />
                : item.fixed_asset_code || '–'}
            </td>
          );
        case 'notes':
          return (
            <td key="notes" className={`px-3 ${py} text-xs text-muted-foreground`}>
              {tableEditMode
                ? <input className="w-full min-w-[80px] bg-transparent border-b border-primary/40 focus:border-primary focus:outline-none text-xs"
                    value={tableEdits[item.id]?.notes ?? item.notes ?? ''}
                    onChange={e => handleInlineChange(item.id, 'notes', e.target.value)}
                    onBlur={() => saveInlineRow(item.id)}
                    onClick={e => e.stopPropagation()}
                  />
                : <div className="max-w-[12rem] line-clamp-2 break-words leading-snug">{item.notes || '–'}</div>}
            </td>
          );
        default: return null;
      }
    }).concat(renderCustomCells(item, py));

  return (
    <div className="space-y-4 p-4 lg:p-6">
      {/* カスタム列セルの保存失敗バナー（15秒で自動消去、手動で×ボタン） */}
      {saveErrors.length > 0 && (
        <div className="space-y-1">
          {saveErrors.map(e => (
            <div key={e.id} className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span className="flex-1">カスタム列の保存に失敗: {e.msg}</span>
              <button onClick={() => setSaveErrors(prev => prev.filter(x => x.id !== e.id))} className="text-destructive/60 hover:text-destructive shrink-0">×</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle className={embedded ? "hidden" : undefined}>機材一覧</PageTitle>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />Excelインポート
          </Button>
          <Button size="sm" variant="outline" onClick={downloadExcel}>
            <Download className="h-4 w-4 mr-1" />Excel出力
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPrintDialogOpen(true)}>
            <Printer className="h-4 w-4 mr-1" />印刷
          </Button>
          {/* 列表示ピッカー */}
          <div className="relative" ref={colPickerRef}>
            <Button size="sm" variant={colPickerOpen ? 'default' : 'outline'} onClick={() => setColPickerOpen(v => !v)}>
              <SlidersHorizontal className="h-4 w-4 mr-1" />表示列
            </Button>
            {colPickerOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg p-2 w-56 animate-slide-up">
                <div className="flex items-center justify-between px-1 pb-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">表示列</p>
                  <button className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5" onClick={resetColSettings}>
                    <RotateCcw className="h-2.5 w-2.5" />デフォルトに戻す
                  </button>
                </div>
                {colOrder.map((key, idx) => {
                  const col = COL_DEFS.find(c => c.key === key);
                  if (!col) return null;
                  return (
                    <div key={col.key} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/60">
                      <EnhancedCheckbox
                        checked={visibleCols.has(col.key)}
                        onCheckedChange={() => toggleCol(col.key)}
                        id={`col-${col.key}`}
                      />
                      <label htmlFor={`col-${col.key}`} className="flex-1 cursor-pointer text-sm select-none">
                        {col.label}
                      </label>
                      <div className="flex gap-0.5">
                        <button className="p-0.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-20" disabled={idx === 0} onClick={() => moveCol(key, 'up')}><ArrowUp className="h-3 w-3" /></button>
                        <button className="p-0.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-20" disabled={idx === colOrder.length - 1} onClick={() => moveCol(key, 'down')}><ArrowDown className="h-3 w-3" /></button>
                      </div>
                    </div>
                  );
                })}
                {/* カスタム列 */}
                {orderedCustomCols.length > 0 && (
                  <>
                    <div className="border-t my-1.5" />
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1">カスタム列</p>
                    {orderedCustomCols.map((col, idx) => {
                      const allCustomIds = orderedCustomCols.map(c => c.id);
                      return (
                        <div key={col.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/60">
                          <EnhancedCheckbox
                            checked={visibleCustomCols.has(col.id)}
                            onCheckedChange={() => toggleCustomCol(col.id)}
                            id={`custom-col-${col.id}`}
                          />
                          <label htmlFor={`custom-col-${col.id}`} className="flex items-center gap-2 flex-1 cursor-pointer text-sm select-none min-w-0">
                            <span className="flex-1 truncate">{col.name}</span>
                            <span className="text-[10px] text-muted-foreground/60 shrink-0">
                              {col.scope === 'shared' ? '共' : '個'}
                            </span>
                          </label>
                          <div className="flex gap-0.5 shrink-0">
                            <button className="p-0.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-20" disabled={idx === 0} onClick={() => moveCustomCol(col.id, 'up', allCustomIds)}><ArrowUp className="h-3 w-3" /></button>
                            <button className="p-0.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-20" disabled={idx === orderedCustomCols.length - 1} onClick={() => moveCustomCol(col.id, 'down', allCustomIds)}><ArrowDown className="h-3 w-3" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                <div className="border-t mt-1.5 pt-1.5">
                  <button
                    className="flex w-full items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded"
                    onClick={() => { setColPickerOpen(false); setCustomColDialogOpen(true); }}
                  >
                    <Settings2 className="h-3.5 w-3.5" />カスタム列を管理...
                  </button>
                </div>
              </div>
            )}
          </div>
          {canEdit && (
            <Button
              size="sm"
              variant={tableEditMode ? "default" : "outline"}
              onClick={() => { setTableEditMode(v => !v); setTableEdits({}); }}
            >
              <Edit3 className="h-4 w-4 mr-1" />{tableEditMode ? "編集完了" : "表編集"}
            </Button>
          )}
          {canEdit && <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" />機材登録
          </Button>}
        </div>
      </div>

      <ExcelImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <CustomColumnDialog open={customColDialogOpen} onOpenChange={setCustomColDialogOpen} />

      {/* 機材ブロックタブ（最優先フィルター） */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {[{ code: "", label: "全て" }, ...TYPE_CODES].map((t) => (
          <button
            key={t.code}
            onClick={() => setSearchParams(p => {
              const n = new URLSearchParams(p);
              if (t.code) n.set('tab', t.code); else n.delete('tab');
              n.delete('orphans');
              return n;
            }, { replace: true })}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filterBlock === t.code
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 設備/貸出フィルター + 設置場所複数選択 */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground">区分:</span>
        {([{ value: 'equipment', label: '設備のみ' }, { value: 'rental', label: '貸出のみ' }] as const).map(s => (
          <button
            key={s.value}
            onClick={() => setSearchParams(p => {
              const n = new URLSearchParams(p);
              if (filterSection === s.value) n.delete('sect'); else n.set('sect', s.value);
              return n;
            }, { replace: true })}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filterSection === s.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {s.label}
          </button>
        ))}
        <span className="text-xs text-muted-foreground ml-2">場所:</span>
        <div className="relative">
          {locFilterOpen && <div className="fixed inset-0 z-40" onClick={() => setLocFilterOpen(false)} />}
          <button
            type="button"
            onClick={() => setLocFilterOpen(v => !v)}
            className={`relative flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
              filterLocs.size > 0 ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-transparent hover:bg-muted/80'
            }`}
          >
            <MapPin className="h-3.5 w-3.5" />
            {filterLocs.size > 0 ? `${filterLocs.size}件選択中` : '絞り込み'}
          </button>
          {locFilterOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-lg py-1.5 min-w-[200px] max-h-72 overflow-y-auto">
              {filterLocs.size > 0 && (
                <button
                  className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/60 border-b border-border mb-1"
                  onClick={() => { setSearchParams(p => { const n = new URLSearchParams(p); n.delete('locs'); return n; }, { replace: true }); setLocFilterOpen(false); }}
                >
                  クリア
                </button>
              )}
              {locations.map((loc: any) => (
                <label key={loc.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/60 cursor-pointer text-sm">
                  <EnhancedCheckbox checked={filterLocs.has(loc.id)} onCheckedChange={() => toggleLocFilter(loc.id)} />
                  <span className="truncate">{loc.name || loc.location_detail}</span>
                </label>
              ))}
              {locations.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">設置場所がありません</p>}
            </div>
          )}
        </div>
        {(filterSection || filterLocs.size > 0) && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => setSearchParams(p => { const n = new URLSearchParams(p); n.delete('sect'); n.delete('locs'); return n; }, { replace: true })}
          >
            フィルターを解除
          </button>
        )}
      </div>

      {/* 検索 + 子機材トグル */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative max-w-sm flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="名前・ID・型番で検索..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
          <Switch
            checked={includeChildren}
            onCheckedChange={(v) => setSearchParams(p => {
              const n = new URLSearchParams(p);
              if (v) n.set('children', '1'); else n.delete('children');
              return n;
            }, { replace: true })}
          />
          <span>子機材も表示</span>
        </div>
      </div>

      {/* 一括編集バー (管理者のみ表示、選択中にのみ浮上) */}
      {canBulkEdit && selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 bg-primary text-primary-foreground rounded-lg px-4 py-2 flex items-center justify-between shadow-md">
          <span className="text-sm font-medium">{selectedIds.size} 件選択中</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}>
              <Edit3 className="h-4 w-4 mr-1" />一括編集
            </Button>
            <Button size="sm" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={clearSelection}>
              <X className="h-4 w-4 mr-1" />選択解除
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : itemsError ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Package className="h-12 w-12 opacity-20" />
          <p className="font-medium text-destructive">
            {(itemsError as any)?.response?.status === 403
              ? '機材管理へのアクセス権限がありません。管理者に権限付与を依頼してください。'
              : 'データの取得に失敗しました。ページを再読み込みしてください。'}
          </p>
          {(itemsError as any)?.response?.data?.error?.debug && (
            <pre className="text-xs bg-muted/50 rounded p-3 max-w-xl overflow-auto">
              {JSON.stringify((itemsError as any).response.data.error.debug, null, 2)}
            </pre>
          )}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Package className="h-12 w-12 opacity-20" /><p>機材が登録されていません</p>
        </div>
      ) : (
        <>
          {/* ── モバイル カードビュー (md未満) ── */}
          <div className="md:hidden space-y-2 pb-4">
            {items.map((item: any) => {
              const isChild = item.parent_id != null;
              const borderColor = TYPE_BORDER_COLOR[item.equipment_type_code ?? ''] ?? '#6b7280';
              return (
                <div
                  key={item.id}
                  className={`bg-card rounded-lg border border-border/60 shadow-sm cursor-pointer active:bg-muted/30 transition-colors overflow-hidden ${isChild ? 'ml-4' : ''}`}
                  style={{ borderLeft: `3px solid ${borderColor}` }}
                  onClick={() => navigateToDetail(item.id)}
                >
                  <div className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <SectionBadge typeCode={item.equipment_type_code} section={item.equipment_section} />
                        <span className=" text-xs text-muted-foreground">{item.eq_code}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    </div>
                    <p className="font-semibold text-sm leading-tight mb-0.5 truncate">
                      {item.name}
                      {(item.children_count ?? 0) > 0 && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground bg-muted rounded-full px-1.5">{item.children_count}</span>}
                      {item.parent_name && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground bg-muted rounded px-1">← {item.parent_name}</span>}
                    </p>
                    <p className=" text-xs text-muted-foreground truncate">
                      {item.model_number || '–'}{item.unit_number != null ? ` / No.${item.unit_number}` : ''}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground flex-wrap">
                      {item.manufacturer_name && <span>{item.manufacturer_name}</span>}
                      {item.manufacturer_name && (item.location_name || item.location_detail) && <span className="opacity-30">|</span>}
                      {(item.location_name || item.location_detail) && <span className="truncate">{item.location_name || item.location_detail}</span>}
                    </div>
                    {(item.asset_class || (item.condition && item.condition !== 'good')) && (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {item.asset_class && <AssetBadge v={item.asset_class} />}
                        {item.condition && item.condition !== 'good' && (
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset ${
                            item.condition === 'excellent' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                            item.condition === 'fair' ? 'bg-yellow-50 text-yellow-700 ring-yellow-200' :
                            'bg-red-50 text-red-700 ring-red-200'
                          }`}>{CONDITION_LABELS[item.condition] ?? item.condition}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* ── PC テーブルビュー (md以上) ── */}
          <div className="hidden md:block">
        <div className="overflow-x-auto rounded-xl ring-1 ring-border/60 shadow-sm bg-card">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40">
                <th className="w-8 px-2 py-2.5" />
                {canBulkEdit && (
                  <th className="w-8 px-2 py-2.5">
                    <EnhancedCheckbox
                      checked={
                        items.length > 0 && selectedIds.size === items.length
                          ? true
                          : selectedIds.size > 0
                            ? 'indeterminate'
                            : false
                      }
                      onCheckedChange={() => toggleSelectAll()}
                    />
                  </th>
                )}
                {colOrder.filter(k => visibleCols.has(k)).map(key => {
                  const col = COL_DEFS.find(c => c.key === key);
                  if (!col) return null;
                  return <SortableTh key={col.key} label={col.label} sortKey={col.sortKey} currentKey={sortKey} currentDir={sortDir} onSort={onSort} />;
                })}
                {orderedCustomCols.filter(c => visibleCustomCols.has(c.id)).map(col => (
                  <th key={col.id} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    {col.name}
                    <span className="ml-1 text-[9px] opacity-40">{col.scope === 'shared' ? '共' : '個'}</span>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {items.map((item: any, idx: number) => {
                const idToItem = new Map(items.map((i: any) => [i.id, i]));
                const isChildItem = item.parent_id != null;
                const hasChildren = (item.children_count ?? 0) > 0;
                const isExpanded = expandedIds.has(item.id);
                const children: any[] = childrenCache[item.id] ?? [];
                const isLoadingChild = loadingChildren.has(item.id);
                const isSelected = selectedIds.has(item.id);

                // フラットリストの子機材行（子機材も表示ONで検索ヒットした子）
                if (isChildItem) {
                  const depth = (() => { let d = 0; let pid = item.parent_id; while (pid && idToItem.get(pid)?.parent_id) { d++; pid = idToItem.get(pid)?.parent_id; } return d; })();
                  return (
                    <tr
                      key={item.id}
                      className={`group bg-muted/20 transition-colors ${tableEditMode ? 'cursor-default hover:bg-amber-50/50' : 'cursor-pointer hover:bg-muted/40'} ${tableEdits[item.id] ? 'outline outline-1 outline-amber-400/60' : ''}`}
                      onClick={tableEditMode ? undefined : () => navigateToDetail(item.id)}
                    >
                      <td className="pr-1 py-2 text-muted-foreground/40 text-xs" style={{ paddingLeft: `${(depth + 1) * 16 + 4}px` }}>└</td>
                      {canBulkEdit && <td />}
                      {renderTableCells(item, {
                        py: 'py-2',
                        nameSuffix: item.parent_name
                          ? <span className="ml-1.5 text-[10px] text-muted-foreground/60 bg-muted rounded px-1 py-0.5">← {item.parent_name}</span>
                          : undefined,
                      })}
                      <td className="px-2 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          {canEdit && <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" title="コピーして新規登録" onClick={(e) => openCopy(item, e)}><Copy className="h-3 w-3" /></Button>}
                          {canEdit && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openEdit(item); }}><Pencil className="h-3 w-3" /></Button>}
                          {canDelete && <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); if (confirm(`「${item.name}」を削除？`)) deleteMutation.mutate(item.id); }}><Trash2 className="h-3 w-3" /></Button>}
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <>
                    <tr
                      key={item.id}
                      className={`group transition-colors ${tableEditMode ? 'cursor-default' : 'cursor-pointer'} ${isSelected ? 'bg-primary/6' : tableEditMode ? 'hover:bg-amber-50/50 dark:hover:bg-amber-900/10' : 'hover:bg-accent/30'} ${tableEdits[item.id] ? 'outline outline-1 outline-amber-400/60' : ''}`}
                      onClick={tableEditMode ? undefined : () => navigateToDetail(item.id)}
                    >
                      {/* 展開ボタン */}
                      <td className="px-2 py-2 w-8" onClick={(e) => { if (hasChildren) toggleExpand(item, e); else e.stopPropagation(); }}>
                        {hasChildren ? (
                          <button className="flex items-center justify-center h-6 w-6 rounded hover:bg-muted text-muted-foreground transition-colors" onClick={(e) => toggleExpand(item, e)}>
                            {isLoadingChild ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        ) : null}
                      </td>
                      {canBulkEdit && (
                        <td className="px-2 py-2 w-8" onClick={(e) => e.stopPropagation()}>
                          <EnhancedCheckbox
                            checked={isSelected}
                            onCheckedChange={() => { /* shift+click は onClick で処理するので no-op */ }}
                            onClick={(e) => handleCheckboxClick(item.id, idx, (e as React.MouseEvent).shiftKey)}
                          />
                        </td>
                      )}
                      {renderTableCells(item, {
                        py: 'py-2',
                        nameSuffix: hasChildren
                          ? <span className="ml-1.5 text-[10px] font-normal text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{item.children_count}</span>
                          : undefined,
                      })}
                      <td className="px-2 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          {canEdit && <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="コピーして新規登録" onClick={(e) => openCopy(item, e)}><Copy className="h-3.5 w-3.5" /></Button>}
                          {canEdit && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(item); }}><Pencil className="h-3.5 w-3.5" /></Button>}
                          {canDelete && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); if (confirm(`「${item.name}」を削除？`)) deleteMutation.mutate(item.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
                        </div>
                      </td>
                    </tr>
                    {/* 子機材インライン表示 */}
                    {isExpanded && children.map((child: any) => (
                      <tr
                        key={child.id}
                        className={`group bg-muted/20 transition-colors ${tableEditMode ? 'cursor-default hover:bg-amber-50/50' : 'cursor-pointer hover:bg-muted/40'} ${tableEdits[child.id] ? 'outline outline-1 outline-amber-400/60' : ''}`}
                        onClick={tableEditMode ? undefined : () => navigateToDetail(child.id)}
                      >
                        <td className="pl-8 pr-1 py-1.5 text-muted-foreground/40 text-xs">└</td>
                        {canBulkEdit && <td />}
                        {renderTableCells(child, { py: 'py-1.5' })}
                        <td className="px-2 py-1.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            {canEdit && <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" title="コピーして新規登録" onClick={(e) => openCopy(child, e)}><Copy className="h-3 w-3" /></Button>}
                            {canEdit && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); openEdit(child); }}><Pencil className="h-3 w-3" /></Button>}
                            {canDelete && <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); if (confirm(`「${child.name}」を削除？`)) { deleteMutation.mutate(child.id, { onSuccess: () => { setChildrenCache(prev => ({ ...prev, [item.id]: (prev[item.id] ?? []).filter((c: any) => c.id !== child.id) })); } }); } }}><Trash2 className="h-3 w-3" /></Button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {isExpanded && isLoadingChild && (
                      <tr key={`${item.id}-loading`} className="bg-muted/10">
                        <td colSpan={99} className="px-6 py-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5" />読み込み中...
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {editingId ? "機材編集" : isCopyMode ? "機材コピー登録" : "機材登録"}
              {!editingId && (
                <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground ml-auto pr-6">
                  <Switch
                    checked={continuousMode}
                    onCheckedChange={(v) => { setContinuousMode(!!v); setSaveSuccess(false); }}
                  />
                  <span>連続登録</span>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>
          {saveSuccess && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              ✓ 登録しました。続けて次の機材を入力してください。
            </div>
          )}
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>拠点 *</Label>
                <Select value={form.location_code} onValueChange={(v) => setForm({ ...form, location_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOC_CODES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>種別コード *</Label>
                <Select value={form.equipment_type_code} onValueChange={(v) => setForm({ ...form, equipment_type_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_CODES.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} - {t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>設備/貸出 *</Label>
                <Select value={form.equipment_section} onValueChange={(v) => setForm({ ...form, equipment_section: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>商品名 *</Label>
                <div className="relative">
                  <Input
                    value={form.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onBlur={() => setTimeout(() => setSuggestItems([]), 200)}
                    placeholder="ユニバーサルフレーム"
                    autoComplete="off"
                  />
                  {suggestItems.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 bg-card border rounded-md shadow-lg mt-0.5">
                      <p className="px-3 py-1.5 text-xs text-muted-foreground border-b">同名の型名が複数あります。選択してください</p>
                      {Array.from(
                        new Map(suggestItems.map((i: any) => [i.model_number ?? '', i])).values()
                      ).map((item: any) => {
                        const maxUnit = Math.max(
                          0,
                          ...suggestItems
                            .filter((i: any) => (i.model_number ?? '') === (item.model_number ?? ''))
                            .map((i: any) => Number(i.unit_number) || 0)
                        );
                        return (
                          <button
                            key={item.model_number ?? 'none'}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                            onMouseDown={() => {
                              setForm(f => ({
                                ...f,
                                model_number: item.model_number || f.model_number,
                                manufacturer_id: item.manufacturer_id || f.manufacturer_id,
                                unit_number: String(maxUnit + 1),
                              }));
                              setSuggestItems([]);
                            }}
                          >
                            <span className="font-medium">{item.model_number || '（型名なし）'}</span>
                            <span className="text-primary text-xs ml-auto">→ No.{maxUnit + 1}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label>メーカー</Label>
                <Select value={form.manufacturer_id || "none"} onValueChange={(v) => setForm({ ...form, manufacturer_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    {manufacturers.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>型名</Label>
                <Input value={form.model_number} onChange={(e) => setForm({ ...form, model_number: e.target.value })} placeholder="Vbus-70V2" />
              </div>
              <div className="space-y-1">
                <Label>no (個体番号)</Label>
                <Input type="number" min="1" value={form.unit_number} onChange={(e) => setForm({ ...form, unit_number: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>serial</Label>
                <Input value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-semibold mb-3">資産・保証</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>所管</Label>
                  <BranchCodeInput value={form.branch_code} onChange={(v) => setForm({ ...form, branch_code: v })} />
                </div>
                <div className="space-y-1">
                  <Label>資産管理</Label>
                  <Select value={form.asset_class} onValueChange={(v) => setForm({ ...form, asset_class: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ASSET_CLASS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>資産コード</Label>
                  <Input value={form.fixed_asset_code} onChange={(e) => setForm({ ...form, fixed_asset_code: e.target.value })} placeholder="消耗品は空欄" />
                </div>
                <div className="space-y-1">
                  <Label>償却年数</Label>
                  <Input type="number" min="0" value={form.depreciation_years} onChange={(e) => setForm({ ...form, depreciation_years: e.target.value })} placeholder="消耗品は0" />
                </div>
                <div className="space-y-1">
                  <Label>購入年月</Label>
                  <Input type="date" value={form.purchased_at} onChange={(e) => setForm({ ...form, purchased_at: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>保証期間 (年)</Label>
                  <Input type="number" min="0" value={form.warranty_years} onChange={(e) => setForm({ ...form, warranty_years: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label>設置場所</Label>
                  <Select value={form.location_id || "none"} onValueChange={(v) => setForm({ ...form, location_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">なし</SelectItem>
                      {locations.map((loc: any) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* 色選択 (常に表示) */}
            <div className="border-t pt-4">
              <p className="text-sm font-semibold mb-3">機材色</p>
              <div className="space-y-1">
                <Label>色</Label>
                <Select value={form.color_id || "none"} onValueChange={(v) => setForm({ ...form, color_id: v === "none" ? "" : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="なし（種別色）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし（種別色）</SelectItem>
                    {colors.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full border border-border/40" style={{ background: c.color_hex }} />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ラック実装フィールド（is_rack場所選択時のみ） */}
            {(() => {
              const selLoc = locations.find((l: any) => l.id === form.location_id);
              if (!selLoc?.is_rack) return null;
              return (
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold mb-3">ラック実装</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label>U位置 (下端)</Label>
                      <Input
                        type="number" min={1} max={selLoc.rack_units || 99}
                        value={form.rack_position}
                        onChange={(e) => setForm({ ...form, rack_position: e.target.value })}
                        placeholder="1〜"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>高さ (U)</Label>
                      <Input
                        type="number" min={1}
                        value={form.rack_height}
                        onChange={(e) => setForm({ ...form, rack_height: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>横位置</Label>
                      <Select value={form.rack_slot} onValueChange={(v) => setForm({ ...form, rack_slot: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RACK_SLOT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>面</Label>
                      <Select value={form.rack_side} onValueChange={(v) => setForm({ ...form, rack_side: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="front">前面</SelectItem>
                          <SelectItem value="back">背面</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {form.rack_position && selLoc.rack_units && (Number(form.rack_position) + Number(form.rack_height) - 1 > selLoc.rack_units) && (
                    <p className="text-xs text-destructive mt-2">⚠ U位置 + 高さがラック総U数({selLoc.rack_units}U)を超えています</p>
                  )}
                </div>
              );
            })()}

            <div className="border-t pt-4">
              <div className="space-y-1">
                <Label>親機材（付属先）</Label>
                <Select
                  value={form.parent_id || "none"}
                  onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? "" : v })}
                >
                  <SelectTrigger><SelectValue placeholder="選択なし（単体）" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">選択なし（単体）</SelectItem>
                    {items
                      .filter((it: any) => it.id !== editingId)
                      .map((it: any) => (
                        <SelectItem key={it.id} value={it.id}>
                          {it.eq_code} — {it.name}{it.model_number ? ` (${it.model_number})` : ""}{it.unit_number ? ` No.${it.unit_number}` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>備考</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            {saveError && (
              <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">{saveError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button onClick={handleSubmit} disabled={saveMutation.isPending || !form.name}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingId ? "更新" : "登録"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 一括編集ダイアログ */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>一括編集 ({selectedIds.size} 件)</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>編集するフィールド</Label>
              <Select value={bulkField} onValueChange={(v) => { setBulkField(v as BulkField); setBulkValue(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">商品名</SelectItem>
                  <SelectItem value="manufacturer_id">メーカー</SelectItem>
                  <SelectItem value="model_number">型名</SelectItem>
                  <SelectItem value="serial_number">シリアル番号</SelectItem>
                  <SelectItem value="unit_number">管理番号</SelectItem>
                  <SelectItem value="fixed_asset_code">資産コード</SelectItem>
                  <SelectItem value="branch_code">所管</SelectItem>
                  <SelectItem value="asset_class">資産管理</SelectItem>
                  <SelectItem value="equipment_section">設備/貸出</SelectItem>
                  <SelectItem value="equipment_type_code">種別コード</SelectItem>
                  <SelectItem value="condition">コンディション</SelectItem>
                  <SelectItem value="color_id">機材色</SelectItem>
                  <SelectItem value="location_id">設置場所</SelectItem>
                  <SelectItem value="location_detail">場所詳細</SelectItem>
                  <SelectItem value="purchased_at">購入年月</SelectItem>
                  <SelectItem value="warranty_years">保証期間 (年)</SelectItem>
                  <SelectItem value="depreciation_years">償却年数</SelectItem>
                  <SelectItem value="status">ステータス</SelectItem>
                  <SelectItem value="rack_position">U位置 (下端)</SelectItem>
                  <SelectItem value="rack_height">高さ (U)</SelectItem>
                  <SelectItem value="rack_slot">横位置</SelectItem>
                  <SelectItem value="rack_side">前面/背面</SelectItem>
                  <SelectItem value="notes">備考</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>新しい値</Label>
              {bulkField === 'name' || bulkField === 'model_number' || bulkField === 'serial_number' || bulkField === 'fixed_asset_code' || bulkField === 'location_detail' ? (
                <Input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder={bulkField === 'name' ? '商品名' : bulkField === 'model_number' ? '型名' : bulkField === 'serial_number' ? 'シリアル番号' : bulkField === 'fixed_asset_code' ? '資産コード' : '場所詳細'} />
              ) : bulkField === 'unit_number' || bulkField === 'rack_position' || bulkField === 'rack_height' ? (
                <Input type="number" min={bulkField === 'rack_height' ? 1 : 0} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder={bulkField === 'rack_height' ? '1' : '0'} />
              ) : bulkField === 'manufacturer_id' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">(なし)</SelectItem>
                    {manufacturers.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : bulkField === 'asset_class' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>{ASSET_CLASS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              ) : bulkField === 'equipment_section' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>{SECTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              ) : bulkField === 'equipment_type_code' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>{TYPE_CODES.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} - {t.label}</SelectItem>)}</SelectContent>
                </Select>
              ) : bulkField === 'condition' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excellent">新品同様</SelectItem>
                    <SelectItem value="good">良好</SelectItem>
                    <SelectItem value="fair">普通</SelectItem>
                    <SelectItem value="poor">要注意</SelectItem>
                  </SelectContent>
                </Select>
              ) : bulkField === 'color_id' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし（種別色）</SelectItem>
                    {colors.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full border border-border/40" style={{ background: c.color_hex }} />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : bulkField === 'location_id' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">(なし)</SelectItem>
                    {locations.map((loc: any) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : bulkField === 'status' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">稼働中</SelectItem>
                    <SelectItem value="in_repair">修理中</SelectItem>
                    <SelectItem value="retired">引退</SelectItem>
                    <SelectItem value="disposed">廃棄</SelectItem>
                    <SelectItem value="lost">紛失</SelectItem>
                  </SelectContent>
                </Select>
              ) : bulkField === 'rack_slot' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    {RACK_SLOT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : bulkField === 'rack_side' ? (
                <Select value={bulkValue} onValueChange={setBulkValue}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="front">前面</SelectItem>
                    <SelectItem value="back">背面</SelectItem>
                  </SelectContent>
                </Select>
              ) : bulkField === 'purchased_at' ? (
                <Input type="date" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
              ) : bulkField === 'warranty_years' || bulkField === 'depreciation_years' ? (
                <Input type="number" min="0" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="0" />
              ) : (
                <Input value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder={bulkField === 'branch_code' ? 'GMO-IG' : ''} />
              )}
            </div>

            {bulkUpdateMutation.error ? (
              <p className="text-sm text-destructive">
                {(bulkUpdateMutation.error as any)?.response?.data?.error?.message || (bulkUpdateMutation.error as Error).message}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkOpen(false)}>キャンセル</Button>
              <Button onClick={submitBulk} disabled={bulkUpdateMutation.isPending || (!bulkField) || (bulkValue === '' && !['notes', 'location_detail', 'serial_number', 'fixed_asset_code'].includes(bulkField))}>
                {bulkUpdateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {selectedIds.size} 件に適用
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 印刷設定ダイアログ */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>印刷設定</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>タイトル</Label>
              <Input value={printTitle} onChange={(e) => setPrintTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>印刷する列</Label>
              <ToggleButtonGroup
                options={PRINT_COLS.map(c => ({ value: c.key, label: c.label }))}
                value={Array.from(printCols)}
                onChange={(next) => setPrintCols(new Set(next))}
                multi
                cols={{ base: 2, sm: 3 }}
                size="sm"
                showSelectAll
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>チェック欄を追加（棚卸し用手書き）</span>
              <Switch checked={printCheckbox} onCheckedChange={(v) => setPrintCheckbox(!!v)} />
            </div>
            <div className="space-y-1.5">
              <Label>用紙方向</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="radio" name="print-orient" checked={!printLandscape} onChange={() => setPrintLandscape(false)} />
                  縦 (A4 Portrait)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="radio" name="print-orient" checked={printLandscape} onChange={() => setPrintLandscape(true)} />
                  横 (Landscape)
                </label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">※ 現在の絞り込み結果 {items.length} 件を印刷</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>キャンセル</Button>
              <Button onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" />印刷実行
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 印刷エリア（スクリーンでは非表示、@media print で表示） */}
      <div id="eq-print-area-wrapper">
        <PrintTable
          items={items}
          printCols={printCols}
          printCheckbox={printCheckbox}
          printTitle={printTitle}
          filterLabel={filterLabel}
        />
      </div>
    </div>
  );
}

function SortableTh({ label, sortKey, currentKey, currentDir, onSort }: {
  label: string; sortKey: string; currentKey: string | null; currentDir: 'asc' | 'desc'; onSort: (k: string) => void;
}) {
  const active = currentKey === sortKey;
  return (
    <th className="px-3 py-2.5 text-left select-none whitespace-nowrap">
      <button
        className={`inline-flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:text-foreground ${active ? 'text-foreground' : 'text-muted-foreground'}`}
        onClick={() => onSort(sortKey)}
      >
        {label}
        {active
          ? currentDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
          : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
      </button>
    </th>
  );
}

const ASSET_BADGE: Record<string, string> = {
  fixed_asset: 'bg-blue-50 text-blue-700 ring-blue-200',
  consumable:  'bg-green-50 text-green-700 ring-green-200',
  leased:      'bg-orange-50 text-orange-700 ring-orange-200',
  transferred: 'bg-gray-100 text-gray-600 ring-gray-200',
};
function AssetBadge({ v }: { v: string }) {
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ring-1 ring-inset whitespace-nowrap ${ASSET_BADGE[v] ?? 'bg-muted text-muted-foreground ring-border'}`}>
      {ASSET_CLASS_LABELS[v] ?? v}
    </span>
  );
}

const TYPE_BADGE: Record<string, string> = {
  V: 'bg-violet-50 text-violet-700', C: 'bg-sky-50 text-sky-700',
  A: 'bg-amber-50 text-amber-700', IC: 'bg-teal-50 text-teal-700',
  NW: 'bg-cyan-50 text-cyan-700', L: 'bg-yellow-50 text-yellow-700',
  XR: 'bg-pink-50 text-pink-700', E: 'bg-gray-100 text-gray-600',
};
function SectionBadge({ typeCode, section }: { typeCode: string | null; section: string | null }) {
  const label = sectionDisplay(typeCode, section);
  if (!label || label === '-') return <span className="text-muted-foreground text-xs">–</span>;
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${TYPE_BADGE[typeCode ?? ''] ?? 'bg-muted text-muted-foreground'}`}>
      {label}
    </span>
  );
}

function PrintTable({ items, printCols, printCheckbox, printTitle, filterLabel }: {
  items: any[];
  printCols: Set<string>;
  printCheckbox: boolean;
  printTitle: string;
  filterLabel: string;
}) {
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

  const getCellValue = (item: any, key: string): string => {
    switch (key) {
      case 'eq_code':           return item.eq_code || '–';
      case 'equipment_type':    return sectionDisplay(item.equipment_type_code, item.equipment_section) || '–';
      case 'name':              return item.name || '–';
      case 'manufacturer_name': return item.manufacturer_name || '–';
      case 'model_number':      return item.model_number || '–';
      case 'unit_number':       return item.unit_number != null ? String(item.unit_number) : '–';
      case 'serial_number':     return item.serial_number || '–';
      case 'location':          return item.location_name || item.location_detail || '–';
      case 'fixed_asset_code':  return item.fixed_asset_code || '–';
      case 'purchased_at':      return item.purchased_at?.slice(0, 7) || '–';
      case 'warranty_years':    return item.warranty_years ? `${item.warranty_years}年` : '–';
      case 'notes':             return item.notes || '–';
      default:                  return '–';
    }
  };

  const visibleCols = PRINT_COLS.filter(c => printCols.has(c.key));

  // 各アイテムの深さを計算（idMap から親を辿る）
  const idMap = new Map<string, any>(items.map((i: any) => [i.id, i]));
  const getDepth = (item: any): number => {
    let depth = 0;
    let pid = item.parent_id;
    while (pid && idMap.has(pid)) {
      depth++;
      pid = idMap.get(pid)?.parent_id;
    }
    return depth;
  };

  // インデント記号（深さ → プレフィックス文字列）
  const INDENT_PREFIX = ['', '└ ', '　└ ', '　　└ '];

  return (
    <div id="eq-print-area">
      <div className="print-title">{printTitle}</div>
      <div className="print-meta">
        {today}　全 {items.length} 件{filterLabel ? `　フィルター: ${filterLabel}` : ''}
      </div>
      <table>
        <thead>
          <tr>
            {printCheckbox && <th className="check-col">✓</th>}
            {visibleCols.map(c => (
              <th key={c.key} className={c.key === 'eq_code' ? 'col-id' : ''}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => {
            const depth = getDepth(item);
            const depthClass = `depth-${Math.min(depth, 3)}`;
            return (
              <tr key={item.id} className={depthClass}>
                {printCheckbox && (
                  <td className="check-col">
                    <span style={{ display: 'block', width: 13, height: 13, border: '1px solid #000', margin: '0 auto' }} />
                  </td>
                )}
                {visibleCols.map(c => {
                  const isName = c.key === 'name';
                  const tdClass = [
                    c.key === 'eq_code' ? 'col-id' : '',
                    c.key === 'notes' ? 'col-notes' : '',
                    isName ? 'col-name' : '',
                  ].filter(Boolean).join(' ');
                  const value = getCellValue(item, c.key);
                  return (
                    <td key={c.key} className={tdClass}
                      style={isName && depth > 0 ? { paddingLeft: `${depth * 10 + 5}px` } : {}}>
                      {isName && depth > 0 ? `${INDENT_PREFIX[Math.min(depth, 3)]}${value}` : value}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
