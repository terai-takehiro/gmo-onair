import { useState, useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import {
  X, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Info, RotateCcw,
  Sparkles, Type, Hash, CalendarDays, ListChecks, Link2, Tag, FileText, Inbox,
  ChevronDown, Check,
} from 'lucide-react';

// ── 型 (server と shape を合わせる) ──────────────────────
export type ImportMappingKey =
  | 'category' | 'division' | 'imageId'
  | 'name' | 'nameEn' | 'projectName' | 'projectNameEn' | 'nameKana' | 'projectKana'
  | 'org' | 'orgEn'
  | 'entryNo' | 'department' | 'position' | 'location' | 'joinDate'
  | 'ism' | 'skills' | 'title' | 'titleEn' | 'comment' | 'commentEn'
  | 'teamSize' | 'members'
  | 'recName' | 'recNameEn' | 'recNameKana' | 'recCompany' | 'recDept' | 'recPosition'
  | 'recRespect' | 'recRespectEn' | 'recRespectComment' | 'recRespectCommentEn';

export type ImportMapping = Partial<Record<ImportMappingKey, string>>;

type ColumnType = 'empty' | 'number' | 'date' | 'list' | 'id' | 'url' | 'shortText' | 'longText';

interface ColumnAnalysis {
  header: string;
  type: ColumnType;
  avgLength: number;
  maxLength: number;
  filledRatio: number;
  samples: string[];
  suggestedKey?: ImportMappingKey;
  suggestedConfidence: 'exact' | 'partial' | 'none';
}

interface PreviewResult {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  columns: ColumnAnalysis[];
  /** legacy (cgKey → header) — UI では使わない */
  suggestedMapping: ImportMapping;
}

interface ImportResult {
  totalInserted: number;
  skipped: number;
  warnings: string[];
  categories: { id: number; name: string; description: string | null; inserted: number }[];
}

// ── CG 項目カタログ (グループ化) ──────────────────────────
interface CgFieldDef { key: ImportMappingKey; label: string; required?: boolean }
interface CgFieldGroup { title: string; fields: CgFieldDef[] }

const CG_GROUPS: CgFieldGroup[] = [
  {
    title: '基本情報 (DB列)',
    fields: [
      { key: 'category', label: '賞 (Award)', required: true },
      { key: 'division', label: '部門 (Division)' },
      { key: 'name', label: 'ノミネート者氏名', required: true },
      { key: 'nameEn', label: 'ノミネート者氏名 (英語)' },
      { key: 'projectName', label: 'プロジェクト名 (チーム時)' },
      { key: 'projectNameEn', label: 'プロジェクト名 (英語)' },
      { key: 'org', label: '会社' },
      { key: 'orgEn', label: '会社 (英語)' },
      { key: 'imageId', label: '画像ID' },
    ],
  },
  {
    title: 'プロフィール (oneshot_data)',
    fields: [
      { key: 'entryNo', label: 'エントリーNo' },
      { key: 'nameKana', label: 'フリガナ' },
      { key: 'projectKana', label: 'プロジェクト名 フリガナ' },
      { key: 'department', label: '部署' },
      { key: 'position', label: '役職' },
      { key: 'location', label: '勤務地' },
      { key: 'joinDate', label: '入社日' },
    ],
  },
  {
    title: 'ノミネート内容 (oneshot_data)',
    fields: [
      { key: 'ism', label: '私のイズム' },
      { key: 'skills', label: '私の得意技' },
      { key: 'title', label: 'ノミネートタイトル' },
      { key: 'titleEn', label: 'ノミネートタイトル (英語)' },
      { key: 'comment', label: 'ノミネート者コメント' },
      { key: 'commentEn', label: 'ノミネート者コメント (英語)' },
    ],
  },
  {
    title: 'チーム情報 (oneshot_data)',
    fields: [
      { key: 'teamSize', label: '人数' },
      { key: 'members', label: 'チームメンバー' },
    ],
  },
  {
    title: '推薦者情報 (oneshot_data.recommender)',
    fields: [
      { key: 'recName', label: '推薦者氏名' },
      { key: 'recNameEn', label: '推薦者氏名 (英語)' },
      { key: 'recNameKana', label: '推薦者フリガナ' },
      { key: 'recCompany', label: '推薦者会社' },
      { key: 'recDept', label: '推薦者部署' },
      { key: 'recPosition', label: '推薦者役職' },
      { key: 'recRespect', label: '尊敬ポイント' },
      { key: 'recRespectEn', label: '尊敬ポイント (英語)' },
      { key: 'recRespectComment', label: '尊敬ポイント コメント' },
      { key: 'recRespectCommentEn', label: '尊敬ポイント コメント (英語)' },
    ],
  },
];

const CG_LABEL_BY_KEY: Record<ImportMappingKey, string> = (() => {
  const m: Record<string, string> = {};
  for (const g of CG_GROUPS) for (const f of g.fields) m[f.key] = f.label;
  return m as Record<ImportMappingKey, string>;
})();

// ── タイプバッジ ──────────────────────────────────────────
const TYPE_META: Record<ColumnType, { label: string; icon: typeof Type; cls: string }> = {
  shortText: { label: '短文',     icon: Type,         cls: 'bg-sky-100 text-sky-700 border-sky-300' },
  longText:  { label: '長文',     icon: FileText,     cls: 'bg-indigo-100 text-indigo-700 border-indigo-300' },
  list:      { label: 'リスト',   icon: ListChecks,   cls: 'bg-violet-100 text-violet-700 border-violet-300' },
  date:      { label: '日付',     icon: CalendarDays, cls: 'bg-amber-100 text-amber-700 border-amber-300' },
  number:    { label: '数値',     icon: Hash,         cls: 'bg-cyan-100 text-cyan-700 border-cyan-300' },
  id:        { label: 'ID',       icon: Tag,          cls: 'bg-rose-100 text-rose-700 border-rose-300' },
  url:       { label: 'URL',      icon: Link2,        cls: 'bg-teal-100 text-teal-700 border-teal-300' },
  empty:     { label: '空',       icon: Inbox,        cls: 'bg-slate-100 text-slate-500 border-slate-300' },
};

// ── 列ごとの割当 ──────────────────────────────────────────
type Assignment =
  | { action: 'cg'; cgKey: ImportMappingKey }   // 既知 CG 項目に割当
  | { action: 'asIs' }                            // そのまま oneshot_data に保存
  | { action: 'ignore' };                         // 使用しない

const STORAGE_KEY_PREFIX = 'awards-cg-import-assignments-';

function loadStoredAssignments(eventId: number): Record<string, Assignment> | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${eventId}`);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, Assignment>;
  } catch { return null; }
}
function saveStoredAssignments(eventId: number, a: Record<string, Assignment>): void {
  try { localStorage.setItem(`${STORAGE_KEY_PREFIX}${eventId}`, JSON.stringify(a)); } catch { /* noop */ }
}

// ── コンポーネント ────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  eventId: number;
  onImported: () => void;
}

type Phase = 'select' | 'preview' | 'committing' | 'done';

export default function ExcelImportDialog({ open, onClose, eventId, onImported }: Props) {
  const [phase, setPhase] = useState<Phase>('select');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPhase('select');
      setFile(null);
      setPreview(null);
      setAssignments({});
      setResult(null);
      setError(null);
    }
  }, [open]);

  const previewMutation = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append('file', f);
      const res = await api.post(`/awards/events/${eventId}/import-preview`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data as PreviewResult;
    },
    onSuccess: (p) => {
      setPreview(p);
      // 初期 assignment: localStorage 復元 → なければサーバー推奨
      const stored = loadStoredAssignments(eventId);
      const init: Record<string, Assignment> = {};
      const validHeaders = new Set(p.headers);
      // localStorage の値で valid なものを復元
      if (stored) {
        for (const [h, a] of Object.entries(stored)) {
          if (validHeaders.has(h)) init[h] = a;
        }
      }
      // 残り (= localStorage に無い列) は推奨 or 'asIs' (空列は ignore) で初期化
      const usedCg = new Set<ImportMappingKey>();
      for (const a of Object.values(init)) if (a.action === 'cg') usedCg.add(a.cgKey);
      p.columns.forEach((col) => {
        if (init[col.header]) return;
        if (col.type === 'empty') {
          init[col.header] = { action: 'ignore' };
        } else if (col.suggestedKey && !usedCg.has(col.suggestedKey)) {
          init[col.header] = { action: 'cg', cgKey: col.suggestedKey };
          usedCg.add(col.suggestedKey);
        } else {
          init[col.header] = { action: 'asIs' };
        }
      });
      setAssignments(init);
      setPhase('preview');
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('ファイルが選択されていません');
      const { mapping, extraColumns } = buildPayload(assignments);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mapping', JSON.stringify(mapping));
      fd.append('extraColumns', JSON.stringify(extraColumns));
      const res = await api.post(`/awards/events/${eventId}/import-excel`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data as ImportResult;
    },
    onSuccess: (r) => {
      saveStoredAssignments(eventId, assignments);
      setResult(r);
      setPhase('done');
      onImported();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  // 検証: 必須項目 (category, name) が割当られているか
  const validation = useMemo(() => {
    if (!preview) return { ok: true, missing: [], conflicts: [] as ImportMappingKey[] };
    const usedCg = new Map<ImportMappingKey, string[]>();
    for (const [h, a] of Object.entries(assignments)) {
      if (a.action === 'cg') {
        if (!usedCg.has(a.cgKey)) usedCg.set(a.cgKey, []);
        usedCg.get(a.cgKey)!.push(h);
      }
    }
    const missing: ImportMappingKey[] = [];
    const required: ImportMappingKey[] = ['category', 'name'];
    for (const k of required) if (!usedCg.has(k)) missing.push(k);
    const conflicts: ImportMappingKey[] = [];
    for (const [k, hs] of usedCg) if (hs.length > 1) conflicts.push(k);
    return { ok: missing.length === 0 && conflicts.length === 0, missing, conflicts };
  }, [assignments, preview]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 sm:p-4">
      <div className="w-full max-w-5xl h-[100dvh] sm:max-h-[95vh] sm:h-auto flex flex-col bg-card border border-slate-300 sm:rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0" />
          <h2 className="text-base font-bold text-slate-900 min-w-0 truncate">
            Excel インポート
            <span className="ml-2 text-sm text-slate-500 font-normal">列の自動分類 → 確認</span>
          </h2>
          <div className="flex-1" />
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded hover:bg-slate-100 text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {phase === 'select' && (
            <PhaseSelect
              onPick={(f) => { setFile(f); setError(null); previewMutation.mutate(f); }}
              pending={previewMutation.isPending}
              error={error}
            />
          )}
          {phase === 'preview' && preview && (
            <PhasePreview
              preview={preview}
              file={file}
              assignments={assignments}
              setAssignments={setAssignments}
              validation={validation}
            />
          )}
          {phase === 'committing' && <PhaseSpinner label="インポート中…" />}
          {phase === 'done' && result && <PhaseDone result={result} />}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50">
          {error && <span className="text-sm text-red-600 break-words"><AlertCircle className="inline h-3.5 w-3.5 mr-1" />{error}</span>}
          <div className="flex-1" />
          {phase === 'preview' && preview && (
            <>
              <button
                onClick={() => { setPhase('select'); setFile(null); setPreview(null); }}
                className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
              >
                ファイル変更
              </button>
              <button
                onClick={() => setAssignments(buildAutoAssignments(preview))}
                className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                title="自動分類結果に戻す"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                自動に戻す
              </button>
              <button
                onClick={() => {
                  if (!validation.ok) {
                    setError(
                      validation.missing.length > 0
                        ? `必須項目が未割当: ${validation.missing.map((k) => CG_LABEL_BY_KEY[k]).join(', ')}`
                        : `重複した割当: ${validation.conflicts.map((k) => CG_LABEL_BY_KEY[k]).join(', ')}`
                    );
                    return;
                  }
                  setError(null);
                  setPhase('committing');
                  importMutation.mutate();
                }}
                disabled={importMutation.isPending}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-bold',
                  validation.ok
                    ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                )}
              >
                <Check className="h-4 w-4" />
                {importMutation.isPending ? '実行中…' : 'この設定でインポート'}
              </button>
            </>
          )}
          {phase === 'done' && (
            <button onClick={onClose} className="rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-bold hover:bg-emerald-500">
              閉じる
            </button>
          )}
          {(phase === 'select' || phase === 'committing') && (
            <button onClick={onClose} className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
              キャンセル
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Phase: ファイル選択 ──────────────────────────────────
function PhaseSelect({
  onPick, pending, error,
}: { onPick: (f: File) => void; pending: boolean; error: string | null }) {
  return (
    <div className="p-6 sm:p-10 flex flex-col items-center gap-4">
      <div className="rounded-full bg-emerald-50 p-4">
        <FileSpreadsheet className="h-10 w-10 text-emerald-600" />
      </div>
      <p className="text-base font-bold text-slate-800">Excel ファイルを選択</p>
      <p className="text-sm text-slate-500 text-center max-w-md">
        .xlsx / .xls をアップロードします。各列のデータ型を自動分類し、CG 項目への割当を提案します。
        合っていれば確認、違っていればプルダウンで修正できます。
      </p>
      <label className={cn(
        'flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold transition-colors cursor-pointer',
        pending
          ? 'bg-slate-200 text-slate-500 cursor-wait'
          : 'bg-emerald-600 text-white hover:bg-emerald-500'
      )}>
        <Upload className="h-4 w-4" />
        {pending ? '解析中…' : 'ファイルを選択'}
        <input
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          disabled={pending}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }}
        />
      </label>
      {error && (
        <div className="text-sm text-red-600 flex items-start gap-1.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}
    </div>
  );
}

// ── Phase: プレビュー / 列カードリスト ─────────────────
function PhasePreview({
  preview, file, assignments, setAssignments, validation,
}: {
  preview: PreviewResult;
  file: File | null;
  assignments: Record<string, Assignment>;
  setAssignments: (a: Record<string, Assignment>) => void;
  validation: { ok: boolean; missing: ImportMappingKey[]; conflicts: ImportMappingKey[] };
}) {
  const usedCgKeys = useMemo(() => {
    const set = new Set<ImportMappingKey>();
    for (const a of Object.values(assignments)) if (a.action === 'cg') set.add(a.cgKey);
    return set;
  }, [assignments]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* 概要 */}
      <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
        <Info className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-emerald-900">
            {file?.name} · {preview.totalRows}行 · {preview.columns.length}列
          </div>
          <div className="text-xs text-emerald-800/80 mt-0.5">
            列ごとに「自動分類タイプ」と「推奨 CG 項目」を表示しています。違っていればプルダウンで修正してください。
            既知 CG に該当しない列は <strong>そのまま保存</strong> で <code>oneshot_data</code> に格納されます。
          </div>
        </div>
      </div>

      {/* 警告バー */}
      {!validation.ok && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm">
          {validation.missing.length > 0 && (
            <div className="text-red-700">
              <AlertCircle className="inline h-4 w-4 mr-1" />
              必須項目が未割当です: <strong>{validation.missing.map((k) => CG_LABEL_BY_KEY[k]).join(' / ')}</strong>
            </div>
          )}
          {validation.conflicts.length > 0 && (
            <div className="text-red-700">
              <AlertCircle className="inline h-4 w-4 mr-1" />
              同じ CG 項目に複数の列が割当てられています: <strong>{validation.conflicts.map((k) => CG_LABEL_BY_KEY[k]).join(' / ')}</strong>
            </div>
          )}
        </div>
      )}

      {/* カードリスト */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {preview.columns.map((col) => (
          <ColumnCard
            key={col.header}
            col={col}
            assignment={assignments[col.header] ?? { action: 'ignore' }}
            usedCgKeys={usedCgKeys}
            onChange={(next) => setAssignments({ ...assignments, [col.header]: next })}
          />
        ))}
      </div>
    </div>
  );
}

// ── 列カード ──────────────────────────────────────────────
function ColumnCard({
  col, assignment, usedCgKeys, onChange,
}: {
  col: ColumnAnalysis;
  assignment: Assignment;
  usedCgKeys: Set<ImportMappingKey>;
  onChange: (a: Assignment) => void;
}) {
  const meta = TYPE_META[col.type];
  const TypeIcon = meta.icon;

  const isCg = assignment.action === 'cg';
  const isAsIs = assignment.action === 'asIs';
  const isIgnore = assignment.action === 'ignore';
  const isSuggested =
    isCg && col.suggestedKey === (assignment as { cgKey: ImportMappingKey }).cgKey;

  return (
    <div className={cn(
      'rounded-lg border bg-white p-3 space-y-2',
      isIgnore ? 'border-slate-200 opacity-60' :
      isAsIs ? 'border-amber-300' :
      isSuggested ? 'border-emerald-400' : 'border-sky-400'
    )}>
      {/* 1行目: ヘッダー名 + タイプバッジ */}
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shrink-0', meta.cls)}>
          <TypeIcon className="h-3 w-3" />
          {meta.label}
        </span>
        <h4 className="text-sm font-bold text-slate-900 truncate min-w-0 flex-1">{col.header}</h4>
        <span className="text-[10px] text-slate-500 shrink-0">
          {Math.round(col.filledRatio * 100)}%入力
        </span>
      </div>

      {/* サンプル */}
      <div className="text-xs text-slate-600 break-words min-h-[1.25rem]">
        {col.samples.length > 0 ? (
          col.samples.map((s, i) => (
            <span key={i} className="inline-block bg-slate-100 rounded px-1.5 py-0.5 mr-1 mb-1">
              {s.length > 36 ? s.slice(0, 36) + '…' : s}
            </span>
          ))
        ) : (
          <span className="text-slate-400">(空)</span>
        )}
      </div>

      {/* 推奨ヒント (まだ採用されていない場合のみ) */}
      {col.suggestedKey && !isSuggested && col.suggestedConfidence !== 'none' && (
        <button
          onClick={() => onChange({ action: 'cg', cgKey: col.suggestedKey! })}
          className="flex items-center gap-1.5 w-full rounded border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800 hover:bg-emerald-100"
        >
          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
          推奨: → <strong>{CG_LABEL_BY_KEY[col.suggestedKey]}</strong>
          <span className="ml-auto text-[10px] text-emerald-600">
            {col.suggestedConfidence === 'exact' ? '名前一致' : '類似一致'}
          </span>
        </button>
      )}

      {/* アクションプルダウン */}
      <AssignmentPicker
        value={assignment}
        onChange={onChange}
        usedCgKeys={usedCgKeys}
        header={col.header}
      />
    </div>
  );
}

// ── アクションプルダウン (action + cgKey の合体 select) ─────
function AssignmentPicker({
  value, onChange, usedCgKeys, header,
}: {
  value: Assignment;
  onChange: (a: Assignment) => void;
  usedCgKeys: Set<ImportMappingKey>;
  header: string;
}) {
  const selectVal: string =
    value.action === 'cg' ? `cg:${value.cgKey}` :
    value.action === 'asIs' ? 'asIs' :
    'ignore';

  return (
    <div className="relative">
      <select
        value={selectVal}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'asIs') onChange({ action: 'asIs' });
          else if (v === 'ignore') onChange({ action: 'ignore' });
          else if (v.startsWith('cg:')) onChange({ action: 'cg', cgKey: v.slice(3) as ImportMappingKey });
        }}
        className="w-full appearance-none rounded border border-slate-300 bg-white px-2.5 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      >
        <option value="asIs">📦 そのまま保存 (oneshot_data.{header})</option>
        <option value="ignore">⊘ 使用しない</option>
        {CG_GROUPS.map((g) => (
          <optgroup key={g.title} label={g.title}>
            {g.fields.map((f) => {
              const inUseElsewhere = usedCgKeys.has(f.key) &&
                !(value.action === 'cg' && value.cgKey === f.key);
              return (
                <option key={f.key} value={`cg:${f.key}`}>
                  → {f.label}{f.required ? ' *' : ''}{inUseElsewhere ? '  (他列で使用中)' : ''}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
    </div>
  );
}

// ── Phase: 実行中 ────────────────────────────────────────
function PhaseSpinner({ label }: { label: string }) {
  return (
    <div className="p-12 flex flex-col items-center gap-3 text-slate-600">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      <div className="text-sm font-bold">{label}</div>
    </div>
  );
}

// ── Phase: 完了 ──────────────────────────────────────────
function PhaseDone({ result }: { result: ImportResult }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-emerald-100 p-2">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <div>
          <div className="text-base font-bold text-slate-900">インポート完了</div>
          <div className="text-sm text-slate-600">
            {result.totalInserted}件処理 (重複は上書き) / {result.skipped}件スキップ
          </div>
        </div>
      </div>

      <div className="rounded border border-slate-200 bg-white">
        <div className="px-3 py-2 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
          カテゴリ別
        </div>
        <div className="divide-y divide-slate-100">
          {result.categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="font-bold text-slate-800">{c.name}</span>
              {c.description && <span className="text-slate-500">/ {c.description}</span>}
              <div className="flex-1" />
              <span className="font-bold text-emerald-700 tabular-nums">{c.inserted}件</span>
            </div>
          ))}
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3">
          <div className="text-sm font-bold text-amber-900 mb-1">⚠ 警告</div>
          <ul className="space-y-0.5 text-xs text-amber-800 list-disc pl-5">
            {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── ヘルパー ──────────────────────────────────────────────

/** assignments → server payload (mapping + extraColumns) に変換 */
function buildPayload(
  assignments: Record<string, Assignment>,
): { mapping: ImportMapping; extraColumns: string[] } {
  const mapping: ImportMapping = {};
  const extraColumns: string[] = [];
  for (const [header, a] of Object.entries(assignments)) {
    if (a.action === 'cg') {
      mapping[a.cgKey] = header;
    } else if (a.action === 'asIs') {
      extraColumns.push(header);
    }
    // ignore: skip
  }
  return { mapping, extraColumns };
}

/** preview 結果から自動 assignment を構築 (推奨採用 / 重複回避) */
function buildAutoAssignments(preview: PreviewResult): Record<string, Assignment> {
  const out: Record<string, Assignment> = {};
  const used = new Set<ImportMappingKey>();
  preview.columns.forEach((col) => {
    if (col.type === 'empty') {
      out[col.header] = { action: 'ignore' };
    } else if (col.suggestedKey && !used.has(col.suggestedKey)) {
      out[col.header] = { action: 'cg', cgKey: col.suggestedKey };
      used.add(col.suggestedKey);
    } else {
      out[col.header] = { action: 'asIs' };
    }
  });
  return out;
}
