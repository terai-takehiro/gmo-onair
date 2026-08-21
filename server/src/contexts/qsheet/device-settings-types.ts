// 収録設定・配信設定（機器設定）の明細の型と検証。
//
// 項目名・許容値は #279（`docs/design/qsheet-recording-streaming.md` §2）を正とし、
// **綴りを変えない**（機器の REST / Assistant の取込がこの文字列をそのまま見る）。
import { z } from 'zod';

// ── 収録: decks[] ──────────────────────────────────────────
export const DeckSchema = z.object({
  deckId: z.string().min(1).max(16),
  label: z.string().max(64).optional(),
  videoFormat: z.string().max(32).optional(),
  codec: z.string().max(32).optional(),
  audioChannels: z.number().int().positive().max(16).optional(),
  slot: z.string().max(32).optional(),
  filePrefix: z.string().max(128).optional(),
  // 「使わないと決めた台」（#279 §4-5 の灰）。08 / impl doc の §9-2-5 は保存場所を未決としており、
  // この実装では decks[].skip に持たせる（行そのものを消す案より、後で戻せて安全なため）。
  skip: z.boolean().optional(),
});
export type Deck = z.infer<typeof DeckSchema>;
export const DecksSchema = z.array(DeckSchema).max(64);

// ── 配信: destinations[] ───────────────────────────────────
// セッション名: 半角英数＋空白＋`._-+'[]()` のみ・1〜32字・前後空白不可（#279 §2-2 / §0-9）
const SESSION_NAME_RE = /^[A-Za-z0-9 ._\-+'[\]()]{1,32}$/;

export const DestinationSchema = z.object({
  encoderId: z.string().min(1).max(16),
  name: z
    .string()
    .min(1)
    .max(32)
    .refine((v) => v === v.trim(), 'セッション名の前後に空白は使えません')
    .refine((v) => SESSION_NAME_RE.test(v), 'セッション名は半角英数と ._-+\'[]() のみ使えます'),
  protocol: z.enum(['RTMP', 'SRT Caller', 'SRT Listener']).optional(),
  url: z.string().max(256).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  // 送られてきた値が '****' で始まるなら「変更なし」(devices-settings.service.ts 側で判定)。
  // ここではただの文字列として受ける（暗号化はサービス層の責務）。
  streamKey: z.string().max(256).optional(),
  passphrase: z.string().max(256).optional(),
  latencyMs: z.number().int().positive().optional(),
  bandwidthPct: z.number().positive().optional(),
  mtu: z.number().int().positive().optional(),
  aes: z.enum(['なし', 'AES-128', 'AES-192', 'AES-256']).optional(),
});
export type Destination = z.infer<typeof DestinationSchema>;
export const DestinationsSchema = z.array(DestinationSchema).max(128);

// ── 配信: meetings[]（WEB会議。Excel には出さない） ─────────
export const MeetingSchema = z.object({
  meetingId_: z.string().min(1).max(64), // 行の id（genId('mtg_')）。会議ツール側の ID とは別物
  tool: z.enum(['Zoom', 'Teams', 'Google Meet', 'Webex', 'その他']),
  toolOther: z.string().max(64).optional(),
  label: z.string().max(64).optional(),
  url: z.string().min(1).max(512),
  joinId: z.string().max(64).optional(),
  passcode: z.string().max(64).optional(),
  videoInput: z.enum(['OA1', 'other']),
  videoInputOther: z.string().max(64).optional(),
  audioInput: z.enum(['UltraStudio', 'Rubix42']),
  note: z.string().max(500).optional(),
});
export type Meeting = z.infer<typeof MeetingSchema>;
export const MeetingsSchema = z.array(MeetingSchema).max(32);

// ── 応答の形 ────────────────────────────────────────────────
export interface RecordingSettings {
  serviceDate: string;
  decks: Deck[];
  lastExportedAt: string | null;
  lastExportedBy: string | null;
  lastExportName: string | null;
}

export interface DestinationOut extends Omit<Destination, 'streamKey'> {
  streamKeyMasked: string;
  hasStreamKey: boolean;
}

export interface StreamingSettings {
  serviceDate: string;
  destinations: DestinationOut[];
  meetings: Meeting[];
  keyMode: 'blank' | 'plain';
  lastExportedAt: string | null;
  lastExportedBy: string | null;
  lastExportName: string | null;
}

export interface PreflightIssue {
  where: string;
  code: string;
  message: string;
}

export interface PreflightResult {
  red: PreflightIssue[];
  amber: PreflightIssue[];
  gray: PreflightIssue[];
  headerPreview: { sheets: { name: string; headers: string[] }[] };
}
