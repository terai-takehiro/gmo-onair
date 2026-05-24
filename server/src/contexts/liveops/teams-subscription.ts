import axios from 'axios';
import { queryAll, queryOne, execute } from '../../shared/db/connection';

// in-memory: programId → current participant count
const counters = new Map<string, number>();
// in-memory: subscriptionId → programId (for webhook reverse-lookup)
const subToProgram = new Map<string, string>();

let renewalInterval: ReturnType<typeof setInterval> | null = null;

/** meetingUrl (join URL) → Graph API meetingId (base64 string) */
async function resolveMeetingId(token: string, joinUrl: string): Promise<string> {
  const res = await axios.get('https://graph.microsoft.com/v1.0/communications/onlineMeetings', {
    headers: { Authorization: `Bearer ${token}` },
    params: { $filter: `joinWebUrl eq '${joinUrl}'` },
    timeout: 10000,
  });
  const items: any[] = res.data.value ?? [];
  if (items.length === 0) throw new Error('Teams meeting not found for the given URL');
  return items[0].id as string;
}

export async function subscribeToMeeting(
  programId: string,
  meetingUrl: string,
  token: string,
  baseUrl: string,
): Promise<void> {
  const meetingId = await resolveMeetingId(token, meetingUrl);

  const expiresAt = new Date(Date.now() + 55 * 60 * 1000); // 55 minutes

  const res = await axios.post(
    'https://graph.microsoft.com/v1.0/subscriptions',
    {
      changeType: 'updated',
      notificationUrl: `${baseUrl}/api/v1/internal/liveops/webhooks/teams`,
      resource: `communications/onlineMeetings/${meetingId}`,
      expirationDateTime: expiresAt.toISOString(),
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    },
  );

  const subscriptionId: string = res.data.id;
  subToProgram.set(subscriptionId, programId);
  counters.set(programId, counters.get(programId) ?? 0);

  // Persist to DB for restart recovery
  await execute(
    `INSERT INTO liveops_teams_subscriptions (id, program_id, meeting_id, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET expires_at = $4, updated_at = NOW()`,
    [subscriptionId, programId, meetingId, expiresAt],
  );
}

export function handleNotification(subscriptionId: string, resourceData: any): void {
  const programId = subToProgram.get(subscriptionId);
  if (!programId) return;

  // Count from roster data if available
  const members: any[] = resourceData?.members ?? resourceData?.attendees ?? [];
  if (members.length > 0) {
    counters.set(programId, members.length);
  }
}

export function getCount(programId: string): number {
  return counters.get(programId) ?? 0;
}

async function renewSubscription(subscriptionId: string, token: string): Promise<void> {
  const expiresAt = new Date(Date.now() + 55 * 60 * 1000);
  await axios.patch(
    `https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`,
    { expirationDateTime: expiresAt.toISOString() },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 10000 },
  );
  await execute(
    'UPDATE liveops_teams_subscriptions SET expires_at = $2, updated_at = NOW() WHERE id = $1',
    [subscriptionId, expiresAt],
  );
}

export async function restoreSubscriptions(): Promise<void> {
  try {
    const rows = await queryAll(
      `SELECT id, program_id FROM liveops_teams_subscriptions
       WHERE expires_at > NOW() + INTERVAL '2 minutes'`,
      [],
    );
    for (const row of rows as any[]) {
      subToProgram.set(row.id, row.program_id);
      if (!counters.has(row.program_id)) counters.set(row.program_id, 0);
    }
  } catch (e) {
    console.warn('[teams-sub] restoreSubscriptions failed:', (e as Error).message);
  }
}

export function startSubscriptionRenewal(getToken: () => Promise<string | null>): void {
  if (renewalInterval) return;
  renewalInterval = setInterval(async () => {
    try {
      const rows = await queryAll(
        `SELECT id FROM liveops_teams_subscriptions
         WHERE expires_at BETWEEN NOW() AND NOW() + INTERVAL '15 minutes'`,
        [],
      );
      if (rows.length === 0) return;
      const token = await getToken();
      if (!token) return;
      for (const row of rows as any[]) {
        renewSubscription(row.id, token).catch(err =>
          console.warn('[teams-sub] renew failed for', row.id, err.message),
        );
      }
    } catch (e) {
      console.warn('[teams-sub] renewal check failed:', (e as Error).message);
    }
  }, 40 * 60 * 1000); // every 40 minutes
}
