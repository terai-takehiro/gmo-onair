/**
 * Slack への投稿 (Bot token)
 *
 * トークン (`SLACK_BOT_TOKEN`) が無ければ **機能ごと無効**にして 503 を返す。
 * 未設定の環境で勝手に何かが飛ぶことはない。
 *
 * 必要な Bot Token Scopes:
 *   chat:write         … 投稿する
 *   chat:write.public  … 招待されていない公開チャンネルにも投げる
 *   users:read.email   … ONAiR のメールから Slack ユーザーを引く (個人DM用)
 *   channels:read      … チャンネル一覧 (**任意**。無ければ手入力に落ちる)
 */
import axios from 'axios';

const API = 'https://slack.com/api';

export function isSlackConfigured(): boolean {
  return !!process.env.SLACK_BOT_TOKEN;
}

function token(): string {
  const t = process.env.SLACK_BOT_TOKEN;
  if (!t) throw new Error('SLACK_BOT_TOKEN が設定されていません');
  return t;
}

async function call<T = Record<string, unknown>>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await axios.post(`${API}/${method}`, body, {
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json; charset=utf-8' },
    timeout: 15_000,
    validateStatus: () => true,
  });
  const data = res.data as { ok?: boolean; error?: string };
  if (!data?.ok) {
    // Slack のエラーコードをそのまま添える (missing_scope / channel_not_found 等が原因の切り分けに要る)
    throw new Error(`Slack ${method} 失敗: ${data?.error ?? `HTTP ${res.status}`}`);
  }
  return res.data as T;
}

/** チャンネル (または DM の user id) に本文を投げる */
export async function postMessage(channel: string, text: string): Promise<{ ts: string }> {
  const r = await call<{ ts: string }>('chat.postMessage', {
    channel,
    text,
    // 絵文字やリンクを勝手に展開させない (本文は自分で組んでいる)
    unfurl_links: false,
    unfurl_media: false,
  });
  return { ts: r.ts };
}

/** ONAiR のメールから Slack ユーザーを引く (個人DM用)。見つからなければ null */
export async function findUserByEmail(email: string): Promise<string | null> {
  try {
    const r = await call<{ user?: { id?: string } }>('users.lookupByEmail', { email });
    return r.user?.id ?? null;
  } catch {
    return null;
  }
}

export interface SlackChannel { id: string; name: string; is_private: boolean }

/**
 * チャンネル一覧。`channels:read` が無ければ **空配列 + reason** を返す
 * (画面はそのとき手入力に落ちる。エラーで画面を止めない)
 */
export async function listChannels(): Promise<{ channels: SlackChannel[]; reason?: string }> {
  try {
    const out: SlackChannel[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const r = await call<{ channels?: SlackChannel[]; response_metadata?: { next_cursor?: string } }>(
        'conversations.list',
        { limit: 200, exclude_archived: true, types: 'public_channel,private_channel', cursor },
      );
      out.push(...(r.channels ?? []).map((c) => ({ id: c.id, name: c.name, is_private: !!c.is_private })));
      cursor = r.response_metadata?.next_cursor || undefined;
      if (!cursor) break;
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return { channels: out };
  } catch (err) {
    return { channels: [], reason: (err as Error).message };
  }
}
