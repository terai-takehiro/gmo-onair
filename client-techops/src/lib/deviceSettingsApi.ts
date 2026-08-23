// 収録設定・配信設定（機器設定）の API 呼び出し。1本にまとめる（impl doc §5-1）。
import api from '@/lib/api';

export interface Deck {
  deckId: string;
  label?: string;
  videoFormat?: string;
  codec?: string;
  audioChannels?: number;
  slot?: string;
  filePrefix?: string;
  skip?: boolean;
}

export interface Destination {
  /**
   * 行の安定した id。**鍵の引き継ぎはこれで突き合わせる**。
   * ⚠️ 以前はサーバーが (encoderId, name) で前の鍵を探していたため、
   * 配信先の名前を直して保存すると**保存済みのストリームキーが黙って消えた**。
   */
  destId: string;
  encoderId: string;
  name: string;
  protocol?: 'RTMP' | 'SRT Caller' | 'SRT Listener';
  url?: string;
  port?: number;
  /**
   * **新しく入れる鍵だけ**を持つ。画面の入力欄は常に空で描く（伏せ字を入れない）。
   *   未設定 … いまの鍵をそのまま残す
   *   `''`   … 鍵を消す（「キーを消す」を押したとき）
   */
  streamKey?: string;
  /** サーバーに鍵が入っているか（表示用。PUT では送らない） */
  hasStreamKey?: boolean;
  /** 伏せ字（表示用。PUT では送らない） */
  streamKeyMasked?: string;
  passphrase?: string;
  latencyMs?: number;
  bandwidthPct?: number;
  mtu?: number;
  aes?: 'なし' | 'AES-128' | 'AES-192' | 'AES-256';
}

export interface DestinationOut extends Omit<Destination, 'streamKey' | 'destId'> {
  destId?: string;
  streamKeyMasked: string;
  hasStreamKey: boolean;
}

export interface Meeting {
  meetingId_: string;
  tool: 'Zoom' | 'Teams' | 'Google Meet' | 'Webex' | 'その他';
  toolOther?: string;
  label?: string;
  url: string;
  joinId?: string;
  passcode?: string;
  videoInput: 'OA1' | 'other';
  videoInputOther?: string;
  audioInput: 'UltraStudio' | 'Rubix42';
  note?: string;
}

export interface RecordingSettings {
  serviceDate: string;
  decks: Deck[];
  lastExportedAt: string | null;
  lastExportedBy: string | null;
  lastExportName: string | null;
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

export interface PreflightIssue { where: string; code: string; message: string }

/**
 * Excel の**中身**の見本（1シート分）。
 * サーバーが実物と同じ整形（`buildSheetSpecs`）を通した先頭数行を返す。
 *
 * ⚠️ `rows` の空欄は**空文字のまま**来る（画面が橙で「（空欄）」と描く決めごと）。
 * ⚠️ ストリームキーは値があれば `'****'`・無ければ空文字で、**平文は絶対に来ない**。
 */
export interface PreviewSheet {
  name: string;
  headers: string[];
  rows: string[][];
  /** 実際に出る行数（`rows` は先頭だけなので「ほか N 行」を出すのに要る） */
  totalRows: number;
}

export interface PreflightResult {
  red: PreflightIssue[];
  amber: PreflightIssue[];
  gray: PreflightIssue[];
  /**
   * ⚠️ **見出しだけの見本。もう画面では使わない**（サーバーはまだ返す）。
   * これしか出していなかったせいで、**中身が1行も無い Excel** が落ちてきても
   * 画面は普段どおりに見えた（監査 2026-08-22）。いまは `preview` を使う。
   */
  headerPreview: { sheets: { name: string; headers: string[] }[] };
  /** 出るシートの先頭数行（収録設定・配信設定・入力ガイド） */
  preview: PreviewSheet[];
  /** 保存されるファイル名。**画面の見本もサーバーの命名を使う**（別々に組むと食い違う） */
  filename: string;
}

/** 案件・番組の文脈（ヘッダーのミニアプリ切替・簡易入口からのハブ遷移が使う） */
export interface OwnerContext {
  kind: 'project' | 'program';
  id: string;
  name: string;
  glsNumber: string | null;
  /** その案件/番組の本番実施日（無ければ null）。収録設定等の実施日の既定値に使う */
  eventDate?: string | null;
}

const base = (ownerKey: string) => `/techops/production/${encodeURIComponent(ownerKey)}`;
const dateQuery = (date?: string) => (date ? `?date=${encodeURIComponent(date)}` : '');

/** 見つからない・権限が無いときは null（呼び出し側で「見つかりません」を出す） */
export async function getOwnerContext(ownerKey: string): Promise<OwnerContext | null> {
  try {
    const { data } = await api.get(`${base(ownerKey)}/context`);
    return data.data;
  } catch {
    return null;
  }
}

export interface ServiceDateOption { date: string; hasRecording: boolean; hasStreaming: boolean }

/** 実施日の候補（すでに設定がある日＋スケジュール表の日） */
export async function getServiceDates(ownerKey: string): Promise<ServiceDateOption[]> {
  try {
    const { data } = await api.get(`${base(ownerKey)}/dates`);
    return data.data?.dates ?? [];
  } catch {
    return [];
  }
}

export async function getRecording(ownerKey: string, date?: string): Promise<RecordingSettings | null> {
  const { data } = await api.get(`${base(ownerKey)}/recording${dateQuery(date)}`);
  return data.data;
}

export async function putRecording(ownerKey: string, serviceDate: string, decks: Deck[]): Promise<void> {
  await api.put(`${base(ownerKey)}/recording`, { serviceDate, decks });
}

export async function getStreaming(ownerKey: string, date?: string): Promise<StreamingSettings | null> {
  const { data } = await api.get(`${base(ownerKey)}/streaming${dateQuery(date)}`);
  return data.data;
}

/**
 * 送る形に整える。
 * ⚠️ `hasStreamKey` / `streamKeyMasked` は**表示専用なので送らない**。
 * `streamKey` は **利用者が触ったときだけ**送る（未設定なら鍵はそのまま残る）。
 */
function toWire(d: Destination) {
  const { hasStreamKey: _h, streamKeyMasked: _m, streamKey, ...rest } = d;
  return streamKey === undefined ? rest : { ...rest, streamKey };
}

export async function putStreaming(
  ownerKey: string,
  serviceDate: string,
  destinations: Destination[],
  meetings: Meeting[]
): Promise<void> {
  await api.put(`${base(ownerKey)}/streaming`, {
    serviceDate,
    destinations: destinations.map(toWire),
    meetings,
  });
}

/**
 * 書き出す前の点検。
 *
 * ⚠️ **`sheets` を必ず渡すこと。** 渡さないとサーバーは既定で両方のシートを点検するので、
 * 画面でシートのチェックを外しても**外したシートの赤が出続けた**（監査 2026-08-22）。
 * 見本（`preview`）も同じ引数で決まるので、選択を変えたら引き直す。
 */
export async function preflight(
  ownerKey: string,
  opts: { date?: string; sheets?: ('recording' | 'streaming')[] } = {}
): Promise<PreflightResult> {
  const params = new URLSearchParams();
  if (opts.date) params.set('date', opts.date);
  // 空配列は送らない（サーバーは空文字を「指定なし = 両方」と読む。送っても意味が変わらない）
  if (opts.sheets && opts.sheets.length > 0) params.set('sheets', opts.sheets.join(','));
  const query = params.toString();
  const { data } = await api.post(`${base(ownerKey)}/settings/preflight${query ? `?${query}` : ''}`);
  return data.data;
}

export async function exportXlsx(
  ownerKey: string,
  opts: { date?: string; sheets: ('recording' | 'streaming')[]; keyMode: 'blank' | 'plain' }
): Promise<{ blob: Blob; filename: string }> {
  const params = new URLSearchParams();
  if (opts.date) params.set('date', opts.date);
  params.set('sheets', opts.sheets.join(','));
  params.set('keyMode', opts.keyMode);
  const res = await api.get(`${base(ownerKey)}/settings/export-xlsx?${params.toString()}`, {
    responseType: 'blob',
  });
  const disposition = res.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename\*=UTF-8''([^;]+)/);
  const filename = match ? decodeURIComponent(match[1]) : '収録配信設定.xlsx';
  return { blob: res.data as Blob, filename };
}

export async function copyFrom(
  ownerKey: string,
  serviceDate: string,
  from: { ownerKey: string; date: string },
  what: ('recording' | 'streaming')[]
): Promise<{ recording: boolean; streaming: boolean }> {
  const { data } = await api.post(`${base(ownerKey)}/settings/copy-from?date=${encodeURIComponent(serviceDate)}`, {
    from,
    what,
  });
  return data.data;
}
