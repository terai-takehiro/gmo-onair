/**
 * 香盤表 (デザイン 21章 28a / 仕様書 §7.8)
 *
 * 当日の動きを1枚にする。縦が時間、横が「誰・どの部屋」。
 *
 * ── 白紙から作らない ──────────────────────────────────
 *
 * 案件には日程・予約・Qシート・機材・メンバーが既に入っているので、
 * **最初の1枚は自動で組む**。人がやるのはそこから直すことだけ。
 * いま Excel で作っているものを画面に移すだけでは、入力が二度手間になる。
 *
 * ── 組み直しても人の手直しを消さない ────────────────────
 *
 * 自動で入った枠は `origin_kind`/`origin_id` を持つので、組み直しは
 * **その枠だけを差し替える** (人が置いた枠には触らない)。
 * 区別が無いと「組み直したら手で直した分が消えた」が起きる。
 *
 * ── 名前は1か所で直す ──────────────────────────────────
 *
 * 人のレーンは案件メンバーを指す (`member_id`)。表示名はメンバー側から引く。
 * 香盤表に名前を写すと、片方だけ直された表ができる。
 */
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';

/** 1時間の高さ (px)。30分枠でも2行が収まる寸法 (デザイン 28a) */
export const HOUR_PX = 88;

export const CATEGORIES = [
  { key: 'setup', label: '設営' },
  { key: 'rehearsal', label: 'リハーサル' },
  { key: 'performance', label: '本番' },
  { key: 'break', label: '休憩' },
  { key: 'audience', label: '客入れ・客出し' },
  { key: 'move', label: '移動' },
  { key: 'teardown', label: '撤収' },
] as const;

/** 香盤表が読む元データ。画面にそのまま出す (どこから来たかを見せる) */
export const SOURCES = [
  { from: '案件の日程', to: '本番日・リハ日・飛び日から、その日の枠を用意します' },
  { from: 'スタジオの予約', to: '部屋のレーンと、押さえている時間が入ります' },
  { from: 'Qシート', to: '本番の中の進行（開場・オープニング・表彰…）が入ります' },
  { from: '機材の貸出', to: '出庫・返却の時刻が入ります' },
  { from: '案件メンバーとパートナー', to: '人のレーンになります。名前は1か所で直します' },
] as const;

/** 社内だけのレーン。社外に出す版では外す */
const INTERNAL_LANE_HINTS = ['テクニカル', '運営'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const minOf = (t: string | Date | null): number | null => {
  if (!t) return null;
  const d = t instanceof Date ? t : new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
};

/** 分 → 「14:30」 */
export const hhmm = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

async function assertProject(projectId: string) {
  const p = (await queryOne(
    `SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL`, [projectId]
  )) as any;
  if (!p) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  return p;
}

// ───────────────────────────────────────────────────────
// 1枚を用意する
// ───────────────────────────────────────────────────────

/**
 * その日の香盤表を用意する。**同じ日を二度作らない** (冪等)。
 * 無ければ作って、そのとき自動で組む。
 */
export async function ensureCallSheet(projectId: string, sheetDate: string, userId: string) {
  await assertProject(projectId);
  if (!DATE_RE.test(sheetDate)) {
    throw new AppError(400, 'VALIDATION_ERROR', '日付は YYYY-MM-DD で指定してください');
  }

  const existing = (await queryOne(
    `SELECT * FROM call_sheets WHERE project_id = ? AND sheet_date = ? AND deleted_at IS NULL`,
    [projectId, sheetDate]
  )) as any;
  if (existing) return existing;

  const id = uuidv4();
  await execute(
    `INSERT INTO call_sheets (id, project_id, sheet_date, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?)`,
    [id, projectId, sheetDate, userId, userId]
  );
  // 作った直後に自動で組む — **白紙を見せない**
  await rebuildFromSources(id, userId);
  return (await queryOne(`SELECT * FROM call_sheets WHERE id = ?`, [id])) as any;
}

export async function listCallSheets(projectId: string) {
  await assertProject(projectId);
  return (await queryAll(
    `SELECT s.*,
            (SELECT COUNT(*) FROM call_sheet_lanes l WHERE l.call_sheet_id = s.id) AS lane_count,
            (SELECT COUNT(*) FROM call_sheet_blocks b WHERE b.call_sheet_id = s.id) AS block_count
       FROM call_sheets s
      WHERE s.project_id = ? AND s.deleted_at IS NULL
      ORDER BY s.sheet_date`,
    [projectId]
  )) as any[];
}

// ───────────────────────────────────────────────────────
// 自動で組む
// ───────────────────────────────────────────────────────

/** レーンを1本用意する (同じ名前は作らない) */
async function ensureLane(
  sheetId: string, spec: {
    kind: string; name: string; sub?: string | null;
    room_id?: string | null; member_id?: string | null; sort_order: number;
  }
): Promise<string> {
  const found = (await queryOne(
    `SELECT id FROM call_sheet_lanes WHERE call_sheet_id = ? AND name = ?`,
    [sheetId, spec.name]
  )) as any;
  if (found) return String(found.id);

  const id = uuidv4();
  await execute(
    `INSERT INTO call_sheet_lanes (id, call_sheet_id, kind, name, sub, room_id, member_id, internal_only, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, sheetId, spec.kind, spec.name, spec.sub ?? null, spec.room_id ?? null, spec.member_id ?? null,
     INTERNAL_LANE_HINTS.some((h) => spec.name.includes(h)), spec.sort_order]
  );
  return id;
}

/** 自動で入る枠を1つ置く。**同じ元データからは1つだけ** (組み直しても増えない) */
async function putAutoBlock(
  sheetId: string, laneId: string, b: {
    label: string; start_min: number; end_min: number | null; category: string;
    origin_kind: string; origin_id: string; note?: string | null;
  }
) {
  await execute(
    `INSERT INTO call_sheet_blocks
       (id, call_sheet_id, lane_id, label, start_min, end_min, category, source, origin_kind, origin_id, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'auto', ?, ?, ?)
     -- 索引が部分 (WHERE origin_kind IS NOT NULL) なので、同じ条件を書かないと
     -- Postgres が索引を特定できない (42P10)
     ON CONFLICT (call_sheet_id, origin_kind, origin_id) WHERE origin_kind IS NOT NULL
     DO UPDATE SET lane_id = EXCLUDED.lane_id, label = EXCLUDED.label,
                   start_min = EXCLUDED.start_min, end_min = EXCLUDED.end_min,
                   category = EXCLUDED.category, note = EXCLUDED.note, updated_at = NOW()`,
    [uuidv4(), sheetId, laneId, b.label, b.start_min, b.end_min, b.category,
     b.origin_kind, b.origin_id, b.note ?? null]
  );
}

/**
 * 元データから組み直す。
 * **人が置いた枠 (source='manual') には触らない** — 手直しを消さないため。
 */
export async function rebuildFromSources(sheetId: string, userId: string) {
  const sheet = (await queryOne(
    `SELECT * FROM call_sheets WHERE id = ? AND deleted_at IS NULL`, [sheetId]
  )) as any;
  if (!sheet) throw new AppError(404, 'NOT_FOUND', '香盤表が見つかりません');
  const day = String(sheet.sheet_date);
  let order = 0;

  // ① スタジオの予約 → 部屋のレーンと枠
  const bookings = (await queryAll(
    `SELECT b.id, b.title, b.booking_type, b.start_time, b.end_time, b.all_day,
            COALESCE((SELECT string_agg(r.name, ' / ' ORDER BY r.name)
                        FROM studio_booking_rooms br JOIN studio_rooms r ON r.id = br.room_id
                       WHERE br.booking_id = b.id), '') AS rooms,
            (SELECT br.room_id FROM studio_booking_rooms br WHERE br.booking_id = b.id LIMIT 1) AS room_id
       FROM studio_bookings b
      WHERE b.project_id = ? AND b.deleted_at IS NULL
        -- start_time は TEXT ("2026-11-14 14:30" の形) なので先頭10文字で日を見る
        AND LEFT(b.start_time, 10) = ?
      ORDER BY b.start_time`,
    [sheet.project_id, day]
  )) as any[];

  const CATEGORY_OF_BOOKING: Record<string, string> = {
    performance: 'performance', rehearsal: 'rehearsal', setup: 'setup',
    // **仮押さえは「本番」として写さない**。まだ確定していないものを香盤表で本番と
    // 同じ色で出すと、当日の動きを決める人が確定済みだと読む。題名からも種別を外した
    // (v3.1.2) ので、色が同じだと手掛かりが1つも無くなる。'hold' の見た目は
    // 別区分にして、下の label にも種別を前置する。
    hold: 'hold', tour: 'audience', consultation: 'break',
    maintenance: 'setup', internal: 'setup', other: 'setup',
  };
  /** 香盤表のブロックに出す種別の前置。確定していないものだけ付ける */
  const TENTATIVE_PREFIX: Record<string, string> = { hold: '仮押さえ', consultation: '相談' };

  for (const b of bookings) {
    // 部屋が決まっていない予約は「会場（部屋未定）」に寄せる — 落とすと当日の動きが抜ける
    const laneName = b.rooms || '会場（部屋未定）';
    const laneId = await ensureLane(sheetId, {
      kind: 'room', name: laneName, sub: b.rooms ? null : '部屋が決まっていません',
      room_id: b.room_id ?? null, sort_order: order++,
    });
    const s = minOf(b.start_time), e = minOf(b.end_time);
    if (s == null) continue;
    await putAutoBlock(sheetId, laneId, {
      label: `${TENTATIVE_PREFIX[String(b.booking_type)] ? `【${TENTATIVE_PREFIX[String(b.booking_type)]}】` : ''}${b.title || '予約'}`,
      start_min: b.all_day ? 0 : s,
      end_min: b.all_day ? 24 * 60 : e, category: CATEGORY_OF_BOOKING[String(b.booking_type)] ?? 'setup',
      origin_kind: 'studio_booking', origin_id: String(b.id),
    });
  }

  // ② Qシート → 本番の中の進行
  const qsheets = (await queryAll(
    `SELECT id, title, data FROM qsheet_documents
      WHERE project_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1`,
    [sheet.project_id]
  )) as any[];
  if (qsheets.length > 0) {
    const laneId = await ensureLane(sheetId, {
      kind: 'group', name: '進行（Qシート）', sub: qsheets[0].title ?? null, sort_order: order++,
    });
    // Qシートの中身は JSONB。行の形が版で違うので、時刻と項目名が読めるものだけ拾う
    const rows: any[] = extractQsheetRows(qsheets[0].data);
    for (const r of rows) {
      if (r.start_min == null) continue;
      await putAutoBlock(sheetId, laneId, {
        label: r.label, start_min: r.start_min, end_min: r.end_min,
        category: 'performance', origin_kind: 'qsheet', origin_id: `${qsheets[0].id}:${r.key}`,
      });
    }
  }

  // ③ 機材の貸出 → 出庫・返却の時刻
  const lendings = (await queryAll(
    `SELECT l.id, l.lent_at, l.due_date, e.name AS equipment_name
       FROM equipment_lendings l
       LEFT JOIN equipment_items e ON e.id = l.equipment_id
      WHERE l.project_id = ? AND (l.lent_at LIKE ? OR l.due_date LIKE ?)`,
    [sheet.project_id, `${day}%`, `${day}%`]
  )) as any[];
  if (lendings.length > 0) {
    const laneId = await ensureLane(sheetId, {
      kind: 'group', name: '機材の出し入れ', sort_order: order++,
    });
    for (const l of lendings) {
      const out = String(l.lent_at ?? '').startsWith(day) ? minOf(l.lent_at) : null;
      const back = String(l.due_date ?? '').startsWith(day) ? minOf(l.due_date) : null;
      if (out != null) {
        await putAutoBlock(sheetId, laneId, {
          label: `出庫 ${l.equipment_name ?? ''}`.trim(), start_min: out, end_min: out + 30,
          category: 'setup', origin_kind: 'equipment_out', origin_id: String(l.id),
        });
      }
      if (back != null) {
        await putAutoBlock(sheetId, laneId, {
          label: `返却 ${l.equipment_name ?? ''}`.trim(), start_min: back, end_min: back + 30,
          category: 'teardown', origin_kind: 'equipment_back', origin_id: String(l.id),
        });
      }
    }
  }

  // ④ 案件メンバーとパートナー → 人のレーン (枠は人が置く)
  const members = (await queryAll(
    `SELECT id, member_name, role, is_external FROM project_members
      WHERE project_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at`,
    [sheet.project_id]
  )) as any[];
  for (const m of members) {
    await ensureLane(sheetId, {
      kind: 'person', name: String(m.member_name),
      sub: m.role ? String(m.role) : (m.is_external ? '外部' : null),
      member_id: String(m.id), sort_order: order++,
    });
  }

  await execute(`UPDATE call_sheets SET updated_at = NOW(), updated_by = ? WHERE id = ?`, [userId, sheetId]);
  return getCallSheet(sheetId);
}

/**
 * Qシートの JSONB から「時刻つきの行」だけを拾う。
 * 版によって形が違うので、**読めなかったものは黙って落とす** (落ちても香盤表は成立する)。
 */
function extractQsheetRows(data: unknown): Array<{ key: string; label: string; start_min: number | null; end_min: number | null }> {
  const out: Array<{ key: string; label: string; start_min: number | null; end_min: number | null }> = [];
  const asMin = (v: unknown): number | null => {
    if (typeof v !== 'string') return null;
    const m = v.match(/^(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const walk = (node: any, path: string) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((n, i) => walk(n, `${path}.${i}`));
      return;
    }
    const t = asMin(node.time ?? node.start ?? node.start_time);
    const label = node.title ?? node.label ?? node.item ?? node.name;
    if (t != null && typeof label === 'string' && label.trim()) {
      const dur = Number(node.duration ?? node.length ?? 0);
      out.push({
        key: path, label: label.trim(), start_min: t,
        end_min: Number.isFinite(dur) && dur > 0 ? t + Math.round(dur / 60) : null,
      });
    }
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
  };
  walk(data, 'q');
  return out.slice(0, 60); // 1枚に載る量に切る (それ以上は Qシート側で見る)
}

// ───────────────────────────────────────────────────────
// 読む
// ───────────────────────────────────────────────────────

/**
 * 1枚を返す。**重なっているところ**も一緒に返す —
 * 画面で判定すると、印刷とPDFで違う警告が出る。
 */
export async function getCallSheet(sheetId: string) {
  const sheet = (await queryOne(
    `SELECT s.*, p.name AS project_name, p.gls_number
       FROM call_sheets s JOIN projects p ON p.id = s.project_id
      WHERE s.id = ? AND s.deleted_at IS NULL`,
    [sheetId]
  )) as any;
  if (!sheet) throw new AppError(404, 'NOT_FOUND', '香盤表が見つかりません');

  const lanes = (await queryAll(
    `SELECT l.*, COALESCE(m.member_name, l.name) AS display_name
       FROM call_sheet_lanes l
       LEFT JOIN project_members m ON m.id = l.member_id AND m.deleted_at IS NULL
      WHERE l.call_sheet_id = ?
      ORDER BY l.sort_order, l.created_at`,
    [sheetId]
  )) as any[];

  const blocks = (await queryAll(
    `SELECT * FROM call_sheet_blocks WHERE call_sheet_id = ? ORDER BY start_min, created_at`,
    [sheetId]
  )) as any[];

  return {
    ...sheet,
    hour_px: HOUR_PX,
    categories: CATEGORIES,
    sources: SOURCES,
    lanes: lanes.map((l) => ({
      ...l,
      // 名前はメンバー側が正 (香盤表に写さない)
      name: String(l.display_name),
      internal_only: Boolean(l.internal_only),
      visible: Boolean(l.visible),
    })),
    blocks: blocks.map((b) => ({
      ...b,
      start_label: hhmm(Number(b.start_min)),
      end_label: b.end_min == null ? null : hhmm(Number(b.end_min)),
    })),
    warnings: findWarnings(sheet, lanes, blocks),
  };
}

/**
 * 重なっているところを探す。デザイン 28a の3種類:
 *  - 同じ人が2か所に置かれている
 *  - 本番の枠が Qシートの合計尺より短い
 *  - 撤収が完全退館の時刻をまたいでいる
 */
export function findWarnings(sheet: any, lanes: any[], blocks: any[]): string[] {
  const w: string[] = [];
  const laneOf = new Map(lanes.map((l) => [String(l.id), l]));

  // ① 同じレーン (人) の中で時間が重なっている
  const byLane = new Map<string, any[]>();
  for (const b of blocks) {
    const k = String(b.lane_id);
    if (!byLane.has(k)) byLane.set(k, []);
    byLane.get(k)!.push(b);
  }
  for (const [laneId, bs] of byLane) {
    const lane = laneOf.get(laneId);
    if (!lane || lane.kind !== 'person') continue;  // 部屋は同時に複数の作業が走る
    const sorted = [...bs].sort((a, b) => Number(a.start_min) - Number(b.start_min));
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = Number(sorted[i - 1].end_min ?? sorted[i - 1].start_min);
      if (Number(sorted[i].start_min) < prevEnd) {
        w.push(`同じ人が2か所に置かれています（${lane.name}・${hhmm(Number(sorted[i].start_min))}）`);
        break; // 1レーンにつき1件だけ言う (同じ話を何度も出さない)
      }
    }
  }

  // ② 本番の枠が Qシートの進行の合計より短い
  const perf = blocks.filter((b) => b.category === 'performance' && b.origin_kind === 'studio_booking');
  const q = blocks.filter((b) => b.origin_kind === 'qsheet');
  if (perf.length > 0 && q.length > 0) {
    const perfMin = perf.reduce((s, b) => s + Math.max(0, Number(b.end_min ?? b.start_min) - Number(b.start_min)), 0);
    const qMin = q.reduce((s, b) => s + Math.max(0, Number(b.end_min ?? b.start_min) - Number(b.start_min)), 0);
    if (qMin > perfMin) {
      w.push(`本番の枠がQシートの合計尺より ${qMin - perfMin}分 短いです`);
    }
  }

  // ③ 撤収が完全退館の時刻をまたいでいる
  if (sheet.venue_close) {
    const close = (() => {
      const m = String(sheet.venue_close).match(/^(\d{1,2}):(\d{2})/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    })();
    if (close != null) {
      for (const b of blocks) {
        if (b.category !== 'teardown') continue;
        if (Number(b.end_min ?? b.start_min) > close) {
          w.push(`撤収が完全退館の時刻をまたいでいます（${sheet.venue_close}）`);
          break;
        }
      }
    }
  }

  return w;
}

// ───────────────────────────────────────────────────────
// 直す
// ───────────────────────────────────────────────────────

export async function upsertBlock(
  sheetId: string, body: {
    id?: string; lane_id?: string; label?: string;
    start_min?: number; end_min?: number | null; category?: string; note?: string | null;
  }
) {
  const sheet = await queryOne(`SELECT id FROM call_sheets WHERE id = ? AND deleted_at IS NULL`, [sheetId]);
  if (!sheet) throw new AppError(404, 'NOT_FOUND', '香盤表が見つかりません');

  if (body.id) {
    const row = await queryOne(
      `SELECT id FROM call_sheet_blocks WHERE id = ? AND call_sheet_id = ?`, [body.id, sheetId]);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'その枠は見つかりません');
    await execute(
      `UPDATE call_sheet_blocks
          SET lane_id = COALESCE(?, lane_id), label = COALESCE(?, label),
              start_min = COALESCE(?, start_min), end_min = ?,
              category = COALESCE(?, category), note = ?, updated_at = NOW()
        WHERE id = ?`,
      [body.lane_id ?? null, body.label ?? null,
       body.start_min ?? null, body.end_min ?? null,
       body.category ?? null, body.note ?? null, body.id]
    );
    return getCallSheet(sheetId);
  }

  if (!body.lane_id) throw new AppError(400, 'VALIDATION_ERROR', 'どのレーンに置くか選んでください');
  if (!body.label?.trim()) throw new AppError(400, 'VALIDATION_ERROR', '何をするかを入れてください');
  if (body.start_min == null) throw new AppError(400, 'VALIDATION_ERROR', '始まりの時刻を入れてください');

  await execute(
    `INSERT INTO call_sheet_blocks (id, call_sheet_id, lane_id, label, start_min, end_min, category, source, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?)`,
    [uuidv4(), sheetId, body.lane_id, body.label.trim(),
     Math.max(0, Math.round(Number(body.start_min))),
     body.end_min == null ? null : Math.round(Number(body.end_min)),
     body.category ?? 'setup', body.note ?? null]
  );
  return getCallSheet(sheetId);
}

export async function deleteBlock(sheetId: string, blockId: string) {
  const row = await queryOne(
    `SELECT id FROM call_sheet_blocks WHERE id = ? AND call_sheet_id = ?`, [blockId, sheetId]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'その枠は見つかりません');
  await execute(`DELETE FROM call_sheet_blocks WHERE id = ?`, [blockId]);
  return getCallSheet(sheetId);
}

/** レーンの出し入れ。**消さずに隠す** — 消すと置いた枠も消える */
export async function setLaneVisible(sheetId: string, laneId: string, visible: boolean) {
  const row = await queryOne(
    `SELECT id FROM call_sheet_lanes WHERE id = ? AND call_sheet_id = ?`, [laneId, sheetId]);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'そのレーンは見つかりません');
  await execute(`UPDATE call_sheet_lanes SET visible = ? WHERE id = ?`, [visible, laneId]);
  return getCallSheet(sheetId);
}

export async function updateSheet(
  sheetId: string, body: { title?: string; start_hour?: number; end_hour?: number; venue_close?: string | null },
  userId: string
) {
  const sheet = await queryOne(`SELECT id FROM call_sheets WHERE id = ? AND deleted_at IS NULL`, [sheetId]);
  if (!sheet) throw new AppError(404, 'NOT_FOUND', '香盤表が見つかりません');
  await execute(
    `UPDATE call_sheets
        SET title = COALESCE(?, title),
            start_hour = COALESCE(?, start_hour), end_hour = COALESCE(?, end_hour),
            venue_close = ?, updated_at = NOW(), updated_by = ?
      WHERE id = ?`,
    [body.title ?? null,
     body.start_hour ?? null, body.end_hour ?? null,
     body.venue_close ?? null, userId, sheetId]
  );
  return getCallSheet(sheetId);
}

// ───────────────────────────────────────────────────────
// 計時LIVE に渡す
// ───────────────────────────────────────────────────────

/**
 * 選んだ枠を計時LIVEのタイマーにする。**枠の長さがそのまま尺**になる。
 * 当日タイマーを作り直さないための経路。
 * 同じ名前のタイマーは作り直さない (二度押しても増えない)。
 */
export async function sendBlocksToTimer(sheetId: string, blockIds: string[], userId: string) {
  const sheet = (await queryOne(
    `SELECT * FROM call_sheets WHERE id = ? AND deleted_at IS NULL`, [sheetId])) as any;
  if (!sheet) throw new AppError(404, 'NOT_FOUND', '香盤表が見つかりません');
  if (!Array.isArray(blockIds) || blockIds.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'タイマーにする枠を選んでください');
  }

  const blocks = (await queryAll(
    `SELECT * FROM call_sheet_blocks
      WHERE call_sheet_id = ? AND id IN (${blockIds.map(() => '?').join(',')})
      ORDER BY start_min`,
    [sheetId, ...blockIds]
  )) as any[];

  const made: Array<{ label: string; seconds: number }> = [];
  for (const b of blocks) {
    const len = Number(b.end_min ?? 0) - Number(b.start_min);
    if (!(len > 0)) continue;   // 終わりの無い枠は尺が出ないので渡さない
    const seconds = len * 60;
    const existing = (await queryOne(
      `SELECT id FROM liveops_timers WHERE project_id = ? AND name = ?`,
      [sheet.project_id, b.label]
    )) as any;
    if (existing) {
      await execute(
        `UPDATE liveops_timers SET total_seconds = ?, remaining_ms = ?, updated_at = NOW() WHERE id = ?`,
        [seconds, seconds * 1000, existing.id]
      );
    } else {
      await execute(
        `INSERT INTO liveops_timers (name, project_id, total_seconds, remaining_ms, running, created_by)
         VALUES (?, ?, ?, ?, FALSE, ?)`,
        [b.label, sheet.project_id, seconds, seconds * 1000, userId]
      );
    }
    made.push({ label: String(b.label), seconds });
  }

  if (made.length === 0) {
    throw new AppError(
      400, 'VALIDATION_ERROR',
      '選んだ枠に終わりの時刻が入っていないので、タイマーの尺が決まりません。終わりの時刻を入れてください'
    );
  }
  return { made, count: made.length };
}
