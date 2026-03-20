import { inflateSync } from 'zlib';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const data = searchParams.get('data');

  if (!data) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const html = inflateSync(Buffer.from(data, 'base64url')).toString('utf-8');
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  } catch(e) {
    return new Response('Invalid data', { status: 400 });
  }
}