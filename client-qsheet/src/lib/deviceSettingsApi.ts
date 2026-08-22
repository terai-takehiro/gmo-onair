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
  encoderId: string;
  name: string;
  protocol?: 'RTMP' | 'SRT Caller' | 'SRT Listener';
  url?: string;
  port?: number;
  streamKey?: string; // PUT 送信専用。GET 応答には streamKeyMasked / hasStreamKey で来る
  passphrase?: string;
  latencyMs?: number;
  bandwidthPct?: number;
  mtu?: number;
  aes?: 'なし' | 'AES-128' | 'AES-192' | 'AES-256';
}

export interface DestinationOut extends Omit<Destination, 'streamKey'> {
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
export interface PreflightResult {
  red: PreflightIssue[];
  amber: PreflightIssue[];
  gray: PreflightIssue[];
  headerPreview: { sheets: { name: string; headers: string[] }[] };
}

/** 案件・番組の文脈（ヘッダーのミニアプリ切替・簡易入口からのハブ遷移が使う） */
export interface OwnerContext {
  kind: 'project' | 'program';
  id: string;
  name: string;
  glsNumber: string | null;
}

const base = (ownerKey: string) => `/qsheet/production/${encodeURIComponent(ownerKey)}`;
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

export async function putStreaming(
  ownerKey: string,
  serviceDate: string,
  destinations: Destination[],
  meetings: Meeting[]
): Promise<void> {
  await api.put(`${base(ownerKey)}/streaming`, { serviceDate, destinations, meetings });
}

export async function preflight(ownerKey: string, date?: string): Promise<PreflightResult> {
  const { data } = await api.post(`${base(ownerKey)}/settings/preflight${dateQuery(date)}`);
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
