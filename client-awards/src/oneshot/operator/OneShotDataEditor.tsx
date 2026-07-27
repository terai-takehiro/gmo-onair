import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import {
  X, Save, Database, AlertCircle, CheckCircle2,
  Image as ImageIcon, Award, User, MessageSquare, Sparkles,
  Quote, Users as UsersIcon, Info, RotateCcw, Edit3, FileJson,
} from 'lucide-react';
import OneShotStage from '../OneShotStage';
import type { Lang, Nominee, NomineeMember, NomineeRecommender } from '../types';

/** どこから値が来ているかのタグ */
type SourceTag = 'db' | 'oneshot_data' | 'i18n' | 'fallback' | 'computed' | 'empty';

/** CG ステージ (1920x1080) 上の領域 — ホバー時に半透明枠でハイライト */
interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FieldDef {
  key: string;
  label: string;
  /** CG 上の領域 (ホバーで強調表示) */
  region: Region;
  /** 値の出処 */
  source: SourceTag;
  /** JA 値 */
  ja?: string | null;
  /** EN 値 */
  en?: string | null;
  /** oneshot_data 編集対象パス (空なら編集不可) */
  editPath?: string;
  editPathEn?: string;
  /** マルチライン入力 */
  multiline?: boolean;
  /** カンマ区切り array 入力 */
  asArray?: boolean;
  /** 詳細ヒント */
  dbHint?: string;
  icon?: typeof ImageIcon;
  /** チーム時のみ表示 */
  teamOnly?: boolean;
}

interface SectionDef {
  key: string;
  title: string;
  icon: typeof ImageIcon;
  fields: FieldDef[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  nominee: Nominee | null;
  entryId: number | null;
  refetchKey: unknown[];
  lang: Lang;
}

const SOURCE_LABEL: Record<SourceTag, { text: string; cls: string; dot: string }> = {
  db: { text: 'DB列', cls: 'bg-success/40 text-success border-success/40', dot: 'bg-success' },
  oneshot_data: { text: 'oneshot_data', cls: 'bg-warning/40 text-warning border-warning/40', dot: 'bg-warning' },
  i18n: { text: 'i18n辞書', cls: 'bg-info/40 text-info border-info/40', dot: 'bg-info' },
  fallback: { text: 'fallback', cls: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' },
  computed: { text: '算出', cls: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' },
  empty: { text: '未設定', cls: 'bg-destructive/40 text-destructive border-destructive/50', dot: 'bg-destructive' },
};

// ── CG ステージ上の領域定義 (1920×1080 stage 座標)。
//    lower-third が画面下中央、normal width 1200×~290。
//    精密な座標ではなく、各フィールドが大体どこに出るかを示す矩形。
const REGIONS = {
  portrait: { x: 374, y: 724, w: 146, h: 182 },
  awardName: { x: 542, y: 724, w: 240, h: 28 },
  subcategory: { x: 800, y: 724, w: 280, h: 28 },
  entryNo: { x: 1410, y: 724, w: 130, h: 30 },
  name: { x: 542, y: 758, w: 480, h: 60 },
  nameRomaji: { x: 1040, y: 770, w: 200, h: 30 },
  company: { x: 1280, y: 758, w: 260, h: 30 },
  department: { x: 1280, y: 794, w: 260, h: 24 },
  // モジュールスロット (選択中の module で内容が変わる)
  moduleSlot: { x: 542, y: 840, w: 1000, h: 150 },
  moduleHeader: { x: 542, y: 840, w: 600, h: 28 },
  moduleByline: { x: 1100, y: 840, w: 440, h: 28 },
  moduleBody: { x: 542, y: 880, w: 1000, h: 110 },
} as const;

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
    projectName: n.projectName,
    projectNameEn: n.projectNameEn,
    projectKana: n.projectKana,
    teamSize: n.teamSize,
    members: n.members ?? undefined,
    membersEn: n.membersEn ?? undefined,
    recommender: { ...n.recommender },
  };
}

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

function tag(val: string | null | undefined, src: SourceTag): SourceTag {
  return val && val.trim() ? src : 'empty';
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
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  useEffect(() => {
    if (open && nominee) {
      setDraft(nomineeToDraft(nominee));
      setHoveredKey(null);
    }
  }, [open, nominee]);

  // CG プレビュー letterbox
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.4);
  useEffect(() => {
    if (!open) return;
    const el = previewRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      setPreviewScale(Math.min(w / 1920, h / 1080));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const sections: SectionDef[] = useMemo(() => {
    if (!nominee) return [];
    const n = nominee;
    const isTeam = n.type === 'team';

    return [
      {
        key: 'basic',
        title: '基本情報 (DB 列)',
        icon: User,
        fields: [
          {
            key: 'name',
            label: '氏名',
            region: REGIONS.name,
            source: tag(n.name, 'db'),
            ja: n.name,
            en: n.nameEn,
            dbHint: 'awards_entries.name / .name_en (EventEditor で編集)',
            icon: User,
          },
          {
            key: 'company',
            label: '会社',
            region: REGIONS.company,
            source: tag(n.company, 'db'),
            ja: n.company,
            en: n.companyEn,
            dbHint: 'awards_entries.org / .org_en (EventEditor で編集)',
          },
          {
            key: 'image',
            label: '写真',
            region: REGIONS.portrait,
            source: tag(n.image, 'db'),
            ja: n.image,
            dbHint: 'awards_entries.photo_url (EventEditor で写真アップロード)',
            icon: ImageIcon,
          },
        ],
      },
      {
        key: 'award',
        title: '賞・部門 (DB 列 + i18n 辞書)',
        icon: Award,
        fields: [
          {
            key: 'category',
            label: '賞 (Award)',
            region: REGIONS.awardName,
            source: tag(n.category, 'db'),
            ja: n.category,
            en: n.categoryEn,
            dbHint: 'awards_categories.name / .name_en + i18n辞書 (英訳辞書ボタンで編集)',
            icon: Award,
          },
          {
            key: 'subcategory',
            label: '部門 (Division)',
            region: REGIONS.subcategory,
            source: tag(n.subcategory, 'db'),
            ja: n.subcategory,
            en: n.subcategoryEn,
            dbHint: 'awards_categories.description / .description_en + i18n辞書',
          },
          {
            key: 'entryNo',
            label: 'エントリーNo',
            region: REGIONS.entryNo,
            source: n.entryNo ? 'oneshot_data' : 'computed',
            ja: n.entryNo,
            editPath: 'entryNo',
            dbHint: 'oneshot_data.entryNo',
          },
        ],
      },
      {
        key: 'profile',
        title: 'プロフィール (oneshot_data 編集可)',
        icon: User,
        fields: [
          {
            key: 'department',
            label: '部署',
            region: REGIONS.department,
            source: tag(n.department, 'oneshot_data'),
            ja: n.department,
            en: n.departmentEn,
            editPath: 'department',
            editPathEn: 'departmentEn',
          },
          {
            key: 'position',
            label: '役職',
            region: REGIONS.department,
            source: tag(n.position, 'oneshot_data'),
            ja: n.position,
            en: n.positionEn,
            editPath: 'position',
            editPathEn: 'positionEn',
          },
          {
            key: 'location',
            label: '勤務地',
            region: REGIONS.department,
            source: tag(n.location, 'oneshot_data'),
            ja: n.location,
            en: n.locationEn,
            editPath: 'location',
            editPathEn: 'locationEn',
          },
        ],
      },
      {
        key: 'content',
        title: 'ノミネート内容 (モジュール表示時)',
        icon: MessageSquare,
        fields: [
          {
            key: 'ism',
            label: '私のイズム',
            region: REGIONS.moduleBody,
            source: tag(n.ism, 'oneshot_data'),
            ja: n.ism,
            en: n.ismEn,
            editPath: 'ism',
            editPathEn: 'ismEn',
            multiline: true,
            icon: Sparkles,
          },
          {
            key: 'skills',
            label: '私の得意技',
            region: REGIONS.moduleBody,
            source: n.skills.length ? 'oneshot_data' : 'empty',
            ja: n.skills.join(', '),
            en: n.skillsEn.join(', '),
            editPath: 'skills',
            editPathEn: 'skillsEn',
            asArray: true,
            icon: Sparkles,
          },
          {
            key: 'title',
            label: 'ノミネートタイトル',
            region: REGIONS.moduleBody,
            source: tag(n.title, 'oneshot_data'),
            ja: n.title,
            en: n.titleEn,
            editPath: 'title',
            editPathEn: 'titleEn',
            icon: Award,
          },
        ],
      },
      ...(isTeam
        ? [
            {
              key: 'team',
              title: 'チーム情報 (oneshot_data 編集可)',
              icon: UsersIcon,
              fields: [
                {
                  key: 'projectName',
                  label: 'プロジェクト名',
                  region: REGIONS.name,
                  source: tag(n.projectName, 'oneshot_data'),
                  ja: n.projectName,
                  en: n.projectNameEn,
                  editPath: 'projectName',
                  editPathEn: 'projectNameEn',
                },
                {
                  key: 'teamSize',
                  label: '人数',
                  region: REGIONS.moduleSlot,
                  source: n.teamSize != null ? 'oneshot_data' : 'empty',
                  ja: n.teamSize != null ? String(n.teamSize) : '',
                },
              ] as FieldDef[],
            } satisfies SectionDef,
          ]
        : []),
      {
        key: 'recommender',
        title: '推薦者情報 (oneshot_data 編集可)',
        icon: Quote,
        fields: [
          {
            key: 'rec.respect',
            label: '尊敬ポイント (13文字)',
            region: REGIONS.moduleBody,
            source: tag(n.recommender.respect, 'oneshot_data'),
            ja: n.recommender.respect,
            en: n.recommender.respectEn,
            editPath: 'recommender.respect',
            editPathEn: 'recommender.respectEn',
            icon: Quote,
          },
          {
            key: 'rec.name',
            label: '推薦者氏名',
            region: REGIONS.moduleByline,
            source: tag(n.recommender.name, 'oneshot_data'),
            ja: n.recommender.name,
            en: n.recommender.nameEn,
            editPath: 'recommender.name',
            editPathEn: 'recommender.nameEn',
          },
          {
            key: 'rec.position',
            label: '推薦者役職',
            region: REGIONS.moduleByline,
            source: tag(n.recommender.position, 'oneshot_data'),
            ja: n.recommender.position,
            en: n.recommender.positionEn,
            editPath: 'recommender.position',
            editPathEn: 'recommender.positionEn',
          },
        ],
      },
    ];
  }, [nominee]);

  const allFields = useMemo(() => sections.flatMap((s) => s.fields), [sections]);
  const editable = allFields.filter((f) => f.editPath);
  const filled = editable.filter((f) => f.source === 'oneshot_data').length;
  const completeness = editable.length ? Math.round((filled / editable.length) * 100) : 0;

  const editValue = (path: string | undefined): string => {
    if (!path) return '';
    let cur: unknown = draft;
    for (const p of path.split('.')) {
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

  const resetDraft = () => {
    if (nominee) setDraft(nomineeToDraft(nominee));
  };

  const [showRaw, setShowRaw] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!entryId) throw new Error('DB 紐付けのないノミネートは編集できません');
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(draft)) {
        if (v == null) continue;
        if (typeof v === 'string' && !v.trim()) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        cleaned[k] = v;
      }
      if (cleaned.recommender && Object.keys(cleaned.recommender as object).length === 0) {
        delete cleaned.recommender;
      }
      const res = await api.put(`/awards/entries/${entryId}/oneshot-data`, { oneshot_data: cleaned });
      // サーバーが UPDATE 後の row を返すので返却 (UI 検証用)
      return res.data?.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: refetchKey });
      // 保存後はモーダルを閉じずに残し、Inspector でバッジが緑(oneshot_data)に
      // 切り替わるのを確認できるようにする (旧版は閉じていたが、ユーザーが
      // 「保存しても DB に行ってる感じがしない」と感じる原因になっていたため)
    },
  });

  const saveError =
    saveMutation.error instanceof Error
      ? saveMutation.error.message
      : saveMutation.error
      ? String(saveMutation.error)
      : null;

  if (!open || !nominee) return null;

  const hovered = hoveredKey ? allFields.find((f) => f.key === hoveredKey) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 sm:p-4">
      <div className="w-full max-w-7xl h-[100dvh] sm:max-h-[95vh] sm:h-auto flex flex-col bg-background border border-border sm:rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-3 sm:py-4 border-b border-border">
          <Database className="h-5 w-5 text-warning-strong shrink-0" />
          <h2 className="text-sm sm:text-base font-bold text-foreground min-w-0 truncate">
            DB ↔ CG マッピング
            <span className="ml-2 text-xs sm:text-sm text-muted-foreground font-normal">#{entryId ?? '—'}</span>
          </h2>
          <div className="flex-1" />
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-black tracking-widest shrink-0',
              completeness === 100
                ? 'bg-success/50 text-success border border-success/50'
                : completeness >= 50
                ? 'bg-warning/50 text-warning-strong border border-warning/50'
                : 'bg-destructive/40 text-destructive border border-destructive/40'
            )}
            title={`oneshot_data 充足率 ${filled}/${editable.length}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">充足率 </span>{completeness}%
          </span>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded hover:bg-card text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Save success/error banner */}
        {(saveMutation.isSuccess || saveError) && (
          <div
            className={cn(
              'mx-3 sm:mx-6 mt-3 flex items-start gap-2 rounded border px-3 py-2 text-sm',
              saveError
                ? 'border-destructive/60 bg-destructive/40 text-destructive'
                : 'border-success/60 bg-success/40 text-success'
            )}
          >
            {saveError ? <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              {saveError ? (
                <>
                  <div className="font-bold">保存に失敗しました</div>
                  <div className="text-xs mt-0.5 break-all">{saveError}</div>
                </>
              ) : (
                <div className="font-bold">
                  保存しました — 充足率 {completeness}% に更新。バッジが 🟡 oneshot_data に変わっているか確認してください。
                </div>
              )}
            </div>
            <button
              onClick={() => saveMutation.reset()}
              className="text-xs opacity-70 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Body: stack on mobile, 2 cols on lg */}
        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[1fr_minmax(420px,520px)] overflow-hidden min-h-0">
          {/* ── Left: CG preview with hotspots ─────────────── */}
          <div className="flex flex-col h-[34vh] lg:h-auto border-b lg:border-b-0 lg:border-r border-border overflow-hidden shrink-0 lg:shrink">
            <div className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-3 border-b border-border/60 bg-background/40">
              <Edit3 className="h-4 w-4 text-warning-strong shrink-0" />
              <span className="text-sm font-bold text-foreground">CG プレビュー</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">右の項目にホバーで該当箇所をハイライト</span>
            </div>
            <div className="flex-1 relative bg-black overflow-hidden" ref={previewRef}>
              {/* 1920x1080 stage */}
              <div
                className="absolute"
                style={{
                  left: '50%',
                  top: '50%',
                  width: 1920,
                  height: 1080,
                  transform: `translate(-50%, -50%) scale(${previewScale})`,
                  transformOrigin: 'center center',
                }}
              >
                <OneShotStage
                  nominee={nominee}
                  lang={lang}
                  moduleKey="respect"
                  transparent={false}
                  lowerThirdMounted={true}
                  lowerThirdExiting={false}
                  tickerMounted={false}
                  tickerExiting={false}
                  tickerOn={false}
                  tickerCategory={null}
                />
                {/* Hotspots overlay (in stage coords, scaled with parent) */}
                {allFields.map((f, i) => {
                  const isHover = hoveredKey === f.key;
                  return (
                    <div
                      key={f.key}
                      className={cn(
                        'absolute pointer-events-auto cursor-pointer transition-all',
                        isHover && 'z-20'
                      )}
                      style={{
                        left: f.region.x,
                        top: f.region.y,
                        width: f.region.w,
                        height: f.region.h,
                      }}
                      onMouseEnter={() => setHoveredKey(f.key)}
                      onMouseLeave={() => setHoveredKey((k) => (k === f.key ? null : k))}
                    >
                      {/* outline */}
                      <div
                        className={cn(
                          'absolute inset-0 transition-all',
                          isHover ? 'opacity-100' : 'opacity-0'
                        )}
                        style={{
                          outline: '4px solid rgba(245, 158, 11, 0.85)',
                          outlineOffset: '-4px',
                          background: 'rgba(245, 158, 11, 0.15)',
                          borderRadius: 4,
                        }}
                      />
                      {/* number badge */}
                      <div
                        className={cn(
                          'absolute -top-3 -left-3 rounded-full text-white text-[28px] font-black flex items-center justify-center transition-all border-2',
                          isHover
                            ? 'bg-warning border-white scale-110 shadow-2xl'
                            : f.source === 'empty'
                            ? 'bg-destructive border-destructive'
                            : f.source === 'oneshot_data'
                            ? 'bg-warning border-warning'
                            : f.source === 'i18n'
                            ? 'bg-info border-info'
                            : 'bg-success border-success'
                        )}
                        style={{
                          width: 56,
                          height: 56,
                          fontSize: 26,
                          // 重ならないよう少しずらす
                          transform: `translate(${(i % 4) * 4}px, ${(Math.floor(i / 4) * 2)}px)`,
                        }}
                      >
                        {i + 1}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Legend */}
            <div className="px-5 py-3 border-t border-border bg-background/40 flex items-center gap-3 flex-wrap text-xs">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">凡例:</span>
              {(
                [
                  { tag: 'db', desc: 'DB列 (固定)' },
                  { tag: 'oneshot_data', desc: 'JSONB (右で編集可)' },
                  { tag: 'i18n', desc: '英訳辞書' },
                  { tag: 'empty', desc: '未設定' },
                ] as const
              ).map(({ tag, desc }) => (
                <span key={tag} className="flex items-center gap-1.5">
                  <span className={cn('h-2.5 w-2.5 rounded-full', SOURCE_LABEL[tag].dot)} />
                  <span className="text-muted-foreground">{desc}</span>
                </span>
              ))}
            </div>
          </div>

          {/* ── Right: Field list grouped by section ───────── */}
          <div className="flex-1 lg:flex-initial overflow-y-auto p-3 sm:p-5 space-y-4 sm:space-y-5">
            {hovered && (
              <div className="rounded-lg border border-warning/50 bg-warning/30 px-3 py-2 text-xs text-warning-strong">
                <span className="font-bold">選択中:</span> {hovered.label}
                {hovered.dbHint && (
                  <div className="text-[11px] text-warning-strong mt-1 font-mono">
                    {hovered.dbHint}
                  </div>
                )}
              </div>
            )}

            {sections.map((section, secIdx) => {
              const SecIcon = section.icon;
              const offset = sections.slice(0, secIdx).reduce((s, x) => s + x.fields.length, 0);
              return (
                <section key={section.key} className="space-y-2.5">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-foreground pb-1.5 border-b border-border">
                    <SecIcon className="h-4 w-4 text-warning-strong" />
                    {section.title}
                  </h3>
                  <div className="space-y-2">
                    {section.fields.map((f, i) => (
                      <FieldRow
                        key={f.key}
                        index={offset + i + 1}
                        field={f}
                        isHovered={hoveredKey === f.key}
                        onHover={() => setHoveredKey(f.key)}
                        onLeave={() => setHoveredKey((k) => (k === f.key ? null : k))}
                        editValueJa={editValue(f.editPath)}
                        editValueEn={editValue(f.editPathEn)}
                        updateField={updateField}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        {/* Raw JSONB collapsible (debug) */}
        {showRaw && (
          <div className="mx-3 sm:mx-6 mb-2 rounded border border-border bg-background p-3 max-h-[40vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-muted-foreground">RAW oneshot_data (送信される JSONB)</span>
            </div>
            <pre className="text-[11px] text-success whitespace-pre-wrap break-all">
              {JSON.stringify(
                Object.fromEntries(
                  Object.entries(draft).filter(([, v]) => {
                    if (v == null) return false;
                    if (typeof v === 'string' && !v.trim()) return false;
                    if (Array.isArray(v) && v.length === 0) return false;
                    return true;
                  })
                ),
                null,
                2
              )}
            </pre>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2 flex-wrap px-3 sm:px-6 py-3 border-t border-border bg-background/50">
          {!entryId && (
            <span className="flex items-center gap-1.5 text-xs text-warning-strong">
              <AlertCircle className="h-4 w-4" />
              DB 未紐付け
            </span>
          )}
          <button
            onClick={() => setShowRaw((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2.5 sm:px-3 py-2 text-xs sm:text-sm transition-colors',
              showRaw
                ? 'border-success bg-success/30 text-success'
                : 'border-border bg-card text-muted-foreground hover:bg-muted'
            )}
            title="送信される JSONB を確認"
          >
            <FileJson className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">JSONB</span>
            {showRaw ? '隠す' : '表示'}
          </button>
          <div className="flex-1" />
          <button
            onClick={resetDraft}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 sm:px-3 py-2 text-xs sm:text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">リセット</span>
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-card px-3 sm:px-4 py-2 text-xs sm:text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            閉じる
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!entryId || saveMutation.isPending}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 sm:px-4 py-2 text-sm font-bold transition-colors',
              entryId
                ? 'bg-warning text-foreground hover:bg-warning/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── FieldRow ──────────────────────────────────────────────
interface FieldRowProps {
  index: number;
  field: FieldDef;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  editValueJa: string;
  editValueEn: string;
  updateField: (path: string, value: string, isArray?: boolean) => void;
}

function FieldRow({
  index,
  field: f,
  isHovered,
  onHover,
  onLeave,
  editValueJa,
  editValueEn,
  updateField,
}: FieldRowProps) {
  const sl = SOURCE_LABEL[f.source];
  const FieldIcon = f.icon ?? Edit3;
  const isEditable = !!f.editPath;
  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={cn(
        'rounded-lg border bg-card/40 p-3 transition-all',
        isHovered
          ? 'border-warning/70 bg-card/80 ring-2 ring-warning/30'
          : 'border-border/60 hover:bg-card/60'
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black shrink-0',
            f.source === 'empty'
              ? 'bg-destructive text-white'
              : f.source === 'oneshot_data'
              ? 'bg-warning text-warning-foreground'
              : f.source === 'i18n'
              ? 'bg-info text-white'
              : 'bg-success text-white'
          )}
        >
          {index}
        </span>
        <FieldIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-bold text-foreground">{f.label}</span>
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-bold', sl.cls)}>
          {sl.text}
        </span>
        {!isEditable && (
          <span className="text-[11px] text-muted-foreground italic">
            {f.source === 'db' ? '読み取り専用' : ''}
          </span>
        )}
      </div>

      {/* Values / inputs */}
      {isEditable ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <FieldInput
            label="JA"
            multiline={f.multiline}
            value={editValueJa}
            placeholder={f.ja ?? ''}
            onChange={(v) => f.editPath && updateField(f.editPath, v, f.asArray)}
          />
          {f.editPathEn && (
            <FieldInput
              label="EN"
              multiline={f.multiline}
              value={editValueEn}
              placeholder={f.en ?? ''}
              onChange={(v) => f.editPathEn && updateField(f.editPathEn, v, f.asArray)}
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <ReadOnlyValue label="JA" value={f.ja} />
          <ReadOnlyValue label="EN" value={f.en} />
        </div>
      )}

      {/* DB hint */}
      {f.dbHint && (
        <div className="mt-2 text-[11px] text-muted-foreground font-mono break-all">
          ↳ {f.dbHint}
        </div>
      )}
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
    'w-full rounded border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 transition-colors',
    value
      ? 'border-warning/50 focus:ring-warning/40'
      : 'border-border focus:ring-border'
  );
  return (
    <div className="space-y-1">
      <span className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={cn(cls, 'resize-y leading-relaxed')}
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

function ReadOnlyValue({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">{label}</span>
      <div className="rounded border border-border bg-background/50 px-3 py-2 text-sm text-muted-foreground break-words whitespace-pre-wrap min-h-[36px]">
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}
