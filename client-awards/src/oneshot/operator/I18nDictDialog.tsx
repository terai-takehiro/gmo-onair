import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Languages, Tv, Filter, X, Download, Upload, Save, RotateCcw, Info } from 'lucide-react';
import {
  loadOverrides,
  saveOverrides,
  exportOverridesJson,
  parseOverridesJson,
  type I18nOverrides,
} from '../lib/i18nOverrides';
import { confirmAction } from '@gmo-onair/shared/src/client/ui';

interface CategoryRow {
  id: number;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 現在のイベントのカテゴリ一覧 (=賞名候補 + 部門名候補の抽出元) */
  categories: CategoryRow[];
  onSaved: (next: I18nOverrides) => void;
}

export default function I18nDictDialog({ open, onClose, categories, onSaved }: Props) {
  const [draft, setDraft] = useState<I18nOverrides>({ awards: {}, divisions: {} });
  const [importErr, setImportErr] = useState<string | null>(null);

  // Modal を開いた瞬間に最新の値を読み込む
  useEffect(() => {
    if (open) {
      setDraft(loadOverrides());
      setImportErr(null);
    }
  }, [open]);

  // カテゴリ一覧から賞名・部門名のユニーク集合を抽出
  const { awards, divisions } = useMemo(() => {
    const aMap = new Map<string, string | null>();
    const dMap = new Map<string, string | null>();
    for (const c of categories) {
      if (c.name && !aMap.has(c.name)) aMap.set(c.name, c.name_en ?? null);
      if (c.description && !dMap.has(c.description)) {
        dMap.set(c.description, c.description_en ?? null);
      }
    }
    return {
      awards: Array.from(aMap.entries()).map(([ja, dbEn]) => ({ ja, dbEn })),
      divisions: Array.from(dMap.entries()).map(([ja, dbEn]) => ({ ja, dbEn })),
    };
  }, [categories]);

  if (!open) return null;

  const handleSave = () => {
    saveOverrides(draft);
    onSaved(draft);
    onClose();
  };

  const handleReset = async () => {
    if (!(await confirmAction({ title: '全ての英訳辞書設定を消去しますか？', description: '(localStorage 内のみ。DB は影響なし)', confirmLabel: '削除する', tone: 'danger' }))) return;
    const empty = { awards: {}, divisions: {} };
    saveOverrides(empty);
    setDraft(empty);
    onSaved(empty);
  };

  const handleExport = () => {
    const blob = new Blob([exportOverridesJson(draft)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `awards-cg-i18n-overrides_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (file: File) => {
    setImportErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const parsed = parseOverridesJson(text);
      if (!parsed) {
        setImportErr('JSON の形式が不正です');
        return;
      }
      setDraft(parsed);
    };
    reader.onerror = () => setImportErr('ファイル読み込みに失敗しました');
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 sm:p-4">
      <div className="w-full max-w-3xl h-[100dvh] sm:max-h-[90vh] sm:h-auto flex flex-col bg-background border border-border sm:rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
          <Languages className="h-5 w-5 text-warning-strong" />
          <h2 className="text-base font-bold text-foreground">英訳辞書 · 賞 / 部門</h2>
          <span className="text-xs text-muted-foreground hidden sm:inline">(localStorage 保存)</span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded hover:bg-card text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info banner */}
        <div className="mx-6 mt-3 flex items-start gap-2 rounded border border-warning/40 bg-warning/30 px-3 py-2.5 text-sm text-warning-strong">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            ブラウザに保存されます。DB の <code className="px-1 rounded bg-card text-warning-strong text-xs">awards_categories.name_en</code> /{' '}
            <code className="px-1 rounded bg-card text-warning-strong text-xs">description_en</code> よりも優先されるため、
            DB を削除/再作成しても (このブラウザ上では) 翻訳が残ります。デバイス間移動は下部の Export/Import で。
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* 賞 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Tv className="h-4 w-4 text-warning-strong" />
              <h3 className="text-sm font-black tracking-widest text-foreground uppercase">
                賞 · Award
                <span className="ml-1.5 text-muted-foreground font-medium">({awards.length})</span>
              </h3>
            </div>
            {awards.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">登録済み賞なし</p>
            ) : (
              <div className="space-y-2">
                {awards.map(({ ja, dbEn }) => {
                  const value = draft.awards[ja] ?? '';
                  const placeholder = dbEn || `EN訳を入力 (${ja})`;
                  return (
                    <div key={ja} className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                      <div className="text-sm font-bold text-foreground truncate" title={ja}>
                        {ja}
                      </div>
                      <input
                        value={value}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            awards: { ...d.awards, [ja]: e.target.value },
                          }))
                        }
                        placeholder={placeholder}
                        className={cn(
                          'rounded border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2',
                          value
                            ? 'border-warning/60 text-warning-strong focus:ring-warning/40'
                            : 'border-border text-foreground focus:ring-border'
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 部門 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Filter className="h-4 w-4 text-warning-strong" />
              <h3 className="text-sm font-black tracking-widest text-foreground uppercase">
                部門 · Division
                <span className="ml-1.5 text-muted-foreground font-medium">({divisions.length})</span>
              </h3>
            </div>
            {divisions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">登録済み部門なし</p>
            ) : (
              <div className="space-y-2">
                {divisions.map(({ ja, dbEn }) => {
                  const value = draft.divisions[ja] ?? '';
                  const placeholder = dbEn || `EN訳を入力 (${ja})`;
                  return (
                    <div key={ja} className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                      <div className="text-sm text-foreground truncate" title={ja}>
                        {ja}
                      </div>
                      <input
                        value={value}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            divisions: { ...d.divisions, [ja]: e.target.value },
                          }))
                        }
                        placeholder={placeholder}
                        className={cn(
                          'rounded border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2',
                          value
                            ? 'border-warning/60 text-warning-strong focus:ring-warning/40'
                            : 'border-border text-foreground focus:ring-border'
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 flex-wrap px-6 py-3 border-t border-border bg-background/50">
          <button
            onClick={handleExport}
            className="h-ctl-3 flex items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            JSONエクスポート
          </button>
          <label className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            JSONインポート
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = '';
              }}
            />
          </label>
          <button
            onClick={handleReset}
            className="h-ctl-3 flex items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-destructive/40 hover:text-destructive transition-colors"
            title="全ての設定を消去"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            リセット
          </button>
          <div className="flex-1" />
          {importErr && <span className="text-xs text-destructive">{importErr}</span>}
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="h-ctl-3 flex items-center gap-1.5 rounded-md bg-warning px-4 text-sm font-bold text-foreground hover:bg-warning/90 transition-colors"
          >
            <Save className="h-4 w-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
