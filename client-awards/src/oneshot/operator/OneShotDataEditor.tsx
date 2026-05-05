import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import {
  X, Save, Database, FileJson, Eye, AlertCircle, CheckCircle2, Type,
  Globe, Briefcase, Quote, Award, Users as UsersIcon, MessageSquare, Info,
} from 'lucide-react';
import type { Lang, Nominee, NomineeMember, NomineeRecommender } from '../types';

/** mapper が source-attribute するためのフィールド分類 */
type SourceTag = 'db' | 'oneshot_data' | 'i18n' | 'fallback' | 'computed' | 'empty';

interface FieldStatus {
  key: string;
  label: string;
  source: SourceTag;
  ja?: string | null;
  en?: string | null;
  /** oneshot_data 編集対象フィールドのドット記法パス (e.g., 'recommender.respect') */
  editPath?: string;
  /** EN フィールドの編集対象パス */
  editPathEn?: string;
  multiline?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 編集対象 — null なら閉じる */
  nominee: Nominee | null;
  /** DB の awards_entries.id (= nominee が `entry-N` 形式の N) */
  entryId: number | null;
  /** API 経由保存後に react-query を invalidate するキー */
  refetchKey: unknown[];
  lang: Lang;
}

const SOURCE_LABEL: Record<SourceTag, { text: string; cls: string }> = {
  db: { text: 'DB 列', cls: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40' },
  oneshot_data: { text: 'oneshot_data', cls: 'bg-amber-900/40 text-amber-300 border-amber-700/40' },
  i18n: { text: 'i18n 辞書', cls: 'bg-sky-900/40 text-sky-300 border-sky-700/40' },
  fallback: { text: 'fallback', cls: 'bg-slate-800 text-slate-400 border-slate-700' },
  computed: { text: '算出', cls: 'bg-slate-800 text-slate-400 border-slate-700' },
  empty: { text: '未設定', cls: 'bg-red-900/30 text-red-400 border-red-800/40' },
};

/** ドット記法パスで JSONB を deep set */
function setPath<T extends Record<string, unknown>>(obj: T, path: string, value: unknown): T {
  if (!path) return obj;
  const parts = path.split('.');
  const next: Record<string, unknown> = { ...obj };
  let cur = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const v = cur[k];
    cur[k] = v && typeof v === 'object' ? { ...(v as object) } : {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  return next as T;
}

/** Nominee → 編集可能な oneshot_data 型 (基本列以外を取り出す) */
type OneShotDataDraft = {
  type?: 'individual' | 'team';
  entryNo?: string;
  nameKana?: string;
  department?: string;
  departmentEn?: string;
  position?: string;
  positionEn?: string;
  location?: string;
  locationEn?: string;
  joinDate?: string;
  ism?: string;
  ismEn?: string;
  skills?: string[];
  skillsEn?: string[];
  title?: string;
  titleEn?: string;
  comment?: string;
  commentEn?: string;
  projectName?: string;
  projectNameEn?: string;
  projectKana?: string;
  teamSize?: number;
  members?: NomineeMember[] | null;
  membersEn?: NomineeMember[] | null;
  recommender?: Partial<NomineeRecommender>;
};

function nomineeToDraft(n: Nominee): OneShotDataDraft {
  return {
    type: n.type,
    entryNo: n.entryNo,
    nameKana: n.nameKana,
    department: n.department || undefined,
    departmentEn: n.departmentEn || undefined,
    position: n.position,
    positionEn: n.positionEn,
    location: n.location,
    locationEn: n.locationEn,
    joinDate: n.joinDate,
    ism: n.ism || undefined,
    ismEn: n.ismEn || undefined,
    skills: n.skills.length ? n.skills : undefined,
    skillsEn: n.skillsEn.length ? n.skillsEn : undefined,
    title: n.title || undefined,
    titleEn: n.titleEn || undefined,
    comment: n.comment || undefined,
    commentEn: n.commentEn || undefined,
    projectName: n.projectName,
    projectNameEn: n.projectNameEn,
    projectKana: n.projectKana,
    teamSize: n.teamSize,
    members: n.members ?? undefined,
    membersEn: n.membersEn ?? undefined,
    recommender: { ...n.recommender },
  };
}

export default function OneShotDataEditor({
  open,
  onClose,
  nominee,
  entryId,
  refetchKey,
  lang,
}: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<OneShotDataDraft>({});
  const [tab, setTab] = useState<'inspect' | 'edit'>('inspect');

  useEffect(() => {
    if (open && nominee) {
      setDraft(nomineeToDraft(nominee));
      setTab('inspect');
    }
  }, [open, nominee]);

  const saveMutation = useMutation({
    mutationFn: async (next: OneShotDataDraft) => {
      if (!entryId) throw new Error('DB 紐付けのないノミネートは編集できません');
      // 空文字は null として保存しない (JSONB を肥大化させない)
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(next)) {
        if (v == null) continue;
        if (typeof v === 'string' && !v.trim()) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        cleaned[k] = v;
      }
      // recommender も空オブジェクトなら除外
      if (cleaned.recommender && Object.keys(cleaned.recommender as object).length === 0) {
        delete cleaned.recommender;
      }
      await api.put(`/awards/entries/${entryId}/oneshot-data`, { oneshot_data: cleaned });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: refetchKey });
      onClose();
    },
  });

  // インスペクター: nominee の各フィールドの source を表示
  const fields: FieldStatus[] = useMemo(() => {
    if (!nominee) return [];
    const n = nominee;
    const isTeam = n.type === 'team';
    const tag = (val: string | null | undefined, source: SourceTag): SourceTag =>
      val && val.trim() ? source : 'empty';

    const list: FieldStatus[] = [
      // ── 基本 (DB awards_entries 列) ─────────────────
      {
        key: 'name',
        label: '氏名',
        source: tag(n.name, 'db'),
        ja: n.name,
        en: n.nameEn,
      },
      {
        key: 'company',
        label: '会社',
        source: tag(n.company, 'db'),
        ja: n.company,
        en: n.companyEn,
      },
      {
        key: 'image',
        label: '写真URL',
        source: tag(n.image, 'db'),
        ja: n.image,
      },
      {
        key: 'category',
        label: '賞 (Award)',
        source: tag(n.category, 'db'),
        ja: n.category,
        en: n.categoryEn,
      },
      {
        key: 'subcategory',
        label: '部門 (Division)',
        source: tag(n.subcategory, 'db'),
        ja: n.subcategory,
        en: n.subcategoryEn,
      },
      // ── 1S CG 専用 (oneshot_data) ──────────────────
      {
        key: 'entryNo',
        label: 'エントリーNo',
        source: n.entryNo ? 'oneshot_data' : 'computed',
        ja: n.entryNo,
        editPath: 'entryNo',
      },
      {
        key: 'department',
        label: '部署',
        source: tag(n.department, 'oneshot_data'),
        ja: n.department,
        en: n.departmentEn,
        editPath: 'department',
        editPathEn: 'departmentEn',
      },
      {
        key: 'position',
        label: '役職',
        source: tag(n.position, 'oneshot_data'),
        ja: n.position,
        en: n.positionEn,
        editPath: 'position',
        editPathEn: 'positionEn',
      },
      {
        key: 'location',
        label: '勤務地',
        source: tag(n.location, 'oneshot_data'),
        ja: n.location,
        en: n.locationEn,
        editPath: 'location',
        editPathEn: 'locationEn',
      },
      {
        key: 'ism',
        label: '私のイズム',
        source: tag(n.ism, 'oneshot_data'),
        ja: n.ism,
        en: n.ismEn,
        editPath: 'ism',
        editPathEn: 'ismEn',
        multiline: true,
      },
      {
        key: 'skills',
        label: '私の得意技',
        source: n.skills.length ? 'oneshot_data' : 'empty',
        ja: n.skills.join(' / '),
        en: n.skillsEn.join(' / '),
        editPath: 'skills',
        editPathEn: 'skillsEn',
      },
      {
        key: 'title',
        label: 'ノミネートタイトル',
        source: tag(n.title, 'oneshot_data'),
        ja: n.title,
        en: n.titleEn,
        editPath: 'title',
        editPathEn: 'titleEn',
      },
      {
        key: 'comment',
        label: 'ノミネート者コメント',
        source: tag(n.comment, 'oneshot_data'),
        ja: n.comment,
        en: n.commentEn,
        editPath: 'comment',
        editPathEn: 'commentEn',
        multiline: true,
      },
      // ── チーム情報 (type=team のみ) ────────────────
      ...(isTeam
        ? [
            {
              key: 'projectName',
              label: 'プロジェクト名',
              source: tag(n.projectName, 'oneshot_data'),
              ja: n.projectName,
              en: n.projectNameEn,
              editPath: 'projectName',
              editPathEn: 'projectNameEn',
            } as FieldStatus,
            {
              key: 'teamSize',
              label: '人数',
              source: n.teamSize != null ? 'oneshot_data' : 'empty',
              ja: n.teamSize != null ? String(n.teamSize) : '',
            } as FieldStatus,
            {
              key: 'members',
              label: 'チームメンバー',
              source: (n.members?.length ?? 0) > 0 ? 'oneshot_data' : 'empty',
              ja: n.members?.map((m) => `${m.role}: ${m.name} (${m.company})`).join('\n'),
              en: n.membersEn?.map((m) => `${m.role}: ${m.name} (${m.company})`).join('\n'),
              multiline: true,
            } as FieldStatus,
          ]
        : []),
      // ── 推薦者 ─────────────────────────────────────
      {
        key: 'rec.name',
        label: '推薦者氏名',
        source: tag(n.recommender.name, 'oneshot_data'),
        ja: n.recommender.name,
        en: n.recommender.nameEn,
        editPath: 'recommender.name',
        editPathEn: 'recommender.nameEn',
      },
      {
        key: 'rec.company',
        label: '推薦者会社',
        source: tag(n.recommender.company, 'oneshot_data'),
        ja: n.recommender.company,
        en: n.recommender.companyEn,
        editPath: 'recommender.company',
        editPathEn: 'recommender.companyEn',
      },
      {
        key: 'rec.position',
        label: '推薦者役職',
        source: tag(n.recommender.position, 'oneshot_data'),
        ja: n.recommender.position,
        en: n.recommender.positionEn,
        editPath: 'recommender.position',
        editPathEn: 'recommender.positionEn',
      },
      {
        key: 'rec.respect',
        label: '尊敬ポイント (13文字)',
        source: tag(n.recommender.respect, 'oneshot_data'),
        ja: n.recommender.respect,
        en: n.recommender.respectEn,
        editPath: 'recommender.respect',
        editPathEn: 'recommender.respectEn',
      },
      {
        key: 'rec.respectComment',
        label: '尊敬ポイント コメント',
        source: tag(n.recommender.respectComment, 'oneshot_data'),
        ja: n.recommender.respectComment,
        en: n.recommender.respectCommentEn,
        editPath: 'recommender.respectComment',
        editPathEn: 'recommender.respectCommentEn',
        multiline: true,
      },
    ];
    return list;
  }, [nominee]);

  if (!open || !nominee) return null;

  const totalEditable = fields.filter((f) => f.editPath).length;
  const filledEditable = fields.filter((f) => f.editPath && f.source === 'oneshot_data').length;
  const completeness = totalEditable > 0 ? Math.round((filledEditable / totalEditable) * 100) : 0;

  const editField = (path: string | undefined): string => {
    if (!path) return '';
    const parts = path.split('.');
    let cur: unknown = draft;
    for (const p of parts) {
      if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[p];
      else return '';
    }
    if (Array.isArray(cur)) return cur.join(', ');
    return cur == null ? '' : String(cur);
  };

  const updateField = (path: string, value: string, isArray = false) => {
    let v: unknown = value;
    if (isArray) v = value ? value.split(/\s*[、,]\s*/).filter(Boolean) : [];
    setDraft((d) => setPath(d as Record<string, unknown>, path, v) as OneShotDataDraft);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-700 rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800">
          <Database className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-bold text-slate-100">DB ↔ CG マッピング · エントリ #{entryId ?? '-'}</h2>
          <div className="flex-1" />
          <span
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black tracking-widest',
              completeness === 100
                ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/50'
                : completeness >= 50
                ? 'bg-amber-900/50 text-amber-300 border border-amber-700/50'
                : 'bg-red-900/40 text-red-300 border border-red-800/40'
            )}
            title={`oneshot_data 充足率 ${filledEditable}/${totalEditable}`}
          >
            <CheckCircle2 className="h-3 w-3" />
            {completeness}% 充足
          </span>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded hover:bg-slate-800 text-slate-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab */}
        <div className="flex gap-1 px-5 pt-3 border-b border-slate-800">
          {(
            [
              { k: 'inspect', label: 'INSPECT', icon: Eye, hint: 'CGに何が出るか確認' },
              { k: 'edit', label: 'EDIT', icon: FileJson, hint: 'oneshot_data 編集' },
            ] as const
          ).map(({ k, label, icon: Icon, hint }) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-[11px] font-black tracking-widest border-b-2 -mb-px transition-colors',
                tab === k
                  ? 'border-amber-400 text-amber-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              )}
              title={hint}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
          <div className="flex-1" />
          {nominee && (
            <div className="text-[10px] text-slate-500 self-center hidden sm:block">
              ノミネート: <span className="text-slate-300 font-bold">{lang === 'ja' ? nominee.name : nominee.nameEn}</span>
              <span className="mx-1.5 text-slate-700">·</span>
              {lang === 'ja' ? nominee.category : nominee.categoryEn}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'inspect' ? (
            <InspectView fields={fields} />
          ) : (
            <EditView fields={fields} editField={editField} updateField={updateField} />
          )}
        </div>

        {/* Legend (small) */}
        <div className="px-5 py-2 border-t border-slate-800 bg-slate-950/50 flex items-center gap-2 flex-wrap text-[10px]">
          <Info className="h-3 w-3 text-slate-500" />
          <span className="text-slate-500">凡例:</span>
          {(
            [
              { tag: 'db', desc: 'awards_entries / awards_categories 列' },
              { tag: 'oneshot_data', desc: 'JSONB 列 (このエディタで編集可)' },
              { tag: 'i18n', desc: 'localStorage 翻訳辞書' },
              { tag: 'empty', desc: '未設定' },
            ] as const
          ).map(({ tag, desc }) => (
            <span key={tag} className="flex items-center gap-1">
              <span
                className={cn(
                  'inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold',
                  SOURCE_LABEL[tag].cls
                )}
              >
                {SOURCE_LABEL[tag].text}
              </span>
              <span className="text-slate-500">{desc}</span>
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-800 bg-slate-950/50">
          {!entryId && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400">
              <AlertCircle className="h-3 w-3" />
              DB 未紐付けノミネート (seed) — 保存不可
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
          >
            閉じる
          </button>
          {tab === 'edit' && (
            <button
              onClick={() => saveMutation.mutate(draft)}
              disabled={!entryId || saveMutation.isPending}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors',
                entryId
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              )}
            >
              <Save className="h-3 w-3" />
              {saveMutation.isPending ? '保存中…' : 'oneshot_data を保存'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Inspect view ──────────────────────────────────────────
function InspectView({ fields }: { fields: FieldStatus[] }) {
  return (
    <div className="space-y-1.5">
      {fields.map((f) => {
        const tag = SOURCE_LABEL[f.source];
        const Icon = iconForKey(f.key);
        return (
          <div
            key={f.key}
            className="grid grid-cols-12 gap-2 items-start rounded border border-slate-800 bg-slate-800/30 p-2 text-xs"
          >
            <div className="col-span-12 sm:col-span-3 flex items-center gap-1.5">
              <Icon className="h-3 w-3 text-slate-500 shrink-0" />
              <span className="font-bold text-slate-200 truncate">{f.label}</span>
            </div>
            <div className="col-span-6 sm:col-span-2">
              <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold', tag.cls)}>
                {tag.text}
              </span>
            </div>
            <div className="col-span-12 sm:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <div className="text-slate-300 whitespace-pre-wrap break-words">
                <span className="text-[9px] tracking-widest text-slate-600 uppercase mr-1">JA</span>
                {f.ja || <span className="text-slate-600">—</span>}
              </div>
              <div className="text-slate-400 whitespace-pre-wrap break-words">
                <span className="text-[9px] tracking-widest text-slate-600 uppercase mr-1">EN</span>
                {f.en || <span className="text-slate-600">—</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Edit view ─────────────────────────────────────────────
function EditView({
  fields,
  editField,
  updateField,
}: {
  fields: FieldStatus[];
  editField: (path: string | undefined) => string;
  updateField: (path: string, value: string, isArray?: boolean) => void;
}) {
  const editable = fields.filter((f) => f.editPath);
  return (
    <div className="space-y-3">
      {editable.map((f) => {
        const isArray = f.key === 'skills';
        return (
          <div key={f.key} className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-200">
              {f.label}
              {isArray && <span className="text-[9px] text-slate-500">(カンマ区切り)</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <FieldInput
                label="JA"
                multiline={f.multiline}
                value={editField(f.editPath)}
                onChange={(v) => f.editPath && updateField(f.editPath, v, isArray)}
                placeholder={f.ja ?? ''}
              />
              {f.editPathEn && (
                <FieldInput
                  label="EN"
                  multiline={f.multiline}
                  value={editField(f.editPathEn)}
                  onChange={(v) => f.editPathEn && updateField(f.editPathEn, v, isArray)}
                  placeholder={f.en ?? ''}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const cls = cn(
    'w-full rounded border bg-slate-800 px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-2',
    value
      ? 'border-amber-500/40 focus:ring-amber-500/40'
      : 'border-slate-700 focus:ring-slate-500'
  );
  return (
    <div className="space-y-0.5">
      <span className="text-[9px] tracking-widest text-slate-500 uppercase">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={cn(cls, 'resize-y')}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </div>
  );
}

// アイコン選定 (UI上でフィールド種別を一目で識別)
function iconForKey(k: string): typeof Type {
  if (k.startsWith('rec.')) return Quote;
  if (k === 'category' || k === 'subcategory' || k === 'entryNo') return Award;
  if (k === 'image' || k === 'name' || k === 'company') return Briefcase;
  if (k === 'comment' || k === 'ism' || k === 'title') return MessageSquare;
  if (k === 'projectName' || k === 'teamSize' || k === 'members') return UsersIcon;
  if (k === 'departmentEn' || k.endsWith('En')) return Globe;
  return Type;
}
