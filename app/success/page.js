'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  return (
    <main style={{ fontFamily: 'Georgia, serif', background: '#F7F3EE', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: '560px', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', background: '#3B6D11', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
          <span style={{ color: '#fff', fontSize: '1.8rem' }}>✓</span>
        </div>
        <h1 style={{ fontSize: '2.2rem', marginBottom: '1rem' }}>You're all set.</h1>
        <p style={{ fontSize: '1.05rem', color: '#4A4540', lineHeight: 1.8, marginBottom: '2rem', fontWeight: 300 }}>
          Your full website audit report is being generated and will be delivered to your inbox within 2 minutes.
        </p>
        <p style={{ fontSize: '0.85rem', color: '#9A9490' }}>Didn&apos;t get it? Check your spam folder or <a href="mailto:tim@timshephard.co" style={{ color: '#8B4513', textDecoration: 'underline', cursor: 'pointer', pointerEvents: 'auto', display: 'inline' }}>email me directly</a>.</p>
        <a href="/" style={{ display: 'inline-block', marginTop: '2rem', color: '#C8522A', fontSize: '0.9rem' }}>← Back to home</a>
      </div>
    </main>
  );
}

export default function Success() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}