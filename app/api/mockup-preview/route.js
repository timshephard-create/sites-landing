// In-memory store for mockup HTML
export const mockupStore = new Map();

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  
  const html = mockupStore.get(id);
  if (!html) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}