/**
 * 案件分類の2段（客入れの有無 × 案件分類）と、旧 `project_type` の対応表
 *
 * ── ここが唯一の対応表 ──────────────────────────────────────
 *
 * migration 181 で `projects.audience` / `projects.project_category` を足しましたが、
 * **`project_type` を捨てていません**（理由は 181 の冒頭）。2つの持ち方が並ぶので、
 * 対応表を書き写すと**片方だけ直した日から一覧と詳細で分類が食い違います**。
 *
 * → **書くのはサーバーのここだけ。** 画面からは2段の値だけを受け取り、
 *   `project_type` はこの表から導いて保存します（画面に両方送らせない）。
 *
 * ── GLS-B（プロジェクト管理）は2段を持たない ────────────────
 *
 * `gmo_project` / `consulting` / `other` は工事・構築のプロジェクトで、
 * 「客入れの有無」も「配信か収録か」も意味を持ちません。**NULL のまま**にします。
 * 無理に当てはめると、集計で「無観客のイベント」として数えられます。
 */

export const AUDIENCES = ['with_audience', 'no_audience'] as const;
export const PROJECT_CATEGORIES = ['broadcast', 'recording', 'event'] as const;

export type Audience = (typeof AUDIENCES)[number];
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

export const AUDIENCE_LABEL: Record<Audience, string> = {
  with_audience: '有観客',
  no_audience: '無観客',
};

export const PROJECT_CATEGORY_LABEL: Record<ProjectCategory, string> = {
  broadcast: '配信/生放送',
  recording: '収録',
  event: 'イベント（会場のみ）',
};

/**
 * 2段 → 旧 `project_type`。**6通りすべてに行き先がある**こと。
 *
 * 旧分類は4種しかないので、いくつかは同じ値に寄ります:
 *   有観客 ＋ 配信 → ハイブリッド（客を入れて配信する = ハイブリッドそのもの）
 *   有観客 ＋ 収録 → ハイブリッド（公開収録。旧分類に受け皿が無いのでいちばん近いもの）
 *   有観客 ＋ イベント → オフラインイベント
 *   無観客 ＋ 配信 → 生放送
 *   無観客 ＋ 収録 → 収録
 *   無観客 ＋ イベント → オフラインイベント（客を入れない会場もの＝社内式典など）
 *
 * **どれも GLS-A に落ちます**（`getProjectCategory` が A 判定する4種のいずれか）。
 * ここが B に落ちる組み合わせを作ると、作った案件が案件一覧から消えます。
 */
const TO_PROJECT_TYPE: Record<string, string> = {
  'with_audience:broadcast': 'hybrid_event',
  'with_audience:recording': 'hybrid_event',
  'with_audience:event': 'offline_event',
  'no_audience:broadcast': 'live_broadcast',
  'no_audience:recording': 'recording',
  'no_audience:event': 'offline_event',
};

/** 旧 `project_type` → 2段。GLS-B の3種は `null`（2段を持たない） */
const FROM_PROJECT_TYPE: Record<string, { audience: Audience; project_category: ProjectCategory }> = {
  hybrid_event: { audience: 'with_audience', project_category: 'broadcast' },
  offline_event: { audience: 'with_audience', project_category: 'event' },
  live_broadcast: { audience: 'no_audience', project_category: 'broadcast' },
  recording: { audience: 'no_audience', project_category: 'recording' },
};

export function isAudience(v: unknown): v is Audience {
  return typeof v === 'string' && (AUDIENCES as readonly string[]).includes(v);
}

export function isProjectCategory(v: unknown): v is ProjectCategory {
  return typeof v === 'string' && (PROJECT_CATEGORIES as readonly string[]).includes(v);
}

/** 標準工程テンプレートの鍵。migration 181 が `project_types` に入れているのと同じ形 */
export function classificationKey(audience: Audience, category: ProjectCategory): string {
  return `${audience}:${category}`;
}

/** 2段が揃っているときだけ `project_type` を導く。片方でも欠けたら null（＝触らない） */
export function projectTypeOf(audience: unknown, category: unknown): string | null {
  if (!isAudience(audience) || !isProjectCategory(category)) return null;
  return TO_PROJECT_TYPE[classificationKey(audience, category)] ?? null;
}

/**
 * `project_type` から2段を埋める。**すでに2段が入っている行には使わない**こと
 * （旧分類は4種なので、有観客の収録が「有観客 ＋ 配信」に上書きされる）。
 */
export function classificationOf(projectType: unknown): { audience: Audience; project_category: ProjectCategory } | null {
  return (typeof projectType === 'string' && FROM_PROJECT_TYPE[projectType]) || null;
}

/**
 * 保存する値をまとめて決める。
 *
 * 返すのは **3つセット**（audience / project_category / project_type）で、
 * 呼ぶ側はこれをそのまま書きます。**1つだけ書き換える経路を作らないこと** —
 * 分類と種類がずれた行ができ、一覧（種類で見る画面）と詳細（2段で見る画面）で
 * 違う分類が出ます。
 *
 * @param audience  画面から来た客入れの有無（未指定なら `undefined`）
 * @param category  画面から来た案件分類（未指定なら `undefined`）
 * @param fallbackProjectType 2段が来なかったときに使う旧分類（既存値 or 画面の値）
 */
export function resolveClassification(
  audience: unknown,
  category: unknown,
  fallbackProjectType: unknown,
): { audience: Audience | null; project_category: ProjectCategory | null; project_type: string } {
  const derived = projectTypeOf(audience, category);
  if (derived) {
    return {
      audience: audience as Audience,
      project_category: category as ProjectCategory,
      project_type: derived,
    };
  }
  // 2段が来ていない（＝ GLS-B / 旧フォーム / MCP からの登録）。
  // 旧分類から埋められるなら埋める。埋められなければ2段は NULL のまま
  const type = typeof fallbackProjectType === 'string' && fallbackProjectType ? fallbackProjectType : 'other';
  const back = classificationOf(type);
  return {
    audience: back?.audience ?? null,
    project_category: back?.project_category ?? null,
    project_type: type,
  };
}
