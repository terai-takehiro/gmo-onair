/**
 * 案件の「書類」タブ — そろっていないものが期日順に並ぶ (デザイン 15章)
 *
 * ── なにが問題だったか ──────────────────────────────────
 *
 * 1つの案件で必要な紙・データは12種あるのに、**どこに何が揃っているかを
 * 人が覚えていた**。申込書は案件フォーム、見積は売上、Qシートは別アプリ、
 * 香盤表と運営マニュアルはまた別、カードの返却は日常業務。
 * 「いま何が足りないか」を知るには**7つの画面を順に開く**しかなかった。
 *
 * 抜けは決まった形で出る:
 *  - 申込書をもらわないまま本番日が来る
 *  - 仮押さえのまま本予約に切り替える期限が過ぎる
 *  - **セキュリティカードが返ってこない**（貸した本人しか知らない）
 *  - 請求書を出したのに検収書を出していない
 *
 * ── 決めたこと ──────────────────────────────────────────
 *
 * ①**12種の定義はコードに置く**。DB に置くと「種類が変わったのか、この案件だけ
 *   違うのか」が区別できなくなる（22章 運営マニュアルの部品と同じ判断）。
 *
 * ②**そろったかどうかを人に押させない**。元データがあるかで判定する。
 *   人が「できました」を押す形にすると、押し忘れが「足りない」として残り、
 *   逆に押しただけで実物が無い状態も作れてしまう。
 *
 * ③**期日順に並べる**。「足りないもの」を種類順に並べても動けない。
 *   期日が近いものから並べ、**過ぎているものは上に出す**。
 *
 * ④**まだ必要でないものは「足りない」と数えない**。ヨミの段階で請求書が無いのは
 *   当たり前で、それを足りないと言うと**印の意味が消える**。段ごとに要るものを
 *   決めて、その段に来ていないものは「あとで」として別に出す。
 *
 * ⑤**期日はサーバーが計算する**。画面で日付を引くと、案件一覧の期限と
 *   案件の中の期限が食い違う（13章の仮押さえの期限で決めたのと同じ）。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { HOLD_DEADLINE_DAYS } from './project-tabs.service';

/** 案件の段の進み方 (この順で「もう必要か」を判定する) */
const STAGE_ORDER = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 's_completed'] as const;

/** その段に来ているか (e_lost は失注なので何も要求しない) */
function stageReached(current: string, needed: string): boolean {
  if (current === 'e_lost') return false;
  const a = STAGE_ORDER.indexOf(current as (typeof STAGE_ORDER)[number]);
  const b = STAGE_ORDER.indexOf(needed as (typeof STAGE_ORDER)[number]);
  if (a < 0 || b < 0) return false;
  return a >= b;
}

export type DocGroup = 'paper' | 'work' | 'card';

export interface DocKindDef {
  key: string;
  label: string;
  group: DocGroup;
  /** 誰が用意するか。画面にそのまま出す */
  who: string;
  /** なぜ要るか。1行で */
  why: string;
  /** この段に来たら要る */
  required_from: (typeof STAGE_ORDER)[number];
  /** どこで作るか (画面のリンク。`{id}` は案件ID・`{gls}` はGLS番号に置き換える) */
  path?: string;
  path_label?: string;
}

/**
 * 案件に要る12種。**元PDFではなく業務の並び**でグループを3つに分けている
 * (お客様とやり取りする紙 / 現場で作るもの / 貸したもの)。
 */
export const DOC_KINDS: DocKindDef[] = [
  // ── お客様とやり取りする紙 ──
  { key: 'estimate', label: '見積書', group: 'paper', who: '営業',
    why: '金額の合意。これが無いと発注をもらえません', required_from: 'c_proposal',
    path: '/sales/projects/{id}/estimates', path_label: '見積をつくる' },
  { key: 'application_form', label: '申込書', group: 'paper', who: 'お客様',
    why: '受注の証跡。本番日までに要ります', required_from: 'b_verbal',
    path: '/sales/projects/{id}', path_label: '案件を開く' },
  { key: 'logo_permission', label: 'ロゴ使用許諾', group: 'paper', who: 'お客様',
    why: 'ロゴを画面や資料に出すときだけ要ります', required_from: 'a_won',
    path: '/sales/projects/{id}', path_label: '案件を開く' },
  { key: 'invoice', label: '請求書', group: 'paper', who: '経理',
    why: '締めの日にまとめて出します', required_from: 's_completed',
    path: '/finance/billing', path_label: '請求のしごとへ' },
  { key: 'inspection', label: '検収書', group: 'paper', who: '経理',
    why: 'お客様の社内処理で要ることがあります', required_from: 's_completed',
    path: '/finance/billing', path_label: '請求のしごとへ' },
  { key: 'payment', label: '入金', group: 'paper', who: '経理',
    why: '期日を過ぎたら催促します', required_from: 's_completed',
    path: '/finance/billing', path_label: '入金の確認へ' },
  // ── 現場で作るもの ──
  { key: 'booking', label: '本予約', group: 'work', who: '営業',
    why: '仮押さえのままだと部屋が確保できていません', required_from: 'b_verbal',
    path: '/schedule?layers=studio', path_label: 'スタジオ予約へ' },
  { key: 'call_sheet', label: '香盤表', group: 'work', who: '制作',
    why: '当日の動きを1枚にします', required_from: 'a_won',
    path: '/sales/projects/{id}/call-sheet', path_label: '香盤表をつくる' },
  { key: 'manual', label: '運営マニュアル', group: 'work', who: '制作',
    why: '当日みんなが持つ1冊です', required_from: 'a_won',
    path: '/sales/projects/{id}/manual', path_label: '運営マニュアルをつくる' },
  { key: 'qsheet', label: 'Qシート', group: 'work', who: 'ディレクター',
    why: '進行の台本。本番の送出がこれを見ます', required_from: 'a_won',
    path: '/qsheet/', path_label: 'Qシートへ' },
  { key: 'techsheet', label: '技術資料', group: 'work', who: '技術',
    why: 'カメラ・映像・音声の仕様です', required_from: 'a_won',
    path: '/techsheet/', path_label: '技術資料へ' },
  // ── 貸したもの ──
  { key: 'security_card', label: 'セキュリティカードの返却', group: 'card', who: '受付',
    why: '返ってこないと次の案件で貸せません', required_from: 'a_won',
    path: '/daily/security-cards', path_label: 'カードの管理へ' },
];

export const GROUP_LABELS: Record<DocGroup, string> = {
  paper: 'お客様とやり取りする紙',
  work: '現場で作るもの',
  card: '貸したもの',
};

export interface DocItem extends DocKindDef {
  /** そろっているか (元データがあるかで判定。人に押させない) */
  ready: boolean;
  /** そろっている／いない の理由。日本語でそのまま出す */
  note: string;
  /** 期日 (YYYY-MM-DD)。決まらないものは null */
  due: string | null;
  /** 期日の決め方。「なぜこの日か」を人に見せる */
  due_why: string | null;
  /** 期日を過ぎているか (そろっていないものだけ true になりうる) */
  overdue: boolean;
  /** 期日まで何日 (過ぎていればマイナス)。期日が無ければ null */
  days_left: number | null;
  /** いまの段でもう必要か */
  needed_now: boolean;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * DB から来た日付を `YYYY-MM-DD` にそろえる。
 *
 * **DATE 型の列は Date オブジェクトで返る** (`security_card_lendings.due_on` など) ので、
 * そのまま String() すると `Wed Sep 02 ...` になり、日付として引き算できない
 * (画面に「9164日 過ぎています」と出た — 検証で見つけた)。
 * TEXT の列 (`payment_due_date` など) はそのまま先頭10文字を採る。
 */
const dateStr = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : ymd(v);
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const minus = (base: string, days: number) => {
  const d = new Date(base.slice(0, 10));
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() - days);
  return ymd(d);
};
const daysBetween = (from: string, to: string) => {
  const a = new Date(from), b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
};

/** 申込書は本番日の何日前までに要るか */
export const APPLICATION_FORM_DAYS = 14;
/** 香盤表・運営マニュアル・Qシート・技術資料は本番日の何日前までに要るか */
export const PRODUCTION_DOC_DAYS = 7;

/**
 * この案件の書類・成果物・カードの状態を返す。
 *
 * **1本の口で返す** — 12種の状態を画面から集めると7〜8往復になり、
 * そろい方の判定が画面ごとに分かれる。
 */
export async function getProjectDocs(projectId: string, today = ymd(new Date())) {
  const project = (await queryOne(
    `SELECT id, name, gls_number, stage, event_start, event_end,
            application_form, logo_permission
       FROM projects WHERE id = ? AND deleted_at IS NULL`, [projectId])) as any;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

  const stage = String(project.stage);
  const eventStart: string | null = dateStr(project.event_start);

  // ── 元データを集める (そろったかどうかは人に押させない) ──
  const rev = (await queryOne(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'estimate')                             AS estimates,
       COUNT(*) FILTER (WHERE status <> 'estimate')                            AS confirmed,
       COUNT(*) FILTER (WHERE status <> 'estimate' AND invoice_issued_at IS NULL)  AS not_invoiced,
       COUNT(*) FILTER (WHERE status <> 'estimate' AND inspection_issued_at IS NULL) AS not_inspected,
       COUNT(*) FILTER (WHERE status <> 'estimate' AND invoice_issued_at IS NOT NULL
                          AND paid_at IS NULL)                                 AS unpaid,
       MIN(payment_due_date) FILTER (WHERE status <> 'estimate' AND paid_at IS NULL) AS next_due
     FROM revenues WHERE project_id = ? AND deleted_at IS NULL`, [projectId])) as any;

  const book = (await queryOne(
    `SELECT
       COUNT(*)                                                          AS total,
       COUNT(*) FILTER (WHERE booking_type = 'hold' OR status = 'tentative') AS holds
     FROM studio_bookings WHERE project_id = ? AND deleted_at IS NULL`, [projectId])) as any;

  const callSheets = (await queryOne(
    `SELECT COUNT(*) AS c FROM call_sheets WHERE project_id = ?`, [projectId])
    .catch(() => ({ c: 0 }))) as any;
  // 運営マニュアルは**配る版を出したか**で見る。`manuals.version` は作った時点で 1 なので
  // 版数では判定できない (出した版は `manual_issues` に残る)。
  const manuals = (await queryOne(
    `SELECT COUNT(*) AS c,
            (SELECT COUNT(*) FROM manual_issues i
              WHERE i.manual_id IN (SELECT id FROM manuals WHERE project_id = ?)) AS issued
       FROM manuals WHERE project_id = ?`, [projectId, projectId])
    .catch(() => ({ c: 0, issued: 0 }))) as any;
  const qsheets = (await queryOne(
    `SELECT COUNT(*) AS c FROM qsheet_documents WHERE project_id = ?`, [projectId])
    .catch(() => ({ c: 0 }))) as any;
  const techsheets = (await queryOne(
    `SELECT COUNT(*) AS c FROM techsheet_documents WHERE project_id = ?`, [projectId])
    .catch(() => ({ c: 0 }))) as any;

  // 貸し出したままのカード。**期日は返却予定日**なので、返ってこないと過ぎる
  const cards = (await queryAll(
    `SELECT l.id, l.borrower_person, l.borrower_company, l.due_on, c.card_no
       FROM security_card_lendings l JOIN security_cards c ON c.id = l.card_id
      WHERE l.project_id = ? AND l.status = 'active' AND l.deleted_at IS NULL
      ORDER BY l.due_on NULLS LAST`, [projectId]).catch(() => [])) as any[];

  // ── 12種を組み立てる ──
  const items: DocItem[] = DOC_KINDS.map((def) => {
    let ready = false;
    let note = '';
    let due: string | null = null;
    let due_why: string | null = null;

    switch (def.key) {
      case 'estimate':
        ready = Number(rev?.estimates ?? 0) > 0;
        note = ready ? '見積があります' : 'まだありません';
        break;
      case 'application_form':
        ready = Number(project.application_form ?? 0) === 1;
        note = ready ? 'もらっています' : 'もらっていません';
        if (eventStart) {
          due = minus(eventStart, APPLICATION_FORM_DAYS);
          due_why = `本番日の${APPLICATION_FORM_DAYS}日前`;
        }
        break;
      case 'logo_permission':
        ready = Number(project.logo_permission ?? 0) === 1;
        // ロゴを使わない案件もあるので「無い」を足りないとは言い切らない
        note = ready ? 'もらっています' : 'ロゴを出すときだけ要ります';
        break;
      case 'booking':
        if (Number(book?.total ?? 0) === 0) {
          ready = false;
          note = '予約がまだありません';
        } else if (Number(book?.holds ?? 0) > 0) {
          ready = false;
          note = `仮押さえが ${Number(book.holds)}件 残っています`;
        } else {
          ready = true;
          note = '本予約になっています';
        }
        if (Number(book?.holds ?? 0) > 0 && eventStart) {
          due = minus(eventStart, HOLD_DEADLINE_DAYS);
          due_why = `本番日の${HOLD_DEADLINE_DAYS}日前`;
        }
        break;
      case 'call_sheet':
        ready = Number(callSheets?.c ?? 0) > 0;
        note = ready ? 'あります' : 'まだありません';
        if (eventStart) { due = minus(eventStart, PRODUCTION_DOC_DAYS); due_why = `本番日の${PRODUCTION_DOC_DAYS}日前`; }
        break;
      case 'manual':
        ready = Number(manuals?.issued ?? 0) > 0;
        note = Number(manuals?.issued ?? 0) > 0
          ? '配る版を出しています'
          : (Number(manuals?.c ?? 0) > 0 ? '作りかけです（まだ配る版を出していません）' : 'まだありません');
        if (eventStart) { due = minus(eventStart, PRODUCTION_DOC_DAYS); due_why = `本番日の${PRODUCTION_DOC_DAYS}日前`; }
        break;
      case 'qsheet':
        ready = Number(qsheets?.c ?? 0) > 0;
        note = ready ? `${Number(qsheets.c)}件あります` : 'まだありません';
        if (eventStart) { due = minus(eventStart, PRODUCTION_DOC_DAYS); due_why = `本番日の${PRODUCTION_DOC_DAYS}日前`; }
        break;
      case 'techsheet':
        ready = Number(techsheets?.c ?? 0) > 0;
        note = ready ? 'あります' : 'まだありません';
        if (eventStart) { due = minus(eventStart, PRODUCTION_DOC_DAYS); due_why = `本番日の${PRODUCTION_DOC_DAYS}日前`; }
        break;
      case 'invoice':
        if (Number(rev?.confirmed ?? 0) === 0) {
          ready = false; note = '売上がまだ登録されていません';
        } else if (Number(rev?.not_invoiced ?? 0) > 0) {
          ready = false; note = `${Number(rev.not_invoiced)}件 出していません`;
        } else { ready = true; note = '出しています'; }
        break;
      case 'inspection':
        if (Number(rev?.confirmed ?? 0) === 0) {
          ready = false; note = '売上がまだ登録されていません';
        } else if (Number(rev?.not_inspected ?? 0) > 0) {
          ready = false; note = 'お客様から求められたら出します';
        } else { ready = true; note = '出しています'; }
        break;
      case 'payment':
        if (Number(rev?.confirmed ?? 0) === 0) {
          ready = false; note = '請求してからです';
        } else if (Number(rev?.unpaid ?? 0) > 0) {
          ready = false; note = `${Number(rev.unpaid)}件 入金待ちです`;
          if (rev?.next_due) { due = dateStr(rev.next_due); due_why = due ? '支払期日' : null; }
        } else { ready = true; note = '入金を確認しています'; }
        break;
      case 'security_card':
        if (cards.length === 0) {
          ready = true; note = '貸し出しているカードはありません';
        } else {
          ready = false;
          note = `${cards.length}枚 貸し出したままです（${cards
            .map((c) => `No.${c.card_no} ${c.borrower_person}`).join(' / ')}）`;
          const firstDue = cards.find((c) => c.due_on);
          if (firstDue) { due = dateStr(firstDue.due_on); due_why = due ? '返却予定日' : null; }
        }
        break;
    }

    const needed_now = stageReached(stage, def.required_from);
    const days_left = due ? daysBetween(today, due) : null;
    return {
      ...def, ready, note, due, due_why,
      // そろっていて期日を過ぎていても「遅れ」ではない (もう済んでいる)
      overdue: !ready && needed_now && days_left != null && days_left < 0,
      days_left, needed_now,
    };
  });

  // ── 並び: 期日を過ぎたもの → 期日が近いもの → 期日が無いもの → そろったもの ──
  //
  // 種類の順に並べても動けない。**次に何をすればよいか**の順に並べる。
  const rank = (i: DocItem) => {
    if (i.ready) return 4;
    if (!i.needed_now) return 3;
    if (i.overdue) return 0;
    if (i.due) return 1;
    return 2;
  };
  const sorted = [...items].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
    if (a.due) return -1;
    if (b.due) return 1;
    return DOC_KINDS.findIndex((d) => d.key === a.key) - DOC_KINDS.findIndex((d) => d.key === b.key);
  });

  // まだ必要でないものは「足りない」に数えない (印の意味が消える)
  const missing = sorted.filter((i) => !i.ready && i.needed_now);
  const later = sorted.filter((i) => !i.ready && !i.needed_now);
  const readyItems = sorted.filter((i) => i.ready);
  const nextDue = missing.find((i) => i.due);

  return {
    project: {
      id: String(project.id), name: String(project.name),
      gls_number: project.gls_number ?? null, stage,
      event_start: eventStart,
    },
    today,
    items: sorted,
    groups: (['paper', 'work', 'card'] as DocGroup[]).map((g) => ({
      key: g, label: GROUP_LABELS[g],
      total: items.filter((i) => i.group === g).length,
      missing: missing.filter((i) => i.group === g).length,
    })),
    summary: {
      total: items.length,
      ready: readyItems.length,
      missing: missing.length,
      overdue: missing.filter((i) => i.overdue).length,
      later: later.length,
      // 次にやること。**名前と期日で言う** (「N件足りません」だけでは動けない)
      next: nextDue
        ? { key: nextDue.key, label: nextDue.label, due: nextDue.due, days_left: nextDue.days_left }
        : (missing[0] ? { key: missing[0].key, label: missing[0].label, due: null, days_left: null } : null),
    },
  };
}

/** 12種の決まり (画面が凡例を出すのに使う。イベントに依らない) */
export function getDocFormat() {
  return {
    kinds: DOC_KINDS,
    groups: (['paper', 'work', 'card'] as DocGroup[]).map((g) => ({ key: g, label: GROUP_LABELS[g] })),
    stage_order: STAGE_ORDER,
    application_form_days: APPLICATION_FORM_DAYS,
    production_doc_days: PRODUCTION_DOC_DAYS,
    hold_deadline_days: HOLD_DEADLINE_DAYS,
  };
}
