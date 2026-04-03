import { validateContent, logValidation, getRecentCorrections, formatCorrectionsBlock } from '../_lib/validator.js';

export const maxDuration = 300;

/**
 * Extract signal-rich metadata from raw HTML before stripping tags.
 * Returns structured signals for the AI prompt.
 */
function extractSignals(html, pageUrl) {
  const signals = {};

  // Meta title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  signals.metaTitle = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : null;

  // Meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  signals.metaDescription = descMatch ? descMatch[1].trim() : null;

  // OG tags
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  signals.ogTitle = ogTitle ? ogTitle[1].trim() : null;
  signals.ogDescription = ogDesc ? ogDesc[1].trim() : null;
  signals.hasOgImage = !!ogImage;

  // Viewport meta (mobile-readiness indicator)
  signals.hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html);

  // Schema/structured data
  signals.hasSchemaMarkup = /<script[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(html);
  if (signals.hasSchemaMarkup) {
    const schemaMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (schemaMatches) {
      signals.schemaTypes = schemaMatches.map(m => {
        try {
          const json = JSON.parse(m.replace(/<script[^>]*>|<\/script>/gi, ''));
          return json['@type'] || null;
        } catch { return null; }
      }).filter(Boolean);
    }
  }

  // Platform detection
  const platformIndicators = [
    { name: 'WordPress', pattern: /wp-content|wp-includes|wordpress/i },
    { name: 'Squarespace', pattern: /squarespace\.com|squarespace-cdn/i },
    { name: 'Wix', pattern: /wix\.com|wixsite\.com|parastorage\.com/i },
    { name: 'Shopify', pattern: /shopify\.com|cdn\.shopify/i },
    { name: 'Webflow', pattern: /webflow\.com|assets\.website-files\.com/i },
    { name: 'GoDaddy', pattern: /godaddy\.com|secureserver\.net/i },
    { name: 'Weebly', pattern: /weebly\.com/i },
  ];
  signals.platform = null;
  for (const { name, pattern } of platformIndicators) {
    if (pattern.test(html)) {
      signals.platform = name;
      break;
    }
  }

  // Footer content (copyright year, branding)
  const footerMatch = html.match(/<footer[^>]*>([\s\S]*?)<\/footer>/i);
  if (footerMatch) {
    signals.footerText = footerMatch[1]
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);
  }

  // Copyright year
  const yearMatch = html.match(/©\s*(\d{4})|copyright\s*(\d{4})/i);
  signals.copyrightYear = yearMatch ? (yearMatch[1] || yearMatch[2]) : null;

  // SSL check (based on URL, not HTML)
  signals.isHttps = pageUrl?.startsWith('https://') || false;

  // Social links
  const socialPatterns = ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 'tiktok.com', 'yelp.com'];
  signals.socialLinks = socialPatterns.filter(s => html.toLowerCase().includes(s));

  // Phone number detection
  const phoneMatch = html.match(/(?:tel:|href=["']tel:)([^"'<]+)/i) || html.match(/(\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})/);
  signals.hasPhoneNumber = !!phoneMatch;

  // Image alt text audit (sample)
  const images = html.match(/<img[^>]*>/gi) || [];
  const imagesWithAlt = images.filter(img => /alt=["'][^"']+["']/i.test(img));
  signals.totalImages = images.length;
  signals.imagesWithAlt = imagesWithAlt.length;

  // H1 tags
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  signals.h1Text = h1Match ? h1Match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 200) : null;

  // Navigation structure
  const navMatch = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i);
  if (navMatch) {
    const navLinks = navMatch[1].match(/href=["']([^"']+)["'][^>]*>([^<]*)/gi) || [];
    signals.navItems = navLinks.slice(0, 10).map(l => {
      const text = l.replace(/<[^>]*>/g, '').replace(/href=["'][^"']+["']/g, '').trim();
      return text;
    }).filter(Boolean);
  }

  return signals;
}

/**
 * Clean HTML to plain text for body content analysis.
 */
function cleanHtml(html, maxLength = 2000) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, maxLength);
}

export async function POST(request) {
  const { url, email, turnstileToken } = await request.json();

  // Server-side validation
  if (!url || !url.startsWith('http')) {
    return Response.json({ error: 'Invalid URL' }, { status: 400 });
  }
  if (!email || !email.includes('@')) {
    return Response.json({ error: 'Invalid email' }, { status: 400 });
  }

  // Verify Turnstile CAPTCHA
  if (!turnstileToken) {
    return Response.json({ error: 'Security check required. Please complete the CAPTCHA.' }, { status: 400 });
  }
  try {
    const verifyForm = new URLSearchParams();
    verifyForm.append('secret', process.env.TURNSTILE_SECRET_KEY);
    verifyForm.append('response', turnstileToken);
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: verifyForm,
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success) {
      return Response.json({ error: 'Security check failed. Please refresh and try again.' }, { status: 400 });
    }
  } catch (e) {
    console.error('Turnstile verification error:', e);
    return Response.json({ error: 'Security check failed. Please try again.' }, { status: 400 });
  }

  // Rate limit — check if email already received a free audit
  // Bypass for test account
  if (email !== 'tim.shephard@gmail.com') {
    try {
      const contactRes = await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`, {
        headers: { 'api-key': process.env.BREVO_API_KEY }
      });
      if (contactRes.ok) {
        return Response.json({ error: "Looks like we already sent an audit to that email — check your inbox!" }, { status: 429 });
      }
    } catch (e) {
      console.error('Brevo rate limit check error:', e);
      // Proceed if check fails
    }
  }

  const fetchPage = async (pageUrl) => {
    try {
      const res = await fetch(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) return { html: '', clean: '', signals: {} };
      const html = await res.text();
      return {
        html,
        clean: cleanHtml(html, 2000),
        signals: extractSignals(html, pageUrl)
      };
    } catch(e) {
      return { html: '', clean: '', signals: {} };
    }
  };

  const extractLinks = (html, baseUrl) => {
    const linkRegex = /href=["']([^"']+)["']/gi;
    const matches = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      try {
        const link = new URL(match[1], baseUrl).href;
        if (link.startsWith(baseUrl) && !link.includes('#') && !link.match(/\.(jpg|jpeg|png|gif|pdf|zip|svg|webp|css|js)/i)) {
          matches.push(link);
        }
      } catch(e) {}
    }
    return [...new Set(matches)];
  };

  let siteData = {};
  let homepageSignals = {};
  let rawHomepageHtml = '';

  try {
    const homePage = await fetchPage(url);
    rawHomepageHtml = homePage.html;
    siteData['homepage'] = homePage.clean;
    homepageSignals = homePage.signals;

    const allLinks = extractLinks(rawHomepageHtml, url);
    const priorityKeywords = ['service', 'about', 'contact', 'pricing', 'price', 'team', 'staff', 'booking', 'appointment', 'menu'];

    const priorityLinks = priorityKeywords
      .map(kw => allLinks.find(l => l.toLowerCase().includes(kw)))
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 4);

    // Fetch priority pages in parallel
    const pageResults = await Promise.allSettled(
      priorityLinks.map(async (link) => {
        const pageName = new URL(link).pathname.replace(/\//g, '') || 'page';
        const content = await fetchPage(link);
        return { pageName, content };
      })
    );

    for (const result of pageResults) {
      if (result.status === 'fulfilled' && result.value.content.clean) {
        siteData[result.value.pageName] = result.value.content.clean;
      }
    }
  } catch(e) {
    siteData['homepage'] = 'Could not fetch site.';
  }

  // Build enriched content for AI — includes structured signals
  const signalsSummary = formatSignals(homepageSignals);

  const combinedContent = Object.entries(siteData)
    .map(([page, content]) => `=== ${page.toUpperCase()} ===\n${content}`)
    .join('\n\n');

  const fullPromptContent = `Website URL: ${url}
Pages crawled: ${Object.keys(siteData).join(', ')}

=== TECHNICAL SIGNALS (extracted from HTML) ===
${signalsSummary}

=== PAGE CONTENT ===
${combinedContent}`;

  const recentCorrections = await getRecentCorrections('free-audit');
  const correctionsBlock = formatCorrectionsBlock(recentCorrections);

  const systemPrompt = `${correctionsBlock}You are a website advisor helping local business owners understand how their website is performing. Your tone is that of a knowledgeable friend — honest, clear, never condescending, never salesy. You have crawled multiple pages of their website and have both the page content AND technical signals extracted from the HTML.

Return a JSON object with this exact structure:
{
  "score": number between 0-100,
  "grade": one of F, D, C, B, A,
  "industry": one or two word description of the business type e.g. medspa, plumber, restaurant, law firm,
  "summary": one honest sentence about the overall site — reference something specific you saw (their business name, headline, a missing element, or their platform),
  "issues": array of 4-5 objects, each with { "title": string, "description": string, "impact": one of high/medium/low }
}

Scoring guide:
- 80-100: Site is genuinely good, only minor improvements needed
- 60-79: Solid foundation but missing key conversion elements
- 40-59: Several real problems costing them customers
- Below 40: Significant issues that need immediate attention

For each issue:
- Be specific to what you actually saw on their pages. Reference actual page names, headlines, copy, or elements you found (or didn't find)
- Only flag a feature as missing if you have checked all scraped pages and confirmed it does not appear on any of them. State which pages you checked.
- Use the technical signals: meta title, meta description presence, schema markup, platform, viewport, SSL, image alt text stats, social links, copyright year
- high impact means it is likely costing them customers or revenue right now
- medium impact means it is reducing their effectiveness
- low impact means it would improve the site but is not urgent
- If the site handles something well, skip it and focus on real gaps
- Describe the cost of inaction, not just the problem

STRICT HALLUCINATION RULES — violations will cause this finding to be rejected by the validator:
- NEVER flag a feature as missing unless you have confirmed its absence across ALL scraped pages provided — a feature not found on the homepage may exist on /services or /contact
- NEVER reference competitors or industry benchmarks unless they appear verbatim in the scraped content
- NEVER quote or paraphrase page copy unless the exact text appears in the scraped content provided
- NEVER state a percentage or metric unless it is directly calculable from the scraped data (e.g. alt text ratio must be calculated from actual image count in scraped content, not estimated)
- NEVER flag the current year copyright as outdated — if the copyright year matches the current calendar year it is correct and must not be flagged
- NEVER describe a service as unique or premium unless the site explicitly positions it that way
- Every finding must identify which specific page or element it was observed on — findings without a source are not verifiable and will be rejected
- If you cannot find a specific verifiable issue, do not invent one — fewer accurate findings are better than more hallucinated ones

Rules:
- Base everything on the actual content and technical signals you were given
- If pricing was found on a subpage, note that it requires extra clicks to find
- If contact info was found, note whether it is prominent or buried
- Never fabricate issues that are not supported by the content or signals
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
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: fullPromptContent
        }]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Anthropic API error:', res.status, errText);
      return Response.json({ error: 'Audit analysis failed. Please try again.' }, { status: 502 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();

    let audit;
    try {
      audit = JSON.parse(clean);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr.message, 'Raw:', text.slice(0, 500));
      return Response.json({ error: 'Audit failed — unexpected response format' }, { status: 500 });
    }

    // Validate findings against scraped data
    const businessName = homepageSignals.metaTitle || url;
    const originalAudit = JSON.parse(JSON.stringify(audit));
    const validation = await validateContent({
      contentType: 'free-audit',
      businessName,
      website: url,
      generatedContent: audit,
      scrapedData: fullPromptContent
    });
    if (validation.valid) {
      console.log('[validator] ✓ free-audit passed');
    } else {
      if (validation.correctedContent) {
        try {
          audit = JSON.parse(validation.correctedContent);
          console.log(`[validator] ✗ ${validation.issues.length} issue(s) — auto-corrected`);
        } catch {
          console.log('[validator] ✗ correction parse failed — using original');
        }
      } else {
        console.log('[validator] ✗ uncorrectable — fallback used');
      }
      logValidation({
        contentType: 'free-audit',
        businessName,
        website: url,
        original: originalAudit,
        issues: validation.issues,
        corrected: validation.correctedContent
      }).catch(() => {});
    }

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
            model: 'claude-sonnet-4-5',
            max_tokens: 4000,
            messages: [{
              role: 'user',
              content: `Generate a single clean, modern, high-converting homepage design for a ${audit.industry} business as a complete self-contained HTML file. Requirements: inline styles only, no external CSS, use Google Fonts via a single link tag, fixed navigation bar with logo and CTA button, hero section with compelling headline and CTA, services section with 3 cards, trust/social proof section, final CTA section. Use a cohesive professional color palette. Page should look like a real $5,000 website. Return ONLY the complete HTML starting with <!DOCTYPE html>, no explanation, no markdown backticks.`
            }]
          })
        });
        if (mockupRes.ok) {
          const mockupData = await mockupRes.json();
          const rawMockup = mockupData.content?.[0]?.text || '';
          // Strip markdown code fences Claude often wraps around HTML
          const mockupHtml = rawMockup.replace(/```html|```/g, '').trim();
          if (mockupHtml) {
            teaserImageUrl = await screenshotHtml(mockupHtml);
          }
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
        if (coRes.ok) {
          const coData = await coRes.json();
          checkoutUrl = coData.url || null;
        }
      } catch (e) {
        console.error('Checkout session creation error:', e);
      }
    }

    if (email) {
      // Add to Brevo CRM — log failures but don't block
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
      }).catch((e) => {
        console.error('Brevo contact sync error:', e);
      });

      // Send email — log failures
      try {
        await sendAuditEmail(email, url, audit, teaserImageUrl, checkoutUrl);
      } catch (e) {
        console.error('Audit email send failed:', e.message, '| email:', email, '| url:', url);
      }
    }

    return Response.json({ audit, pagesCrawled: Object.keys(siteData) });
  } catch(err) {
    console.error('Audit error:', err);
    return Response.json({ error: 'Audit failed' }, { status: 500 });
  }
}

/**
 * Format extracted signals into a readable summary for the AI prompt.
 */
function formatSignals(signals) {
  const lines = [];

  if (signals.metaTitle) lines.push(`Meta title: "${signals.metaTitle}"`);
  else lines.push('Meta title: MISSING');

  if (signals.metaDescription) lines.push(`Meta description: "${signals.metaDescription}"`);
  else lines.push('Meta description: MISSING');

  if (signals.h1Text) lines.push(`H1 headline: "${signals.h1Text}"`);
  else lines.push('H1 headline: MISSING');

  lines.push(`HTTPS: ${signals.isHttps ? 'Yes' : 'No — site is not using SSL'}`);
  lines.push(`Mobile viewport meta: ${signals.hasViewport ? 'Present' : 'MISSING — may not be mobile-friendly'}`);

  if (signals.platform) lines.push(`Platform detected: ${signals.platform}`);
  else lines.push('Platform: Not detected (possibly custom-built)');

  lines.push(`Schema/structured data: ${signals.hasSchemaMarkup ? `Yes (types: ${signals.schemaTypes?.join(', ') || 'unknown'})` : 'NONE found'}`);

  if (signals.hasOgImage) lines.push('Open Graph image: Present');
  else lines.push('Open Graph image: MISSING (social sharing will show no preview)');

  if (signals.totalImages > 0) {
    lines.push(`Images: ${signals.totalImages} found, ${signals.imagesWithAlt} have alt text (${Math.round(signals.imagesWithAlt / signals.totalImages * 100)}%)`);
  }

  lines.push(`Phone number visible: ${signals.hasPhoneNumber ? 'Yes' : 'Not found in HTML'}`);

  if (signals.socialLinks?.length > 0) {
    lines.push(`Social links: ${signals.socialLinks.join(', ')}`);
  } else {
    lines.push('Social links: None found');
  }

  if (signals.copyrightYear) {
    const currentYear = new Date().getFullYear();
    if (parseInt(signals.copyrightYear) < currentYear) {
      lines.push(`Copyright year: ${signals.copyrightYear} (OUTDATED — current year is ${currentYear})`);
    } else {
      lines.push(`Copyright year: ${signals.copyrightYear} (current — up to date)`);
    }
  }

  if (signals.footerText) lines.push(`Footer content: "${signals.footerText.slice(0, 200)}"`);

  if (signals.navItems?.length > 0) {
    lines.push(`Navigation items: ${signals.navItems.join(', ')}`);
  }

  return lines.join('\n');
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
      console.error('ScreenshotOne error:', res.status);
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
      replyTo: { name: 'Tim Shephard', email: 'tim@timshephard.co' },
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

  // Hidden preheader text for email client previews
  const preheader = `Your site scored ${audit.score}/100 (${audit.grade}). Here's what we found.`;
  const preheaderHTML = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>`;

  return `
  ${preheaderHTML}
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
                          <a href="${ctaUrl}" data-link-tracking="false" style="display:block;background:#C8522A;color:#ffffff;padding:18px 24px;border-radius:2px;text-decoration:none;font-family:Georgia,serif;font-size:16px;text-align:center;line-height:1.3;">Get Your Full Report &#8594;</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0;font-family:Georgia,serif;font-size:13px;color:rgba(255,255,255,0.35);">Rather just talk? <a href="https://calendly.com/tim-shephard/free-15-min-website-call" style="color:rgba(255,255,255,0.5);text-decoration:underline;">Book a free 15-min call</a></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding-top:28px;text-align:center;">
              <p style="margin:0;font-family:Georgia,serif;font-size:12px;color:#9A9490;">Tim Shephard &middot; Creative Mind Ventures &middot; Dallas-Fort Worth, TX</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>`;
}
