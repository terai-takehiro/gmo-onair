/**
 * お試し（練習が実績に混ざらない）— デザイン 25章
 *
 * ── なにが問題だったか ──────────────────────────────────
 *
 * 新しく入った人や、はじめて見積を作る人が**練習する場所が無かった**。
 * いまは本物の案件を作って試し、あとで消している。だから
 *
 *  - 消し忘れた練習が**案件一覧に並ぶ**
 *  - 練習で入れた金額が**売上・粗利・月次の数字に入る**
 *  - 練習の予約が**スタジオのカレンダーに出る**（他の人には本物と区別が付かない）
 *
 * ── 決めたこと ──────────────────────────────────────────
 *
 * ①**道具は本物と同じものを使う**。練習用の見積画面・練習用の香盤表を別に作ると、
 *   練習で通った道と本番で通る道が違うので**練習の意味が無くなる**。
 *   案件に印を1つ付けるだけにして、通り道は1本のままにする。
 *
 * ②**数字は数える側で外す**（案件一覧・売上・粗利・月次・ヨミ・ダッシュボード）。
 *
 * ③**外に出るものは作らせない**。ここがこの章のいちばん大事なところ。
 *   数える側で外すやり方は「1か所忘れると黙って混ざる」ので、
 *   **他の人が見るものを作る操作そのものを止める**:
 *     - スタジオの予約（カレンダーに出る）
 *     - 計時LIVEのタイマー（当日の画面に出る）
 *     - GLS の発番（番号を1本使ってしまう）
 *     - BOX のフォルダ（共有フォルダにゴミが残る）
 *     - 請求書（番号を採ってしまう）
 *   止めるほうが安全なのは、**忘れたときの出方が違う**から。
 *   読む側を1か所忘れると「練習の金額が黙って数字に入る」が、
 *   書く側を1か所忘れると「練習の予約が出てしまった」と**その場で見える**。
 *
 * ④**お試しは本物にできない**。「これを本物にする」を作ると、練習で入れた金額や
 *   日程がそのまま実績に入る道ができてしまう。画面にもそう書く。
 *
 * ⑤**片づけるのは人が押す**。自動で消すと「作りかけの練習が朝には消えていた」
 *   が起きる。何日前のものかを出して、押せば消える形にした。
 */
import { v4 as uuidv4 } from 'uuid';
import { execute, queryAll, queryOne } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateSequenceNumber } from '../../../shared/services/sequence.service';

/** お試しのお客様の名前 (本物のお客様一覧には出さない) */
export const SANDBOX_CUSTOMER_NAME = 'お試し用（練習）';

/** 何日たったものを「古いお試し」と出すか */
export const SANDBOX_STALE_DAYS = 30;

/** お試しで試せる道具。**本物と同じ画面**に入る */
export const SANDBOX_TOOLS = [
  { key: 'money', label: 'お金の数字', what: '想定金額・確定売上・仕入・粗利の見え方',
    path: '/sales/projects/{id}' },
  { key: 'estimate', label: '見積をつくる', what: '料金表から組んで粗利をその場で見る',
    path: '/sales/projects/{id}/estimates' },
  { key: 'call_sheet', label: '香盤表', what: '当日の動きを1枚にする（枠を置く練習）',
    path: '/sales/projects/{id}/call-sheet' },
  { key: 'manual', label: '運営マニュアル', what: '部品を作って1冊に束ねる',
    path: '/sales/projects/{id}/manual' },
  { key: 'docs', label: '書類のそろい方', what: '何が足りないかが期日順に並ぶ',
    path: '/sales/projects/{id}' },
] as const;

/**
 * お試しの案件ではできないこと。**他の人が見るものを作る操作**。
 * 画面にも一覧で出す（できないことを黙っていると、押して失敗して理由が分からない）。
 */
export const SANDBOX_BLOCKED = [
  { key: 'booking', label: 'スタジオの予約', why: 'カレンダーに出て、他の人には本物と区別が付きません' },
  { key: 'timer', label: '計時LIVEのタイマー', why: '当日の画面に出ます' },
  { key: 'gls', label: 'GLSの発番', why: '番号を1本使ってしまいます' },
  { key: 'box', label: 'BOXのフォルダ', why: '共有フォルダに練習のフォルダが残ります' },
  { key: 'invoice', label: '請求書', why: '請求書の番号を採ってしまいます' },
] as const;

type BlockedKey = (typeof SANDBOX_BLOCKED)[number]['key'];

/** お試しの案件かどうか */
export async function isSandboxProject(projectId: string): Promise<boolean> {
  const row = (await queryOne(
    `SELECT is_sandbox FROM projects WHERE id = ? AND deleted_at IS NULL`, [projectId])) as any;
  return Boolean(row?.is_sandbox);
}

/**
 * お試しの案件では止める。**書く側で止める**のがこの章の要点
 * (読む側を1か所忘れると黙って混ざるが、書く側なら「出てしまった」と見える)。
 */
export async function assertNotSandbox(projectId: string | null | undefined, what: BlockedKey) {
  if (!projectId) return;
  if (!(await isSandboxProject(projectId))) return;
  const def = SANDBOX_BLOCKED.find((b) => b.key === what);
  throw new AppError(
    400, 'SANDBOX_BLOCKED',
    `お試しの案件では${def?.label ?? 'この操作'}を作れません。${def?.why ?? ''}`,
  );
}

/** お試し用のお客様を1つだけ持つ (毎回作らない) */
async function ensureSandboxCustomer(userId: string): Promise<string> {
  const found = (await queryOne(
    `SELECT id FROM customers WHERE is_sandbox = TRUE AND deleted_at IS NULL LIMIT 1`)) as any;
  if (found) return String(found.id);
  const id = uuidv4();
  await execute(
    `INSERT INTO customers (id, name, short_name, is_sandbox, created_by)
     VALUES (?, ?, 'お試し', TRUE, ?)`,
    [id, SANDBOX_CUSTOMER_NAME, userId]);
  return id;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * お試しをはじめる。**白紙から作らない** — 練習にならないので、
 * 日程とメンバーだけ先に入れておく。
 *
 * **予約は作らない**。予約はカレンダーに出るので、お試しでは触れない
 * (香盤表は「部屋が決まっていません」の状態から練習できる)。
 */
export async function startSandbox(userId: string, userName?: string) {
  const customerId = await ensureSandboxCustomer(userId);
  const id = uuidv4();
  const code = await generateSequenceNumber('opp_code', 'OPP');

  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  await execute(
    `INSERT INTO projects
       (id, code, name, customer_id, stage, project_type, gls_category, expected_amount,
        assigned_to, event_start, event_end, notes, application_form, logo_permission,
        is_sandbox, created_by)
     VALUES (?, ?, ?, ?, 'a_won', 'other', 'A', 3000000, ?, ?, ?, ?, 0, 0, TRUE, ?)`,
    [id, code, 'お試し（練習用）', customerId, userId, ymd(start), ymd(end),
     'これは練習用の案件です。数字には入りません。', userId]);

  // 日程 (案件の中だけに入る。カレンダーには出ない)
  for (const [d, label] of [[ymd(start), '本番'], [ymd(end), '予備日']] as const) {
    await execute(
      `INSERT INTO project_dates (id, project_id, date, label) VALUES (?, ?, ?, ?)`,
      [uuidv4(), id, d, label]).catch(() => { /* 日程が入らなくても練習は始められる */ });
  }

  // メンバー (香盤表の人のレーンがここから出る)
  const members: Array<[string, string]> = [
    [userName || 'あなた', 'プロデューサー'],
    ['練習 ディレクター', 'ディレクター'],
    ['練習 テクニカル', 'テクニカル'],
  ];
  for (const [name, role] of members) {
    await execute(
      `INSERT INTO project_members (id, project_id, member_name, role, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), id, name, role, userId]).catch(() => { /* 同上 */ });
  }

  return getSandbox(id);
}

/** お試し1件の中身 */
export async function getSandbox(projectId: string) {
  const p = (await queryOne(
    `SELECT p.id, p.code, p.name, p.stage, p.event_start, p.event_end, p.created_at,
            p.is_sandbox, c.name AS customer_name
       FROM projects p LEFT JOIN customers c ON c.id = p.customer_id
      WHERE p.id = ? AND p.deleted_at IS NULL`, [projectId])) as any;
  if (!p) throw new AppError(404, 'NOT_FOUND', 'そのお試しは見つかりません');
  if (!p.is_sandbox) {
    throw new AppError(400, 'VALIDATION_ERROR', 'これはお試しの案件ではありません');
  }
  const days = Math.floor(
    (Date.now() - new Date(p.created_at).getTime()) / 86_400_000);
  return {
    id: String(p.id), code: p.code, name: String(p.name), stage: String(p.stage),
    customer_name: p.customer_name ?? null,
    event_start: p.event_start ?? null, event_end: p.event_end ?? null,
    created_at: p.created_at, days_old: days,
    stale: days >= SANDBOX_STALE_DAYS,
    tools: SANDBOX_TOOLS.map((t) => ({ ...t, path: t.path.replace('{id}', String(p.id)) })),
    blocked: SANDBOX_BLOCKED,
  };
}

/** 自分のお試しの一覧 (人ごと。他人の練習は出さない) */
export async function listSandboxes(userId: string) {
  const rows = (await queryAll(
    `SELECT p.id, p.name, p.created_at, p.event_start,
            (SELECT COUNT(*) FROM revenues r
              WHERE r.project_id = p.id AND r.status = 'estimate' AND r.deleted_at IS NULL) AS estimates,
            (SELECT COUNT(*) FROM call_sheets s WHERE s.project_id = p.id) AS call_sheets,
            (SELECT COUNT(*) FROM manuals m WHERE m.project_id = p.id) AS manuals
       FROM projects p
      WHERE p.is_sandbox = TRUE AND p.deleted_at IS NULL AND p.created_by = ?
      ORDER BY p.created_at DESC`, [userId])) as any[];

  return {
    items: rows.map((r) => {
      const days = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86_400_000);
      return {
        id: String(r.id), name: String(r.name),
        created_at: r.created_at, days_old: days, stale: days >= SANDBOX_STALE_DAYS,
        event_start: r.event_start ?? null,
        // 何を試したか (片づける前に見る)
        tried: [
          Number(r.estimates) > 0 ? '見積' : null,
          Number(r.call_sheets) > 0 ? '香盤表' : null,
          Number(r.manuals) > 0 ? '運営マニュアル' : null,
        ].filter(Boolean) as string[],
      };
    }),
    stale_days: SANDBOX_STALE_DAYS,
    tools: SANDBOX_TOOLS,
    blocked: SANDBOX_BLOCKED,
    // **本物にはできない**ことを画面に出すために返す
    cannot_promote: 'お試しは本物の案件にできません。本物は「案件をつくる」から始めてください',
  };
}

/**
 * 片づける。**練習で作ったものごと消す** (残すと次に開いたときに混ざる)。
 *
 * 本物の案件をここから消せないように、**お試しでなければ 400 で止める**
 * (id を差し替えて本物を消す経路にしない)。
 */
export async function cleanupSandbox(projectId: string, userId: string) {
  const p = (await queryOne(
    `SELECT id, is_sandbox, created_by FROM projects WHERE id = ? AND deleted_at IS NULL`,
    [projectId])) as any;
  if (!p) throw new AppError(404, 'NOT_FOUND', 'そのお試しは見つかりません');
  if (!p.is_sandbox) {
    throw new AppError(400, 'VALIDATION_ERROR', 'お試しではない案件はここから消せません');
  }

  // 練習で作ったものを先に消す (FK の順)
  const manual = (await queryOne(`SELECT id FROM manuals WHERE project_id = ?`, [projectId])
    .catch(() => null)) as any;
  if (manual) {
    await execute(`DELETE FROM manual_issues WHERE manual_id = ?`, [manual.id]).catch(() => {});
    await execute(
      `DELETE FROM manual_layout_items WHERE layout_id IN
         (SELECT id FROM manual_layouts WHERE manual_id = ?)`, [manual.id]).catch(() => {});
    await execute(`DELETE FROM manual_layouts WHERE manual_id = ?`, [manual.id]).catch(() => {});
    await execute(`DELETE FROM manual_parts WHERE manual_id = ?`, [manual.id]).catch(() => {});
    await execute(`DELETE FROM manuals WHERE id = ?`, [manual.id]).catch(() => {});
  }
  await execute(
    `DELETE FROM call_sheet_blocks WHERE call_sheet_id IN
       (SELECT id FROM call_sheets WHERE project_id = ?)`, [projectId]).catch(() => {});
  await execute(
    `DELETE FROM call_sheet_lanes WHERE call_sheet_id IN
       (SELECT id FROM call_sheets WHERE project_id = ?)`, [projectId]).catch(() => {});
  await execute(`DELETE FROM call_sheets WHERE project_id = ?`, [projectId]).catch(() => {});
  await execute(
    `DELETE FROM revenue_items WHERE revenue_id IN
       (SELECT id FROM revenues WHERE project_id = ?)`, [projectId]).catch(() => {});
  await execute(`DELETE FROM revenues WHERE project_id = ?`, [projectId]).catch(() => {});
  await execute(`DELETE FROM purchases WHERE project_id = ?`, [projectId]).catch(() => {});
  await execute(`DELETE FROM project_members WHERE project_id = ?`, [projectId]).catch(() => {});
  await execute(`DELETE FROM project_dates WHERE project_id = ?`, [projectId]).catch(() => {});
  await execute(`DELETE FROM tasks WHERE project_id = ?`, [projectId]).catch(() => {});
  await execute(`DELETE FROM project_changes WHERE project_id = ?`, [projectId]).catch(() => {});
  await execute(`DELETE FROM project_comments WHERE project_id = ?`, [projectId]).catch(() => {});
  await execute(`DELETE FROM projects WHERE id = ? AND is_sandbox = TRUE`, [projectId]);

  return { removed: true, by: userId };
}
