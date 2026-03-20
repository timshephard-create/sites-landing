import { NextResponse } from 'next/server';

export async function POST(request) {
  const { url, email } = await request.json();

  const fetchPage = async (pageUrl) => {
    try {
      const res = await fetch(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000)
      });
      const html = await res.text();
      return {
        raw: html.slice(0, 12000),
        clean: html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/[^\x20-\x7E]/g, '')
          .slice(0, 4000)
      };
    } catch(e) {
      return null;
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
    const homePage = await fetchPage(url);
    if (homePage) {
      rawHomepage = homePage.raw;
      siteData['homepage'] = homePage.clean;
    }

    const allLinks = extractLinks(rawHomepage, url);
    const priorityKeywords = ['service', 'about', 'contact', 'pricing', 'price', 'team', 'staff', 'booking', 'appointment', 'menu', 'faq', 'work', 'portfolio', 'product', 'location'];

    const priorityLinks = priorityKeywords
      .map(kw => allLinks.find(l => l.toLowerCase().includes(kw)))
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 6);

    const remainingLinks = allLinks
      .filter(l => !priorityLinks.includes(l))
      .slice(0, 3);

    for (const link of [...priorityLinks, ...remainingLinks]) {
      const pageName = new URL(link).pathname.replace(/\//g, '-').replace(/^-|-$/g, '') || 'page';
      const content = await fetchPage(link);
      if (content) siteData[pageName] = content.clean;
    }
  } catch(e) {
    siteData['homepage'] = 'Could not fetch site.';
  }

  const combinedContent = Object.entries(siteData)
    .map(([page, content]) => `=== ${page.toUpperCase()} ===\n${content}`)
    .join('\n\n');

  // Run audit and mockup generation in parallel
  const [reportResult, mockupResult] = await Promise.allSettled([
    generateReport(url, combinedContent, Object.keys(siteData)),
    generateMockup(url, siteData['homepage'] || '')
  ]);

  const report = reportResult.status === 'fulfilled' ? reportResult.value : null;
  const mockupHtml = mockupResult.status === 'fulfilled' ? mockupResult.value : null;

  if (!report) {
    return NextResponse.json({ error: 'Report generation failed' }, { status: 500 });
  }

  // Screenshot the mockup
  let mockupImageData = null;
  if (mockupHtml) {
    mockupImageData = await screenshotHtml(mockupHtml);
  }

  await sendReportEmail(email, url, report, mockupImageData);
  return NextResponse.json({ success: true });
}

async function generateReport(url, combinedContent, pagesCrawled) {
  const systemPrompt = `You are a senior website strategist delivering a paid audit report to a small business owner. This is a premium $147 report — it should be thorough, specific, and genuinely useful. You have crawled multiple pages of their site.

Return a JSON object with this exact structure:
{
  "score": number between 0-100,
  "grade": one of F, D, C-, C, C+, B-, B, B+, A-, A, A+,
  "summary": "2-3 sentence executive summary referencing specific things found on the site",
  "sections": [
    {
      "title": "string",
      "score": number between 0-100,
      "findings": ["3-5 specific strings about what was found"],
      "recommendations": [
        { "priority": "high|medium|low", "action": "specific action to take", "impact": "expected outcome" }
      ]
    }
  ]
}

Include these 7 sections: First Impressions, SEO & Discoverability, Mobile Experience, Trust & Credibility, Calls to Action, Page Speed & Technical, Content Quality.

Rules:
- Reference actual content, page names, copy, and structure you found
- High priority = likely costing them customers right now
- Be direct and specific — this is a paid report, not a free summary
- Never fabricate issues not supported by the content
- Never use: stunning, seamless, leverage, optimize, solutions
- Return only valid JSON, no markdown, no preamble`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Website URL: ${url}\nPages crawled: ${pagesCrawled.join(', ')}\n\n${combinedContent}`
      }]
    })
  });

  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

async function generateMockup(url, homepageContent) {
  const domain = new URL(url).hostname.replace('www.', '');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 4000,
      system: `You are an expert web designer. Based on the business content provided, generate a single clean, modern, high-converting homepage design as a complete self-contained HTML file.

Requirements:
- Use only inline styles (no external CSS files)
- Use Google Fonts via a single <link> tag (pick one elegant font appropriate for the business)
- Include a fixed navigation bar with logo/business name and a CTA button
- Include a hero section with a compelling headline, subheadline, and CTA button
- Include a services/features section with 3 cards
- Include a trust/social proof section (testimonial or stats bar)
- Include a final CTA section
- Use a cohesive color palette that fits the business type
- Make it look like a real $5,000 website — professional, modern, conversion-focused
- Page should be exactly 900px tall when rendered at 1280px wide
- Do not use any external images — use CSS gradients or solid colors for backgrounds
- Return ONLY the complete HTML starting with <!DOCTYPE html>, no explanation, no markdown backticks`,
      messages: [{
        role: 'user',
        content: `Business website: ${url}\nDomain: ${domain}\n\nCurrent homepage content:\n${homepageContent}\n\nGenerate an improved homepage design for this business.`
      }]
    })
  });

  const data = await res.json();
  const html = data.content?.[0]?.text || '';
  return html.replace(/```html|```/g, '').trim();
}

async function screenshotHtml(html) {
  try {
    // Store HTML and get a temp ID
    const id = Date.now().toString();
    const { mockupStore } = await import('../mockup-preview/route.js');
    mockupStore.set(id, html);

    // Clean up after 5 minutes
    setTimeout(() => mockupStore.delete(id), 5 * 60 * 1000);

    const previewUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/mockup-preview?id=${id}`;

    const params = new URLSearchParams({
      access_key: process.env.SCREENSHOT_ONE_ACCESS_KEY,
      url: previewUrl,
      viewport_width: '1280',
      viewport_height: '900',
      device_scale_factor: '1',
      format: 'jpg',
      image_quality: '85',
      full_page: 'false',
      delay: '2'
    });

    const screenshotUrl = `https://api.screenshotone.com/take?${params.toString()}`;
    const res = await fetch(screenshotUrl);

    if (!res.ok) {
      console.error('ScreenshotOne error:', await res.text());
      return null;
    }

    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:image/jpeg;base64,${base64}`;

  } catch(e) {
    console.error('Screenshot error:', e);
    return null;
  }
}

async function sendReportEmail(email, url, report, mockupImageData) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { name: 'Tim Shephard', email: 'tim@timshephard.co' },
      to: [{ email }],
      subject: `Your Full Website Audit Report — ${url}`,
      htmlContent: buildEmailHTML(url, report, mockupImageData)
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo error: ${err}`);
  }
}

function buildEmailHTML(url, report, mockupImageData) {
  const sectionHTML = report.sections.map(section => `
    <div style="margin-bottom:32px; border:1px solid #e8e4df; border-radius:4px; padding:24px; background:#fff;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="margin:0; font-family:Georgia,serif; font-size:1.1rem; color:#1A1714;">${section.title}</h3>
        <span style="font-size:1.4rem; font-weight:700; color:${section.score >= 80 ? '#3B6D11' : section.score >= 60 ? '#854F0B' : '#993C1D'};">${section.score}/100</span>
      </div>
      <h4 style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; color:#9A9490; margin:0 0 8px;">What We Found</h4>
      <ul style="margin:0 0 16px; padding-left:20px;">
        ${section.findings.map(f => `<li style="margin-bottom:6px; font-size:0.9rem; color:#4A4540; line-height:1.6;">${f}</li>`).join('')}
      </ul>
      <h4 style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; color:#9A9490; margin:0 0 8px;">Recommendations</h4>
      ${section.recommendations.map(r => `
        <div style="background:${r.priority === 'high' ? '#FAECE7' : r.priority === 'medium' ? '#FAEEDA' : '#EAF3DE'}; border-radius:2px; padding:12px; margin-bottom:8px;">
          <div style="margin-bottom:4px;">
            <span style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.08em; color:${r.priority === 'high' ? '#993C1D' : r.priority === 'medium' ? '#854F0B' : '#3B6D11'}; font-weight:600;">${r.priority} priority</span>
          </div>
          <strong style="font-size:0.88rem; color:#1A1714;">${r.action}</strong>
          <p style="margin:4px 0 0; font-size:0.82rem; color:#4A4540; line-height:1.5;">${r.impact}</p>
        </div>
      `).join('')}
    </div>
  `).join('');

  const mockupSection = mockupImageData ? `
    <div style="margin-bottom:40px;">
      <div style="text-align:center; margin-bottom:20px;">
        <p style="font-size:0.75rem; letter-spacing:0.12em; text-transform:uppercase; color:#C8522A; margin-bottom:8px;">Your Homepage, Reimagined</p>
        <h2 style="font-family:Georgia,serif; font-size:1.4rem; color:#1A1714; margin:0 0 8px;">Here's what a high-converting version of your homepage could look like.</h2>
        <p style="font-size:0.88rem; color:#9A9490; margin:0;">Built around your business, your services, and your customers.</p>
      </div>
      <div style="border:3px solid #C8522A; border-radius:4px; overflow:hidden; box-shadow:0 8px 32px rgba(0,0,0,0.12);">
        <img src="${mockupImageData}" alt="Your reimagined homepage" style="width:100%; display:block;" />
      </div>
      <p style="font-size:0.78rem; color:#9A9490; text-align:center; margin-top:12px; font-style:italic;">This is a design concept based on best practices for your industry. Your actual rebuild would be fully customized.</p>
    </div>
  ` : '';

  return `
    <div style="max-width:680px; margin:0 auto; font-family:Georgia,serif; color:#1A1714; background:#F7F3EE; padding:40px 20px;">

      <div style="text-align:center; margin-bottom:40px;">
        <p style="font-size:0.75rem; letter-spacing:0.12em; text-transform:uppercase; color:#C8522A; margin-bottom:8px;">Full Website Audit Report</p>
        <h1 style="font-size:1.6rem; margin:8px 0; word-break:break-all; color:#1A1714;">${url}</h1>
        <div style="display:inline-block; background:#1A1714; padding:16px 32px; border-radius:4px; margin-top:16px;">
          <span style="font-size:3rem; color:#fff; font-weight:700;">${report.score}</span>
          <span style="font-size:1.2rem; color:rgba(255,255,255,0.5);">/100 &nbsp;·&nbsp; ${report.grade}</span>
        </div>
      </div>

      <div style="background:#fff; border-left:3px solid #C8522A; padding:20px; margin-bottom:40px; font-size:1rem; line-height:1.7; color:#4A4540; font-style:italic; border-radius:0 4px 4px 0;">
        ${report.summary}
      </div>

      ${mockupSection}

      <h2 style="font-family:Georgia,serif; font-size:1.3rem; margin:0 0 20px; color:#1A1714;">Detailed Findings</h2>
      ${sectionHTML}

      <div style="background:#1A1714; padding:32px; border-radius:4px; text-align:center; margin-top:40px;">
        <p style="color:#fff; font-family:Georgia,serif; font-size:1.2rem; margin-bottom:8px;">Ready to make this real?</p>
        <p style="color:rgba(255,255,255,0.5); font-size:0.88rem; margin-bottom:20px; font-weight:300;">Book a free 15-minute call. We'll talk through the priorities and I'll show you exactly what your rebuild would look like. Flat fee $1,500, 2-week delivery.</p>
        <a href="https://calendly.com/tim-shephard/free-15-min-website-call" style="background:#C8522A; color:#fff; padding:12px 28px; border-radius:2px; text-decoration:none; font-size:0.9rem; font-family:Georgia,serif;">Book your free call →</a>
      </div>

      <p style="text-align:center; font-size:0.75rem; color:#9A9490; margin-top:32px;">Tim Shephard · Creative Mind Ventures · Grand Prairie, TX</p>
    </div>
  `;
}