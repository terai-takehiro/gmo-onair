// SMS送信 — Twilio対応 / 未設定時はコンソールログ (開発用)

export async function sendSms(phone: string, message: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    console.log(`\n========== [DEV] SMS (${phone}) ==========`);
    console.log(message);
    console.log('==========================================\n');
    return true;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const body = new URLSearchParams({ To: phone, From: from, Body: message });
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') },
      body,
    });
    if (!res.ok) {
      console.error('[SMS] Twilio error:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[SMS] Send failed:', err);
    return false;
  }
}

export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
