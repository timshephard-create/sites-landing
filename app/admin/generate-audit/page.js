'use client';

import { useEffect, useState } from 'react';

export const dynamic = 'force-dynamic';

export default function AdminGenerateAuditPage() {
  const [secret, setSecret] = useState('');
  const [hasSecret, setHasSecret] = useState(false);
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('admin_secret');
    if (stored) {
      setSecret(stored);
      setHasSecret(true);
    }
  }, []);

  const saveSecret = (e) => {
    e.preventDefault();
    if (!secret) return;
    sessionStorage.setItem('admin_secret', secret);
    setHasSecret(true);
  };

  const clearSecret = () => {
    sessionStorage.removeItem('admin_secret');
    setSecret('');
    setHasSecret(false);
    setResult(null);
    setError(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/generate-audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': secret
        },
        body: JSON.stringify({ url, email })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        if (res.status === 401) {
          sessionStorage.removeItem('admin_secret');
          setHasSecret(false);
        }
      } else {
        setResult(data);
        setUrl('');
      }
    } catch (err) {
      setError(err.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const wrapStyle = { maxWidth: 560, margin: '60px auto', padding: '0 20px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1A1714' };
  const inputStyle = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #d4cfc8', borderRadius: 4, marginTop: 4, fontFamily: 'inherit' };
  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, marginTop: 16 };
  const buttonStyle = { marginTop: 20, padding: '12px 20px', background: '#1A1714', color: '#fff', border: 0, borderRadius: 4, cursor: 'pointer', fontSize: 14, fontWeight: 600 };

  if (!hasSecret) {
    return (
      <div style={wrapStyle}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Admin: Generate Audit</h1>
        <p style={{ color: '#666', fontSize: 14 }}>Enter the admin secret to continue. Stored in sessionStorage for this tab only.</p>
        <form onSubmit={saveSecret}>
          <label style={labelStyle}>
            Admin secret
            <input
              type="password"
              autoFocus
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              style={inputStyle}
            />
          </label>
          <button type="submit" style={buttonStyle}>Continue</button>
        </form>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Admin: Generate Audit</h1>
        <button onClick={clearSecret} style={{ background: 'none', border: 0, color: '#999', cursor: 'pointer', fontSize: 12 }}>clear secret</button>
      </div>
      <p style={{ color: '#666', fontSize: 14, marginTop: 6 }}>
        Triggers the same paid-flow report generator. Email is sent on completion (typically 30–90 seconds).
      </p>
      <form onSubmit={submit}>
        <label style={labelStyle}>
          Website URL
          <input
            type="url"
            required
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={inputStyle}
            disabled={submitting}
          />
        </label>
        <label style={labelStyle}>
          Recipient email
          <input
            type="email"
            required
            placeholder="lead@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            disabled={submitting}
          />
        </label>
        <button type="submit" style={{ ...buttonStyle, opacity: submitting ? 0.6 : 1 }} disabled={submitting}>
          {submitting ? 'Enqueuing…' : 'Generate audit'}
        </button>
      </form>

      {result && (
        <div style={{ marginTop: 24, padding: 16, background: '#EAF3DE', border: '1px solid #c9dfa9', borderRadius: 4, fontSize: 14, color: '#3B6D11' }}>
          <strong>Enqueued.</strong>
          <div style={{ marginTop: 6 }}>{result.message}</div>
        </div>
      )}
      {error && (
        <div style={{ marginTop: 24, padding: 16, background: '#FAECE7', border: '1px solid #e8c5b5', borderRadius: 4, fontSize: 14, color: '#993C1D' }}>
          <strong>Error.</strong>
          <div style={{ marginTop: 6 }}>{error}</div>
        </div>
      )}
    </div>
  );
}
