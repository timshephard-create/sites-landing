'use client';
import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('idle'); // idle, url, email, loading, results
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState('');
  const [pagesCrawled, setPagesCrawled] = useState([]);
  const [exitIntentShown, setExitIntentShown] = useState(false);
  const [exitIntentDismissed, setExitIntentDismissed] = useState(false);
  const [stickyDismissed, setStickyDismissed] = useState(false);
  const [showSticky, setShowSticky] = useState(false);
  const auditInFlight = useRef(false);

  useEffect(() => {
    const handleScroll = () => setShowSticky(window.scrollY > 300);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (step !== 'results' || exitIntentShown || exitIntentDismissed) return;
    const handleMouseMove = (e) => {
      if (e.clientY < 50) setExitIntentShown(true);
    };
    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [step, exitIntentShown, exitIntentDismissed]);

  const handleUrlSubmit = () => {
    if (!url || !url.startsWith('http')) {
      setError('Please enter a valid URL starting with http:// or https://');
      return;
    }
    setError('');
    setStep('email');
  };

  const handleAudit = async () => {
    if (auditInFlight.current) return; // Prevent double-submit
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    auditInFlight.current = true;
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
    } finally {
      auditInFlight.current = false;
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

  const getUrgencyStats = (issues) => {
    if (!issues?.length) return [];
    const text = issues.map(i => `${i.title} ${i.description}`).join(' ').toLowerCase();
    const stats = [];
    if (text.includes('ssl') || text.includes('https') || text.includes('secure')) {
      stats.push('Sites without SSL lose 15–20% of visitors due to "Not Secure" browser warnings.');
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
      stats.push('76% of people who search for a local business on their phone visit within a day — if they can find you.');
    }
    return stats.slice(0, 3);
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
            <p style={{ color: '#4A4540', fontSize: '0.95rem' }}>Analyzing your site — hang tight, this usually takes 30–60 seconds...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {step === 'results' && audit && (
          <div>
            {/* Score + summary */}
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
                        <span style={{ color: '#993C1D', fontSize: '0.9rem', flexShrink: 0, marginTop: '2px' }}>→</span>
                        <span style={{ fontSize: '0.88rem', color: '#6B2E18', lineHeight: 1.6, fontWeight: 300 }}>{stat}</span>
                      </li>
                    ))}
                  </ul>
                  <button onClick={handleCheckout} style={{ display: 'block', width: '100%', background: '#C8522A', color: '#fff', border: 'none', padding: '0.85rem 1.5rem', borderRadius: '2px', fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'Georgia, serif', marginTop: '1.25rem' }}>
                    See the full fix — $147 report →
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
                {/* Fade overlay over bottom 2 sections */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%', background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.97))', pointerEvents: 'none' }} />
              </div>
              <button onClick={handleCheckout} style={{ display: 'block', width: '100%', background: '#C8522A', color: '#fff', border: 'none', padding: '1rem 1.8rem', borderRadius: '2px', fontSize: '1rem', cursor: 'pointer', fontFamily: 'Georgia, serif', marginTop: '1.25rem' }}>
                Get Your Full Report →
              </button>
            </div>

            {/* MAIN CTA BLOCK */}
            <div style={{ background: '#1A1714', borderRadius: '4px', padding: '2rem', marginTop: '1.5rem', textAlign: 'center' }}>
              <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: '#fff', marginBottom: '0.5rem' }}>Want the full picture?</p>
              <p style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.5rem', fontWeight: 300 }}>7-section deep-dive with specific fixes, priority order, and a custom mockup of your homepage — delivered to your inbox in minutes.</p>
              <p style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.7)', marginBottom: '1.5rem' }}>Everything in the free audit is fixable. The full report shows you exactly how.</p>
              <button onClick={handleCheckout} style={{ display: 'block', width: '100%', background: '#C8522A', color: '#fff', border: 'none', padding: '1rem 1.8rem', borderRadius: '2px', fontSize: '1rem', cursor: 'pointer', fontFamily: 'Georgia, serif', marginBottom: '0.75rem' }}>
                Get Full Report + Custom Mockup — $147
              </button>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)', marginBottom: '1.25rem' }}>Delivered to {email} within 2 minutes</p>
              <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
                Not ready to buy?&nbsp;
                <a href="https://calendly.com/tim-shephard/free-15-min-website-call" target="_blank" rel="noreferrer" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'underline' }}>Book a free 15-min call instead</a>
              </p>
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
            <p style={{ fontSize: '1.05rem', color: '#4A4540', lineHeight: 1.8, fontWeight: 300, marginBottom: '1.5rem' }}>I'm based in the Dallas-Fort Worth area. I know this market. And I started offering flat-fee website rebuilds because I kept seeing great local businesses being let down by their online presence.</p>
            <a href="https://timshephard.co" target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem', color: '#C8522A', textDecoration: 'none', borderBottom: '1px solid rgba(200,82,42,0.3)', paddingBottom: '2px' }}>See my full portfolio →</a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: '6rem 2rem', background: '#fff' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C8522A', marginBottom: '1rem' }}>Common questions</p>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.2, marginBottom: '3rem' }}>Things people usually ask.</h2>
          {[
            {
              q: 'What does $1,500 actually include?',
              a: 'Everything you need to launch: up to 5 pages designed and built, mobile-first layout, copywriting, email capture, Google Maps integration, and basic SEO setup. One flat fee, no monthly retainer, no hidden costs. You own the site outright when we\'re done.'
            },
            {
              q: 'What platform do you build on?',
              a: 'We build on the platform that best fits your needs and budget — whether that\'s a custom-coded site for full design control, or a user-friendly CMS like Squarespace for clients who want to manage their own content after handoff. We\'ll recommend the right approach based on your goals.'
            },
            {
              q: 'How does the two-week turnaround actually work?',
              a: 'Week one is design: you\'ll see a full homepage concept and give feedback. Week two is build and launch. It moves fast, so we ask that you\'re available to review and respond within 24 hours at each stage. Most projects finish on time when clients are.'
            },
            {
              q: 'Do I need to provide copy and photos?',
              a: 'No. Copywriting is included — I\'ll write the content based on a short intake form you fill out before we start. For photos, I\'ll work with what you have, source stock where needed, or let you know if professional photography would meaningfully improve the result.'
            },
            {
              q: 'What if I already have a website — can you just improve it?',
              a: 'Sometimes. If the foundation is solid, a targeted refresh may make sense. But in most cases, rebuilding from scratch is faster, cheaper, and produces a better result than patching an outdated site. The free audit will tell you which situation you\'re in.'
            },
          ].map((item, i, arr) => (
            <div key={i} style={{ borderTop: '1px solid #e8e4df', paddingTop: '1.5rem', paddingBottom: '1.5rem', borderBottom: i === arr.length - 1 ? '1px solid #e8e4df' : 'none' }}>
              <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', fontWeight: 500, marginBottom: '0.6rem' }}>{item.q}</p>
              <p style={{ fontSize: '0.95rem', color: '#4A4540', lineHeight: 1.8, margin: 0, fontWeight: 300 }}>{item.a}</p>
            </div>
          ))}
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

      {/* MOBILE STICKY CTA — visible after 300px scroll, hidden once audit has been run */}
      {showSticky && !stickyDismissed && step === 'idle' && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200, background: '#1A1714', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <a href="#audit" style={{ flex: 1, display: 'block', background: '#C8522A', color: '#fff', padding: '0.85rem 1rem', borderRadius: '2px', fontSize: '0.9rem', textDecoration: 'none', textAlign: 'center', fontFamily: 'Georgia, serif' }}>
            See how your site scores →
          </a>
          <button onClick={() => setStickyDismissed(true)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.5rem', lineHeight: 1, flexShrink: 0 }}>
            ✕
          </button>
        </div>
      )}

      {/* EXIT INTENT OVERLAY */}
      {exitIntentShown && !exitIntentDismissed && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,23,20,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ background: '#F7F3EE', borderRadius: '4px', padding: '2.5rem', maxWidth: '480px', width: '100%', position: 'relative' }}>
            <button onClick={() => setExitIntentDismissed(true)} aria-label="Close" style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: '#9A9490', fontSize: '1.1rem', lineHeight: 1, padding: '0.25rem' }}>
              ✕
            </button>
            <p style={{ fontSize: '0.72rem', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C8522A', marginBottom: '0.75rem' }}>Don't lose your audit results</p>
            <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', lineHeight: 1.25, marginBottom: '1rem' }}>Your issues are identified.<br />The fixes are waiting.</p>
            <p style={{ fontSize: '0.9rem', color: '#4A4540', lineHeight: 1.7, fontWeight: 300, marginBottom: '1.5rem' }}>
              The full report gives you a prioritized action plan, specific fixes for every issue found, and a custom mockup of what your homepage could look like — delivered to your inbox in minutes.
            </p>
            <button onClick={() => { setExitIntentDismissed(true); handleCheckout(); }} style={{ display: 'block', width: '100%', background: '#C8522A', color: '#fff', border: 'none', padding: '1rem 1.8rem', borderRadius: '2px', fontSize: '1rem', cursor: 'pointer', fontFamily: 'Georgia, serif', marginBottom: '0.75rem' }}>
              Get My Full Report — $147
            </button>
            <button onClick={() => setExitIntentDismissed(true)} style={{ display: 'block', width: '100%', background: 'none', border: 'none', color: '#9A9490', fontSize: '0.8rem', cursor: 'pointer', padding: '0.5rem', fontFamily: 'Georgia, serif' }}>
              No thanks, I'll figure it out myself
            </button>
          </div>
        </div>
      )}

    </main>
  );
}
