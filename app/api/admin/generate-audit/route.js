import { NextResponse, after } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  const startTime = Date.now();
  console.log('[ADMIN-GENERATE] ========== INCOMING REQUEST ==========');
  console.log('[ADMIN-GENERATE] Timestamp:', new Date().toISOString());

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    console.error('[ADMIN-GENERATE] REJECTED — ADMIN_SECRET not configured on server');
    return NextResponse.json({ error: 'Admin not configured' }, { status: 500 });
  }

  const provided = request.headers.get('x-admin-secret');
  if (!provided || provided !== adminSecret) {
    console.error('[ADMIN-GENERATE] REJECTED — bad or missing x-admin-secret');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url, email } = payload || {};

  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return NextResponse.json({ error: 'Invalid URL — must start with http(s)' }, { status: 400 });
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host');
  const origin = `${proto}://${host}`;
  const reportUrl = `${origin}/api/report`;

  console.log('[ADMIN-GENERATE] URL:', url);
  console.log('[ADMIN-GENERATE] Email:', email);
  console.log('[ADMIN-GENERATE] Will trigger report at:', reportUrl);

  after(async () => {
    const afterStart = Date.now();
    console.log('[ADMIN-GENERATE:AFTER] ===== after() callback STARTED =====');
    console.log('[ADMIN-GENERATE:AFTER] Time since request start:', afterStart - startTime, 'ms');
    console.log('[ADMIN-GENERATE:AFTER] Calling:', reportUrl);
    try {
      const res = await fetch(reportUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, email })
      });
      const elapsed = Date.now() - afterStart;
      console.log('[ADMIN-GENERATE:AFTER] Response status:', res.status);
      console.log('[ADMIN-GENERATE:AFTER] Response elapsed:', elapsed, 'ms');
      if (!res.ok) {
        const errText = await res.text();
        console.error('[ADMIN-GENERATE:AFTER] REPORT FAILED:', res.status, errText);
      } else {
        console.log('[ADMIN-GENERATE:AFTER] REPORT SUCCESS for:', email);
      }
    } catch (err) {
      const elapsed = Date.now() - afterStart;
      console.error('[ADMIN-GENERATE:AFTER] FETCH ERROR after', elapsed, 'ms:', err.message);
    }
    console.log('[ADMIN-GENERATE:AFTER] ===== after() callback ENDED =====');
  });

  console.log('[ADMIN-GENERATE] after() registered, returning 202 now');
  return NextResponse.json({
    accepted: true,
    message: `Report generation enqueued for ${url}. Email will be sent to ${email} when complete (typically 30–90 seconds).`
  }, { status: 202 });
}
