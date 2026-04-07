'use client';

const cards = [
  {
    niche: 'MEDSPA',
    headline: 'Radiance Med Spa',
    problem: 'Coupon-led, template-pink, and five years out of date.',
    wins: ['Editorial noir redesign', 'Single book CTA', 'Press authority strip'],
    bg: '#0e0d0b',
    accent: '#c4a472',
    headlineFont: "'Cormorant Garamond', serif",
    headlineStyle: 'italic',
    headlineWeight: 300,
    labelFont: "'DM Mono', monospace",
    textColor: '#f0ece4',
    mutedColor: '#9a8a78',
    pillBg: 'rgba(196,164,114,0.12)',
    pillBorder: 'rgba(196,164,114,0.25)',
    pillColor: '#c4a472',
    nicheBg: '#c4a472',
    nicheColor: '#0e0d0b',
  },
  {
    niche: 'DENTAL',
    headline: 'Cornerstone Family Dental',
    problem: 'Cold blue template. Doctor buried. Reviews hidden in a sidebar.',
    wins: ['Warm boutique palette', 'Doctor-forward hero', 'Trust above the fold'],
    bg: '#f7f5f0',
    accent: '#6b8f71',
    headlineFont: "'Nunito', sans-serif",
    headlineStyle: 'normal',
    headlineWeight: 800,
    labelFont: "'DM Mono', monospace",
    textColor: '#2a2420',
    mutedColor: '#8a7a68',
    pillBg: 'rgba(107,143,113,0.1)',
    pillBorder: 'rgba(107,143,113,0.25)',
    pillColor: '#6b8f71',
    nicheBg: '#6b8f71',
    nicheColor: '#fff',
  },
  {
    niche: 'HVAC',
    headline: 'Apex Air & Heat',
    problem: 'All-caps chaos, six badge claims, and a coupon where the CTA should be.',
    wins: ['Bold trade authority', 'Emergency bar urgency', 'License callouts above fold'],
    bg: '#0f1a2e',
    accent: '#e8521a',
    headlineFont: "'Bebas Neue', sans-serif",
    headlineStyle: 'normal',
    headlineWeight: 400,
    labelFont: "'DM Mono', monospace",
    textColor: '#fff',
    mutedColor: '#8090a8',
    pillBg: 'rgba(232,82,26,0.12)',
    pillBorder: 'rgba(232,82,26,0.25)',
    pillColor: '#e8521a',
    nicheBg: '#e8521a',
    nicheColor: '#fff',
  },
];

const quotes = [
  {
    text: 'He took responsibility for the KAB brand, completely overhauled the website, and succeeded with almost no budget and a remarkably positive outlook on a very tight timeframe.',
    name: 'Noah Ullman',
    title: 'CMO — Keep America Beautiful',
  },
  {
    text: "Tim is the total package: Concept, Design, Execution, Polish, Delivery. His positive attitude and witty humor were a constant pick-me-up to our team.",
    name: 'Nathan McCall',
    title: 'Pali Camp',
  },
  {
    text: "Tim is one of the best creative directors I've ever worked with in my 13-year career. He does a great job pushing the boundaries beyond what clients often expect.",
    name: "Isma'il Rashada",
    title: 'Loch Harbour Group / DHS S&T Directorate',
  },
  {
    text: 'Tim consistently delivers exceptional results. What sets Tim apart is not just his creative marketing expertise but also his outstanding communication and collaboration skills.',
    name: 'Helen Lowman',
    title: 'CEO — Keep America Beautiful',
  },
  {
    text: "Tim's remarkable creativity is only matched by his collaborative attitude and his positive influence on our work environment.",
    name: 'Rick Ringel',
    title: 'Director — Ecrion Software',
  },
];

export default function SocialProofBlock() {
  const handleScrollToTop = (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <section style={{ background: '#1a1a18', padding: '5rem 2rem', color: '#f5f3ee' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Nunito:wght@300;400;600;700;800&family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500;600&family=Barlow+Condensed:ital,wght@0,700;1,900&display=swap');
        .sp-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; max-width: 1100px; margin: 0 auto 1.5rem; }
        .sp-quotes-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; max-width: 1100px; margin: 0 auto; }
        @media (max-width: 768px) {
          .sp-cards { grid-template-columns: 1fr; }
          .sp-quotes-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* A. Eyebrow */}
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', letterSpacing: '0.15em', color: '#e8521a', textTransform: 'uppercase', marginBottom: '3rem' }}>
          // The Work
        </p>
      </div>

      {/* B. Industry Cards */}
      <div className="sp-cards">
        {cards.map((card) => (
          <div key={card.niche} style={{
            background: card.bg,
            borderRadius: '4px',
            padding: '2rem 1.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            border: `1px solid ${card.niche === 'DENTAL' ? '#e2ddd4' : 'rgba(255,255,255,0.06)'}`,
          }}>
            {/* Niche pill */}
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '9px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              background: card.nicheBg,
              color: card.nicheColor,
              padding: '4px 10px',
              alignSelf: 'flex-start',
            }}>
              {card.niche}
            </span>

            {/* Headline */}
            <h3 style={{
              fontFamily: card.headlineFont,
              fontStyle: card.headlineStyle,
              fontWeight: card.headlineWeight,
              fontSize: card.niche === 'HVAC' ? '1.8rem' : '1.5rem',
              color: card.textColor,
              lineHeight: 1.1,
              letterSpacing: card.niche === 'HVAC' ? '1.5px' : '0',
            }}>
              {card.headline}
            </h3>

            {/* Problem line */}
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.82rem',
              color: card.mutedColor,
              lineHeight: 1.6,
              fontStyle: 'italic',
            }}>
              {card.problem}
            </p>

            {/* Win pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: 'auto' }}>
              {card.wins.map((win) => (
                <span key={win} style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '9px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '4px 10px',
                  background: card.pillBg,
                  border: `1px solid ${card.pillBorder}`,
                  color: card.pillColor,
                }}>
                  {win}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <p style={{
        fontFamily: "'DM Mono', monospace",
        fontSize: '10px',
        color: '#555',
        textAlign: 'center',
        fontStyle: 'italic',
        letterSpacing: '0.06em',
        marginBottom: '4rem',
      }}>
        Concept work — portfolio demonstrations
      </p>

      {/* C. Quotes */}
      <div className="sp-quotes-grid">
        {quotes.map((q, i) => (
          <div key={i} style={{ padding: '0.5rem 0' }}>
            {/* Orange open-quote */}
            <span style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontStyle: 'italic',
              fontSize: '3.5rem',
              color: '#e8521a',
              lineHeight: 0.6,
              display: 'block',
              marginBottom: '0.75rem',
            }}>
              &ldquo;
            </span>
            {/* Quote body */}
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '0.92rem',
              color: '#f5f3ee',
              lineHeight: 1.75,
              marginBottom: '0.75rem',
              fontWeight: 300,
            }}>
              {q.text}
            </p>
            {/* Attribution */}
            <p style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              color: '#888880',
              letterSpacing: '0.06em',
            }}>
              — {q.name}, {q.title}
            </p>
          </div>
        ))}
      </div>

      {/* D. CTA line */}
      <div style={{ textAlign: 'center', marginTop: '4rem' }}>
        <a
          href="#"
          onClick={handleScrollToTop}
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '1rem',
            color: '#f5f3ee',
            textDecoration: 'none',
          }}
        >
          Ready to see what your site could be?{' '}
          <span style={{ color: '#e8521a' }}>&rarr;</span>
        </a>
      </div>
    </section>
  );
}
