import * as XLSX from 'xlsx';
import { getDb } from '../../../shared/db/connection';

export interface ImportResult {
  categories: { id: number; name: string; description: string | null; inserted: number }[];
  totalInserted: number;
  skipped: number;
  warnings: string[];
}

// ── ヘッダー正規化マッピング (auto-detect 候補) ─────────────
// UI から custom mapping が渡された場合はそちらを優先、未指定の項目だけ
// この auto-detect にフォールバック。
const AWARD_HEADERS           = ['種別'];
const DIVISION_HEADERS        = ['エントリー部門', 'エントリー部門名'];
const IMAGE_ID_HEADERS        = ['画像id', '画像ｉｄ', 'imageid', 'image_id', '画像'];
// CG表示名としては「ノミネート名」（個人＝氏名 / チーム＝代表者名 などが入る）を優先
const NAME_JA_HEADERS         = [
  'ノミネート名',
  'ノミネート者氏名',
  '氏名', '名前', '名称', 'name',
];
const NAME_PROJECT_HEADERS    = ['プロジェクト名'];
const NAME_EN_HEADERS         = [
  'ノミネート者氏名（英語）', 'ノミネート者氏名(英語)',
  'ノミネート名（英語）', 'ノミネート名(英語)',
  '氏名（英語）', '氏名(英語)',
  'name_en', 'name(en)', 'nameenglish', '英語名',
];
const NAME_EN_PROJECT_HEADERS = ['プロジェクト名（英語）', 'プロジェクト名(英語)'];
const ORG_JA_HEADERS          = ['ノミネート者会社', '所属', '会社', '企業', 'org'];
const ORG_EN_HEADERS          = ['ノミネート者会社（英語）', 'ノミネート者会社(英語)', 'org_en', 'org(en)', '会社（英語）', '会社(英語)'];

// oneshot_data 用 (フィールドが Excel にある場合のみ収集される)
const ENTRY_NO_HEADERS        = ['エントリーno', 'エントリーNo', 'entryno', 'entry_no'];
const NAME_KANA_HEADERS       = ['ノミネート者フリガナ', 'フリガナ'];
const PROJECT_KANA_HEADERS    = ['プロジェクト名（フリガナ）', 'プロジェクト名(フリガナ)', 'projectkana'];
const DEPARTMENT_HEADERS      = ['ノミネート者部署', '部署'];
const POSITION_HEADERS        = ['ノミネート者役職', '役職'];
const LOCATION_HEADERS        = ['ノミネート者勤務地', '勤務地'];
const JOIN_DATE_HEADERS       = ['ノミネート者入社日', '入社日'];
const ISM_HEADERS             = ['ノミネート者私のイズム', '私のイズム', '個人やチームの魅力・個性', 'イズム'];
const SKILLS_HEADERS          = ['ノミネート者私の得意技', '私の得意技', '個人やチームの特長・強み', '得意技'];
const TITLE_HEADERS           = ['ノミネートタイトル'];
const TITLE_EN_HEADERS        = ['ノミネートタイトル（英語）', 'ノミネートタイトル(英語)'];
const TEAM_SIZE_HEADERS       = ['人数'];
const MEMBERS_HEADERS         = ['チームメンバー', 'メンバー', '副代表'];
// 推薦者
const REC_NAME_HEADERS        = ['推薦者氏名', '推薦者名'];
const REC_NAME_EN_HEADERS     = ['推薦者氏名（英語）', '推薦者氏名(英語)'];
const REC_NAME_KANA_HEADERS   = ['推薦者フリガナ'];
const REC_COMPANY_HEADERS     = ['推薦者会社'];
const REC_DEPT_HEADERS        = ['推薦者部署', '推薦者`部署'];
const REC_POSITION_HEADERS    = ['推薦者役職'];
const REC_RESPECT_HEADERS     = ['尊敬ポイント（13文字）', '尊敬ポイント(13文字)', '尊敬ポイント'];
const REC_RESPECT_EN_HEADERS  = ['尊敬ポイント（13文字）（英語）', '尊敬ポイント(13文字)(英語)', '尊敬ポイント（英語）', '尊敬ポイント(英語)'];
// 投票結果 (DB列: rank / points / own_points)
const RANK_HEADERS            = ['順位', 'rank'];
const POINTS_HEADERS          = ['ポイント総計', 'ポイント', 'points', 'point'];
// 「自社以外票」を部分一致で誤検出しないよう「自社票」完全一致候補のみに限定
const OWN_POINTS_HEADERS      = ['自社票', 'own_points'];

// custom mapping のキー定義 (クライアントと共有)
export type ImportMappingKey =
  | 'category' | 'division' | 'imageId'
  | 'name' | 'nameEn' | 'projectName' | 'projectNameEn' | 'nameKana' | 'projectKana'
  | 'org' | 'orgEn'
  | 'entryNo' | 'department' | 'position' | 'location' | 'joinDate'
  | 'ism' | 'skills' | 'title' | 'titleEn'
  | 'teamSize' | 'members'
  | 'recName' | 'recNameEn' | 'recNameKana' | 'recCompany' | 'recDept' | 'recPosition'
  | 'recRespect' | 'recRespectEn'
  | 'rank' | 'points' | 'ownPoints';

export type ImportMapping = Partial<Record<ImportMappingKey, string>>;

// auto-detect 候補とのマッピング (customMapping にない項目はこれで補完)
const AUTO_HEADERS: Record<ImportMappingKey, string[]> = {
  category: AWARD_HEADERS,
  division: DIVISION_HEADERS,
  imageId: IMAGE_ID_HEADERS,
  name: NAME_JA_HEADERS,
  nameEn: NAME_EN_HEADERS,
  projectName: NAME_PROJECT_HEADERS,
  projectNameEn: NAME_EN_PROJECT_HEADERS,
  nameKana: NAME_KANA_HEADERS,
  projectKana: PROJECT_KANA_HEADERS,
  org: ORG_JA_HEADERS,
  orgEn: ORG_EN_HEADERS,
  entryNo: ENTRY_NO_HEADERS,
  department: DEPARTMENT_HEADERS,
  position: POSITION_HEADERS,
  location: LOCATION_HEADERS,
  joinDate: JOIN_DATE_HEADERS,
  ism: ISM_HEADERS,
  skills: SKILLS_HEADERS,
  title: TITLE_HEADERS,
  titleEn: TITLE_EN_HEADERS,
  teamSize: TEAM_SIZE_HEADERS,
  members: MEMBERS_HEADERS,
  recName: REC_NAME_HEADERS,
  recNameEn: REC_NAME_EN_HEADERS,
  recNameKana: REC_NAME_KANA_HEADERS,
  recCompany: REC_COMPANY_HEADERS,
  recDept: REC_DEPT_HEADERS,
  recPosition: REC_POSITION_HEADERS,
  recRespect: REC_RESPECT_HEADERS,
  recRespectEn: REC_RESPECT_EN_HEADERS,
  rank: RANK_HEADERS,
  points: POINTS_HEADERS,
  ownPoints: OWN_POINTS_HEADERS,
};

// 全角 ⇄ 半角・大文字小文字・空白を吸収する正規化
function normalize(s: string): string {
  return s
    .replace(/\s+/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/（/g, '(').replace(/）/g, ')')
    .toLowerCase();
}

/** ヘッダーが「(英語)」系のラベルか (英語列を JA 項目が誤検出しないための判定) */
function isEnglishHeader(normalizedHeader: string): boolean {
  return /英語|\(en\)|\(eng\)|english/.test(normalizedHeader);
}

function findCol(headers: string[], candidates: string[]): number {
  const normalizedHeaders = headers.map(normalize);
  const normalizedCands = candidates.map(normalize);
  // 1) 完全一致を優先（"ノミネート名" が "ノミネート名（英語）" を誤拾いしないように）
  for (const cand of normalizedCands) {
    const idx = normalizedHeaders.findIndex((h) => h === cand);
    if (idx >= 0) return idx;
  }
  // 2) 部分一致をフォールバック。
  //    ただし「プロジェクト名」が「プロジェクト名（英語）」を拾うような、
  //    日本語候補 → 英語列 の部分一致は除外する (候補自体が英語ラベルの場合のみ許可)。
  for (const cand of normalizedCands) {
    const candEn = isEnglishHeader(cand);
    const idx = normalizedHeaders.findIndex(
      (h) => h.includes(cand) && (candEn || !isEnglishHeader(h)),
    );
    if (idx >= 0) return idx;
  }
  return -1;
}

function cellStr(row: unknown[], col: number): string {
  if (col < 0) return '';
  return String(row[col] ?? '').trim();
}

/** Excel ヘッダー名から列 index を解決。
 *  customMapping が指定されていればその列名 (= header text) を最優先、
 *  未指定なら AUTO_HEADERS 候補リストで auto-detect する。 */
function resolveCol(
  headers: string[],
  mapping: ImportMapping | undefined,
  key: ImportMappingKey,
): number {
  const custom = mapping?.[key];
  if (custom && custom.trim()) {
    const target = normalize(custom);
    const idx = headers.map(normalize).indexOf(target);
    if (idx >= 0) return idx;
  }
  return findCol(headers, AUTO_HEADERS[key]);
}

interface RowData {
  award: string;
  division: string;
  rank: number | null;
  /** ポイント総計 (小数可)。Excel に列が無ければ null。 */
  points: number | null;
  /** 自社票 (小数可) → CG の Own Vote 表示 (own_points)。 */
  ownPoints: number | null;
  imageId: string | null;
  nameJa: string;
  nameEn: string | null;
  orgJa: string | null;
  orgEn: string | null;
  /** 1S CG (oneshot_data) 用。フィールドが Excel に無ければ undefined のまま。 */
  oneshotData: Record<string, unknown> | null;
  /** 個人 (individual) / チーム (team) — チーム判定はプロジェクト名の有無で */
  isTeam: boolean;
}

/** Excel 各列の自動分類タイプ */
export type ColumnType =
  | 'empty'
  | 'number'
  | 'date'
  | 'list'
  | 'id'
  | 'url'
  | 'shortText'
  | 'longText';

export interface ColumnAnalysis {
  /** Excel ヘッダー文字列 (元の表記そのまま) */
  header: string;
  /** 自動分類タイプ */
  type: ColumnType;
  /** 平均文字数 (非空セル) */
  avgLength: number;
  /** 最大文字数 (非空セル) */
  maxLength: number;
  /** 入力済セル比率 (0-1) */
  filledRatio: number;
  /** ユニークなサンプル値 (最大 3 件) */
  samples: string[];
  /** 推奨マッピング先 ImportMappingKey (見つからなければ undefined) */
  suggestedKey?: ImportMappingKey;
  /** 推奨の自信度 (exact: ヘッダー名完全一致, partial: 部分一致, none: 推奨なし) */
  suggestedConfidence: 'exact' | 'partial' | 'none';
}

function isDateLike(s: string): boolean {
  if (/^\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(s)) return true;
  if (/^\d{4}\.\d{1,2}\.\d{1,2}/.test(s)) return true;
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(s)) return true;
  return false;
}

function analyzeColumn(header: string, values: string[]): ColumnAnalysis {
  const trimmed = values.map((v) => v.trim());
  const nonEmpty = trimmed.filter(Boolean);
  const filledRatio = trimmed.length > 0 ? nonEmpty.length / trimmed.length : 0;

  if (nonEmpty.length === 0) {
    return {
      header, type: 'empty', avgLength: 0, maxLength: 0, filledRatio: 0,
      samples: [], suggestedConfidence: 'none',
    };
  }

  const avgLength = nonEmpty.reduce((s, v) => s + v.length, 0) / nonEmpty.length;
  const maxLength = nonEmpty.reduce((m, v) => Math.max(m, v.length), 0);
  const samples = Array.from(new Set(nonEmpty)).slice(0, 3);

  let type: ColumnType;
  if (nonEmpty.every((v) => /^https?:\/\//.test(v))) {
    type = 'url';
  } else if (nonEmpty.every((v) => /^-?\d+(\.\d+)?$/.test(v.replace(/,/g, '')))) {
    type = 'number';
  } else if (nonEmpty.every((v) => isDateLike(v))) {
    type = 'date';
  } else if (
    nonEmpty.filter((v) => v.split(/\s*[、,／/]\s*/).filter(Boolean).length >= 2).length /
      nonEmpty.length >= 0.5
  ) {
    type = 'list';
  } else if (
    avgLength <= 12 &&
    nonEmpty.every((v) => /^[a-zA-Z0-9_\-]+$/.test(v)) &&
    new Set(nonEmpty).size / nonEmpty.length >= 0.8
  ) {
    type = 'id';
  } else if (avgLength < 30) {
    type = 'shortText';
  } else {
    type = 'longText';
  }

  return { header, type, avgLength, maxLength, filledRatio, samples, suggestedConfidence: 'none' };
}

/** ヘッダー名と分類タイプから ImportMappingKey の候補を提案 */
function suggestMappingKey(
  analysis: ColumnAnalysis,
  alreadyUsed: Set<ImportMappingKey>,
): { key?: ImportMappingKey; confidence: 'exact' | 'partial' | 'none' } {
  const headerNorm = normalize(analysis.header);

  // 1) ヘッダー名 完全一致
  for (const key of Object.keys(AUTO_HEADERS) as ImportMappingKey[]) {
    if (alreadyUsed.has(key)) continue;
    if (AUTO_HEADERS[key].some((c) => normalize(c) === headerNorm)) {
      return { key, confidence: 'exact' };
    }
  }
  // 2) ヘッダー名 部分一致
  for (const key of Object.keys(AUTO_HEADERS) as ImportMappingKey[]) {
    if (alreadyUsed.has(key)) continue;
    if (AUTO_HEADERS[key].some((c) => headerNorm.includes(normalize(c)))) {
      return { key, confidence: 'partial' };
    }
  }
  return { confidence: 'none' };
}

/** Preview API: Excel を解析して列情報を返す */
export interface PreviewResult {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  /** v2.8.69+: 各列の自動分類 + 推奨マッピング */
  columns: ColumnAnalysis[];
  /** 後方互換: cgKey → header 形式の推奨マッピング (deprecated, columns 推奨) */
  suggestedMapping: ImportMapping;
}

export function previewAwardsExcel(buffer: Buffer): PreviewResult {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('Excel にシートが見つかりません');
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];
  if (rows.length < 2) throw new Error('データ行が存在しません');

  const headerRow = rows[0].some((h) => String(h).trim()) ? 0 : 1;
  const headers = rows[headerRow].map((h) => String(h).trim());
  const dataRows = rows.slice(headerRow + 1).filter((r) => r.some((c) => String(c).trim()));
  const sampleRows = dataRows.slice(0, 3).map((r) => r.map((c) => String(c ?? '').trim()));

  // 列ごとに全行の値を集めて type 解析
  const columns: ColumnAnalysis[] = headers.map((h, idx) => {
    const colValues = dataRows.map((r) => String(r[idx] ?? ''));
    return analyzeColumn(h, colValues);
  });

  // 推奨マッピングを confidence 順 (exact 優先) で割当て、重複を回避
  const used = new Set<ImportMappingKey>();
  // exact 優先で 2 パス
  for (const pass of ['exact', 'partial'] as const) {
    columns.forEach((col) => {
      if (col.type === 'empty' || col.suggestedKey) return;
      const r = suggestMappingKey(col, used);
      if (r.confidence === pass && r.key) {
        col.suggestedKey = r.key;
        col.suggestedConfidence = r.confidence;
        used.add(r.key);
      }
    });
  }

  // 後方互換用 suggestedMapping (cgKey → header) を組み立て
  const suggested: ImportMapping = {};
  columns.forEach((col) => {
    if (col.suggestedKey) suggested[col.suggestedKey] = col.header;
  });

  return { headers, sampleRows, totalRows: dataRows.length, columns, suggestedMapping: suggested };
}

/** Excel ヘッダー名を JSONB のキー名に sanitize
 *  (英数字/かな漢字はそのまま、空白とブラケットだけ詰める。oneshot_data の自由欄キーとして使用) */
function sanitizeKey(header: string): string {
  return header.replace(/\s+/g, '').replace(/[\[\]]/g, '');
}

export async function importAwardsExcel(
  buffer: Buffer,
  eventId: number,
  customMapping?: ImportMapping,
  /** v2.8.69+: 既知 CG 項目に該当しない列を「そのまま保存」する場合の Excel ヘッダー一覧。
   *  oneshot_data.{sanitizeKey(header)} として書き込まれる。 */
  extraColumns?: string[],
): Promise<ImportResult> {
  const warnings: string[] = [];

  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('Excel にシートが見つかりません');

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];

  if (rows.length < 2) throw new Error('データ行が存在しません');

  // ヘッダー行を探す（0行目か1行目）
  const headerRow = rows[0].some((h) => String(h).trim()) ? 0 : 1;
  const headers = rows[headerRow].map(String);
  const dataRows = rows.slice(headerRow + 1).filter((r) => r.some((c) => String(c).trim()));

  const get = (key: ImportMappingKey) => resolveCol(headers, customMapping, key);

  const awardCol        = get('category');
  const divisionCol     = get('division');
  const imageIdCol      = get('imageId');
  const nameJaCol       = get('name');
  const nameProjCol     = get('projectName');
  const nameEnCol       = get('nameEn');
  const nameEnProjCol   = get('projectNameEn');
  const orgJaCol        = get('org');
  const orgEnCol        = get('orgEn');
  const rankCol         = get('rank');
  const pointsCol       = get('points');
  const ownPointsCol    = get('ownPoints');

  if (awardCol < 0) warnings.push('「種別/賞」列のマッピングがありません。単一カテゴリ「インポート」に全エントリを追加します');
  if (divisionCol < 0) warnings.push('「エントリー部門」列のマッピングがありません');
  if (nameJaCol < 0 && nameProjCol < 0) warnings.push('名前列のマッピングが特定できませんでした');

  const parsedRows: RowData[] = [];
  let skipped = 0;

  // oneshot_data 用キー一覧 (基本 4 列以外。"name/org" 系は base 列に格納するので除外)
  // 各 key を Excel 列から読み出して、見つかったものだけ JSONB に格納する。
  const oneshotKeys: ImportMappingKey[] = [
    'entryNo', 'nameKana', 'projectKana',
    'department', 'position', 'location', 'joinDate',
    'ism', 'skills', 'title', 'titleEn',
    'teamSize', 'members',
    'recName', 'recNameEn', 'recNameKana', 'recCompany', 'recDept', 'recPosition',
    'recRespect', 'recRespectEn',
  ];
  const oneshotCols: Partial<Record<ImportMappingKey, number>> = {};
  for (const k of oneshotKeys) oneshotCols[k] = get(k);

  // v2.8.69+: 既知 CG 項目にマッピングされなかった列も oneshot_data に「そのまま保存」する。
  // 重複を避けるため、customMapping ですでに使われている Excel ヘッダーは extra から除外。
  const usedHeaders = new Set<string>(
    Object.values(customMapping ?? {}).filter((v): v is string => !!v),
  );
  const extras: { jsonKey: string; col: number }[] = (extraColumns ?? [])
    .filter((h) => h && !usedHeaders.has(h))
    .map((h) => {
      const target = normalize(h);
      const col = headers.map(normalize).indexOf(target);
      return { jsonKey: sanitizeKey(h), col };
    })
    .filter((x) => x.col >= 0);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const award    = awardCol >= 0 ? cellStr(row, awardCol) || 'インポート' : 'インポート';
    const rawDiv   = divisionCol >= 0 ? cellStr(row, divisionCol) : '';
    const division = rawDiv && !rawDiv.endsWith('部門') ? rawDiv + '部門' : rawDiv;

    const projJa = cellStr(row, nameProjCol);
    const nomJa  = nameJaCol >= 0 ? cellStr(row, nameJaCol) : String(row[1] ?? '').trim();
    const nameJa = projJa || nomJa;
    if (!nameJa) { skipped++; continue; }

    const projEn = cellStr(row, nameEnProjCol);
    const nomEn  = cellStr(row, nameEnCol);
    const nameEn = projEn || nomEn || null;

    // 投票結果 (順位は整数 / ポイント・自社票は小数可)。空セルは null。
    const parseNum = (col: number, integer = false): number | null => {
      if (col < 0) return null;
      const raw = cellStr(row, col).replace(/,/g, '');
      if (!raw) return null;
      const n = integer ? parseInt(raw, 10) : parseFloat(raw);
      return Number.isFinite(n) ? n : null;
    };
    const rank      = parseNum(rankCol, true);
    const points    = parseNum(pointsCol);
    const ownPoints = parseNum(ownPointsCol);

    const imageId = imageIdCol >= 0 ? cellStr(row, imageIdCol) || null : null;
    const stripKK = (s: string) => s.replace(/株式会社/g, '').replace(/\s+/g, ' ').trim();
    const orgJa   = orgJaCol >= 0 ? stripKK(cellStr(row, orgJaCol)) || null : null;
    const orgEn   = orgEnCol >= 0 ? cellStr(row, orgEnCol) || null : null;

    // ── oneshot_data を構築 ──
    const isTeam = !!projJa;
    const od: Record<string, unknown> = {};
    od.type = isTeam ? 'team' : 'individual';

    const setIf = (jsonKey: string, mapKey: ImportMappingKey, transform?: (v: string) => unknown) => {
      const col = oneshotCols[mapKey];
      if (col == null || col < 0) return;
      const v = cellStr(row, col);
      if (!v) return;
      od[jsonKey] = transform ? transform(v) : v;
    };

    setIf('entryNo', 'entryNo');
    setIf('nameKana', 'nameKana');
    setIf('projectKana', 'projectKana');
    if (projJa) od.projectName = projJa;
    if (projEn) od.projectNameEn = projEn;
    setIf('department', 'department');
    setIf('position', 'position');
    setIf('location', 'location');
    setIf('joinDate', 'joinDate');
    setIf('ism', 'ism');
    setIf('skills', 'skills', (v) => v.split(/\s*[、,／/]\s*/).filter(Boolean));
    setIf('title', 'title');
    setIf('titleEn', 'titleEn');
    setIf('teamSize', 'teamSize', (v) => parseInt(v, 10) || undefined);
    setIf('members', 'members'); // 文字列のまま (CG 側で member array に整形は今後)

    // 推薦者 (recommender)
    const rec: Record<string, unknown> = {};
    const setRec = (jsonKey: string, mapKey: ImportMappingKey) => {
      const col = oneshotCols[mapKey];
      if (col == null || col < 0) return;
      const v = cellStr(row, col);
      if (!v) return;
      rec[jsonKey] = v;
    };
    setRec('name', 'recName');
    setRec('nameEn', 'recNameEn');
    setRec('nameKana', 'recNameKana');
    setRec('company', 'recCompany');
    setRec('department', 'recDept');
    setRec('position', 'recPosition');
    setRec('respect', 'recRespect');
    setRec('respectEn', 'recRespectEn');
    if (Object.keys(rec).length > 0) od.recommender = rec;

    // v2.8.69+: extras 列をそのまま保存 (キー = sanitize(ヘッダー))
    for (const { jsonKey, col } of extras) {
      const v = cellStr(row, col);
      if (v) od[jsonKey] = v;
    }

    // 何も追加されなかった (type のみ) なら oneshot_data は null として保存
    const oneshotData = Object.keys(od).length > 1 ? od : null;

    parsedRows.push({ award, division, rank, points, ownPoints, imageId, nameJa, nameEn, orgJa, orgEn, oneshotData, isTeam });
  }

  if (parsedRows.length === 0) throw new Error('有効なデータ行が存在しません');

  // (種別, エントリー部門) ごとにグループ化（順序を保持）
  const groupOrder: string[] = [];
  const groups = new Map<string, RowData[]>();
  for (const r of parsedRows) {
    const key = `${r.award}\x00${r.division}`;
    if (!groups.has(key)) {
      groupOrder.push(key);
      groups.set(key, []);
    }
    groups.get(key)!.push(r);
  }

  const pool = getDb();
  const client = await pool.connect();
  const resultCategories: { id: number; name: string; description: string | null; inserted: number }[] = [];
  let totalInserted = 0;

  try {
    await client.query('BEGIN');

    const maxOrderRes = await client.query(
      `SELECT COALESCE(MAX(display_order),0) AS max FROM awards_categories WHERE event_id=$1`,
      [eventId]
    );
    let nextOrder = (maxOrderRes.rows[0].max as number) + 1;

    for (const key of groupOrder) {
      const rowGroup = groups.get(key)!;
      const [awardName, divisionName] = key.split('\x00');

      // 既存カテゴリを検索（同名+同部門）
      const existingCat = await client.query(
        `SELECT id FROM awards_categories
         WHERE event_id=$1 AND name=$2
           AND (($3 = '' AND description IS NULL) OR description=$3)`,
        [eventId, awardName, divisionName]
      );

      let categoryId: number;
      if (existingCat.rows.length > 0) {
        categoryId = existingCat.rows[0].id as number;
      } else {
        const catRes = await client.query(
          `INSERT INTO awards_categories (event_id, name, description, display_order)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [eventId, awardName, divisionName || null, nextOrder++]
        );
        categoryId = catRes.rows[0].id as number;
      }

      let inserted = 0;
      for (const r of rowGroup) {
        // ── 重複チェック (upsert) ──
        // 同 event + 同 category 内で 氏名 (name) が一致するエントリを探す。
        // 見つかれば Excel 由来の列だけ UPDATE (rank/points/own_points/photo_url/
        // photo_box_file_id/oneshot_data など運用データは保持)。
        // 見つからなければ INSERT。
        const existing = await client.query(
          `SELECT id FROM awards_entries
           WHERE event_id=$1 AND category_id=$2 AND name=$3
           LIMIT 1`,
          [eventId, categoryId, r.nameJa]
        );

        const oneshotJson = r.oneshotData ? JSON.stringify(r.oneshotData) : null;

        if (existing.rows.length > 0) {
          const existingId = existing.rows[0].id as number;
          // 既存 oneshot_data に上書きマージ (Excel に値があるキーだけ更新、
          // 残りは保持) するため `||` 演算子を使用。
          // rank / points / own_points は Excel に値がある時のみ上書き (COALESCE で既存値を保持)
          await client.query(
            `UPDATE awards_entries
             SET name_en = $1,
                 org    = $2,
                 org_en = $3,
                 image_id = $4,
                 oneshot_data = COALESCE(oneshot_data, '{}'::jsonb) || COALESCE($5::jsonb, '{}'::jsonb),
                 rank       = COALESCE($7, rank),
                 points     = COALESCE($8, points),
                 own_points = COALESCE($9, own_points),
                 is_winner  = CASE WHEN $7 IS NOT NULL THEN ($7 = 1) ELSE is_winner END,
                 updated_at = NOW()
             WHERE id = $6`,
            [r.nameEn, r.orgJa, r.orgEn, r.imageId, oneshotJson, existingId, r.rank, r.points, r.ownPoints]
          );
          inserted++;
          totalInserted++;
          continue;
        }

        await client.query(
          `INSERT INTO awards_entries
             (event_id, category_id, rank, points, own_points, name, name_en, org, org_en, image_id, is_winner, oneshot_data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
          [eventId, categoryId, r.rank, r.points, r.ownPoints, r.nameJa, r.nameEn, r.orgJa, r.orgEn, r.imageId, r.rank === 1, oneshotJson]
        );
        inserted++;
        totalInserted++;
      }
      resultCategories.push({ id: categoryId, name: awardName, description: divisionName || null, inserted });
    }

    await client.query('COMMIT');
    return { categories: resultCategories, totalInserted, skipped, warnings };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
