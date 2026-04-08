'use client';
import { useState, useEffect, useRef } from 'react';

export default function FreeAuditLanding() {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('url');
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState('');
  const [pagesCrawled, setPagesCrawled] = useState([]);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [psiData, setPsiData] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const auditInFlight = useRef(false);
  const progressTimer = useRef(null);
  const turnstileRef = useRef(null);
  const turnstileWidgetId = useRef(null);
  const urlInputRef = useRef(null);

  // Autofocus URL input on mount
  useEffect(() => {
    if (urlInputRef.current) urlInputRef.current.focus();
  }, []);

  // Turnstile widget lifecycle
  useEffect(() => {
    if (step !== 'email' && step !== 'scored') {
      if (turnstileWidgetId.current !== null && window.turnstile) {
        window.turnstile.remove(turnstileWidgetId.current);
        turnstileWidgetId.current = null;
        setTurnstileToken('');
      }
      return;
    }

    const renderWidget = () => {
      if (turnstileWidgetId.current !== null || !turnstileRef.current) return;
      turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
        sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
        callback: (token) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
    }
  }, [step]);

  // Progress bar tick for auditing state
  useEffect(() => {
    if (step !== 'auditing') { setLoadingProgress(0); return; }
    setLoadingProgress(0);
    const start = Date.now();
    // Phase 1: ease to 72% over 8 seconds
    const phase1 = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      if (elapsed >= 8) {
        clearInterval(phase1);
        setLoadingProgress(72);
        // Phase 2: creep 0.5% every 800ms, cap at 96%
        progressTimer.current = setInterval(() => {
          setLoadingProgress(prev => prev >= 96 ? prev : prev + 0.5);
        }, 800);
        return;
      }
      // Ease-out curve: fast start, slows toward 72%
      const t = elapsed / 8;
      const eased = 1 - Math.pow(1 - t, 3);
      setLoadingProgress(eased * 72);
    }, 50);
    progressTimer.current = phase1;
    return () => {
      clearInterval(phase1);
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, [step]);

  const handleUrlSubmit = async () => {
    if (!url || !url.startsWith('http')) {
      setError('Please enter a valid URL starting with http:// or https://');
      return;
    }
    setError('');
    setStep('scoring');

    if (typeof gtag !== 'undefined') gtag('event', 'speed_check_started');
    if (typeof fbq !== 'undefined') fbq('trackCustom', 'SpeedCheckStarted');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`/api/psi?url=${encodeURIComponent(url)}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`PSI HTTP ${res.status}`);
      const data = await res.json();
      const rawScore = data?.lighthouseResult?.categories?.performance?.score;
      if (rawScore == null) throw new Error('No score in response');

      const score = Math.round(rawScore * 100);
      const audits = data.lighthouseResult.audits || {};
      const auditIds = ['largest-contentful-paint', 'interactive', 'speed-index', 'uses-optimized-images', 'render-blocking-resources', 'uses-text-compression', 'viewport', 'meta-description'];
      const labelMap = { 'largest-contentful-paint': 'Page load time', 'interactive': 'Ready to use', 'speed-index': 'Visual load speed' };
      const issues = auditIds
        .map(id => audits[id] ? { ...audits[id], _id: id } : null)
        .filter(a => a && a.score !== null && a.score < 0.9 && a.displayValue)
        .slice(0, 3)
        .map(a => ({ title: labelMap[a._id] || a.title, value: a.displayValue }));

      setPsiData({ score, issues });
      setStep('scored');
    } catch (e) {
      setPsiData(null);
      setStep('email');
    }
  };

  const handleAudit = async () => {
    if (auditInFlight.current) return;
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    if (!turnstileToken) {
      setError('Please complete the security check first.');
      return;
    }
    auditInFlight.current = true;
    setError('');
    setStep('auditing');
    window.scrollTo({ top: 0, behavior: 'instant' });

    if (typeof gtag !== 'undefined') gtag('event', 'free_audit_requested');
    if (typeof fbq !== 'undefined') fbq('track', 'Lead');

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, email, turnstileToken })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLoadingProgress(100);
      await new Promise(r => setTimeout(r, 400));
      setAudit(data.audit);
      setPagesCrawled(data.pagesCrawled || []);
      setStep('complete');

      if (typeof gtag !== 'undefined') gtag('event', 'audit_complete');
      if (typeof fbq !== 'undefined') fbq('trackCustom', 'AuditComplete');
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
      setStep('email');
    } finally {
      auditInFlight.current = false;
    }
  };

  const handleCheckout = async () => {
    if (typeof gtag !== 'undefined') gtag('event', 'paid_audit_clicked', { value: 147, currency: 'USD' });
    if (typeof fbq !== 'undefined') fbq('track', 'InitiateCheckout', { value: 147, currency: 'USD' });
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, email })
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setError('Checkout failed. Please try again.');
    } catch (e) {
      setError('Checkout failed. Please try again.');
    }
  };

  const scoreColor = (s) => s >= 90 ? '#3B6D11' : s >= 50 ? '#854F0B' : '#993C1D';

  const impactColor = (impact) => {
    if (impact === 'high') return { bg: '#FAECE7', color: '#993C1D' };
    if (impact === 'medium') return { bg: '#FAEEDA', color: '#854F0B' };
    return { bg: '#EAF3DE', color: '#3B6D11' };
  };

  return (
    <main style={{ fontFamily: "'Georgia', serif", background: '#F7F3EE', minHeight: '100vh', color: '#1A1714' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: '540px', margin: '0 auto', padding: '3rem 1.5rem 4rem' }}>

        {/* HERO — always visible */}
        {(step === 'url' || step === 'scoring') && (
          <div style={{ marginBottom: '2.5rem' }}>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.75rem, 5.5vw, 2.5rem)', lineHeight: 1.15, fontWeight: 700, marginBottom: '1rem' }}>
              Your competitors are stealing your customers — your site is helping them.
            </h1>
            <p style={{ fontSize: '1.05rem', color: '#4A4540', lineHeight: 1.7, fontWeight: 300, marginBottom: '2rem' }}>
              See exactly what's broken. Free audit, no sales call, takes 60 seconds.
            </p>
          </div>
        )}

        {/* STEP: URL INPUT */}
        {step === 'url' && (
          <div>
            <input
              ref={urlInputRef}
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Enter your website URL"
              onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
              style={{ width: '100%', padding: '0.95rem 1rem', border: '1px solid #ddd', borderRadius: '2px', fontSize: '16px', fontFamily: 'Georgia, serif', background: '#fff', color: '#1A1714', minHeight: '52px', boxSizing: 'border-box', marginBottom: '0.75rem' }}
            />
            <button
              onClick={handleUrlSubmit}
              style={{ width: '100%', background: '#C8522A', color: '#fff', border: 'none', padding: '0.95rem 2rem', borderRadius: '2px', fontSize: '1rem', cursor: 'pointer', fontFamily: 'Georgia, serif', minHeight: '52px' }}
            >
              Check My Site Free →
            </button>
            {error && <p style={{ color: '#993C1D', fontSize: '0.85rem', marginTop: '0.5rem' }}>{error}</p>}
            <p style={{ fontSize: '0.82rem', color: '#9A9490', marginTop: '0.75rem', textAlign: 'center' }}>
              No sales call. No obligation. Results in under a minute.
            </p>

            {/* Pain points below fold */}
            <div style={{ marginTop: '3rem', borderTop: '1px solid #e8e4df', paddingTop: '2rem' }}>
              {[
                'Slow load times cost you customers before they ever call.',
                'Most DFW business websites fail basic speed and SEO checks.',
                'Your competitors may already know this about your site.',
              ].map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <span style={{ color: '#C8522A', fontSize: '0.85rem', flexShrink: 0, marginTop: '2px' }}>→</span>
                  <p style={{ fontSize: '0.95rem', color: '#4A4540', lineHeight: 1.7, fontWeight: 300, margin: 0 }}>{line}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP: SCORING (PSI loading) */}
        {step === 'scoring' && (
          <div style={{ textAlign: 'center', padding: '3rem 0' }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid #e8e4df', borderTopColor: '#C8522A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1.5rem' }} />
            <p style={{ color: '#4A4540', fontSize: '0.95rem' }}>Checking your site speed...</p>
          </div>
        )}

        {/* STEP: SCORED — PSI result + email capture */}
        {step === 'scored' && psiData && (
          <div>
            {/* Score display */}
            <div style={{ background: '#fff', border: '1px solid #e8e4df', borderRadius: '4px', padding: '1.5rem', marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.72rem', color: '#9A9490', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>Mobile performance score</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: psiData.issues.length ? '1.25rem' : 0 }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: scoreColor(psiData.score) }}>
                  <span style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', color: '#fff', fontWeight: 700 }}>{psiData.score}</span>
                </div>
                <div>
                  <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.2rem', color: scoreColor(psiData.score) }}>
                    {psiData.score >= 90 ? 'Looking good' : psiData.score >= 50 ? 'Needs improvement' : 'Critical issues found'}
                  </p>
                  <p style={{ fontSize: '0.82rem', color: '#9A9490', margin: 0, fontWeight: 300 }}>Google PageSpeed Insights — mobile</p>
                </div>
              </div>
              {psiData.issues.length > 0 && (
                <div style={{ borderTop: '1px solid #f0ece8', paddingTop: '0.75rem' }}>
                  {psiData.issues.map((issue, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0', borderBottom: i < psiData.issues.length - 1 ? '1px solid #f0ece8' : 'none' }}>
                      <span style={{ fontSize: '0.85rem', color: '#4A4540' }}>{issue.title}</span>
                      <span style={{ fontSize: '0.82rem', color: '#993C1D', fontWeight: 500, marginLeft: '1rem', whiteSpace: 'nowrap' }}>{issue.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Email capture */}
            <div style={{ background: '#fff', border: '1px solid #e8e4df', borderRadius: '4px', padding: '1.5rem' }}>
              <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.75rem' }}>Get your full free audit</p>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@yourbusiness.com"
                onKeyDown={e => e.key === 'Enter' && handleAudit()}
                style={{ width: '100%', padding: '0.95rem 1rem', border: '1px solid #ddd', borderRadius: '2px', fontSize: '16px', fontFamily: 'Georgia, serif', background: '#fff', color: '#1A1714', minHeight: '52px', boxSizing: 'border-box', marginBottom: '0.75rem' }}
              />
              <button
                onClick={handleAudit}
                style={{ width: '100%', background: '#C8522A', color: '#fff', border: 'none', padding: '0.95rem 2rem', borderRadius: '2px', fontSize: '1rem', cursor: 'pointer', fontFamily: 'Georgia, serif', minHeight: '52px' }}
              >
                Get your full free audit →
              </button>
              <div ref={turnstileRef} style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'center' }} />
              {error && <p style={{ color: '#993C1D', fontSize: '0.85rem', marginTop: '0.5rem' }}>{error}</p>}
              <p style={{ fontSize: '0.72rem', color: '#9A9490', marginTop: '0.75rem', textAlign: 'center' }}>No spam. One email with your results.</p>
            </div>
          </div>
        )}

        {/* STEP: EMAIL FALLBACK (PSI failed) */}
        {step === 'email' && (
          <div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.75rem, 5.5vw, 2.5rem)', lineHeight: 1.15, fontWeight: 700, marginBottom: '1rem' }}>
              Your competitors are stealing your customers — your site is helping them.
            </h1>
            <div style={{ background: '#fff', border: '1px solid #e8e4df', borderRadius: '4px', padding: '1.5rem' }}>
              <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.3rem' }}>Get your free audit</p>
              <p style={{ fontSize: '0.85rem', color: '#9A9490', marginBottom: '1rem', fontWeight: 300 }}>We'll email you a full breakdown of your site. No spam, ever.</p>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@yourbusiness.com"
                onKeyDown={e => e.key === 'Enter' && handleAudit()}
                style={{ width: '100%', padding: '0.95rem 1rem', border: '1px solid #ddd', borderRadius: '2px', fontSize: '16px', fontFamily: 'Georgia, serif', background: '#fff', color: '#1A1714', minHeight: '52px', boxSizing: 'border-box', marginBottom: '0.75rem' }}
              />
              <button
                onClick={handleAudit}
                style={{ width: '100%', background: '#C8522A', color: '#fff', border: 'none', padding: '0.95rem 2rem', borderRadius: '2px', fontSize: '1rem', cursor: 'pointer', fontFamily: 'Georgia, serif', minHeight: '52px' }}
              >
                Get your full free audit →
              </button>
              <div ref={turnstileRef} style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'center' }} />
              {error && <p style={{ color: '#993C1D', fontSize: '0.85rem', marginTop: '0.5rem' }}>{error}</p>}
              <p style={{ fontSize: '0.72rem', color: '#9A9490', marginTop: '0.75rem' }}>Auditing: {url} · <button onClick={() => { setStep('url'); setError(''); }} style={{ background: 'none', border: 'none', color: '#C8522A', cursor: 'pointer', fontSize: '0.72rem', padding: 0 }}>Change</button></p>
            </div>
          </div>
        )}

        {/* STEP: AUDITING (progress bar) */}
        {step === 'auditing' && (
          <div style={{ padding: '3rem 0' }}>
            <p style={{ fontSize: '0.95rem', color: '#4A4540', marginBottom: '1rem', textAlign: 'center' }}>
              {Math.round(loadingProgress)}% — {loadingProgress < 25 ? 'Checking site speed...' : loadingProgress < 50 ? 'Analyzing SEO signals...' : loadingProgress < 75 ? 'Scanning for revenue leaks...' : loadingProgress < 100 ? 'Writing your report...' : 'Done — loading your results'}
            </p>
            <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(26,23,20,0.08)' }}>
              <div style={{ width: `${Math.min(loadingProgress, 100)}%`, height: '100%', borderRadius: '4px', background: '#C8522A', transition: 'width 600ms ease-out' }} />
            </div>
          </div>
        )}

        {/* STEP: COMPLETE — audit results + upsell */}
        {step === 'complete' && audit && (
          <div>
            {/* Score + summary */}
            <div style={{ background: '#fff', border: '1px solid #e8e4df', borderRadius: '4px', padding: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.25rem' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: scoreColor(audit.score), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', color: '#fff', fontWeight: 700 }}>{audit.grade}</span>
                </div>
                <div>
                  <p style={{ fontSize: '0.72rem', color: '#9A9490', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Overall score</p>
                  <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 700, color: scoreColor(audit.score), margin: 0 }}>{audit.score}/100</p>
                </div>
              </div>
              <p style={{ fontSize: '0.95rem', color: '#4A4540', lineHeight: 1.7, fontStyle: 'italic', borderLeft: '3px solid #C8522A', paddingLeft: '1rem' }}>{audit.summary}</p>
            </div>

            {pagesCrawled.length > 0 && (
              <p style={{ fontSize: '0.72rem', color: '#9A9490', marginBottom: '1rem' }}>Pages analyzed: {pagesCrawled.join(', ')}</p>
            )}

            {/* Issues */}
            <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', marginBottom: '1rem' }}>What we found</h3>
            {audit.issues?.map((issue, i) => {
              const ic = impactColor(issue.impact);
              return (
                <div key={i} style={{ background: '#fff', border: '1px solid #e8e4df', borderRadius: '4px', padding: '1.25rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <p style={{ fontWeight: 500, fontSize: '0.95rem', margin: 0 }}>{issue.title}</p>
                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '2px', background: ic.bg, color: ic.color, whiteSpace: 'nowrap', marginLeft: '1rem' }}>{issue.impact} impact</span>
                  </div>
                  <p style={{ fontSize: '0.88rem', color: '#4A4540', lineHeight: 1.7, margin: 0, fontWeight: 300 }}>{issue.description}</p>
                </div>
              );
            })}

            {/* $147 Upsell */}
            <div style={{ background: '#1A1714', borderRadius: '4px', padding: '2rem', marginTop: '2rem', textAlign: 'center' }}>
              <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', color: '#fff', marginBottom: '0.5rem' }}>
                Want the full fix? Get your priority action plan.
              </p>
              <p style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.5)', marginBottom: '1.5rem', fontWeight: 300 }}>
                7-section deep-dive with specific fixes, priority order, and a custom mockup of your homepage — delivered to your inbox in minutes.
              </p>
              <button
                onClick={handleCheckout}
                style={{ width: '100%', background: '#C8522A', color: '#fff', border: 'none', padding: '1rem 1.8rem', borderRadius: '2px', fontSize: '1rem', cursor: 'pointer', fontFamily: 'Georgia, serif' }}
              >
                Get the Full Report — $147 →
              </button>
              {error && <p style={{ color: '#FAECE7', fontSize: '0.85rem', marginTop: '0.5rem' }}>{error}</p>}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
