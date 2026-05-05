import { useState, useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import {
  X, Upload, FileSpreadsheet, AlertCircle, CheckCircle2,
  Award, User, MessageSquare, Quote, Users as UsersIcon,
  Info, Save, RotateCcw,
} from 'lucide-react';

// クライアント側 ImportMappingKey は server と shape を合わせる必要がある
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

interface PreviewResult {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  suggestedMapping: ImportMapping;
}

interface ImportResult {
  totalInserted: number;
  skipped: number;
  warnings: string[];
  categories: { id: number; name: string; description: string | null; inserted: number }[];
}

interface FieldGroup {
  title: string;
  icon: typeof Award;
  fields: { key: ImportMappingKey; label: string; required?: boolean; hint?: string }[];
}

const FIELD_GROUPS: FieldGroup[] = [
  {
    title: '基本情報 (DB列に格納)',
    icon: User,
    fields: [
      { key: 'category', label: '賞 (Award)', required: true, hint: '例: 種別 / 賞名' },
      { key: 'division', label: '部門 (Division)', hint: '例: エントリー部門' },
      { key: 'name', label: 'ノミネート者氏名', required: true, hint: '個人=氏名、団体は projectName 側を使用' },
      { key: 'nameEn', label: 'ノミネート者氏名 (英語)' },
      { key: 'projectName', label: 'プロジェクト名 (チーム時)', hint: '空なら個人扱い' },
      { key: 'projectNameEn', label: 'プロジェクト名 (英語)' },
      { key: 'org', label: '会社' },
      { key: 'orgEn', label: '会社 (英語)' },
      { key: 'imageId', label: '画像ID', hint: 'ファイル名照合用' },
    ],
  },
  {
    title: 'プロフィール (oneshot_data)',
    icon: User,
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
    icon: MessageSquare,
    fields: [
      { key: 'ism', label: '私のイズム' },
      { key: 'skills', label: '私の得意技', hint: 'カンマ/スラッシュ区切りで自動配列化' },
      { key: 'title', label: 'ノミネートタイトル' },
      { key: 'titleEn', label: 'ノミネートタイトル (英語)' },
      { key: 'comment', label: 'ノミネート者コメント' },
      { key: 'commentEn', label: 'ノミネート者コメント (英語)' },
    ],
  },
  {
    title: 'チーム情報 (oneshot_data, チーム時のみ)',
    icon: UsersIcon,
    fields: [
      { key: 'teamSize', label: '人数' },
      { key: 'members', label: 'チームメンバー' },
    ],
  },
  {
    title: '推薦者情報 (oneshot_data.recommender)',
    icon: Quote,
    fields: [
      { key: 'recName', label: '推薦者氏名' },
      { key: 'recNameEn', label: '推薦者氏名 (英語)' },
      { key: 'recNameKana', label: '推薦者フリガナ' },
      { key: 'recCompany', label: '推薦者会社' },
      { key: 'recDept', label: '推薦者部署' },
      { key: 'recPosition', label: '推薦者役職' },
      { key: 'recRespect', label: '尊敬ポイント (13文字)' },
      { key: 'recRespectEn', label: '尊敬ポイント (英語)' },
      { key: 'recRespectComment', label: '尊敬ポイント コメント' },
      { key: 'recRespectCommentEn', label: '尊敬ポイント コメント (英語)' },
    ],
  },
];

const STORAGE_KEY_PREFIX = 'awards-cg-import-mapping-';

function loadStoredMapping(eventId: number): ImportMapping | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${eventId}`);
    if (!raw) return null;
    return JSON.parse(raw) as ImportMapping;
  } catch {
    return null;
  }
}
function saveStoredMapping(eventId: number, mapping: ImportMapping): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${eventId}`, JSON.stringify(mapping));
  } catch { /* noop */ }
}

interface Props {
  open: boolean;
  onClose: () => void;
  eventId: number;
  /** インポート完了後に呼ばれる (react-query invalidate 用) */
  onImported: () => void;
}

type Phase = 'select' | 'preview' | 'committing' | 'done';

export default function ExcelImportDialog({ open, onClose, eventId, onImported }: Props) {
  const [phase, setPhase] = useState<Phase>('select');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPhase('select');
      setFile(null);
      setPreview(null);
      setMapping({});
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
      // 1. localStorage に前回の保存があればそれを優先
      // 2. なければサーバー推奨マッピング
      const stored = loadStoredMapping(eventId);
      const initial: ImportMapping = { ...p.suggestedMapping, ...(stored ?? {}) };
      // localStorage にあった列名が現 Excel ヘッダーに無ければ無効化
      const validHeaders = new Set(p.headers);
      const cleaned: ImportMapping = {};
      for (const [k, v] of Object.entries(initial)) {
        if (v && validHeaders.has(v)) cleaned[k as ImportMappingKey] = v;
      }
      setMapping(cleaned);
      setPhase('preview');
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('ファイルが選択されていません');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mapping', JSON.stringify(mapping));
      const res = await api.post(`/awards/events/${eventId}/import-excel`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data as ImportResult;
    },
    onSuccess: (r) => {
      saveStoredMapping(eventId, mapping);
      setResult(r);
      setPhase('done');
      onImported();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  const sampleByHeader = useMemo(() => {
    const m: Record<string, string[]> = {};
    if (!preview) return m;
    preview.headers.forEach((h, idx) => {
      m[h] = preview.sampleRows.map((r) => r[idx] ?? '').filter(Boolean).slice(0, 2);
    });
    return m;
  }, [preview]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 sm:p-4">
      <div className="w-full max-w-5xl h-[100dvh] sm:max-h-[95vh] sm:h-auto flex flex-col bg-card border border-slate-300 sm:rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0" />
          <h2 className="text-base font-bold text-slate-900 min-w-0 truncate">
            Excel インポート
            <span className="ml-2 text-sm text-slate-500 font-normal">列マッピング</span>
          </h2>
          <div className="flex-1" />
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded hover:bg-slate-100 text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {phase === 'select' && <PhaseSelect onPick={(f) => { setFile(f); setError(null); previewMutation.mutate(f); }} pending={previewMutation.isPending} error={error} />}
          {phase === 'preview' && preview && (
            <PhasePreview
              preview={preview}
              mapping={mapping}
              setMapping={setMapping}
              file={file}
              sampleByHeader={sampleByHeader}
            />
          )}
          {phase === 'committing' && <PhaseSpinner label="インポート中…" />}
          {phase === 'done' && result && <PhaseDone result={result} />}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50">
          {error && <span className="text-sm text-red-600 break-words"><AlertCircle className="inline h-3.5 w-3.5 mr-1" />{error}</span>}
          <div className="flex-1" />
          {phase === 'preview' && (
            <>
              <button
                onClick={() => { setPhase('select'); setFile(null); setPreview(null); }}
                className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
              >
                ファイル変更
              </button>
              <button
                onClick={() => {
                  setMapping(preview!.suggestedMapping);
                }}
                className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                title="サーバー推奨マッピングに戻す"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                推奨に戻す
              </button>
              <button
                onClick={() => {
                  setError(null);
                  setPhase('committing');
                  importMutation.mutate();
                }}
                disabled={importMutation.isPending}
                className="flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-bold hover:bg-emerald-500"
              >
                <Save className="h-4 w-4" />
                {importMutation.isPending ? '実行中…' : 'マッピングで実行'}
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
  onPick,
  pending,
  error,
}: {
  onPick: (f: File) => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <div className="p-6 sm:p-10 flex flex-col items-center gap-4">
      <div className="rounded-full bg-emerald-50 p-4">
        <FileSpreadsheet className="h-10 w-10 text-emerald-600" />
      </div>
      <p className="text-base font-bold text-slate-800">Excel ファイルを選択</p>
      <p className="text-sm text-slate-500 text-center max-w-md">
        .xlsx / .xls をアップロードします。次画面で列をどの CG 項目にマッピングするか選択できます。
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

// ── Phase: プレビュー + マッピング編集 ─────────────────
function PhasePreview({
  preview,
  mapping,
  setMapping,
  file,
  sampleByHeader,
}: {
  preview: PreviewResult;
  mapping: ImportMapping;
  setMapping: (m: ImportMapping) => void;
  file: File | null;
  sampleByHeader: Record<string, string[]>;
}) {
  const usedHeaders = useMemo(() => new Set(Object.values(mapping).filter(Boolean) as string[]), [mapping]);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* 概要 */}
      <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
        <Info className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-emerald-900">
            {file?.name} · {preview.totalRows}行 · {preview.headers.length}列
          </div>
          <div className="text-xs text-emerald-800/80 mt-0.5">
            各 CG 項目に対応する Excel 列を選択してください。重複する氏名は<strong>上書き</strong> (二重登録なし)。
          </div>
        </div>
      </div>

      {/* マッピング編集 (グループ化) */}
      <div className="space-y-5">
        {FIELD_GROUPS.map((group) => {
          const Icon = group.icon;
          return (
            <section key={group.title} className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 pb-1 border-b border-slate-200">
                <Icon className="h-4 w-4 text-emerald-600" />
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.fields.map((f) => {
                  const selected = mapping[f.key] ?? '';
                  const samples = selected ? sampleByHeader[selected] ?? [] : [];
                  const isMappedElsewhere = (h: string) =>
                    h !== selected && usedHeaders.has(h);
                  return (
                    <div
                      key={f.key}
                      className="grid grid-cols-1 sm:grid-cols-[200px_1fr_220px] gap-2 sm:gap-3 items-start"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-sm font-bold text-slate-700">
                          {f.label}
                          {f.required && <span className="text-red-500">*</span>}
                        </div>
                        {f.hint && (
                          <div className="text-[11px] text-slate-500">{f.hint}</div>
                        )}
                      </div>
                      <select
                        value={selected}
                        onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined })}
                        className={cn(
                          'rounded border bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40',
                          selected ? 'border-emerald-400' : 'border-slate-300'
                        )}
                      >
                        <option value="">(マップしない)</option>
                        {preview.headers.map((h) => (
                          <option
                            key={h}
                            value={h}
                            className={isMappedElsewhere(h) ? 'text-slate-400' : ''}
                          >
                            {h}
                            {isMappedElsewhere(h) ? '  (他で使用中)' : ''}
                          </option>
                        ))}
                      </select>
                      <div className="text-xs text-slate-500 break-words">
                        {samples.length > 0 ? (
                          <>
                            <span className="text-slate-400">サンプル: </span>
                            {samples.map((s, i) => (
                              <span key={i} className="inline-block bg-slate-100 rounded px-1.5 py-0.5 mr-1 mb-1">
                                {s.length > 30 ? s.slice(0, 30) + '…' : s}
                              </span>
                            ))}
                          </>
                        ) : selected ? (
                          <span className="text-slate-400">サンプル: (空)</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* 全列確認 */}
      <details className="rounded border border-slate-300 bg-slate-50">
        <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-slate-700">
          Excel の全列を確認 ({preview.headers.length}列)
        </summary>
        <div className="px-3 pb-3 space-y-1.5">
          {preview.headers.map((h) => (
            <div key={h} className="flex items-center gap-2 text-xs">
              <span className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded border font-bold shrink-0',
                usedHeaders.has(h)
                  ? 'border-emerald-500 bg-emerald-100 text-emerald-700'
                  : 'border-slate-300 bg-white text-slate-500'
              )}>
                {usedHeaders.has(h) ? '✓ 使用' : '未使用'}
              </span>
              <span className="font-bold text-slate-700">{h}</span>
              <span className="text-slate-500 truncate">
                {(sampleByHeader[h] ?? []).slice(0, 1).join(' / ')}
              </span>
            </div>
          ))}
        </div>
      </details>
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
          <div className="text-base font-bold text-slate-900">
            インポート完了
          </div>
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

