import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { notifyError } from "@/lib/notify";
import { parseDur as parseDurShared } from "@/lib/time";
import { Button } from "@/components/ui/button";
import EditorSidebar from "@/components/editor/EditorSidebar";
import EditorSidebarSheet from "@/components/editor/EditorSidebarSheet";
import CueTable from "@/components/editor/CueTable";
import PreviewModal from "@/components/editor/PreviewModal";
import TrashDrawer from "@/components/editor/TrashDrawer";
import { getTrash } from "@/lib/trash";
import { splitMultiEntryRows } from "@/lib/migrateEntries";
import { ensureStableIds } from "@/lib/stableIds";
import { getQsheetSocket, disconnectQsheetSocket } from "@/lib/socket";
import { useAuth } from "@/hooks/useAuth";
import PresenceAvatars, { type PresenceUser } from "@/components/editor/PresenceAvatars";
import { useCollabDoc } from "@/lib/collab/useCollabDoc";
import { applyDataDiff } from "@/lib/collab/ydocDiff";
import { yDocToData } from "@gmo-onair/shared/src/collab/yjsDoc";
import StageEditor from "@/components/editor/StageEditor";
import AudioShareDialog from "@/components/editor/AudioShareDialog";
import ColumnChips from "@/components/editor/ColumnChips";
import CsvImportDialog from "@/components/editor/CsvImportDialog";
import type { CsvImportResult } from "@/lib/csvImport";
import {
  Loader2,
  Save,
  Radio,
  Clock,
  Download,
  Upload,
  PanelRightOpen,
  PanelRightClose,
  ChevronLeft,
  Share2,
  Undo2,
  Eye,
  Trash2,
  MoreHorizontal,
} from "lucide-react";

/**
 * セルに中身があるか (出す列の自動判定用)。
 * 型ごとに形が違うので、空配列・空文字を「無い」として扱う。
 */
function cellHasContent(cell: unknown): boolean {
  if (cell == null) return false;
  if (typeof cell === "string") return cell.trim().length > 0;
  if (typeof cell !== "object") return true;
  const c = cell as Record<string, unknown>;
  if (Array.isArray(c.entries)) {
    return (c.entries as Record<string, unknown>[]).some((e) =>
      Object.values(e ?? {}).some((v) => typeof v === "string" ? v.replace(/<[^>]*>/g, "").trim().length > 0 : v != null && v !== "")
    );
  }
  if (Array.isArray(c.assignments)) {
    return (c.assignments as Record<string, unknown>[]).some((a) => a?.state && a.state !== "off");
  }
  if (typeof c.value === "string") return c.value.trim().length > 0;
  if (c.value != null) return true;
  // sceneId (LED/XR) や imageUrl (スライド) など、上のどれでもない型
  return Object.entries(c).some(([, v]) => typeof v === "string" ? v.trim().length > 0 : v != null && v !== "");
}

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
  /**
   * 出す列 (§4.12)。端末ごとの見た目なので localStorage に持ち、台本の中身 (data) には入れない。
   * null = まだ何も選んでいない → 空の列を自動で隠す初期値を1度だけ入れる。
   */
  const [hiddenBlockIds, setHiddenBlockIds] = useState<Set<string> | null>(null);

  /**
   * 直前の変更 (§4.12)。
   *
   * ゴミ箱 (`doc.data.trash`) はドキュメントと一緒に保存されるので、
   * **保存される前に閉じると消えてしまう**。ロールを1つ消して閉じたら戻せない。
   * そこで「保存とは無関係にその場で戻せる」履歴をメモリに持つ。
   * 保存済みの変更にも効くので「間違えて消した」を実際に取り消せる。
   */
  const historyRef = useRef<{ label: string; at: number; data: DocumentData }[]>([]);
  /** undo は updateData より前に定義されるので ref 越しに呼ぶ */
  const updateDataRef = useRef<((updater: (d: DocumentData) => DocumentData) => void) | null>(null);
  const [historyMarks, setHistoryMarks] = useState<{ label: string; at: number }[]>([]);
  /** 直前に見た data。これと変わったら1手として記録する */
  const prevDataRef = useRef<DocumentData | null>(null);
  /** 元に戻した直後の変化を記録しないための1回フラグ */
  const skipNextHistoryRef = useRef(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showAudioShare, setShowAudioShare] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [editingStageIdx, setEditingStageIdx] = useState<number | null>(null);
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
      const res = await api.get(`/qsheet/documents/${id}`);
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
      const migrated = splitMultiEntryRows(d.data as any);
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

  const saveMutation = useMutation({
    mutationFn: async (document: QsheetDocument) => {
      setSaveStatus("saving");
      const res = await api.put(`/qsheet/documents/${document.id}`, {
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

  /** 何が変わったかを数だけで見て一言にする (中身の比較はしない — 高頻度で走るため) */
  const describeChange = useCallback((prev: DocumentData, next: DocumentData): string => {
    const secs = (d: DocumentData) => d.sections?.length ?? 0;
    const rows = (d: DocumentData) => (d.sections ?? []).reduce((a, s) => a + (s.rows?.length ?? 0), 0);
    const blks = (d: DocumentData) => d.blocks?.length ?? 0;
    if (secs(next) < secs(prev)) return "ロールを削除";
    if (secs(next) > secs(prev)) return "ロールを追加";
    if (blks(next) < blks(prev)) return "列を削除";
    if (blks(next) > blks(prev)) return "列を追加";
    if (rows(next) < rows(prev)) return "行を削除";
    if (rows(next) > rows(prev)) return "行を追加";
    return "編集";
  }, []);

  const updateData = useCallback((updater: (data: DocumentData) => DocumentData) => {
    if (collabEnabled) {
      // collab: Y.Doc を真実源に。現在の Y 状態を prev として updater を適用し、差分を Y 操作へ翻訳。
      collabMutate((ydoc) => {
        const prev = yDocToData(ydoc) as DocumentData;
        const next = updater(prev);
        applyDataDiff(ydoc, prev, next);
      });
      // React 表示は collabData→doc.data 同期 effect が更新する (ここでは setDoc しない)
      return;
    }
    setDoc((prev) => {
      if (!prev) return prev;
      return { ...prev, data: updater({ ...prev.data }) };
    });
    setDirty(true);
    // 競合状態は編集しても解除しない (バナーで「最新を読み込む」を促す)
    setSaveStatus((prev) => (prev === "conflict" ? prev : "unsaved"));
  }, [collabEnabled, collabMutate]);

  useEffect(() => { updateDataRef.current = updateData; }, [updateData]);

  /**
   * 履歴の記録は **確定した data の変化**を見て行う。
   * updateData の中 (setDoc の updater や collabMutate のコールバック) で
   * setState を呼ぶと React に無視されることがあり、実際に履歴が積まれなかった。
   * ここなら collab / 非collab のどちらの経路でも同じ1か所で拾える。
   */
  useEffect(() => {
    const cur = doc?.data;
    if (!cur) return;
    const prev = prevDataRef.current;
    prevDataRef.current = cur;
    if (!prev || prev === cur) return;
    // 元に戻した直後の1回は積まない (積むと行き来を繰り返すだけになる)
    if (skipNextHistoryRef.current) { skipNextHistoryRef.current = false; return; }
    const entry = { label: describeChange(prev, cur), at: Date.now(), data: prev };
    const list = [...historyRef.current, entry].slice(-30); // 30 手前まで
    historyRef.current = list;
    setHistoryMarks(list.map(({ label, at }) => ({ label, at })));
  }, [doc?.data, describeChange]);

  /**
   * 元に戻す — 履歴を1つ戻す (n を渡すとそこまで一気に戻す)。
   * 戻す操作自身は履歴に積まない (積むと行き来を繰り返すだけになる)。
   */
  const undo = useCallback((index?: number) => {
    const list = historyRef.current;
    if (list.length === 0) return;
    const target = typeof index === "number" ? index : list.length - 1;
    const snapshot = list[target];
    if (!snapshot) return;
    const rest = list.slice(0, target);
    historyRef.current = rest;
    setHistoryMarks(rest.map(({ label, at }) => ({ label, at })));
    skipNextHistoryRef.current = true;
    updateDataRef.current?.(() => snapshot.data);
  }, []);

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

  // Ctrl+Z / Cmd+Z → 元に戻す (入力欄の中はブラウザの取り消しに任せる)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.key === "z" || e.key === "Z") || !(e.ctrlKey || e.metaKey) || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        if (target.isContentEditable) return;
      }
      e.preventDefault();
      undo();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo]);

  /**
   * 手動保存。**稿番号は上げない** (§4.12)。
   *
   * 従来は `draftType=numbered` のとき手動保存のたびに +1 していたため、
   * 「ちょっと直して保存」を3回やると第4稿になっていた。稿を上げるかどうかは
   * 人が決めることなので、「稿を上げる」を別の明示操作にした (handleBumpDraft)。
   */
  const handleManualSave = useCallback(() => {
    if (!doc) return;
    if (collabEnabled) {
      // collab: 内容は Y が持つので、ここでは更新時刻だけ触る (サーバーが Y を永続化)
      updateData((d) => ({ ...d, meta: { ...d.meta, updatedAt: new Date().toISOString() } }));
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 1500);
      return;
    }
    clearTimeout(autoSaveTimer.current);
    const nextDoc = { ...doc, data: { ...doc.data, meta: { ...doc.data.meta } } };
    nextDoc.data.meta.updatedAt = new Date().toISOString();
    setDoc(nextDoc);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1500);
    saveMutation.mutate(nextDoc);
  }, [doc, saveMutation, collabEnabled, updateData]);

  /** 稿を上げる — 明示操作。番号が上がるのはここだけ */
  const handleBumpDraft = useCallback(() => {
    if (!doc) return;
    const cur = doc.data.meta?.draftNumber || 1;
    if (!confirm(`第${cur}稿 → 第${cur + 1}稿 にします。よろしいですか？`)) return;
    if (collabEnabled) {
      updateData((d) => ({
        ...d,
        meta: { ...d.meta, draftType: "numbered", draftNumber: (d.meta.draftNumber || 1) + 1, updatedAt: new Date().toISOString() },
      }));
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 1500);
      return;
    }
    clearTimeout(autoSaveTimer.current);
    const nextDoc = { ...doc, data: { ...doc.data, meta: { ...doc.data.meta } } };
    nextDoc.data.meta.draftType = "numbered";
    nextDoc.data.meta.draftNumber = cur + 1;
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

  const parseDur = parseDurShared;
  const totalDuration = doc?.data.sections.reduce(
    (acc, section) => acc + (parseDur(section.duration) || section.rows.reduce((a, r) => a + parseDur(r.duration), 0)), 0
  ) || 0;

  // ── 出す列 (§4.12) ─────────────────────────────────────
  // hooks は早期 return より前に置く (doc 読み込み中でも hooks の数を変えない)
  const COLS_KEY = `qs_cols_${id}`;

  /** 中身が1つも無い列 = まだ使っていない列 */
  const emptyBlockIds = useMemo(() => {
    const empty = new Set<string>();
    const blocks = doc?.data.blocks ?? [];
    const sections = doc?.data.sections ?? [];
    for (const blk of blocks) {
      let used = false;
      for (const sec of sections) {
        for (const row of sec.rows) {
          const cell = (row.cells as Record<string, unknown> | undefined)?.[blk.id];
          if (cell && cellHasContent(cell)) { used = true; break; }
        }
        if (used) break;
      }
      if (!used) empty.add(blk.id);
    }
    return empty;
  }, [doc?.data.blocks, doc?.data.sections]);

  // 初回だけ「空の列は隠す」を入れる。以降はユーザーの選択を尊重する
  useEffect(() => {
    if (!doc || hiddenBlockIds !== null) return;
    try {
      const raw = localStorage.getItem(COLS_KEY);
      if (raw) { setHiddenBlockIds(new Set(JSON.parse(raw) as string[])); return; }
    } catch { /* 壊れていたら既定に落とす */ }
    setHiddenBlockIds(new Set(emptyBlockIds));
  }, [doc, hiddenBlockIds, emptyBlockIds, COLS_KEY]);

  // 毎レンダーで新しい Set を作ると下の useMemo が効かないので memo 化する
  const hidden = useMemo(() => hiddenBlockIds ?? new Set<string>(), [hiddenBlockIds]);

  const persistHidden = useCallback((next: Set<string>) => {
    setHiddenBlockIds(next);
    try { localStorage.setItem(COLS_KEY, JSON.stringify([...next])); } catch { /* noop */ }
  }, [COLS_KEY]);

  const toggleColumn = useCallback((blockId: string) => {
    const next = new Set(hidden);
    if (next.has(blockId)) next.delete(blockId); else next.add(blockId);
    persistHidden(next);
  }, [hidden, persistHidden]);

  const resetColumns = useCallback(() => persistHidden(new Set()), [persistHidden]);

  // 表に渡すのは「出している列」だけ。中身 (row.cells) は触らないので隠しても消えない
  const visibleBlocks = useMemo(
    () => (doc?.data.blocks ?? []).filter((b) => !hidden.has(b.id)),
    [doc?.data.blocks, hidden]
  );

  if (isLoading || !doc) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // 立ち位置図テンプレートを複製して、その複製を編集モードで開く
  // (元データはそのまま残り、「1人追加」などの転用が時短になる)
  const duplicateStageTemplate = (idx: number) => {
    const templates = (((doc.data as any).stageTemplates) || []) as Array<{ name: string; elements: unknown[] }>;
    const src = templates[idx];
    if (!src) return;
    const copy = {
      name: `${src.name || "立ち位置図"} (コピー)`,
      elements: JSON.parse(JSON.stringify(src.elements || [])),
    };
    const newIdx = templates.length;
    updateData((d) => ({ ...d, stageTemplates: [...(((d as any).stageTemplates) || []), copy] } as any));
    setEditingStageIdx(newIdx);
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <header className="flex-none bg-card/80 backdrop-blur-xl border-b border-border z-50">
        {/* Row 1: Title + save + actions */}
        <div className="flex items-center justify-between px-4 h-11">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={() => navigate("/qsheet")}
              className="p-1 rounded-lg hover:bg-accent text-muted-foreground transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
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
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                saveFlash ? "bg-success text-success-foreground scale-105" : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
              aria-label="手動保存"
              aria-keyshortcuts="Control+S"
              title="保存 (Ctrl+S / Cmd+S)"
            >
              <Save size={14} aria-hidden />
              <span className="hidden sm:inline">{saveFlash ? "保存しました" : "保存"}</span>
            </button>
            {/* 印刷 / PDF */}
            <button
              onClick={() => setShowPreview(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="紙 / PDF"
            >
              <Eye size={13} aria-hidden />
              <span className="hidden md:inline">紙 / PDF</span>
            </button>

            {/* 本番をはじめる — ここから先は本番の役割切替 (§4.13) */}
            <Button size="sm" className="h-8 gap-1" onClick={() => navigate(`/qsheet/live/${doc.id}?role=onair`)}>
              <Radio className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">本番をはじめる</span>
            </Button>

            {/* ⋯ — 頻度の低いものはここに畳む (§4.12: ヘッダーは4つに圧縮) */}
            <div className="relative">
              <button
                onClick={() => setShowMore((v) => !v)}
                className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                aria-label="そのほかの操作"
                aria-expanded={showMore}
              >
                <MoreHorizontal size={16} aria-hidden />
              </button>
              {showMore && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMore(false)} aria-hidden />
                  <div className="absolute right-0 top-9 z-50 w-56 rounded-lg border border-border bg-card py-1 shadow-xl">
                    {[
                      ...(historyMarks.length > 0
                        ? [{ label: `元に戻す（${historyMarks[historyMarks.length - 1].label}）`, Icon: Undo2, run: () => undo() }]
                        : []),
                      { label: `ゴミ箱と直前の変更${getTrash(doc.data).length > 0 ? `（${getTrash(doc.data).length}）` : ""}`, Icon: Trash2, run: () => setShowTrash(true) },
                      { label: "CSVで出す", Icon: Download, run: () => exportCsv(doc) },
                      { label: "CSVから取り込む", Icon: Upload, run: () => setShowCsvImport(true) },
                      // ランダウン・プロンプターは本番画面の役割切替から行けるので、ここには置かない (§4.13)
                      { label: "本番のURLを配る", Icon: Share2, run: () => setShowAudioShare(true) },
                      { label: sidebarOpen ? "サイドバーを閉じる" : "サイドバーを開く", Icon: sidebarOpen ? PanelRightClose : PanelRightOpen, run: () => setSidebarOpen(!sidebarOpen) },
                    ].map((m) => (
                      <button
                        key={m.label}
                        type="button"
                        onClick={() => { setShowMore(false); m.run(); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-accent"
                      >
                        <m.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        {m.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Info bar — draft selector + dates + location (hidden on mobile) */}
        <div className="hidden sm:flex items-center gap-3 px-4 pb-2 text-[11px] text-muted-foreground flex-wrap">
          {/* Draft selector */}
          <div className="flex items-center gap-1">
            <span className="font-bold text-primary text-xs bg-primary/10 px-2 py-0.5 rounded" style={{ fontFamily: "'Roboto Condensed',sans-serif" }}>
              {getDraftLabel(doc.data.meta)}
            </span>
            <select
              value={doc.data.meta.draftType || "numbered"}
              onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, draftType: e.target.value } }))}
              className="bg-transparent border border-border rounded px-1.5 py-0.5 text-[11px] outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="稿の種類"
            >
              <option value="numbered">稿番号で管理</option>
              <option value="準備稿">準備稿</option>
              <option value="決定稿">決定稿</option>
            </select>
            {/* 稿を上げるのは明示操作。保存では上がらない (§4.12) */}
            <button
              type="button"
              onClick={handleBumpDraft}
              className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="稿番号を1つ上げます。保存では上がりません"
            >
              稿を上げる
            </button>
          </div>
          <span className="text-border" aria-hidden>|</span>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">放送日</span>
            <input type="date" value={doc.data.meta.broadcastDate || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, broadcastDate: e.target.value } }))} className="bg-transparent border-none outline-none text-foreground" style={{ fontFamily: "'Roboto Condensed',sans-serif" }} aria-label="放送日" />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">収録日</span>
            <input type="date" value={doc.data.meta.recordingDate || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, recordingDate: e.target.value } }))} className="bg-transparent border-none outline-none text-foreground" style={{ fontFamily: "'Roboto Condensed',sans-serif" }} aria-label="収録日" />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">開始</span>
            <input type="time" value={doc.data.meta.broadcastStartTime || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, broadcastStartTime: e.target.value } }))} className="bg-transparent border-none outline-none text-foreground" style={{ fontFamily: "'Roboto Condensed',sans-serif" }} step="1" aria-label="放送開始時刻" />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">場所</span>
            <input value={doc.data.meta.location || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, location: e.target.value } }))} className="bg-transparent border-none outline-none text-foreground w-32" placeholder="撮影場所" aria-label="撮影場所" />
          </label>
          <div className="ml-auto flex items-center gap-1 text-muted-foreground">
            <Clock size={11} aria-hidden />
            <span style={{ fontFamily: "'Roboto Condensed',sans-serif" }} aria-label="総尺">{formatTime(totalDuration)}</span>
          </div>
        </div>

        {/* Row 3: 出す列 — サイドバーの「列」タブに埋もれていた表示切替を上に出した (§4.12) */}
        <div className="hidden sm:block px-4 pb-2">
          <ColumnChips
            blocks={doc.data.blocks}
            hidden={hidden}
            emptyIds={emptyBlockIds}
            onToggle={toggleColumn}
            onReset={resetColumns}
          />
        </div>
      </header>

      {/* 同時編集の競合バナー */}
      {conflictMsg && (
        <div role="alert" className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-destructive text-destructive-foreground text-sm">
          <span className="font-bold">⚠ 保存が競合しました:</span>
          <span className="flex-1 min-w-[200px]">{conflictMsg} 自動保存は停止中です。必要なら現在の内容を CSV エクスポート等で退避してから、最新を読み込んでください。</span>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-destructive-foreground/15 hover:bg-destructive-foreground/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive-foreground/50"
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
          blocks={visibleBlocks}
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
            onEditStageTemplate={(idx) => setEditingStageIdx(idx)}
            onDuplicateStageTemplate={(idx) => duplicateStageTemplate(idx)}
            onEpisodeChange={(episodeId, episodeCode) => {
              setDoc((prev) => prev ? { ...prev, episode_id: episodeId, episode_code: episodeCode } : prev);
              setDirty(true);
            }}
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
        onEditStageTemplate={(idx) => {
          setEditingStageIdx(idx);
          setMobileSidebarOpen(false);
        }}
        onDuplicateStageTemplate={(idx) => {
          duplicateStageTemplate(idx);
          setMobileSidebarOpen(false);
        }}
        onEpisodeChange={(episodeId, episodeCode) => {
          setDoc((prev) => prev ? { ...prev, episode_id: episodeId, episode_code: episodeCode } : prev);
          setDirty(true);
        }}
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

      {/* ゴミ箱 Drawer */}
      {showTrash && (
        <TrashDrawer
          history={historyMarks}
          onUndo={undo}
          data={doc.data}
          onChange={(updater) => updateData(updater)}
          onClose={() => setShowTrash(false)}
        />
      )}

      {/* 本番のURLを配る (4役割 + 音声サポートの配布停止) */}
      <AudioShareDialog
        open={showAudioShare}
        onOpenChange={setShowAudioShare}
        docId={doc.id}
        audioRevokedAt={(queryData as { audio_share_revoked_at?: string | null } | undefined)?.audio_share_revoked_at ?? null}
      />

      {/* Stage Editor Modal */}
      {editingStageIdx !== null && (
        <StageEditor
          template={editingStageIdx >= 0 ? ((doc.data as any).stageTemplates || [])[editingStageIdx] : null}
          onSave={(data) => {
            updateData((d) => {
              const templates = [...((d as any).stageTemplates || [])];
              if (editingStageIdx >= 0 && editingStageIdx < templates.length) {
                templates[editingStageIdx] = data;
              } else {
                templates.push(data);
              }
              return { ...d, stageTemplates: templates } as any;
            });
            setEditingStageIdx(null);
          }}
          onSaveCopy={(data) => {
            // 現在の内容を新しいテンプレートとして追加し、その複製を続けて編集 (元データは変更しない)
            const newIdx = (((doc.data as any).stageTemplates) || []).length;
            updateData((d) => ({ ...d, stageTemplates: [...(((d as any).stageTemplates) || []), data] } as any));
            setEditingStageIdx(newIdx);
          }}
          onClose={() => setEditingStageIdx(null)}
        />
      )}
    </div>
  );
}
