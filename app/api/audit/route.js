export async function POST(request) {
  const { url, email } = await request.json();

  const fetchPage = async (pageUrl) => {
    try {
      const res = await fetch(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000)
      });
      const html = await res.text();
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[^\x20-\x7E]/g, '')
        .slice(0, 2000);
    } catch(e) {
      return '';
    }
  };

  const extractLinks = (html, baseUrl) => {
    const linkRegex = /href=["']([^"']+)["']/gi;
    const matches = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      try {
        const link = new URL(match[1], baseUrl).href;
        if (link.startsWith(baseUrl) && !link.includes('#') && !link.match(/\.(jpg|jpeg|png|gif|pdf|zip)/i)) {
          matches.push(link);
        }
      } catch(e) {}
    }
    return [...new Set(matches)];
  };

  let siteData = {};
  let rawHomepage = '';

  try {
    const homeRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000)
    });
    rawHomepage = await homeRes.text();
    siteData['homepage'] = rawHomepage
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[^\x20-\x7E]/g, '')
      .slice(0, 2000);

    const allLinks = extractLinks(rawHomepage, url);
    const priorityKeywords = ['service', 'about', 'contact', 'pricing', 'price', 'team', 'staff', 'booking', 'appointment', 'menu'];
    
    const priorityLinks = priorityKeywords
      .map(kw => allLinks.find(l => l.toLowerCase().includes(kw)))
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 4);

    for (const link of priorityLinks) {
      const pageName = new URL(link).pathname.replace(/\//g, '') || 'page';
      const content = await fetchPage(link);
      if (content) siteData[pageName] = content;
    }
  } catch(e) {
    siteData['homepage'] = 'Could not fetch site.';
  }

  const combinedContent = Object.entries(siteData)
    .map(([page, content]) => `=== ${page.toUpperCase()} ===\n${content}`)
    .join('\n\n');

  const systemPrompt = "You are a website advisor helping local business owners understand how their website is performing. Your tone is that of a knowledgeable friend — honest, clear, never condescending, never salesy. You have crawled multiple pages of their website and you are giving them a real, specific assessment based on what you actually found.\n\nReturn a JSON object with this exact structure:\n{\n  \"score\": number between 0-100,\n  \"grade\": one of F, D, C, B, A,\n  \"summary\": one honest sentence about the overall site,\n  \"issues\": array of 4-5 objects, each with { \"title\": string, \"description\": string, \"impact\": one of high/medium/low }\n}\n\nScoring guide:\n- 80-100: Site is genuinely good, only minor improvements needed\n- 60-79: Solid foundation but missing key conversion elements\n- 40-59: Several real problems costing them customers\n- Below 40: Significant issues that need immediate attention\n\nFor each issue:\n- Be specific to what you actually saw on their pages\n- high impact means it is likely costing them customers or revenue right now\n- medium impact means it is reducing their effectiveness\n- low impact means it would improve the site but is not urgent\n- If the site handles something well, skip it and focus on real gaps\n- Describe the cost of inaction, not just the problem\n\nRules:\n- Base everything on the actual content you were given\n- If pricing was found on a subpage, note that it requires extra clicks to find\n- If contact info was found, note whether it is prominent or buried\n- Never fabricate issues that are not supported by the content\n- Never use: stunning, seamless, leverage, optimize, solutions\n- Return only valid JSON, no markdown, no preamble";

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ 
          role: 'user', 
          content: 'Website URL: ' + url + '\nPages crawled: ' + Object.keys(siteData).join(', ') + '\n\n' + combinedContent 
        }]
      })
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const audit = JSON.parse(clean);

    if (email) {
      // Save contact to Brevo list
      await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': process.env.BREVO_API_KEY
        },
        body: JSON.stringify({
          email,
          attributes: { WEBSITE_URL: url },
          listIds: [2],
          updateEnabled: true
        })
      }).catch(() => {});

      // Send free audit summary email
      await sendAuditEmail(email, url, audit).catch(() => {});
    }

    return Response.json({ audit, pagesCrawled: Object.keys(siteData) });
  } catch(err) {
    console.error(err);
    return Response.json({ error: 'Audit failed' }, { status: 500 });
  }
}

async function sendAuditEmail(email, url, audit) {
  const scoreColor = audit.score >= 80 ? '#3B6D11' : audit.score >= 60 ? '#854F0B' : '#993C1D';
  const impactColor = (impact) => {
    if (impact === 'high') return { bg: '#FAECE7', color: '#993C1D' };
    if (impact === 'medium') return { bg: '#FAEEDA', color: '#854F0B' };
    return { bg: '#EAF3DE', color: '#3B6D11' };
  };

  const issuesHTML = audit.issues?.map(issue => {
    const ic = impactColor(issue.impact);
    return `
      <div style="background:#fff; border:1px solid #e8e4df; border-radius:4px; padding:16px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <strong style="font-size:0.92rem; color:#1A1714;">${issue.title}</strong>
          <span style="font-size:0.7rem; padding:2px 8px; border-radius:2px; background:${ic.bg}; color:${ic.color}; white-space:nowrap; margin-left:12px;">${issue.impact} impact</span>
        </div>
        <p style="font-size:0.85rem; color:#4A4540; line-height:1.6; margin:0;">${issue.description}</p>
      </div>
    `;
  }).join('') || '';

  const htmlContent = `
    <div style="max-width:640px; margin:0 auto; font-family:Georgia,serif; color:#1A1714; background:#F7F3EE; padding:40px 20px;">

      <div style="text-align:center; margin-bottom:32px;">
        <p style="font-size:0.72rem; letter-spacing:0.12em; text-transform:uppercase; color:#C8522A; margin-bottom:8px;">Free Website Audit</p>
        <h1 style="font-size:1.4rem; margin:0 0 16px; word-break:break-all;">${url}</h1>
        <div style="display:inline-block; background:#1A1714; padding:12px 28px; border-radius:4px;">
          <span style="font-size:2.5rem; color:#fff; font-weight:700; font-family:Georgia,serif;">${audit.score}</span>
          <span style="font-size:1rem; color:rgba(255,255,255,0.5);">/100 · ${audit.grade}</span>
        </div>
      </div>

      <div style="background:#fff; border-left:3px solid #C8522A; padding:16px 20px; margin-bottom:32px; border-radius:0 4px 4px 0;">
        <p style="font-size:0.95rem; color:#4A4540; line-height:1.7; font-style:italic; margin:0;">${audit.summary}</p>
      </div>

      <h2 style="font-family:Georgia,serif; font-size:1.1rem; margin:0 0 16px;">What we found</h2>
      ${issuesHTML}

      <div style="background:#1A1714; border-radius:4px; padding:28px; margin-top:32px; text-align:center;">
        <p style="font-family:Georgia,serif; font-size:1.1rem; color:#fff; margin-bottom:8px;">Want the full picture?</p>
        <p style="font-size:0.85rem; color:rgba(255,255,255,0.5); margin-bottom:8px; font-weight:300;">The full report goes 7 sections deep with specific fixes, priority order, and estimated impact on your revenue.</p>
        <p style="font-size:0.85rem; color:rgba(255,255,255,0.7); margin-bottom:20px; font-weight:400;">Plus — you get a <strong style="color:#C8522A;">visual mockup of your reimagined homepage</strong>, built specifically around your business. See exactly what your site could look like before you spend a dollar on a rebuild.</p>
        <a href="${process.env.NEXT_PUBLIC_BASE_URL}#audit" style="display:inline-block; background:#C8522A; color:#fff; padding:12px 24px; border-radius:2px; text-decoration:none; font-size:0.9rem; font-family:Georgia,serif; margin-bottom:16px;">Get full report + mockup — $147 →</a>
        <br />
        <a href="https://calendly.com/tim-shephard/free-15-min-website-call" style="font-size:0.82rem; color:rgba(255,255,255,0.4); text-decoration:none;">Or book a free 15-min call instead</a>
      </div>

      <p style="text-align:center; font-size:0.72rem; color:#9A9490; margin-top:28px;">Tim Shephard · Creative Mind Ventures · Grand Prairie, TX</p>
    </div>
  `;

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { name: 'Tim Shephard', email: 'tim@timshephard.co' },
      to: [{ email }],
      subject: `Your free website audit — ${url}`,
      htmlContent
    })
  });
}