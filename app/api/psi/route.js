export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  if (!url) return Response.json({ error: 'Missing url' }, { status: 400 });

  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&key=${process.env.PAGESPEED_API_KEY}`;
  const res = await fetch(apiUrl, { next: { revalidate: 0 } });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
