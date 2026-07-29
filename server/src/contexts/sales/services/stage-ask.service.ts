/**
 * 進んだ段で聞く (デザイン 14章 27a/27c / 仕様書 §7.1)
 *
 * いまの案件フォームは1画面に22項目ある。**起票の瞬間に分かっているのは3つだけ**で、
 * 残りは「必要になった段」で聞けばよい。
 *
 * ── なぜ定義をここ1か所に置くか ──────────────────────────
 *
 * 「どのステージで何を聞くか」を画面とサーバーの2か所に書くと必ずずれる。
 * ずれた側が緩いほうだと、**空のまま先に進んだ案件**ができて後から埋められない
 * (誰も「聞いていない」と「入れ忘れ」を区別できなくなる)。
 * ここを正として、画面は `GET /projects/:id/stage-ask` で聞く項目を受け取り、
 * サーバーは `PATCH /projects/:id/stage` で同じ定義を使って必須を止める。
 *
 * ── 空欄の意味を変える ──────────────────────────────────
 *
 * 聞く瞬間に聞くので、**空欄は「まだその段に来ていない」を意味する**ようになる。
 * だから起票フォームに必須マークを増やす必要が無い。
 */
import { queryOne, queryAll, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';

export type StageId = 'neta' | 'd_hold' | 'c_proposal' | 'b_verbal' | 'a_won' | 's_completed' | 'e_lost';

export const STAGE_LABELS: Record<string, string> = {
  neta: 'ネタ',
  d_hold: '仮押さえ',
  c_proposal: '見積提案',
  b_verbal: '口頭決定',
  a_won: '受注',
  s_completed: '完了',
  e_lost: '失注',
};

export interface AskField {
  /** リクエストの本文とプロジェクトの列で使う名前 */
  key: string;
  label: string;
  /** date / date_range / money / rooms / check / lost_reason / text */
  kind: 'date_range' | 'money' | 'rooms' | 'check' | 'lost_reason' | 'text' | 'dates';
  /** 必須か。'conditional' は「案件による」(止めない) */
  required: 'required' | 'optional' | 'conditional';
  /** なぜここで聞くか。画面にそのまま出す */
  why: string;
}

export interface StageAsk {
  to: StageId;
  toLabel: string;
  /** 何問聞くか。「0問」のときは押すだけ */
  question: string;
  fields: AskField[];
  /** 自動で起きること。人が入れなくてよいものを明示する */
  auto: string[];
}

/**
 * ステージが上がるときに聞くこと (デザイン 27c の表そのまま)。
 * **この表にある項目だけ**をその瞬間に聞く。増やすときはここに足す。
 */
export const STAGE_ASKS: Record<string, StageAsk> = {
  d_hold: {
    to: 'd_hold',
    toLabel: '仮押さえ',
    question: 'いつ、どの部屋を押さえますか',
    fields: [
      {
        key: 'event_dates', label: '本番日 ・ リハ日', kind: 'date_range', required: 'required',
        why: '枠を取る操作なので、日付がないと予約できません',
      },
      {
        key: 'room_ids', label: '使用する部屋', kind: 'rooms', required: 'required',
        why: '同じ理由です。空いている部屋から選びます',
      },
    ],
    auto: ['スタジオの仮押さえ予約', '予定（カレンダー）への反映', '機材の出し入れの見込み'],
  },
  c_proposal: {
    to: 'c_proposal',
    toLabel: '見積提案',
    question: 'いくらで出しますか',
    fields: [
      {
        key: 'expected_amount', label: '想定金額（税抜）', kind: 'money', required: 'required',
        why: '見積を作るときに初めて金額が要ります。料金表から選べば明細から自動で入ります',
      },
      {
        key: 'extra_dates', label: '追加の日程（飛び日）', kind: 'dates', required: 'optional',
        why: '複数日になったときだけ。入れると予約が日数ぶん増えます',
      },
    ],
    auto: ['粗利の見込み', 'ヨミの集計への反映'],
  },
  b_verbal: {
    to: 'b_verbal',
    toLabel: '口頭決定',
    question: '聞くことはありません',
    fields: [],
    auto: ['次にやること「申込書をもらう」が立つ'],
  },
  a_won: {
    to: 'a_won',
    toLabel: '受注',
    question: '申込書とロゴの許諾は揃いましたか',
    fields: [
      {
        key: 'application_form', label: '申込書 受領済', kind: 'check', required: 'required',
        why: 'これが無いと請求できません',
      },
      {
        key: 'logo_permission', label: 'ロゴ使用許諾 取得済', kind: 'check', required: 'conditional',
        why: 'ロゴを出す案件のみです。出さない案件はそのままで構いません',
      },
    ],
    // **「自動で起きること」に嘘を書かない。** GLS の採番はここでは起きない
    // (案件ページの「GLS発番」から人が出す) のに自動と書いてあったため、
    // 受注にしても番号が出ず「GLS発番ができない」と読めていた。
    auto: ['見積の「仕入(見込み)」から見込み仕入を作成', '請求のしごとへの追加'],
  },
  e_lost: {
    to: 'e_lost',
    toLabel: '失注',
    question: 'なぜ決まらなかったか',
    fields: [
      {
        key: 'lost_reason', label: '失注理由', kind: 'lost_reason', required: 'required',
        why: '選ぶだけです。ふりかえりの集計に入ります',
      },
      {
        key: 'lessons_learned', label: '教訓・学び', kind: 'text', required: 'optional',
        why: 'ふりかえりの「失注の分析」に出ます。書けるときだけで構いません',
      },
    ],
    auto: ['ふりかえりの集計への反映'],
  },
  s_completed: {
    to: 's_completed',
    toLabel: '完了',
    question: '聞くことはありません',
    fields: [],
    auto: ['ふりかえりの対象になる'],
  },
};

/** 起票で聞く3つ。これ以上増やさない (27a「いま必要」) */
export const INTAKE_FIELDS = ['name', 'customer_id', 'uses_studio'] as const;

// ── 案件の性質で聞くことが変わる ──────────────────────────
//
// 上の表は**スタジオを使う案件 (A系)** を前提に書かれていた。
// しかし GMO案件・コンサルティング・その他 (B系 = プロジェクト系) には
// **スタジオのスケジュールという概念が無い**。それなのに「仮押さえ」で
// 「いつ、どの部屋を押さえますか」と部屋を必須で聞いていたため、
//   - プロジェクト系の案件はステージを1つも先に進められない (必ず 400 になる)
//   - 無理に部屋を選ぶと、スタジオを使わない案件の仮押さえ予約が
//     スタジオのカレンダーに入ってしまう (実際に入っていた)
// という2つの実害が出ていた。案件の性質を見て聞くことを変える。

/**
 * スタジオを使う案件種別 (A系)。
 * `client/src/types/index.ts` の `PROJECT_CATEGORY_A` と同じ並びにすること
 * (ずれると画面とサーバーで「仮押さえがある案件」の判定が食い違う)。
 */
const STUDIO_PROJECT_TYPES = ['offline_event', 'hybrid_event', 'live_broadcast', 'recording'];

/** 'studio' = スタジオを使う (A系) / 'project' = 使わない (B系) / 'unknown' = 決まっていない */
export type StudioUse = 'studio' | 'project' | 'unknown';

/**
 * この案件がスタジオを使うか。
 *
 * 案件分類 (gls_category) が正。v2.8.113 で登録時に必須化されたが、
 * それ以前の案件は空のことがあるので案件種別から補う。
 * どちらも分からないときは **勝手に決めずに 'unknown'** を返す
 * (勝手にスタジオ扱いにすると、また部屋を聞かれて進めなくなる)。
 */
export function resolveStudioUse(project: {
  gls_category?: unknown; project_type?: unknown;
}): StudioUse {
  const category = String(project.gls_category ?? '').toUpperCase();
  if (category === 'A') return 'studio';
  if (category === 'B') return 'project';
  const type = String(project.project_type ?? '');
  if (STUDIO_PROJECT_TYPES.includes(type)) return 'studio';
  if (type) return 'project';
  return 'unknown';
}

/** 進めない理由。**「できない」で終わらせず、何をすれば進めるかまで返す** */
export interface StageBlock {
  /** 画面がそのまま出せる日本語 1〜2 文 */
  message: string;
  /** 代わりにどのステージへ進めばよいか (あるなら) */
  suggest_stage?: StageId;
}

/**
 * このステージに進めない事情があるか (入力不足とは別)。
 *
 * 入力不足は「入れれば進める」が、こちらは **入れても進めない**もの:
 *   - プロジェクト系の案件に「仮押さえ」= 概念そのものが無い
 *   - 案件分類が未設定 = どちらの決まりで進めるか決められない (設定不備)
 *   - スタジオの部屋が1件も登録されていない = 押さえる先が無い (設定不備)
 */
export async function findStageBlock(
  project: Record<string, unknown>, toStage: string,
): Promise<StageBlock | null> {
  if (toStage !== 'd_hold') return null;

  // **案件分類を先に見る。** 未設定のときに案件種別から推測して
  // 「プロジェクト系なので仮押さえはありません」と言うと、ユーザーは
  // そう設定した覚えが無いので理由として通じない (実際に既定値の
  // project_type='other' だけでそう言ってしまっていた)。
  // 未設定は未設定として、何を設定すれば進めるかを言う。
  const category = String(project.gls_category ?? '').toUpperCase();
  const use = resolveStudioUse(project);

  if (category !== 'A' && category !== 'B') {
    const inferred = use === 'studio' ? 'スタジオを使う案件'
      : use === 'project' ? 'スタジオを使わない案件' : null;
    return {
      message:
        '案件分類（スタジオ / プロジェクト）が未設定のため、仮押さえに進めません。' +
        (inferred ? `案件種別からは${inferred}に見えます。` : '') +
        '案件編集で分類を選んでから、もう一度お試しください。',
    };
  }

  if (category === 'B') {
    return {
      message:
        'この案件はプロジェクト系（スタジオを使わない案件）なので、スタジオの「仮押さえ」はありません。' +
        '金額が決まったら「見積提案」に進めてください。',
      suggest_stage: 'c_proposal',
    };
  }
  // スタジオ案件。押さえる部屋が1つも無ければ、入力しても進めないので先に言う
  const rooms = (await queryAll(
    'SELECT id FROM studio_rooms WHERE deleted_at IS NULL LIMIT 1',
  )) as unknown[];
  if (rooms.length === 0) {
    return {
      message:
        'スタジオの部屋が1件も登録されていないため、仮押さえに進めません。' +
        '管理者に部屋の登録を依頼してください。',
    };
  }
  return null;
}

/**
 * この案件をこのステージに動かすとき、何を聞くか。
 * **すでに入っている項目は聞かない** (同じことを2度打たせない)。
 */
export async function getStageAsk(projectId: string, toStage: string) {
  const project = (await queryOne(
    `SELECT p.*, (SELECT COUNT(*) FROM studio_bookings b
                   WHERE b.project_id = p.id AND b.deleted_at IS NULL) AS booking_count
       FROM projects p WHERE p.id = ? AND p.deleted_at IS NULL`,
    [projectId]
  )) as any;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const studioUse = resolveStudioUse(project);
  const ask = STAGE_ASKS[toStage];
  if (!ask) {
    return {
      to: toStage, toLabel: STAGE_LABELS[toStage] ?? toStage,
      question: '聞くことはありません', fields: [], auto: [], filled: {}, missing: [],
      studio_use: studioUse, blocked: null,
    };
  }

  // 入れても進めない事情 (概念が無い / 設定不備) は、聞く前に返す。
  // ここで返さないと「部屋を選べと言われるが選べる部屋が無い」のような
  // 出口の無い画面になり、押しても何も起きないように見える。
  const blocked = await findStageBlock(project, toStage);
  if (blocked) {
    return {
      ...ask,
      filled: {}, room_choices: [], missing: [],
      studio_use: studioUse, blocked,
    };
  }

  const filled: Record<string, boolean> = {};
  for (const f of ask.fields) filled[f.key] = isFilled(project, f.key);

  // 部屋を聞くときは候補も一緒に返す。
  // 部屋の一覧 (`/studios/locations`) は `studio` 権限なので**営業は読めない**。
  // ステージを動かすのは営業なので、そのままでは部屋を1つも選べない
  // (32章で顧客の一覧が読めなかったのと同じ形)。選ぶのに要る id と名前だけ返す。
  let roomChoices: Array<{ id: string; name: string; location: string | null }> = [];
  if (ask.fields.some((f) => f.key === 'room_ids') && !filled.room_ids) {
    roomChoices = (await queryAll(
      `SELECT r.id, r.name, l.name AS location
         FROM studio_rooms r
         LEFT JOIN studio_locations l ON l.id = r.location_id
        WHERE r.deleted_at IS NULL
        ORDER BY l.sort_order NULLS LAST, r.sort_order, r.name`
    )) as any[];
  }

  return {
    ...ask,
    filled,
    room_choices: roomChoices,
    // まだ入っていない必須。画面はこれだけ出せばよい
    missing: ask.fields.filter((f) => f.required === 'required' && !filled[f.key]).map((f) => f.key),
    studio_use: studioUse,
    blocked: null as StageBlock | null,
  };
}

/** その項目がもう入っているか。列名とリクエストの名前が違うものはここで吸収する */
function isFilled(project: any, key: string): boolean {
  switch (key) {
    case 'event_dates': return Boolean(project.event_start);
    case 'room_ids': return Number(project.booking_count) > 0;
    case 'expected_amount': return Number(project.expected_amount) > 0;
    case 'application_form': return Number(project.application_form) === 1;
    case 'logo_permission': return Number(project.logo_permission) === 1;
    case 'lost_reason': return Boolean(project.lost_reason);
    case 'lessons_learned': return Boolean(project.lessons_learned);
    case 'extra_dates': return false; // 任意なので「入っている」判定はしない
    default: return Boolean(project[key]);
  }
}

/**
 * 必須が揃っているか確かめる。**画面だけの制限は必ず抜けるのでここでも止める。**
 * 足りないものは日本語の名前で返す (画面が「何を入れればよいか」をそのまま出せる)。
 */
export async function assertStageRequirements(
  projectId: string, toStage: string, body: Record<string, unknown>
) {
  const ask = STAGE_ASKS[toStage];
  if (!ask) return;

  const project = (await queryOne(
    `SELECT p.*, (SELECT COUNT(*) FROM studio_bookings b
                   WHERE b.project_id = p.id AND b.deleted_at IS NULL) AS booking_count
       FROM projects p WHERE p.id = ? AND p.deleted_at IS NULL`,
    [projectId]
  )) as any;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  // **入れても進めない事情は入力不足より先に言う。**
  // 「部屋が要ります」と言われても、プロジェクト系の案件には押さえる部屋が
  // そもそも無いので、入力を促すのは間違った案内になる。
  const blocked = await findStageBlock(project, toStage);
  if (blocked) throw new AppError(400, 'STAGE_NOT_APPLICABLE', blocked.message);

  const missing: string[] = [];
  for (const f of ask.fields) {
    if (f.required !== 'required') continue;
    if (isFilled(project, f.key)) continue;      // もう入っている
    if (isProvided(body, f.key)) continue;       // いま渡された
    missing.push(f.label);
  }
  if (missing.length > 0) {
    throw new AppError(
      400, 'VALIDATION_ERROR',
      `${ask.toLabel}に進めるには ${missing.join(' と ')} が要ります。${ask.question}`
    );
  }
}

function isProvided(body: Record<string, unknown>, key: string): boolean {
  switch (key) {
    case 'event_dates': return Boolean(body.event_start);
    case 'room_ids': return Array.isArray(body.room_ids) && body.room_ids.length > 0;
    case 'expected_amount': return Number(body.expected_amount) > 0;
    case 'application_form': return body.application_form === true || Number(body.application_form) === 1;
    case 'logo_permission': return body.logo_permission === true || Number(body.logo_permission) === 1;
    case 'lost_reason': return Boolean(body.lost_reason);
    default: return Boolean(body[key]);
  }
}

/**
 * 聞いた答えを案件に書く。ステージを動かす**前**に呼ぶ
 * (書いてから動かせば、`changeStage` の自動処理が入った値を見られる)。
 */
export async function applyStageAnswers(
  projectId: string, toStage: string, body: Record<string, unknown>, userId: string
) {
  const ask = STAGE_ASKS[toStage];
  if (!ask) return;

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (sql: string, v: unknown) => { sets.push(sql); params.push(v); };

  if (body.event_start) {
    push('event_start = ?', body.event_start);
    push('event_end = ?', body.event_end || body.event_start);
  }
  if (body.expected_amount !== undefined && Number(body.expected_amount) > 0) {
    push('expected_amount = ?', Math.round(Number(body.expected_amount)));
  }
  if (body.application_form !== undefined) {
    push('application_form = ?', body.application_form ? 1 : 0);
  }
  if (body.logo_permission !== undefined) {
    push('logo_permission = ?', body.logo_permission ? 1 : 0);
  }

  if (sets.length > 0) {
    await execute(
      `UPDATE projects SET ${sets.join(', ')}, updated_at = NOW(), updated_by = ? WHERE id = ?`,
      [...params, userId, projectId]
    );
  }

  // 追加の日程 (飛び日)。project_dates に足す (既にある日付は足さない)
  if (Array.isArray(body.extra_dates)) {
    for (const d of body.extra_dates as Array<{ date?: string; label?: string }>) {
      if (!d?.date) continue;
      const dup = await queryOne(
        `SELECT id FROM project_dates WHERE project_id = ? AND date = ?`, [projectId, d.date]
      );
      if (dup) continue;
      await execute(
        `INSERT INTO project_dates (id, project_id, date, label) VALUES (?, ?, ?, ?)`,
        [uuidv4(), projectId, d.date, d.label || null]
      );
    }
  }
}

/**
 * 仮押さえの部屋を予約に反映する。
 *
 * `changeStage` は日程があれば仮押さえ予約を自動で作るが、**部屋を持っていなかった**。
 * 部屋のない仮押さえは「押さえた」ことにならない (どの部屋が埋まったか分からない) ので、
 * ここで結び付ける。ステージを動かした**後**に呼ぶ (予約が出来てから紐づける)。
 */
export async function attachHoldRooms(projectId: string, roomIds: string[], userId: string) {
  if (!Array.isArray(roomIds) || roomIds.length === 0) return { attached: 0 };

  const booking = (await queryOne(
    `SELECT id FROM studio_bookings
      WHERE project_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [projectId]
  )) as any;
  if (!booking) return { attached: 0 };

  const known = (await queryAll(
    `SELECT id FROM studio_rooms WHERE id IN (${roomIds.map(() => '?').join(',')})`,
    roomIds
  )) as any[];

  let attached = 0;
  for (const r of known) {
    await execute(
      `INSERT INTO studio_booking_rooms (booking_id, room_id) VALUES (?, ?)
       ON CONFLICT (booking_id, room_id) DO NOTHING`,
      [booking.id, r.id]
    );
    attached++;
  }
  void userId;
  return { attached };
}
