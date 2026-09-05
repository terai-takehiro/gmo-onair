/**
 * 案件分類の2段（客入れの有無 × 案件分類）— 画面側の言葉と組み合わせ
 *
 * ── 1段から2段にした理由 ────────────────────────────────────
 *
 * 旧 `project_type` は「ハイブリッドイベント／オフラインイベント／生放送／収録／…」の
 * 1段でした。**「客を入れるか」と「配信か収録か」という別々の軸が1つに潰れていた**ので、
 * 「有観客の収録（公開収録）」に当てはまる値が無く、みんなハイブリッドを選んでいました。
 *
 *   客入れの有無（有観客 ／ 無観客）      ← 2択ボタン
 *           ↓
 *   案件分類（配信/生放送 ／ 収録 ／ イベント（会場のみ）） ← プルダウン
 *
 * ── 値は DB と同じ集合 ──────────────────────────────────────
 *
 * `projects.audience` / `projects.project_category`（migration 182）の CHECK と
 * **同じ文字列**です。旧 `project_type` への読み替えは**サーバーだけが持ちます**
 * （`server/.../project-classification.ts`）。ここに対応表を書き写すと、
 * 片方だけ直した日から一覧と詳細で分類が食い違います。
 */

export const AUDIENCES = ['with_audience', 'no_audience'] as const;
export const PROJECT_CATEGORIES = ['broadcast', 'recording', 'event'] as const;

export type Audience = (typeof AUDIENCES)[number];
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

export const AUDIENCE_LABEL: Record<Audience, string> = {
  with_audience: '有観客',
  no_audience: '無観客',
};

/** 2択ボタンのアイコン（`lucide-react` の名前ではなく、呼ぶ側が持つ部品名） */
export const AUDIENCE_ICON: Record<Audience, 'users' | 'user-x'> = {
  with_audience: 'users',
  no_audience: 'user-x',
};

export const PROJECT_CATEGORY_LABEL: Record<ProjectCategory, string> = {
  broadcast: '配信/生放送',
  recording: '収録',
  event: 'イベント（会場のみ）',
};

/**
 * 標準工程テンプレートの鍵。**サーバーの `classificationKey()` と同じ形**
 * （`project_flow_templates.project_types` に入っている値）。
 */
export function classificationKey(audience: Audience, category: ProjectCategory): string {
  return `${audience}:${category}`;
}

/** 6通りすべて。標準工程テンプレートの「この型を使う案件の分類」が並べる */
export const CLASSIFICATION_COMBOS: { key: string; audience: Audience; category: ProjectCategory; label: string }[] =
  AUDIENCES.flatMap((a) =>
    PROJECT_CATEGORIES.map((c) => ({
      key: classificationKey(a, c),
      audience: a,
      category: c,
      label: `${AUDIENCE_LABEL[a]} ・ ${PROJECT_CATEGORY_LABEL[c]}`,
    })),
  );

/**
 * 一覧・詳細に出す1行の分類。**片方しか無いときは出さない** —
 * 「有観客」だけ書いてあると、分類が決まっているのか決めていないのか読めません。
 */
export function classificationLabel(
  audience: string | null | undefined,
  category: string | null | undefined,
): string | null {
  if (!audience || !category) return null;
  const a = AUDIENCE_LABEL[audience as Audience];
  const c = PROJECT_CATEGORY_LABEL[category as ProjectCategory];
  return a && c ? `${a} ・ ${c}` : null;
}

/**
 * 「有観客 ・ 収録 の工程の型が入ります」の1行。
 * **2つ揃ったときだけ**出します（この組み合わせが型の決定キーそのもの）。
 */
export function flowHint(
  audience: string | null | undefined,
  category: string | null | undefined,
): string | null {
  const label = classificationLabel(audience, category);
  return label ? `${label} の工程の型が入ります` : null;
}

/** 来場人数を聞くか。**無観客のときは聞かない**（人が来ないので） */
export function asksAttendees(audience: string | null | undefined): boolean {
  return audience === 'with_audience';
}
