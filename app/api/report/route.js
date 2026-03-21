import { NextResponse } from 'next/server';

export const maxDuration = 300;

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
    const { deflateSync } = await import('zlib');
    const encoded = deflateSync(Buffer.from(html)).toString('base64url');
    const previewUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/mockup-preview?data=${encoded}`;

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

    await res.arrayBuffer();
    return screenshotUrl;

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
  const priorityColors = {
    high:   { bg: '#FAECE7', color: '#993C1D' },
    medium: { bg: '#FAEEDA', color: '#854F0B' },
    low:    { bg: '#EAF3DE', color: '#3B6D11' },
  };

  const sectionsHTML = report.sections.map(section => {
    const sc = section.score >= 80 ? '#3B6D11' : section.score >= 60 ? '#854F0B' : '#993C1D';

    const findingsHTML = section.findings.map(f =>
      `<tr><td style="padding:4px 0;font-family:Georgia,serif;font-size:14px;color:#4A4540;line-height:1.6;">&#8226;&nbsp;&nbsp;${f}</td></tr>`
    ).join('');

    const recsHTML = section.recommendations.map(r => {
      const pc = priorityColors[r.priority] || priorityColors.low;
      return `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;border-radius:2px;background:${pc.bg};">
          <tr>
            <td style="padding:12px 16px;">
              <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:${pc.color};font-weight:bold;">${r.priority} priority</p>
              <p style="margin:0 0 4px;font-family:Georgia,serif;font-size:14px;font-weight:bold;color:#1A1714;">${r.action}</p>
              <p style="margin:0;font-family:Georgia,serif;font-size:13px;color:#4A4540;line-height:1.5;">${r.impact}</p>
            </td>
          </tr>
        </table>`;
    }).join('');

    return `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;border:1px solid #e8e4df;border-radius:4px;background:#ffffff;">
        <tr>
          <td style="padding:24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
              <tr>
                <td>
                  <h3 style="margin:0;font-family:Georgia,serif;font-size:18px;color:#1A1714;">${section.title}</h3>
                </td>
                <td width="80" align="right" valign="middle" style="white-space:nowrap;">
                  <span style="font-family:Georgia,serif;font-size:20px;font-weight:bold;color:${sc};">${section.score}/100</span>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9A9490;">What We Found</p>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
              ${findingsHTML}
            </table>
            <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9A9490;">Recommendations</p>
            ${recsHTML}
          </td>
        </tr>
      </table>`;
  }).join('');

  const mockupSection = mockupImageData ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:40px;">
      <tr>
        <td style="text-align:center;padding-bottom:20px;">
          <p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C8522A;">Your Homepage, Reimagined</p>
          <h2 style="margin:0 0 8px;font-family:Georgia,serif;font-size:22px;color:#1A1714;">Here&#8217;s what a high-converting version of your homepage could look like.</h2>
          <p style="margin:0;font-family:Georgia,serif;font-size:14px;color:#9A9490;">Built around your business, your services, and your customers.</p>
        </td>
      </tr>
      <tr>
        <td style="border:3px solid #C8522A;border-radius:4px;line-height:0;font-size:0;">
          <img src="${mockupImageData}" alt="Your reimagined homepage" width="600" style="width:100%;max-width:600px;height:auto;display:block;border:0;" />
        </td>
      </tr>
      <tr>
        <td style="padding-top:12px;text-align:center;">
          <p style="margin:0;font-family:Georgia,serif;font-size:12px;color:#9A9490;font-style:italic;">This is a design concept based on best practices for your industry. Your actual rebuild would be fully customized.</p>
        </td>
      </tr>
    </table>` : '';

  return `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F3EE;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td style="padding-bottom:40px;text-align:center;">
              <p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C8522A;">Full Website Audit Report</p>
              <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:20px;color:#1A1714;word-break:break-all;">${url}</h1>
              <div style="display:inline-block;background:#1A1714;padding:16px 32px;border-radius:4px;">
                <span style="font-family:Georgia,serif;font-size:48px;color:#ffffff;font-weight:bold;">${report.score}</span>
                <span style="font-family:Georgia,serif;font-size:18px;color:rgba(255,255,255,0.5);">&nbsp;/100&nbsp;&nbsp;&middot;&nbsp;&nbsp;${report.grade}</span>
              </div>
            </td>
          </tr>

          <!-- SUMMARY -->
          <tr>
            <td style="padding-bottom:40px;">
              <div style="background:#ffffff;border-left:4px solid #C8522A;padding:20px;border-radius:0 4px 4px 0;">
                <p style="margin:0;font-family:Georgia,serif;font-size:16px;color:#4A4540;line-height:1.7;font-style:italic;">${report.summary}</p>
              </div>
            </td>
          </tr>

          <!-- MOCKUP -->
          <tr>
            <td>${mockupSection}</td>
          </tr>

          <!-- FINDINGS HEADING -->
          <tr>
            <td style="padding-bottom:20px;">
              <h2 style="margin:0;font-family:Georgia,serif;font-size:24px;color:#1A1714;">Detailed Findings</h2>
            </td>
          </tr>

          <!-- SECTIONS -->
          <tr>
            <td style="padding-bottom:16px;">
              ${sectionsHTML}
            </td>
          </tr>

          <!-- CTA BLOCK -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1A1714;border-radius:4px;">
                <tr>
                  <td style="padding:32px 24px;text-align:center;">
                    <p style="margin:0 0 12px;font-family:Georgia,serif;font-size:24px;color:#ffffff;">Ready to fix this?</p>
                    <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:15px;color:rgba(255,255,255,0.6);line-height:1.7;">You&#8217;ve just seen exactly what&#8217;s holding your website back. Everything in this report is fixable. I do flat-fee website rebuilds for local businesses at $1,500, delivered in two weeks. No ongoing fees, no surprises. No fluff.</p>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td>
                          <a href="https://calendly.com/tim-shephard/free-15-min-website-call" style="display:block;background:#C8522A;color:#ffffff;padding:18px 24px;border-radius:2px;text-decoration:none;font-family:Georgia,serif;font-size:16px;text-align:center;line-height:1.3;">Book a Free 15-Min Call &#8594;</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding-top:28px;text-align:center;">
              <p style="margin:0;font-family:Georgia,serif;font-size:12px;color:#9A9490;">Tim Shephard &middot; Creative Mind Ventures &middot; Grand Prairie, TX</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>`;
}