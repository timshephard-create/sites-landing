export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const html = searchParams.get('html');
  
  if (!html) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const decoded = Buffer.from(html, 'base64').toString('utf-8');
    return new Response(decoded, {
      headers: { 'Content-Type': 'text/html' }
    });
  } catch(e) {
    return new Response('Invalid html', { status: 400 });
  }
}