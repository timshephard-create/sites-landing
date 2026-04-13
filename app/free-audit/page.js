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

  // Autofocus URL input when entering URL step
  useEffect(() => {
    if (step === 'url' && urlInputRef.current) urlInputRef.current.focus();
  }, [step]);

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

  const getUrgencyStats = (issues) => {
    if (!issues?.length) return [];
    const text = issues.map(i => `${i.title} ${i.description}`).join(' ').toLowerCase();
    const stats = [];
    if (text.includes('ssl') || text.includes('https') || text.includes('secure')) {
      stats.push('Sites without SSL lose 15\u201320% of visitors due to \u201cNot Secure\u201d browser warnings.');
    }
    if (text.includes('mobile') || text.includes('responsive')) {
      stats.push('53% of web traffic is mobile. A site that doesn\'t work on phones loses more than half its audience.');
    }
    if (text.includes('speed') || text.includes('slow') || text.includes('load') || text.includes('performance')) {
      stats.push('A 1-second delay in page load time reduces conversions by 7%.');
    }
    if (text.includes('contact') || text.includes('phone') || text.includes('booking') || text.includes('call')) {
      stats.push('Visitors who can\'t find a phone number or booking link within 5 seconds leave and don\'t come back.');
    }
    if (text.includes('email') || text.includes('capture') || text.includes('newsletter') || text.includes('list')) {
      stats.push('Businesses without email capture lose 97% of first-time visitors permanently.');
    }
    if (text.includes('seo') || text.includes('google') || text.includes('search') || text.includes('keyword')) {
      stats.push('76% of people who search for a local business on their phone visit within a day \u2014 if they can find you.');
    }
    return stats.slice(0, 3);
  };

  return (
    <main style={{ fontFamily: "'Georgia', serif", background: '#F7F3EE', minHeight: '100vh', color: '#1A1714' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: '540px', margin: '0 auto', padding: '3rem 1.5rem 4rem' }}>

        {/* HERO — visible during URL input and scoring */}
        {(step === 'url' || step === 'scoring') && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.75rem, 5.5vw, 2.5rem)', lineHeight: 1.15, fontWeight: 700, marginBottom: '1rem' }}>
              Your competitors are stealing your customers — your site is helping them.
            </h1>
            <p style={{ fontSize: '1.05rem', color: '#4A4540', lineHeight: 1.7, fontWeight: 300 }}>
              Here's what a free speed check and audit looks like:
            </p>
          </div>
        )}

        {/* SAMPLE AUDIT CARD — visible in URL step */}
        {step === 'url' && (
          <div style={{ background: '#fff', borderRadius: '6px', boxShadow: '0 2px 16px rgba(26,23,20,0.08)', padding: '1.5rem', marginBottom: '1.5rem', position: 'relative', border: '1px solid #e8e4df' }}>
            <span style={{ position: 'absolute', top: '1rem', right: '1rem', fontSize: '10px', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#999' }}>SAMPLE</span>
            <p style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C8522A', textAlign: 'center', marginBottom: '0.5rem' }}>FREE WEBSITE AUDIT</p>

            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <span style={{ fontFamily: 'Georgia, serif', fontSize: '2.5rem', fontWeight: 700, color: '#993C1D' }}>58</span>
              <span style={{ fontSize: '1rem', color: '#9A9490', marginLeft: '0.25rem' }}>/100 · D</span>
            </div>
            <p style={{ fontSize: '0.88rem', color: '#4A4540', lineHeight: 1.7, fontStyle: 'italic', borderLeft: '3px solid #C8522A', paddingLeft: '1rem', marginBottom: '1.25rem' }}>
              This medspa's booking flow and homepage load slowly on mobile, likely costing new patient appointments daily. Three local competitors are outperforming this site on every measurable signal.
            </p>
            <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.75rem' }}>What we found</p>
            {[
              { title: 'No click-to-call button on mobile', impact: 'high impact', desc: "Mobile visitors can't call directly from the homepage — they have to find the number manually." },
              { title: 'Page loads in 9.4s on mobile', impact: 'high impact', desc: 'Industry benchmark for medspas is under 2s. Every second of delay costs an estimated 7% of visitors.' },
              { title: 'Missing reviews schema markup', impact: 'medium impact', desc: "Star ratings don't appear in Google search results — competitors with schema markup look more credible instantly." },
            ].map((issue, i) => (
              <div key={i} style={{ background: '#F7F3EE', borderRadius: '4px', padding: '1rem', marginBottom: i < 2 ? '0.5rem' : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.88rem', margin: 0, color: '#1A1714' }}>{issue.title}</p>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#C8522A', whiteSpace: 'nowrap', marginLeft: '0.75rem' }}>{issue.impact}</span>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#4A4540', lineHeight: 1.6, margin: 0, fontWeight: 300 }}>{issue.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* TRANSITION LINE */}
        {step === 'url' && (
          <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', color: '#1A1714', textAlign: 'center', margin: '1.5rem 0' }}>
            Want to see what we find on yours?
          </p>
        )}

        {/* STEP 1: URL INPUT */}
        {step === 'url' && (
          <div>
            <p style={{ fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9A9490', marginBottom: '0.5rem' }}>Step 1: Enter your website URL</p>
            <input
              ref={urlInputRef}
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="yourwebsite.com"
              onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
              style={{ width: '100%', padding: '0.95rem 1rem', border: '1px solid #ddd', borderRadius: '2px', fontSize: '16px', fontFamily: 'Georgia, serif', background: '#fff', color: '#1A1714', minHeight: '52px', boxSizing: 'border-box', marginBottom: '0.75rem' }}
            />
            <button
              onClick={handleUrlSubmit}
              style={{ width: '100%', background: '#C8522A', color: '#fff', border: 'none', padding: '0.95rem 2rem', borderRadius: '2px', fontSize: '1rem', cursor: 'pointer', fontFamily: 'Georgia, serif', minHeight: '52px' }}
            >
              Show Me My Score →
            </button>
            {error && <p style={{ color: '#993C1D', fontSize: '0.85rem', marginTop: '0.5rem' }}>{error}</p>}
            <p style={{ fontSize: '0.82rem', color: '#9A9490', marginTop: '0.75rem', textAlign: 'center' }}>
              Free. No sales call. See your score in under 60 seconds.
            </p>
            <p style={{ fontSize: '0.78rem', color: '#9A9490', marginTop: '0.25rem', textAlign: 'center' }}>
              Join 200+ DFW businesses who've checked their site.
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

            {/* HONEST URGENCY BOX */}
            {(() => {
              const stats = getUrgencyStats(audit.issues);
              if (!stats.length) return null;
              return (
                <div style={{ background: '#FAECE7', border: '1px solid #E8C4B4', borderRadius: '4px', padding: '1.5rem', marginTop: '1.5rem' }}>
                  <p style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', fontWeight: 700, color: '#993C1D', marginBottom: '1rem' }}>What these issues are costing you:</p>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {stats.map((stat, i) => (
                      <li key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: i < stats.length - 1 ? '0.75rem' : 0 }}>
                        <span style={{ color: '#993C1D', fontSize: '0.9rem', flexShrink: 0, marginTop: '2px' }}>&rarr;</span>
                        <span style={{ fontSize: '0.88rem', color: '#6B2E18', lineHeight: 1.6, fontWeight: 300 }}>{stat}</span>
                      </li>
                    ))}
                  </ul>
                  <button onClick={handleCheckout} style={{ display: 'block', width: '100%', background: '#C8522A', color: '#fff', border: 'none', padding: '0.85rem 1.5rem', borderRadius: '2px', fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'Georgia, serif', marginTop: '1.25rem' }}>
                    Get My Full Audit Report
                  </button>
                </div>
              );
            })()}

            {/* SAMPLE REPORT TEASER */}
            <div style={{ marginTop: '1.5rem', background: '#fff', border: '1px solid #e8e4df', borderRadius: '4px', padding: '1.5rem' }}>
              <p style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', marginBottom: '0.25rem' }}>Your full personalized report is ready.</p>
              <p style={{ fontSize: '0.82rem', color: '#9A9490', marginBottom: '1.25rem', fontWeight: 300 }}>Here's what's inside — with specific fixes, priority order, and a custom mockup of your homepage.</p>
              <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '2px', border: '1px solid #e8e4df' }}>
                {[
                  { heading: 'Performance & Page Speed', lines: ['Your homepage loads in 6.2s on mobile — above the 3s threshold where 53% of visitors abandon.', 'Uncompressed images account for 4.1MB of your total 4.8MB page weight.', 'Fix: Compress all images to WebP, defer non-critical JS, enable browser caching.'] },
                  { heading: 'Mobile Experience', lines: ['Navigation menu breaks at 375px width — tap targets are 18px, below the 44px minimum.', 'Text requires horizontal scrolling on iPhone SE. Two CTAs are completely hidden below the fold.', 'Fix: Rebuild header with mobile-first breakpoints, consolidate CTAs to single action.'] },
                  { heading: 'Local SEO & Google Visibility', lines: ['No structured data markup found. Google cannot display your hours, reviews, or location in search.', 'Title tag is generic ("Home") — missing city name, service type, and differentiator.', 'Fix: Add LocalBusiness schema, rewrite title tags, submit updated sitemap.'] },
                  { heading: 'Trust & Credibility Signals', lines: ['No customer reviews, testimonials, or social proof above the fold.', 'No trust badges, certifications, or credentials visible on key landing pages.', 'Fix: Add 3 testimonials with photos, display years in business, add relevant credentials.'] },
                ].map((section, i) => (
                  <div key={i} style={{ padding: '1rem 1.25rem', borderBottom: i < 3 ? '1px solid #e8e4df' : 'none', position: 'relative' }}>
                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1A1714', marginBottom: '0.4rem', letterSpacing: '0.02em' }}>{section.heading}</p>
                    <div style={{ filter: 'blur(4px)', userSelect: 'none', pointerEvents: 'none' }}>
                      {section.lines.map((line, j) => (
                        <p key={j} style={{ fontSize: '0.78rem', color: '#4A4540', lineHeight: 1.6, margin: j < section.lines.length - 1 ? '0 0 0.3rem' : 0, fontWeight: 300 }}>{line}</p>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%', background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.97))', pointerEvents: 'none' }} />
              </div>
              <button onClick={handleCheckout} style={{ display: 'block', width: '100%', background: '#C8522A', color: '#fff', border: 'none', padding: '1rem 1.8rem', borderRadius: '2px', fontSize: '1rem', cursor: 'pointer', fontFamily: 'Georgia, serif', marginTop: '1.25rem' }}>
                Get My Full Audit Report
              </button>
            </div>

            {/* FREE VS PAID COMPARISON TABLE */}
            <div style={{ marginTop: '1.5rem', border: '1px solid #e8e4df', borderRadius: '4px', overflow: 'hidden', background: '#fff' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #e8e4df' }}>
                <div style={{ padding: '0.75rem 1rem', background: '#F7F3EE', borderRight: '1px solid #e8e4df' }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: '#4A4540', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Free Audit</p>
                </div>
                <div style={{ padding: '0.75rem 1rem', background: '#1A1714' }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: '#C8522A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Full Report — $147</p>
                </div>
              </div>
              {[
                ['Homepage + up to 4 pages crawled', 'Up to 9 pages + sitemap crawl'],
                ['4–5 issues identified', '7 full sections analyzed'],
                ['Issue descriptions + impact ratings', 'Specific findings from your actual pages'],
                ['Generic industry mockup', 'Custom AI mockup of your homepage'],
                ['On screen + email', 'Full report delivered to your inbox'],
              ].map(([free, paid], i, arr) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: i < arr.length - 1 ? '1px solid #e8e4df' : 'none' }}>
                  <div style={{ padding: '0.6rem 1rem', borderRight: '1px solid #e8e4df', background: '#FAFAF9' }}>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#6B6560', fontWeight: 300, lineHeight: 1.4 }}>{free}</p>
                  </div>
                  <div style={{ padding: '0.6rem 1rem', background: '#fff' }}>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#1A1714', fontWeight: 400, lineHeight: 1.4 }}>{paid}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* MAIN CTA BLOCK */}
            <div style={{ background: '#1A1714', borderRadius: '4px', padding: '2rem', marginTop: '1.5rem', textAlign: 'center' }}>
              <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: '#fff', marginBottom: '0.5rem' }}>Want the full picture?</p>
              <p style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.5rem', fontWeight: 300 }}>7-section deep-dive with specific fixes, priority order, and a custom mockup of your homepage — delivered to your inbox in minutes.</p>
              <p style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.7)', marginBottom: '1.5rem' }}>Everything in the free audit is fixable. The full report shows you exactly how.</p>
              <button onClick={handleCheckout} style={{ display: 'block', width: '100%', background: '#C8522A', color: '#fff', border: 'none', padding: '1rem 1.8rem', borderRadius: '2px', fontSize: '1rem', cursor: 'pointer', fontFamily: 'Georgia, serif', marginBottom: '0.75rem' }}>
                Get My Full Audit Report — $147
              </button>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)', marginBottom: '1.25rem' }}>Delivered to {email} within 2 minutes</p>
              <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
                Not ready to buy?&nbsp;
                <a href="https://calendly.com/tim-shephard/free-15-min-website-call" target="_blank" rel="noreferrer" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'underline' }}>Book a free 15-min call instead</a>
              </p>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
