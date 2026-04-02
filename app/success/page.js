'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function Success() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const transactionId = searchParams.get('session_id') || searchParams.get('transaction_id') || undefined;
    if (typeof fbq !== 'undefined') fbq('track', 'Purchase', { value: 147, currency: 'USD' });
    if (typeof gtag !== 'undefined') gtag('event', 'purchase', {
      value: 147,
      currency: 'USD',
      ...(transactionId && { transaction_id: transactionId }),
    });
  }, []);

  return (
    <main style={{ fontFamily: 'Georgia, serif', background: '#F7F3EE', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: '560px', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', background: '#3B6D11', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem' }}>
          <span style={{ color: '#fff', fontSize: '1.8rem' }}>&#10003;</span>
        </div>
        <h1 style={{ fontSize: '2.2rem', marginBottom: '1rem' }}>You&apos;re all set.</h1>
        <p style={{ fontSize: '1.05rem', color: '#4A4540', lineHeight: 1.8, marginBottom: '2rem', fontWeight: 300 }}>
          Your full website audit report is being generated and will be delivered to your inbox within 2 minutes.
        </p>
        <p style={{ fontSize: '0.85rem', color: '#9A9490', lineHeight: 1.8 }}>
          Didn&apos;t get it? Check your spam folder or{' '}
          <button
            onClick={() => { window.location.href = 'mailto:tim@timshephard.co'; }}
            style={{ background: 'none', border: 'none', color: '#8B4513', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}
          >
            email me directly
          </button>{' '}
          at <span style={{ color: '#4A4540', userSelect: 'all' }}>tim@timshephard.co</span>
        </p>
        <a href="/" style={{ display: 'inline-block', marginTop: '2rem', color: '#C8522A', fontSize: '0.9rem' }}>&#8592; Back to home</a>
      </div>
    </main>
  );
}
