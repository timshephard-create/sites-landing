'use client';
import { useState } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('idle'); // idle, url, email, loading, results
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState('');
  const [pagesCrawled, setPagesCrawled] = useState([]);

  const handleUrlSubmit = () => {
    if (!url || !url.startsWith('http')) {
      setError('Please enter a valid URL starting with http:// or https://');
      return;
    }
    setError('');
    setStep('email');
  };

  const handleAudit = async () => {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    setError('');
    setStep('loading');
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, email })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAudit(data.audit);
      setPagesCrawled(data.pagesCrawled || []);
      setStep('results');
    } catch(e) {
      setError('Something went wrong. Please try again.');
      setStep('email');
    }
  };

  const handleCheckout = async () => {
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

  const scoreColor = (score) => {
    if (score >= 80) return '#3B6D11';
    if (score >= 60) return '#854F0B';
    return '#993C1D';
  };

  const impactColor = (impact) => {
    if (impact === 'high') return { bg: '#FAECE7', color: '#993C1D' };
    if (impact === 'medium') return { bg: '#FAEEDA', color: '#854F0B' };
    return { bg: '#EAF3DE', color: '#3B6D11' };
  };

  return (
    <main style={{ fontFamily: "'Georgia', serif", background: '#F7F3EE', minHeight: '100vh', color: '#1A1714' }}>

      {/* NAV */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '1.25rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(247,243,238,0.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid rgba(26,23,20,0.1)' }}>
        <span style={{ fontFamily: 'Georgia, serif', fontSize: '1.1rem' }}>Tim Shephard</span>
        <a href="https://calendly.com/tim-shephard/free-15-min-website-call" target="_blank" rel="noreferrer"
          style={{ background: '#C8522A', color: '#fff', padding: '0.55rem 1.4rem', borderRadius: '2px', fontSize: '0.85rem', textDecoration: 'none' }}>
          Book a free call
        </a>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8rem 2rem 5rem', maxWidth: '1100px', margin: '0 auto' }}>
        <p style={{ fontSize: '0.78rem', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C8522A', marginBottom: '1.5rem' }}>Flat-fee website rebuilds for local businesses</p>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.8rem, 6vw, 5.5rem)', lineHeight: 1.1, fontWeight: 700, maxWidth: '14ch', marginBottom: '1.75rem' }}>
          Your business is great.<br /><em style={{ fontStyle: 'italic', color: '#C8522A' }}>Your website</em><br />should be too.
        </h1>
        <p style={{ fontSize: '1.15rem', color: '#4A4540', maxWidth: '46ch', lineHeight: 1.75, marginBottom: '2.5rem', fontWeight: 300 }}>
          You've built something real. But if your website looks like it was thrown together in 2014, customers are walking away before they ever call you.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <a href="#audit" style={{ background: '#C8522A', color: '#fff', padding: '1rem 2.2rem', borderRadius: '2px', fontSize: '0.95rem', textDecoration: 'none' }}>
            See how your site scores →
          </a>
          <span style={{ fontSize: '0.82rem', color: '#9A9490' }}>Free · Takes 30 seconds · No commitment</span>
        </div>
      </section>

      {/* PROOF BAR */}
      <div style={{ background: '#1A1714', padding: '1.5rem 2rem', display: 'flex', justifyContent: 'center', gap: '3rem', flexWrap: 'wrap' }}>
        {[['$1,500', 'Flat fee, all in'], ['2 wks', 'Delivery time'], ['20+', 'Years in brand & creative'], ['DFW', 'Locally based']].map(([num, label]) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <span style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', color: '#fff', display: 'block' }}>{num}</span>
            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* AUDIT WIDGET */}
      <section id="audit" style={{ padding: '6rem 2rem', maxWidth: '700px', margin: '0 auto' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C8522A', marginBottom: '1rem' }}>Free website audit</p>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.2, marginBottom: '1rem' }}>See exactly what your website is — and isn't — doing for you.</h2>
        <p style={{ fontSize: '1rem', color: '#4A4540', lineHeight: 1.8, marginBottom: '2.5rem', fontWeight: 300 }}>
          Enter your website URL and get an honest assessment in under a minute. No fluff, no generic advice — just a real look at what's working and what's costing you customers.
        </p>

        {step === 'idle' && (
          <div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://yourbusiness.com"
                onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
                style={{ flex: 1, padding: '0.9rem 1rem', border: '1px solid #ddd', borderRadius: '2px', fontSize: '0.95rem', fontFamily: 'Georgia, serif', minWidth: '200px', background: '#fff', color: '#1A1714' }}
              />
              <button onClick={handleUrlSubmit}
                style={{ background: '#C8522A', color: '#fff', border: 'none', padding: '0.9rem 2rem', borderRadius: '2px', fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'Georgia, serif', whiteSpace: 'nowrap' }}>
                Audit my site
              </button>
            </div>
            {error && <p style={{ color: '#993C1D', fontSize: '0.85rem', marginTop: '0.5rem' }}>{error}</p>}
          </div>
        )}

        {step === 'email' && (
          <div style={{ background: '#fff', border: '1px solid #e8e4df', borderRadius: '4px', padding: '2rem' }}>
            <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Where should we send your results?</p>
            <p style={{ fontSize: '0.85rem', color: '#9A9490', marginBottom: '1.5rem', fontWeight: 300 }}>We'll email you a copy so you can reference it later. No spam, ever.</p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@yourbusiness.com"
                onKeyDown={e => e.key === 'Enter' && handleAudit()}
                style={{ flex: 1, padding: '0.9rem 1rem', border: '1px solid #ddd', borderRadius: '2px', fontSize: '0.95rem', fontFamily: 'Georgia, serif', minWidth: '200px', background: '#fff', color: '#1A1714' }}
              />
              <button onClick={handleAudit}
                style={{ background: '#C8522A', color: '#fff', border: 'none', padding: '0.9rem 2rem', borderRadius: '2px', fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'Georgia, serif', whiteSpace: 'nowrap' }}>
                Run audit
              </button>
            </div>
            {error && <p style={{ color: '#993C1D', fontSize: '0.85rem', marginTop: '0.5rem' }}>{error}</p>}
            <p style={{ fontSize: '0.75rem', color: '#9A9490', marginTop: '1rem' }}>Auditing: {url} · <button onClick={() => setStep('idle')} style={{ background: 'none', border: 'none', color: '#C8522A', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}>Change</button></p>
          </div>
        )}

        {step === 'loading' && (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid #e8e4df', borderTopColor: '#C8522A', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1.5rem' }} />
            <p style={{ color: '#4A4540', fontSize: '0.95rem' }}>Analyzing your site — this takes about 20 seconds...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {step === 'results' && audit && (
          <div>
            <div style={{ background: '#fff', border: '1px solid #e8e4df', borderRadius: '4px', padding: '2rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: scoreColor(audit.score), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', color: '#fff', fontWeight: 700 }}>{audit.grade}</span>
                </div>
                <div>
                  <p style={{ fontSize: '0.75rem', color: '#9A9490', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>Overall score</p>
                  <p style={{ fontFamily: 'Georgia, serif', fontSize: '2rem', fontWeight: 700, color: scoreColor(audit.score), margin: 0 }}>{audit.score}/100</p>
                </div>
              </div>
              <p style={{ fontSize: '1rem', color: '#4A4540', lineHeight: 1.7, fontStyle: 'italic', borderLeft: '3px solid #C8522A', paddingLeft: '1rem' }}>{audit.summary}</p>
            </div>

            {pagesCrawled.length > 0 && (
              <p style={{ fontSize: '0.75rem', color: '#9A9490', marginBottom: '1rem' }}>
                Pages analyzed: {pagesCrawled.join(', ')}
              </p>
            )}

            <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', marginBottom: '1rem' }}>What we found</h3>
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

            <div style={{ background: '#1A1714', borderRadius: '4px', padding: '2rem', marginTop: '2rem', textAlign: 'center' }}>
              <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: '#fff', marginBottom: '0.5rem' }}>Want the full picture?</p>
              <p style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.5)', marginBottom: '1.5rem', fontWeight: 300 }}>Get a detailed report with specific fixes, priority order, and estimated impact — delivered to your inbox.</p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <a href="https://calendly.com/tim-shephard/free-15-min-website-call" target="_blank" rel="noreferrer"
                  style={{ background: '#fff', color: '#1A1714', padding: '0.9rem 1.8rem', borderRadius: '2px', fontSize: '0.9rem', textDecoration: 'none', fontFamily: 'Georgia, serif' }}>
                  Book a free call
                </a>
                <button onClick={handleCheckout} style={{ background: '#C8522A', color: '#fff', border: 'none', padding: '0.9rem 1.8rem', borderRadius: '2px', fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'Georgia, serif' }}>
                  Get full report + mockup — $147
                </button>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)', marginTop: '1rem' }}>Full report delivered to {email} within 2 minutes</p>
            </div>
          </div>
        )}
      </section>

      {/* WHAT YOU GET */}
      <section style={{ padding: '6rem 2rem', background: '#fff' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div className="two-col-grid">
            <div>
              <p style={{ fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C8522A', marginBottom: '1rem' }}>What's included</p>
              <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.2, marginBottom: '1.25rem' }}>Everything you need. Nothing you don't.</h2>
              <p style={{ fontSize: '1.05rem', color: '#4A4540', maxWidth: '52ch', lineHeight: 1.8, fontWeight: 300, marginBottom: '2rem' }}>
                A clean, fast, mobile-ready site that tells people who you are, where you are, and why they should choose you — in the first five seconds.
              </p>
              {['Up to 5 pages designed & built', 'Mobile-first design', 'Copywriting included', 'Email capture built in', 'Google Maps & SEO basics', '2-week turnaround'].map(item => (
                <div key={item} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ width: '20px', height: '20px', background: '#C8522A', borderRadius: '2px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: '#fff', fontSize: '0.7rem' }}>✓</span>
                  </div>
                  <span style={{ fontSize: '0.95rem', color: '#1A1714' }}>{item}</span>
                </div>
              ))}
            </div>
            <div style={{ background: '#1A1714', padding: '3rem 2.5rem', borderRadius: '2px' }}>
              <p style={{ fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '0.75rem' }}>Investment</p>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '3.5rem', color: '#fff', lineHeight: 1, marginBottom: '0.4rem' }}>$1,500</div>
              <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.4)', marginBottom: '2rem', fontWeight: 300 }}>One flat fee. No monthly retainer. No surprises.</p>
              <a href="https://calendly.com/tim-shephard/free-15-min-website-call" target="_blank" rel="noreferrer"
                style={{ display: 'block', background: '#C8522A', color: '#fff', padding: '1rem 1.5rem', borderRadius: '2px', fontSize: '0.9rem', textDecoration: 'none', textAlign: 'center', marginBottom: '1rem' }}>
                Book your free 15-min call →
              </a>
              <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>No commitment. Just a conversation.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section style={{ padding: '6rem 2rem', background: '#F7F3EE' }}>
        <div className="about-grid">
          <div>
            <p style={{ fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C8522A', marginBottom: '1rem' }}>Who I am</p>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.2, marginBottom: '1.5rem' }}>A Creative Director.<br />Based right here<br />in DFW.</h2>
            <div style={{ background: '#fff', padding: '1.5rem', borderRadius: '2px', borderLeft: '3px solid #C8522A', marginBottom: '1.5rem' }}>
              <p style={{ fontWeight: 500, fontSize: '0.9rem', color: '#1A1714', marginBottom: '0.3rem' }}>Keep America Beautiful — Senior Creative Director</p>
              <p style={{ fontSize: '0.82rem', color: '#4A4540', fontWeight: 300 }}>Led national campaigns reaching 11.9 million participants across 20,000+ community partners</p>
            </div>
          </div>
          <div>
            <p style={{ fontSize: '1.05rem', color: '#4A4540', lineHeight: 1.8, fontWeight: 300, marginBottom: '1.5rem' }}>I've spent 20 years helping brands communicate clearly and connect with the people who matter most to them.</p>
            <p style={{ fontSize: '1.05rem', color: '#4A4540', lineHeight: 1.8, fontWeight: 300, marginBottom: '1.5rem' }}>I live in Grand Prairie. I know this market. And I started offering flat-fee website rebuilds because I kept seeing great local businesses being let down by their online presence.</p>
            <a href="https://timshephard.co" target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem', color: '#C8522A', textDecoration: 'none', borderBottom: '1px solid rgba(200,82,42,0.3)', paddingBottom: '2px' }}>See my full portfolio →</a>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ background: '#1A1714', padding: '7rem 2rem', textAlign: 'center' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(200,82,42,0.8)', marginBottom: '1rem' }}>Ready?</p>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3.2rem)', color: '#fff', marginBottom: '1.25rem', maxWidth: '18ch', margin: '0 auto 1.25rem' }}>
          Let's build something your customers will actually trust.
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'rgba(255,255,255,0.5)', maxWidth: '52ch', margin: '0 auto 2.5rem', fontWeight: 300 }}>
          Book a free 15-minute call. No pitch, no pressure.
        </p>
        <a href="https://calendly.com/tim-shephard/free-15-min-website-call" target="_blank" rel="noreferrer"
          style={{ background: '#C8522A', color: '#fff', padding: '1.1rem 2.8rem', borderRadius: '2px', fontSize: '1rem', textDecoration: 'none', display: 'inline-block' }}>
          Book your free call →
        </a>
        <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.25)', marginTop: '1.25rem' }}>Flat fee $1,500 · 2-week delivery · DFW based</p>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#1A1714', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <span style={{ fontFamily: 'Georgia, serif', color: 'rgba(255,255,255,0.3)', fontSize: '0.9rem' }}>Tim Shephard · Creative Mind Ventures</span>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <a href="https://timshephard.co" target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.25)', textDecoration: 'none' }}>Portfolio</a>
          <a href="https://calendly.com/tim-shephard/free-15-min-website-call" target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.25)', textDecoration: 'none' }}>Book a call</a>
        </div>
      </footer>

    </main>
  );
}