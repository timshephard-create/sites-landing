export const maxDuration = 300;

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

  const systemPrompt = `You are a website advisor helping local business owners understand how their website is performing. Your tone is that of a knowledgeable friend — honest, clear, never condescending, never salesy. You have crawled multiple pages of their website and you are giving them a real, specific assessment based on what you actually found.

Return a JSON object with this exact structure:
{
  "score": number between 0-100,
  "grade": one of F, D, C, B, A,
  "industry": one or two word description of the business type e.g. medspa, plumber, restaurant, law firm,
  "summary": one honest sentence about the overall site,
  "issues": array of 4-5 objects, each with { "title": string, "description": string, "impact": one of high/medium/low }
}

Scoring guide:
- 80-100: Site is genuinely good, only minor improvements needed
- 60-79: Solid foundation but missing key conversion elements
- 40-59: Several real problems costing them customers
- Below 40: Significant issues that need immediate attention

For each issue:
- Be specific to what you actually saw on their pages
- high impact means it is likely costing them customers or revenue right now
- medium impact means it is reducing their effectiveness
- low impact means it would improve the site but is not urgent
- If the site handles something well, skip it and focus on real gaps
- Describe the cost of inaction, not just the problem

Rules:
- Base everything on the actual content you were given
- If pricing was found on a subpage, note that it requires extra clicks to find
- If contact info was found, note whether it is prominent or buried
- Never fabricate issues that are not supported by the content
- Never use: stunning, seamless, leverage, optimize, solutions
- Return only valid JSON, no markdown, no preamble`;

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

    let teaserImageUrl = null;
    if (audit.industry) {
      try {
        const mockupRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            messages: [{
              role: 'user',
              content: `Generate a single clean, modern, high-converting homepage design for a ${audit.industry} business as a complete self-contained HTML file. Requirements: inline styles only, no external CSS, use Google Fonts via a single link tag, fixed navigation bar with logo and CTA button, hero section with compelling headline and CTA, services section with 3 cards, trust/social proof section, final CTA section. Use a cohesive professional color palette. Page should look like a real $5,000 website. Return ONLY the complete HTML starting with <!DOCTYPE html>, no explanation, no markdown backticks.`
            }]
          })
        });
        const mockupData = await mockupRes.json();
        const mockupHtml = mockupData.content?.[0]?.text || '';
        if (mockupHtml) {
          teaserImageUrl = await screenshotHtml(mockupHtml);
        }
      } catch(e) {
        console.error('Teaser mockup error:', e);
      }
    }

    // Generate a direct Stripe checkout URL for the email CTA
    let checkoutUrl = null;
    if (email) {
      try {
        const coRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/create-checkout-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, websiteUrl: url })
        });
        const coData = await coRes.json();
        checkoutUrl = coData.url || null;
      } catch (e) {
        console.error('Checkout session creation error:', e);
      }
    }

    if (email) {
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

      await sendAuditEmail(email, url, audit, teaserImageUrl, checkoutUrl).catch(() => {});
    }

    return Response.json({ audit, pagesCrawled: Object.keys(siteData) });
  } catch(err) {
    console.error(err);
    return Response.json({ error: 'Audit failed' }, { status: 500 });
  }
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

async function sendAuditEmail(email, url, audit, teaserImageUrl, checkoutUrl) {
  const htmlContent = buildAuditEmailHTML(url, audit, teaserImageUrl, checkoutUrl);

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo error: ${err}`);
  }
}

function buildAuditEmailHTML(url, audit, teaserImageUrl, checkoutUrl) {
  const impactColors = {
    high:   { bg: '#FAECE7', color: '#993C1D' },
    medium: { bg: '#FAEEDA', color: '#854F0B' },
    low:    { bg: '#EAF3DE', color: '#3B6D11' },
  };

  const issuesHTML = (audit.issues || []).map(issue => {
    const ic = impactColors[issue.impact] || impactColors.low;
    return `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;border-radius:4px;border:1px solid #e8e4df;background:#ffffff;">
        <tr>
          <td style="padding:18px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
              <tr>
                <td style="font-family:Georgia,serif;font-size:15px;font-weight:bold;color:#1A1714;padding-right:12px;">${issue.title}</td>
                <td width="100" align="right" valign="top" style="white-space:nowrap;">
                  <span style="display:inline-block;font-family:Arial,sans-serif;font-size:11px;padding:4px 9px;border-radius:2px;background:${ic.bg};color:${ic.color};white-space:nowrap;">${issue.impact} impact</span>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-family:Georgia,serif;font-size:14px;color:#4A4540;line-height:1.7;">${issue.description}</p>
          </td>
        </tr>
      </table>`;
  }).join('');

  const mockupHTML = teaserImageUrl ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0;">
      <tr>
        <td style="text-align:center;padding-bottom:16px;">
          <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C8522A;">What a high-converting ${audit.industry || 'local business'} site looks like</p>
          <h2 style="margin:0 0 8px;font-family:Georgia,serif;font-size:20px;color:#1A1714;">Your site could look like this.</h2>
          <p style="margin:0 0 16px;font-family:Georgia,serif;font-size:14px;color:#4A4540;">Built around your business, your services, and your customers.</p>
        </td>
      </tr>
      <tr>
        <td style="border:3px solid #C8522A;border-radius:4px;line-height:0;font-size:0;">
          <img src="${teaserImageUrl}" alt="Redesigned website example" width="600" style="width:100%;max-width:600px;height:auto;display:block;border:0;" />
        </td>
      </tr>
      <tr>
        <td style="padding-top:8px;text-align:center;">
          <p style="margin:0;font-family:Georgia,serif;font-size:12px;color:#9A9490;font-style:italic;">This is a high-converting example for your industry. Your paid report includes a custom version built around your actual business.</p>
        </td>
      </tr>
    </table>` : '';

  const ctaUrl = checkoutUrl || `${process.env.NEXT_PUBLIC_BASE_URL}`;

  return `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F3EE;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td style="padding-bottom:32px;text-align:center;">
              <p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C8522A;">Free Website Audit</p>
              <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:20px;color:#1A1714;word-break:break-all;">${url}</h1>
              <div style="display:inline-block;background:#1A1714;padding:14px 28px;border-radius:4px;">
                <span style="font-family:Georgia,serif;font-size:42px;color:#ffffff;font-weight:bold;">${audit.score}</span>
                <span style="font-family:Georgia,serif;font-size:16px;color:rgba(255,255,255,0.5);">&nbsp;/100&nbsp;&nbsp;&middot;&nbsp;&nbsp;${audit.grade}</span>
              </div>
            </td>
          </tr>

          <!-- SUMMARY -->
          <tr>
            <td style="padding-bottom:32px;">
              <div style="background:#ffffff;border-left:4px solid #C8522A;padding:18px 20px;border-radius:0 4px 4px 0;">
                <p style="margin:0;font-family:Georgia,serif;font-size:16px;color:#4A4540;line-height:1.7;font-style:italic;">${audit.summary}</p>
              </div>
            </td>
          </tr>

          <!-- ISSUES HEADING -->
          <tr>
            <td style="padding-bottom:16px;">
              <h2 style="margin:0;font-family:Georgia,serif;font-size:22px;color:#1A1714;">What we found</h2>
            </td>
          </tr>

          <!-- ISSUES -->
          <tr>
            <td style="padding-bottom:8px;">
              ${issuesHTML}
            </td>
          </tr>

          <!-- MOCKUP TEASER -->
          <tr>
            <td>${mockupHTML}</td>
          </tr>

          <!-- CTA BLOCK -->
          <tr>
            <td style="padding-top:8px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1A1714;border-radius:4px;">
                <tr>
                  <td style="padding:32px 24px;text-align:center;">
                    <p style="margin:0 0 10px;font-family:Georgia,serif;font-size:22px;color:#ffffff;">Want the full picture?</p>
                    <p style="margin:0 0 8px;font-family:Georgia,serif;font-size:14px;color:rgba(255,255,255,0.5);">The full report goes 7 sections deep with specific fixes and priority order.</p>
                    <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:14px;color:rgba(255,255,255,0.7);">Plus a <strong style="color:#C8522A;">visual mockup of your reimagined homepage</strong> &#8212; built specifically around your business.</p>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                      <tr>
                        <td>
                          <a href="${ctaUrl}" style="display:block;background:#C8522A;color:#ffffff;padding:18px 24px;border-radius:2px;text-decoration:none;font-family:Georgia,serif;font-size:16px;text-align:center;line-height:1.3;">Get Your Full Report &#8594;</a>
                        </td>
                      </tr>
                    </table>
                    <a href="https://calendly.com/tim-shephard/free-15-min-website-call" style="font-family:Georgia,serif;font-size:13px;color:rgba(255,255,255,0.4);text-decoration:none;">Or book a free 15-min call instead</a>
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
