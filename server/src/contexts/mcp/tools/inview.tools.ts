import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { inviewService } from '../../dailyops/services/inview.service';
import { ok, runTool, audit, REQUESTED_BY, currentActorId } from '../helpers';

// 日常業務アプリ (dailyops) — 内覧会 来場予約の MCP ツール。
// Kairos3 の登録通知メール (info@gmo-globalstudio.com 宛) を AI が取り込んで
// register_inview_attendee で 1 件ずつ登録する想定。
//
// メール例のフィールド対応:
//   名前→name / ふりがな→furigana / メールアドレス→email / 会社情報→company /
//   郵便番号→postal_code / 住所→address / 電話番号→phone / FAX番号→fax / 携帯番号→mobile /
//   役職→role / メール配信可否(承諾=true)→mail_consent / 参加希望の回→session_label /
//   ご来場予定時間→visit_time / ご参加人数(N名)→party_size / ご参加者2〜5→companions /
//   ご興味・ご相談→interests
// session_label をそのまま渡せば日付/時間帯/対象は自動抽出される。
// 同一 email × 同一 session_label の再登録は更新になり重複しない。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function registerInviewTools(server: McpServer): void {
  server.registerTool(
    'register_inview_attendee',
    {
      title: '内覧会 来場予約の登録',
      description:
        '内覧会 (定期内覧会) の来場予約を 1 件登録する。Kairos3 の登録通知メールを取り込む用途。' +
        'session_label に「参加希望の回」をそのまま渡すと日付・時間帯・対象を自動抽出する ' +
        '(例: "2026/7/29(水)14:00-17:00｜イベント主催者向け")。' +
        '同じ email × 同じ session_label が既にあれば更新される (メール再取り込みでも重複しない)。' +
        'party_size は「ご参加人数」の数値 (「1名（ご本人のみ）」→1)、companions は「ご参加者2〜5」の氏名配列。',
      inputSchema: {
        name: z.string().min(1).describe('申込者 (代表者) の氏名'),
        session_label: z.string().min(1).describe('参加希望の回 (生の文字列。日付/時間帯/対象を自動抽出)'),
        session_date: z.string().regex(DATE_RE).optional().describe('回の日付 YYYY-MM-DD (通常は session_label から自動抽出されるので不要)'),
        furigana: z.string().optional(),
        email: z.string().optional(),
        company: z.string().optional().describe('会社情報 (会社名+部署をそのまま)'),
        role: z.string().optional().describe('役職'),
        postal_code: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        fax: z.string().optional(),
        mobile: z.string().optional(),
        mail_consent: z.boolean().optional().describe('メール配信可否 (承諾=true)'),
        party_size: z.number().int().min(1).max(999).optional().describe('ご参加人数 (既定 1)'),
        companions: z.array(z.string()).optional().describe('同行者の氏名 (ご参加者2〜5)'),
        visit_time: z.string().optional().describe('ご来場予定時間'),
        interests: z.string().optional().describe('ご興味・ご相談事項'),
        notes: z.string().optional().describe('運営メモ'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const { row, action } = await inviewService.create({
        name: args.name,
        session_label: args.session_label,
        session_date: args.session_date ?? null,
        furigana: args.furigana ?? null,
        email: args.email ?? null,
        company: args.company ?? null,
        role: args.role ?? null,
        postal_code: args.postal_code ?? null,
        address: args.address ?? null,
        phone: args.phone ?? null,
        fax: args.fax ?? null,
        mobile: args.mobile ?? null,
        mail_consent: args.mail_consent ?? null,
        party_size: args.party_size ?? 1,
        companions: args.companions ?? null,
        visit_time: args.visit_time ?? null,
        interests: args.interests ?? null,
        notes: args.notes ?? null,
        source: 'kairos3',
        requested_by: args.requested_by ?? null,
        created_by: currentActorId(),
      });
      audit('register_inview_attendee',
        { name: args.name, session_label: args.session_label, email: args.email, party_size: args.party_size },
        { id: row.id, action, session_date: row.session_date }, args.requested_by);
      return ok({ [action]: true, id: row.id, action, session_label: row.session_label, session_date: row.session_date, name: row.name });
    }),
  );

  server.registerTool(
    'list_inview_attendees',
    {
      title: '内覧会 来場予約の一覧',
      description:
        '内覧会の来場予約を一覧する。from/to (session_date 範囲) や upcoming (今日以降の回のみ) で絞れる。' +
        '回 (セッション) ごとの登録状況を確認したいときに使う。',
      inputSchema: {
        from: z.string().regex(DATE_RE).optional().describe('回の日付の下限 (YYYY-MM-DD)'),
        to: z.string().regex(DATE_RE).optional().describe('回の日付の上限 (YYYY-MM-DD)'),
        upcoming: z.boolean().optional().describe('true で今日以降の回のみ'),
      },
    },
    async (args) => runTool(async () => {
      const rows = await inviewService.list({ from: args.from, to: args.to, upcoming: args.upcoming });
      return ok({ total: rows.length, attendees: rows });
    }),
  );

  server.registerTool(
    'list_inview_sessions',
    {
      title: '内覧会 回(セッション)サマリー',
      description: '内覧会の回ごとに 登録件数 / 合計人数 / 来場済み数 を集計して返す (日付降順)。',
      inputSchema: {},
    },
    async () => runTool(async () => ok({ sessions: await inviewService.listSessions() })),
  );
}
