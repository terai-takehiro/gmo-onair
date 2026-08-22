import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { notifyError } from "@/lib/notify";
import { docTotalSec } from "@/lib/time";
import { Button } from "@/components/ui/button";
import EditorSidebar from "@/components/editor/EditorSidebar";
import EditorSidebarSheet from "@/components/editor/EditorSidebarSheet";
import CueTable from "@/components/editor/CueTable";
import PreviewModal from "@/components/editor/PreviewModal";
import TrashDrawer from "@/components/editor/TrashDrawer";
import { getTrash } from "@/lib/trash";
import { normalizeQsheetData } from "@/lib/migrateEntries";
import { ensureStableIds, genId } from "@/lib/stableIds";
import { getQsheetSocket, disconnectQsheetSocket } from "@/lib/socket";
import { useSyncDocProductionNavContext } from "@/hooks/useSyncDocProductionNavContext";
import { useAuth } from "@/hooks/useAuth";
import { useCollabMetaSync } from "@/hooks/useCollabMetaSync";
import PresenceAvatars, { type PresenceUser } from "@/components/editor/PresenceAvatars";
import { useCollabDoc } from "@/lib/collab/useCollabDoc";
import { applyDataUpdate } from "@/lib/collab/ydocDiff";
import StageEditor from "@/components/editor/StageEditor";
import AudioShareDialog from "@/components/editor/AudioShareDialog";
import CsvImportDialog from "@/components/editor/CsvImportDialog";
import type { CsvImportResult } from "@/lib/csvImport";
import ExcelImportDialog from "@/components/excel/ExcelImportDialog";
import { useExcelIO } from "@/hooks/useExcelIO";
// AI 生成4機能（段8。04-ai.md §8-2）— ボタン・状態・ダイアログをまとめて1部品に持たせてある
// （EditorPage.tsx はもともと 400 行上限の超過ファイルなので、ここでは増やさない）。
// 本番中（進行/ランダウン/プロンプター/公開音声）はこのアプリのどこからも呼ばれない。
import AiEditorTools from "@/components/ai/AiEditorTools";
import {
  Loader2,
  Save,
  Radio,
  List,
  Clock,
  Download,
  Upload,
  PanelRightOpen,
  PanelRightClose,
  ChevronLeft,
  MonitorPlay,
  Mic,
  Eye,
  Trash2,
} from "lucide-react";

// ============================================================
// Types
// ============================================================
interface CueRow {
  duration: string;
  cells: Record<string, unknown>;
  [key: string]: unknown;
}

interface Section {
  label: string;
  rows: CueRow[];
  duration?: string;
  _break?: boolean;
  _pageBreak?: boolean;
  [key: string]: unknown;
}

interface Block {
  id: string;
  type: string;
  label: string;
  width: string | number;
}

interface MicChannel {
  ch: number;
  label?: string;
}

interface MicAssignment {
  ch: number;
  person: string;
  micType: string;
  state: "on" | "off" | "standby";
}

interface Masters {
  persons: string[];
  video: string[];
  audio: string[];
  telop: string[];
  micTypes?: string[];
  micChannels?: MicChannel[];
}

interface DocumentMeta {
  title: string;
  draft: string;
  draftNumber?: number;
  draftType?: string;
  startTime?: string;
  broadcastStartTime?: string;
  broadcastDate?: string;
  recordingDate?: string;
  rehearsalDate?: string;
  location?: string;
  author?: string;
  updatedAt?: string;
}

interface DocumentData {
  meta: DocumentMeta;
  blocks: Block[];
  sections: Section[];
  masters: Masters;
}

interface QsheetDocument {
  id: string;
  title: string;
  data: DocumentData;
  status: string;
  broadcast_date: string | null;
  episode_id: string | null;
  episode_code: string | null;
  updated_at: string;
}

// ============================================================
// Helpers
// ============================================================
const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

// ============================================================
// Excel export (CSV-based for simplicity without xlsx dep)
// ============================================================
function exportCsv(doc: QsheetDocument) {
  const { sections, blocks, meta } = doc.data;
  const headers = ["#", "セクション", "尺", ...blocks.map((b) => b.label)];
  const csvRows: string[][] = [headers];
  let num = 1;

  sections.forEach((sec) => {
    if (sec._break || sec._pageBreak) return;
    sec.rows.forEach((row) => {
      const rowCells: Record<string, unknown> = (row.cells as Record<string, unknown>) || {};
      csvRows.push([
        String(num++),
        String(sec.label || ""),
        String(row.duration || ""),
        ...blocks.map((b) => {
          const cell = rowCells[b.id];
          if (typeof cell === "string") return cell;
          if (cell && typeof cell === "object") {
            const obj = cell as Record<string, unknown>;
            if (b.type === "audio_mic" && Array.isArray(obj.assignments)) {
              return (obj.assignments as MicAssignment[])
                .filter((a) => a.state !== "off")
                .sort((a, b2) => a.ch - b2.ch)
                .map((a) => {
                  const tag = a.state === "on" ? "ON" : "STBY";
                  const name = a.person ? ` ${a.person}` : "";
                  const mic = a.micType ? `/${a.micType}` : "";
                  return `Ch${a.ch}:${tag}${name}${mic}`;
                })
                .join(" / ");
            }
            if (Array.isArray(obj.entries)) {
              return (obj.entries as Array<Record<string, unknown>>)
                .map((e) => {
                  const html = typeof e.html === "string" ? e.html.replace(/<[^>]*>/g, "") : "";
                  if (html) return html;
                  const label = typeof e.label === "string" ? e.label : "";
                  const memo = typeof e.memo === "string" && e.memo ? ` ${e.memo}` : "";
                  return `${label}${memo}`;
                })
                .filter((s) => s.trim())
                .join(" / ");
            }
            if ("value" in obj) return String(obj.value || "");
          }
          return "";
        }),
      ]);
    });
  });

  const bom = "\uFEFF";
  const csv = csvRows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${meta.title || "cuesheet"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// EditorPage
// ============================================================
export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [doc, setDoc] = useState<QsheetDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error" | "unsaved" | "conflict">("saved");
  const [saveFlash, setSaveFlash] = useState(false);
  // 最終保存時刻 (目視確認用) と 同時編集の競合メッセージ
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const { currentUser } = useAuth();
  // 同時共同編集 (Phase 4b): 既定 ON。?collab=0 で従来モードに即フォールバック (緊急スイッチ)。
  const collabRequested = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("collab") !== "0";
  // 安全網: 同期が一定時間成立しなければ従来 HTTP 保存モードへ退避 (データ消失防止)。
  const [collabFailed, setCollabFailed] = useState(false);
  const collabEnabled = collabRequested && !collabFailed;
  const collabUser = currentUser ? { id: currentUser.id, name: currentUser.name } : null;
  const { data: collabData, synced: collabSynced, mutate: collabMutate, peers: collabPeers, setCursor: setCollabCursor } =
    useCollabDoc(id, collabEnabled, collabUser);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showAudioShare, setShowAudioShare] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  // 立ち位置図エディタの開閉状態。null=閉じている、{id:null}=新規追加、{id}=既存テンプレの編集
  const [stageEditorTarget, setStageEditorTarget] = useState<{ id: string | null } | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const toggleBlockCollapse = useCallback((id: string) => {
    setCollapsedBlocks((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleSectionCollapse = useCallback((si: number) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(si) ? next.delete(si) : next.add(si);
      return next;
    });
  }, []);

  const { data: queryData, isLoading } = useQuery({
    queryKey: ["qsheet-document", id],
    queryFn: async () => {
      const res = await api.get(`/techops/documents/${id}`);
      return res.data.data as QsheetDocument;
    },
    enabled: !!id,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (queryData && !doc) {
      const d = { ...queryData, data: { ...queryData.data } };
      if (!d.data.sections) d.data.sections = [];
      if (!d.data.blocks) d.data.blocks = [
        { id: "scenario", type: "scenario", label: "台本", width: 300 },
        { id: "video", type: "video", label: "映像", width: 150 },
        { id: "audio", type: "audio", label: "音声", width: 150 },
      ];
      if (!d.data.meta) d.data.meta = { title: d.title, draft: "準備稿" };
      if (!d.data.masters) d.data.masters = { persons: [], video: [], audio: [], telop: [] };
      // v2.8.155: 旧モデルの複数エントリ行を 1 行 = 1 エントリに分割
      // + stage_diagram の templateIndex→templateId 移行 + モバイル形セルの正規化 (段0)
      const migrated = normalizeQsheetData(d.data as any);
      // Phase 0 (同時編集の地固め): 全 section/row に安定 id を後付け
      const withIds = ensureStableIds(migrated.data as any);
      const anyChanged = migrated.changed || withIds.changed;
      d.data = withIds.data as any;
      if (anyChanged) {
        setDoc(d);
        setDirty(true);
        setSaveStatus("unsaved");
      } else {
        setDoc(d);
      }
    }
  }, [queryData, doc]);

  useSyncDocProductionNavContext((doc as any)?.project_id, (doc as any)?.program_id);

  const saveMutation = useMutation({
    mutationFn: async (document: QsheetDocument) => {
      setSaveStatus("saving");
      const res = await api.put(`/techops/documents/${document.id}`, {
        title: document.data.meta.title || document.title,
        data: document.data,
        status: document.status,
        broadcast_date: document.broadcast_date,
        episode_code: document.episode_code,
        episode_id: document.episode_id,
        // 楽観ロック: 読み込み時点の updated_at を送り、他ユーザーが先に保存していたら 409
        expected_updated_at: document.updated_at,
      });
      return res.data.data as { updated_at: string };
    },
    onSuccess: (saved) => {
      setDirty(false);
      setSaveStatus("saved");
      setLastSavedAt(new Date());
      // 次回保存の楽観ロック用に updated_at を最新化 (編集中の data は触らない)
      if (saved?.updated_at) {
        setDoc((prev) => (prev ? { ...prev, updated_at: saved.updated_at } : prev));
      }
      queryClient.invalidateQueries({ queryKey: ["qsheet-documents"] });
    },
    onError: (err: any) => {
      if (err?.response?.status === 409) {
        // 同時編集の競合: 自動保存を止めてバナーで案内 (黙った上書きはしない)
        const msg = err.response?.data?.error?.message ||
          "他のユーザーがこのシートを先に更新したため、上書きを防ぐため保存を中止しました。";
        setSaveStatus("conflict");
        setConflictMsg(msg);
        return;
      }
      setSaveStatus("error");
      notifyError("保存に失敗しました", { description: "ネットワーク接続を確認して、もう一度保存してください。" });
    },
  });

  const updateData = useCallback((updater: (data: DocumentData) => DocumentData) => {
    if (collabEnabled) {
      // collab: Y.Doc を真実源に。現在の Y 状態を prev として updater を適用し、差分を Y 操作へ翻訳。
      // (id の後付けは applyDataUpdate が持つ。id 無しのまま差分を取ると倍々に増える)
      collabMutate((ydoc) => applyDataUpdate(ydoc, (prev) => updater(prev as DocumentData)));
      // React 表示は collabData→doc.data 同期 effect が更新する (ここでは setDoc しない)
      return;
    }
    setDoc((prev) => {
      if (!prev) return prev;
      // collab 経路と同じ不変条件 (全 section/row に id) をここでも保つ。
      // 保存された JSONB を次に collab で開いたときに id 無しから始めないため。
      return { ...prev, data: ensureStableIds(updater({ ...prev.data })).data as DocumentData };
    });
    setDirty(true);
    // 競合状態は編集しても解除しない (バナーで「最新を読み込む」を促す)
    setSaveStatus((prev) => (prev === "conflict" ? prev : "unsaved"));
  }, [collabEnabled, collabMutate]);

  // CSV インポート: 解析済みセクションを置き換え or 末尾に追加、検出した話者を masters.persons にマージ
  const handleCsvImport = useCallback((result: CsvImportResult, mode: "replace" | "append") => {
    updateData((d) => {
      const persons = Array.isArray(d.masters?.persons) ? d.masters.persons : [];
      const newPersons = result.speakerNames.filter((n) => !persons.includes(n));
      return {
        ...d,
        sections: mode === "replace" ? result.sections : [...d.sections, ...result.sections],
        masters: newPersons.length > 0 ? { ...d.masters, persons: [...persons, ...newPersons] } : d.masters,
      };
    });
  }, [updateData]);

  // 台本 Excel 入出力（03-excel.md §8・§9）。状態・ハンドラは useExcelIO.ts に切り出し。
  const excelIO = useExcelIO(doc, updateData, setDoc);

  // collab: Y.Doc スナップショットを doc.data に反映 (Y が真実源)。
  useEffect(() => {
    if (!collabEnabled || !collabData) return;
    setDoc((prev) => (prev ? { ...prev, data: collabData as DocumentData } : prev));
  }, [collabEnabled, collabData]);

  // collab 安全網 (Phase 4b): 8 秒同期しなければ従来 HTTP 保存モードへ退避 (編集を消さない)。
  useEffect(() => {
    if (!collabRequested || collabSynced || collabFailed) return;
    const t = setTimeout(() => {
      setCollabFailed(true);
      // 退避時に現在の内容を HTTP 保存経路で確実に永続化する (取りこぼし防止)
      setDirty(true);
      notifyError("共同編集に接続できませんでした", {
        description: "通常の保存モードに切り替えました。編集内容は従来どおり保存されます。",
      });
    }, 8000);
    return () => clearTimeout(t);
  }, [collabRequested, collabSynced, collabFailed]);

  // collab (Phase 3): セルにフォーカスしたら自分のカーソル位置を共有する。
  useEffect(() => {
    if (!collabEnabled) return;
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      const cell = target?.closest?.("[data-collab-cell]") as HTMLElement | null;
      const key = cell?.getAttribute("data-collab-cell");
      if (!key) return;
      const [rowId, blockId] = key.split("|");
      if (rowId && blockId) setCollabCursor({ rowId, blockId });
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [collabEnabled, setCollabCursor]);

  // collab (Phase 3): 他ユーザーの編集中セルを色付き枠 + 名前ラベルで表示 (DOM 直接操作でメモ最適化を壊さない)。
  useEffect(() => {
    if (!collabEnabled) return;
    const touched: HTMLElement[] = [];
    const badges: HTMLElement[] = [];
    for (const p of collabPeers) {
      if (!p.cursor) continue;
      const key = `${p.cursor.rowId}|${p.cursor.blockId}`;
      let el: HTMLElement | null = null;
      try {
        el = document.querySelector(`[data-collab-cell="${CSS.escape(key)}"]`) as HTMLElement | null;
      } catch {
        el = null;
      }
      if (!el) continue;
      el.style.outline = `2px solid ${p.user.color}`;
      el.style.outlineOffset = "-2px";
      if (getComputedStyle(el).position === "static") el.style.position = "relative";
      touched.push(el);
      const badge = document.createElement("div");
      badge.textContent = p.user.name;
      badge.style.cssText =
        `position:absolute;top:0;right:0;transform:translateY(-100%);background:${p.user.color};` +
        `color:#fff;font-size:10px;line-height:1.4;padding:0 4px;border-radius:4px 4px 0 0;` +
        `pointer-events:none;white-space:nowrap;z-index:40;font-weight:600;`;
      el.appendChild(badge);
      badges.push(badge);
    }
    return () => {
      for (const el of touched) {
        el.style.outline = "";
        el.style.outlineOffset = "";
      }
      for (const b of badges) b.remove();
    };
  }, [collabEnabled, collabPeers]);

  // Auto-save (2s debounce)。競合検出中は自動保存を止める (409 の連発を防止)。
  // collab モードでは Y 更新をサーバーが永続化するため HTTP 保存はしない。
  useEffect(() => {
    if (collabEnabled) return;
    if (!dirty || !doc || conflictMsg) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveMutation.mutate(doc);
    }, 2000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [dirty, doc, conflictMsg]);

  // collab 有効時、title/status/broadcast_date/episode_* のメタ列だけを別経路で反映する
  // (§3-3 ★追加(重大)の直し。`data` 列には触れない — フックの中身は useCollabMetaSync.ts)。
  useCollabMetaSync({
    collabEnabled,
    docId: doc?.id,
    meta: doc
      ? {
          title: doc.data.meta.title || doc.title || "",
          status: doc.status,
          broadcast_date: doc.broadcast_date,
          episode_id: doc.episode_id,
          episode_code: doc.episode_code,
        }
      : null,
    onSynced: (updatedAt) => setDoc((prev) => (prev ? { ...prev, updated_at: updatedAt } : prev)),
  });

  // 在席表示 (Phase 1): このシートを今開いている人を Socket.IO で同期する。
  // 内容同期はまだ載せず、presence のみ (誰かが同時に開いていると分かる → 競合の心当たりが付く)。
  useEffect(() => {
    if (!id) return;
    const socket = getQsheetSocket(id);
    const onPresence = (payload: { users?: PresenceUser[] }) => {
      setPresenceUsers(Array.isArray(payload?.users) ? payload.users : []);
    };
    socket.on("presence:sync", onPresence);
    const onConnect = () => socket.emit("presence:query");
    socket.on("connect", onConnect);
    if (socket.connected) socket.emit("presence:query");
    return () => {
      socket.off("presence:sync", onPresence);
      socket.off("connect", onConnect);
      disconnectQsheetSocket();
      setPresenceUsers([]);
    };
  }, [id]);

  // Note: Section/row CRUD is handled by CueTable component



  // Global Ctrl+S / Cmd+S → manual save (input/textarea/[contenteditable] 内では無視)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.key === "s" || e.key === "S") || !(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        if (target.isContentEditable) return;
      }
      e.preventDefault();
      handleManualSave();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // Manual save — increments draftNumber if numbered mode
  const handleManualSave = useCallback(() => {
    if (!doc) return;
    if (collabEnabled) {
      // collab: 稿番号の更新のみ Y 経由で行い、HTTP 保存はしない (サーバーが Y を永続化)。
      updateData((d) => {
        const meta = { ...d.meta };
        if (meta.draftType === "numbered" || !meta.draftType) meta.draftNumber = (meta.draftNumber || 1) + 1;
        meta.updatedAt = new Date().toISOString();
        return { ...d, meta };
      });
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 1500);
      return;
    }
    clearTimeout(autoSaveTimer.current);
    const nextDoc = { ...doc, data: { ...doc.data, meta: { ...doc.data.meta } } };
    if (nextDoc.data.meta.draftType === "numbered" || !nextDoc.data.meta.draftType) {
      nextDoc.data.meta.draftNumber = (nextDoc.data.meta.draftNumber || 1) + 1;
    }
    nextDoc.data.meta.updatedAt = new Date().toISOString();
    setDoc(nextDoc);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1500);
    saveMutation.mutate(nextDoc);
  }, [doc, saveMutation, collabEnabled, updateData]);

  const getDraftLabel = (meta?: DocumentMeta): string => {
    if (!meta) return "第1稿";
    if (meta.draftType === "準備稿") return "準備稿";
    if (meta.draftType === "決定稿") return "決定稿";
    return `第${meta.draftNumber || 1}稿`;
  };

  // 編集画面の合計尺: ロール尺 (section.duration) を優先し、無ければ行の合計へ
  // (進行/ランダウンとは向きが逆。両画面の表示結果を変えないため docTotalSec に優先順位を渡す)
  const totalDuration = docTotalSec(doc?.data.sections, { preferRoleDuration: true });

  if (isLoading || !doc) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // 立ち位置図テンプレートを複製して、その複製を編集モードで開く
  // (元データはそのまま残り、「1人追加」などの転用が時短になる)
  const duplicateStageTemplate = (id: string) => {
    const templates = (((doc.data as any).stageTemplates) || []) as Array<{ id?: string; name: string; elements: unknown[] }>;
    const src = templates.find((t) => t.id === id);
    if (!src) return;
    const newId = genId("stg");
    const copy = {
      id: newId,
      name: `${src.name || "立ち位置図"} (コピー)`,
      elements: JSON.parse(JSON.stringify(src.elements || [])),
    };
    updateData((d) => ({ ...d, stageTemplates: [...(((d as any).stageTemplates) || []), copy] } as any));
    setStageEditorTarget({ id: newId });
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <header className="flex-none bg-card/80 backdrop-blur-xl border-b border-border z-50">
        {/* Row 1: Title + save + actions */}
        <div className="flex items-center justify-between px-4 h-11">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={() => navigate("/techops/sheets")}
              className="p-1 rounded-control-md hover:bg-accent text-muted-foreground transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="ダッシュボードに戻る"
            >
              <ChevronLeft size={18} aria-hidden />
            </button>
            <input
              value={doc.data.meta.title || ""}
              onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, title: e.target.value } }))}
              className="flex-1 min-w-0 bg-transparent text-[15px] font-bold border-none outline-none placeholder:text-muted-foreground/40 truncate"
              placeholder="無題のドキュメント"
              aria-label="ドキュメントタイトル"
            />
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            {/* 同時共同編集モード (?collab=1) のインジケータ */}
            {collabEnabled && (
              <span
                className={`hidden sm:inline text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                  collabSynced ? "text-primary bg-primary/10" : "text-muted-foreground bg-muted"
                }`}
                title={collabSynced ? "同時共同編集: 同期済み" : "同時共同編集: 接続中..."}
              >
                {collabSynced ? "共同編集中" : "接続中..."}
              </span>
            )}
            {/* 在席表示 (このシートを今開いている人) */}
            <PresenceAvatars users={presenceUsers} currentUserId={currentUser?.id} />
            {/* Save status badge (最終保存時刻つき) */}
            <span
              role="status"
              aria-live="polite"
              title={lastSavedAt ? `最終保存 ${lastSavedAt.toLocaleTimeString("ja-JP")}` : "このセッションではまだ保存されていません"}
              className={`hidden sm:inline text-xs font-medium px-2 py-0.5 rounded-full transition-all whitespace-nowrap ${
                saveStatus === "saved" ? "text-success bg-success/10" :
                saveStatus === "saving" ? "text-primary bg-primary/10" :
                saveStatus === "error" || saveStatus === "conflict" ? "text-destructive bg-destructive/10" :
                "text-warning bg-warning/10"
              }`}
            >
              {saveStatus === "saved"
                ? `保存済み${lastSavedAt ? ` ${lastSavedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}`
                : saveStatus === "saving" ? "保存中..."
                : saveStatus === "error" ? "保存エラー"
                : saveStatus === "conflict" ? "競合 (未保存)"
                : `未保存${lastSavedAt ? ` (最終保存 ${lastSavedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })})` : ""}`}
            </span>
            {/* Manual save button */}
            <button
              onClick={handleManualSave}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-control-md transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                saveFlash ? "bg-success text-success-foreground scale-105" : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
              aria-label="手動保存"
              aria-keyshortcuts="Control+S"
              title="保存 (Ctrl+S / Cmd+S)"
            >
              <Save size={14} aria-hidden />
              <span className="hidden sm:inline">{saveFlash ? "保存しました" : "保存"}</span>
            </button>
            {/* ゴミ箱 — ロール/行の復元用 */}
            {(() => {
              const trashCount = getTrash(doc.data).length;
              return (
                <button
                  onClick={() => setShowTrash(true)}
                  className="relative hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-control-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  title="ゴミ箱（削除したロール/行を復元）"
                  aria-label={`ゴミ箱 ${trashCount}件`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden md:inline">ゴミ箱</span>
                  {trashCount > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold min-w-[18px] text-center">
                      {trashCount}
                    </span>
                  )}
                </button>
              );
            })()}
            {/* CSV export — desktop only */}
            <Button variant="ghost" size="sm" className="hidden md:flex h-8 gap-1 text-xs" onClick={() => exportCsv(doc)} title="CSVエクスポート">
              <Download className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">CSV</span>
            </Button>
            {/* CSV import — desktop only */}
            <Button variant="ghost" size="sm" className="hidden md:flex h-8 gap-1 text-xs" onClick={() => setShowCsvImport(true)} title="CSVインポート">
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">CSV取込</span>
            </Button>
            {/* PDF export */}
            <button
              onClick={() => setShowPreview(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-control-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="印刷 / PDF プレビュー"
            >
              <Eye size={13} aria-hidden />
              <span className="hidden md:inline">印刷 / PDF</span>
            </button>
            <AiEditorTools documentId={doc.id} projectId={(doc as any).project_id} updateData={updateData} />
            {/* 音声サポート URL 共有 (マイク香盤ブロックがある時のみ表示) */}
            {doc.data.blocks.some((b) => b.type === "audio_mic") && (
              <Button
                variant="ghost"
                size="sm"
                className="hidden md:flex h-8 gap-1"
                onClick={() => setShowAudioShare(true)}
                title="音声サポート画面 URL を共有"
              >
                <Mic className="h-4 w-4 text-pink-600" />
                <span className="hidden lg:inline text-xs">音声共有</span>
              </Button>
            )}

            {/* Navigation buttons — tablet+ */}
            <Button variant="ghost" size="sm" className="hidden md:flex h-8 gap-1" onClick={() => navigate(`/techops/rundown/${doc.id}`)}>
              <List className="h-4 w-4" />
              <span className="hidden lg:inline text-xs">ランダウン</span>
            </Button>
            <Button variant="ghost" size="sm" className="hidden lg:flex h-8 gap-1" onClick={() => navigate(`/techops/prompter/${doc.id}`)}>
              <MonitorPlay className="h-4 w-4" />
              <span className="hidden xl:inline text-xs">プロンプター</span>
            </Button>
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => navigate(`/techops/onair/${doc.id}`)}>
              <Radio className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">ON AIR</span>
            </Button>
            <button
              className="p-1.5 rounded-control-md hover:bg-accent text-muted-foreground transition-colors hidden lg:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? "サイドバーを閉じる" : "サイドバーを開く"}
            >
              {sidebarOpen ? <PanelRightClose size={16} aria-hidden /> : <PanelRightOpen size={16} aria-hidden />}
            </button>
          </div>
        </div>

        {/* Row 2: Info bar — draft selector + dates + location (hidden on mobile) */}
        <div className="hidden sm:flex items-center gap-3 px-4 pb-2 text-[11px] text-muted-foreground flex-wrap">
          {/* Draft selector */}
          <div className="flex items-center gap-1">
            <span className="font-bold text-primary text-xs bg-primary/10 px-2 py-0.5 rounded-badge font-number">
              {getDraftLabel(doc.data.meta)}
            </span>
            <select
              value={doc.data.meta.draftType || "numbered"}
              onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, draftType: e.target.value } }))}
              className="bg-transparent border border-border rounded-control px-1.5 py-0.5 text-[11px] outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="稿の種類"
            >
              <option value="numbered">稿番号を自動設定</option>
              <option value="準備稿">準備稿</option>
              <option value="決定稿">決定稿</option>
            </select>
          </div>
          <span className="text-border" aria-hidden>|</span>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">放送日</span>
            <input type="date" value={doc.data.meta.broadcastDate || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, broadcastDate: e.target.value } }))} className="bg-transparent border-none outline-none text-foreground font-number" aria-label="放送日" />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">収録日</span>
            <input type="date" value={doc.data.meta.recordingDate || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, recordingDate: e.target.value } }))} className="bg-transparent border-none outline-none text-foreground font-number" aria-label="収録日" />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">開始</span>
            <input type="time" value={doc.data.meta.broadcastStartTime || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, broadcastStartTime: e.target.value } }))} className="bg-transparent border-none outline-none text-foreground font-number" step="1" aria-label="放送開始時刻" />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">場所</span>
            <input value={doc.data.meta.location || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, location: e.target.value } }))} className="bg-transparent border-none outline-none text-foreground w-32" placeholder="撮影場所" aria-label="撮影場所" />
          </label>
          <div className="ml-auto flex items-center gap-1 text-muted-foreground">
            <Clock size={11} aria-hidden />
            <span className="font-number tabular-nums" aria-label="総尺">{formatTime(totalDuration)}</span>
          </div>
        </div>
      </header>

      {/* 同時編集の競合バナー */}
      {conflictMsg && (
        <div role="alert" className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-destructive text-destructive-foreground text-sm">
          <span className="font-bold">⚠ 保存が競合しました:</span>
          <span className="flex-1 min-w-[200px]">{conflictMsg} 自動保存は停止中です。必要なら現在の内容を CSV エクスポート等で退避してから、最新を読み込んでください。</span>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 text-xs font-bold rounded-control-md bg-destructive-foreground/15 hover:bg-destructive-foreground/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive-foreground/50"
          >
            最新を読み込む (自分の未保存分は破棄)
          </button>
        </div>
      )}

      {/* Editor body + sidebar
          - lg 以上: 親は overflow-hidden で CueTable 内 <main overflow-auto> が縦スクロール担当
          - lg 未満: 親自身を overflow-y-auto にして CueCardList を含む全コンテンツをスクロール可能にする */}
      <div className="flex flex-1 overflow-y-auto lg:overflow-hidden">
        <CueTable
          blocks={doc.data.blocks}
          sections={doc.data.sections}
          masters={doc.data.masters}
          stageTemplates={(doc.data as any).stageTemplates}
          ledScenes={(doc.data as any).ledScenes}
          meta={doc.data.meta}
          collapsedBlocks={collapsedBlocks}
          collapsedSections={collapsedSections}
          onToggleCollapse={toggleBlockCollapse}
          onToggleSectionCollapse={toggleSectionCollapse}
          updateState={updateData}
        />

        {/* Sidebar (lg+) */}
        {sidebarOpen && (
          <EditorSidebar
            blocks={doc.data.blocks}
            masters={doc.data.masters}
            meta={doc.data.meta}
            stageTemplates={(doc.data as any).stageTemplates}
            ledScenes={(doc.data as any).ledScenes}
            episodeId={doc.episode_id}
            onBlocksChange={(blocks) => updateData((d) => ({ ...d, blocks }))}
            onMastersChange={(masters) => updateData((d) => ({ ...d, masters }))}
            onMetaChange={(meta) => updateData((d) => ({ ...d, meta }))}
            onLedScenesChange={(scenes) => updateData((d) => ({ ...d, ledScenes: scenes } as any))}
            onEditStageTemplate={(id) => setStageEditorTarget({ id })}
            onDuplicateStageTemplate={(id) => duplicateStageTemplate(id)}
            onEpisodeChange={(episodeId, episodeCode) => {
              setDoc((prev) => prev ? { ...prev, episode_id: episodeId, episode_code: episodeCode } : prev);
              setDirty(true);
            }}
            onExportExcel={excelIO.handleExcelExport}
            onShowImport={() => excelIO.setShowExcelImport(true)}
          />
        )}
      </div>

      {/* Mobile/Tablet Sidebar Sheet (lg未満で FAB から開く) */}
      <EditorSidebarSheet
        open={mobileSidebarOpen}
        onOpenChange={setMobileSidebarOpen}
        blocks={doc.data.blocks}
        masters={doc.data.masters}
        meta={doc.data.meta}
        stageTemplates={(doc.data as any).stageTemplates}
        ledScenes={(doc.data as any).ledScenes}
        episodeId={doc.episode_id}
        onBlocksChange={(blocks) => updateData((d) => ({ ...d, blocks }))}
        onMastersChange={(masters) => updateData((d) => ({ ...d, masters }))}
        onMetaChange={(meta) => updateData((d) => ({ ...d, meta }))}
        onLedScenesChange={(scenes) => updateData((d) => ({ ...d, ledScenes: scenes } as any))}
        onEditStageTemplate={(id) => {
          setStageEditorTarget({ id });
          setMobileSidebarOpen(false);
        }}
        onDuplicateStageTemplate={(id) => {
          duplicateStageTemplate(id);
          setMobileSidebarOpen(false);
        }}
        onEpisodeChange={(episodeId, episodeCode) => {
          setDoc((prev) => prev ? { ...prev, episode_id: episodeId, episode_code: episodeCode } : prev);
          setDirty(true);
        }}
        onExportExcel={excelIO.handleExcelExport}
        onShowImport={() => { setMobileSidebarOpen(false); excelIO.setShowExcelImport(true); }}
      />

      {/* FAB — モバイル/タブレットでサイドバーを開く */}
      <button
        type="button"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="エディタサイドバーを開く"
        className={`lg:hidden fixed right-4 size-14 rounded-full shadow-lg flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          saveStatus === "error"
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        }`}
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      >
        <PanelRightOpen size={22} aria-hidden />
        {saveStatus === "error" && (
          <span className="absolute -top-1 -right-1 size-3 rounded-full bg-destructive ring-2 ring-background" aria-hidden />
        )}
      </button>

      {/* Preview Modal */}
      {showPreview && (
        <PreviewModal
          state={doc.data}
          onClose={() => setShowPreview(false)}
          docUpdatedAt={(doc as any).updated_at}
          docCreatedAt={(doc as any).created_at}
          docTitle={doc.title}
        />
      )}

      {/* CSV インポート */}
      {showCsvImport && (
        <CsvImportDialog
          blocks={doc.data.blocks}
          onImport={handleCsvImport}
          onClose={() => setShowCsvImport(false)}
        />
      )}

      {excelIO.showExcelImport && (
        <ExcelImportDialog docId={doc.id} currentData={doc.data} onApply={excelIO.handleExcelApply} onApplyMeta={excelIO.handleExcelApplyMeta} onRestore={excelIO.handleExcelRestore} onClose={() => excelIO.setShowExcelImport(false)} />
      )}

      {/* ゴミ箱 Drawer */}
      {showTrash && (
        <TrashDrawer
          data={doc.data}
          onChange={(updater) => updateData(updater)}
          onClose={() => setShowTrash(false)}
        />
      )}

      {/* 音声サポート URL 共有ダイアログ */}
      <AudioShareDialog
        open={showAudioShare}
        onOpenChange={setShowAudioShare}
        docId={doc.id}
      />

      {/* Stage Editor Modal */}
      {stageEditorTarget && (
        <StageEditor
          template={
            stageEditorTarget.id
              ? (((doc.data as any).stageTemplates || []) as Array<{ id?: string }>).find(
                  (t) => t.id === stageEditorTarget.id,
                ) as any || null
              : null
          }
          onSave={(data) => {
            updateData((d) => {
              const templates = [...((d as any).stageTemplates || [])];
              const idx = templates.findIndex((t: any) => t?.id === data.id);
              if (idx >= 0) {
                templates[idx] = data;
              } else {
                templates.push(data);
              }
              return { ...d, stageTemplates: templates } as any;
            });
            setStageEditorTarget(null);
          }}
          onSaveCopy={(data) => {
            // 現在の内容を新しいテンプレートとして追加し、その複製を続けて編集 (元データは変更しない)
            updateData((d) => ({ ...d, stageTemplates: [...(((d as any).stageTemplates) || []), data] } as any));
            setStageEditorTarget({ id: data.id });
          }}
          onClose={() => setStageEditorTarget(null)}
        />
      )}
    </div>
  );
}
