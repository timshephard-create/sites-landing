import { NextResponse } from 'next/server';
import { validateContent, validateMockupContent, logValidation, getRecentCorrections, formatCorrectionsBlock } from '../_lib/validator.js';

export const maxDuration = 300;

/**
 * Extract signal-rich metadata from raw HTML before stripping tags.
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

  // Footer content
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

  // SSL
  signals.isHttps = pageUrl?.startsWith('https://') || false;

  // Social links
  const socialPatterns = ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'youtube.com', 'tiktok.com', 'yelp.com'];
  signals.socialLinks = socialPatterns.filter(s => html.toLowerCase().includes(s));

  // Phone number
  const phoneMatch = html.match(/(?:tel:|href=["']tel:)([^"'<]+)/i) || html.match(/(\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})/);
  signals.hasPhoneNumber = !!phoneMatch;
  signals.phoneNumber = phoneMatch ? (phoneMatch[1] || phoneMatch[0]).trim() : null;

  // Image alt text audit
  const images = html.match(/<img[^>]*>/gi) || [];
  const imagesWithAlt = images.filter(img => /alt=["'][^"']+["']/i.test(img));
  signals.totalImages = images.length;
  signals.imagesWithAlt = imagesWithAlt.length;

  // H1 tags
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  signals.h1Text = h1Match ? h1Match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 200) : null;

  // All headings (H1-H3) for content structure
  const headings = [];
  const headingRegex = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let headingMatch;
  while ((headingMatch = headingRegex.exec(html)) !== null && headings.length < 15) {
    const text = headingMatch[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (text) headings.push(`H${headingMatch[1]}: ${text}`);
  }
  signals.headings = headings;

  // Navigation structure
  const navMatch = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i);
  if (navMatch) {
    const navLinks = navMatch[1].match(/>([^<]+)</g) || [];
    signals.navItems = navLinks
      .map(l => l.replace(/^>|<$/g, '').trim())
      .filter(t => t.length > 1 && t.length < 50)
      .slice(0, 10);
  }

  // CTA buttons detection
  const ctaPatterns = /(?:book|call|schedule|contact|get started|free|sign up|subscribe|buy|order|request|learn more|get quote)/i;
  const buttons = html.match(/<(?:button|a)[^>]*>[^<]*<\/(?:button|a)>/gi) || [];
  signals.ctaButtons = buttons
    .filter(b => ctaPatterns.test(b))
    .map(b => b.replace(/<[^>]*>/g, '').trim())
    .filter(Boolean)
    .slice(0, 8);

  // Google Analytics / Tag Manager
  signals.hasGoogleAnalytics = /google-analytics\.com|googletagmanager\.com|gtag/i.test(html);

  return signals;
}

function cleanHtml(html, maxLength = 4000) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, maxLength);
}

function formatSignals(signals, pageLabel = 'homepage') {
  const lines = [];

  if (signals.metaTitle) lines.push(`Meta title (${pageLabel}): "${signals.metaTitle}"`);
  else lines.push(`Meta title (${pageLabel}): MISSING`);

  if (signals.metaDescription) lines.push(`Meta description (${pageLabel}): "${signals.metaDescription}"`);
  else lines.push(`Meta description (${pageLabel}): MISSING`);

  if (signals.h1Text) lines.push(`H1 headline (${pageLabel}): "${signals.h1Text}"`);
  else lines.push(`H1 headline (${pageLabel}): MISSING`);

  return lines.join('\n');
}

function formatHomepageSignals(signals) {
  const lines = [];

  if (signals.metaTitle) lines.push(`Meta title: "${signals.metaTitle}"`);
  else lines.push('Meta title: MISSING');

  if (signals.metaDescription) lines.push(`Meta description: "${signals.metaDescription}"`);
  else lines.push('Meta description: MISSING');

  if (signals.h1Text) lines.push(`H1 headline: "${signals.h1Text}"`);
  else lines.push('H1 headline: MISSING');

  lines.push(`HTTPS: ${signals.isHttps ? 'Yes' : 'No — site is not using SSL'}`);
  lines.push(`Mobile viewport meta: ${signals.hasViewport ? 'Present' : 'MISSING'}`);

  if (signals.platform) lines.push(`Platform detected: ${signals.platform}`);
  else lines.push('Platform: Not detected (possibly custom-built)');

  lines.push(`Schema/structured data: ${signals.hasSchemaMarkup ? `Yes (types: ${signals.schemaTypes?.join(', ') || 'unknown'})` : 'NONE found'}`);
  lines.push(`Open Graph image: ${signals.hasOgImage ? 'Present' : 'MISSING'}`);

  if (signals.totalImages > 0) {
    const pct = Math.round(signals.imagesWithAlt / signals.totalImages * 100);
    lines.push(`Images: ${signals.totalImages} found, ${signals.imagesWithAlt} have alt text (${pct}%)`);
  }

  lines.push(`Phone number: ${signals.hasPhoneNumber ? signals.phoneNumber || 'found' : 'Not found'}`);
  lines.push(`Google Analytics: ${signals.hasGoogleAnalytics ? 'Present' : 'Not detected'}`);

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

  if (signals.footerText) lines.push(`Footer content: "${signals.footerText.slice(0, 300)}"`);

  if (signals.navItems?.length > 0) {
    lines.push(`Navigation items: ${signals.navItems.join(', ')}`);
  }

  if (signals.ctaButtons?.length > 0) {
    lines.push(`CTA buttons found: ${signals.ctaButtons.join(' | ')}`);
  } else {
    lines.push('CTA buttons: None clearly identified');
  }

  if (signals.headings?.length > 0) {
    lines.push(`Content headings: ${signals.headings.join(' | ')}`);
  }

  return lines.join('\n');
}

export async function POST(request) {
  const reportStart = Date.now();
  console.log('[REPORT] ========== REPORT GENERATION STARTED ==========');
  console.log('[REPORT] Timestamp:', new Date().toISOString());

  const { url, email } = await request.json();
  console.log('[REPORT] URL:', url);
  console.log('[REPORT] Email:', email);

  // Server-side validation
  if (!url || !url.startsWith('http')) {
    console.error('[REPORT] REJECTED — invalid URL');
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }
  if (!email || !email.includes('@')) {
    console.error('[REPORT] REJECTED — invalid email');
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const fetchPage = async (pageUrl) => {
    try {
      const res = await fetch(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) return null;
      const html = await res.text();
      return {
        raw: html.slice(0, 12000),
        clean: cleanHtml(html, 4000),
        signals: extractSignals(html, pageUrl)
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
        if (link.startsWith(baseUrl) && !link.includes('#') && !link.match(/\.(jpg|jpeg|png|gif|pdf|zip|svg|webp|css|js)/i)) {
          matches.push(link);
        }
      } catch(e) {}
    }
    return [...new Set(matches)];
  };

  /**
   * Try to fetch and parse sitemap.xml for additional page URLs.
   */
  const fetchSitemapUrls = async (baseUrl) => {
    try {
      const origin = new URL(baseUrl).origin;
      const sitemapRes = await fetch(`${origin}/sitemap.xml`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000)
      });
      if (!sitemapRes.ok) return [];
      const xml = await sitemapRes.text();
      const urls = [];
      const locRegex = /<loc>([^<]+)<\/loc>/gi;
      let locMatch;
      while ((locMatch = locRegex.exec(xml)) !== null) {
        const locUrl = locMatch[1].trim();
        if (locUrl.startsWith(origin) && !locUrl.match(/\.(jpg|jpeg|png|gif|pdf|zip|svg|webp)/i)) {
          urls.push(locUrl);
        }
      }
      return urls;
    } catch {
      return [];
    }
  };

  let siteData = {};
  let allPageSignals = {};
  let rawHomepage = '';
  const unreliablePages = [];

  try {
    // Fetch homepage and sitemap in parallel
    const [homePage, sitemapUrls] = await Promise.all([
      fetchPage(url),
      fetchSitemapUrls(url)
    ]);

    if (homePage) {
      rawHomepage = homePage.raw;
      siteData['homepage'] = homePage.clean;
      allPageSignals['homepage'] = homePage.signals;
    }

    // Discover pages from both homepage links and sitemap
    const homepageLinks = extractLinks(rawHomepage, url);
    const allDiscoveredUrls = [...new Set([...homepageLinks, ...sitemapUrls])];

    const priorityKeywords = ['service', 'about', 'contact', 'pricing', 'price', 'team', 'staff', 'booking', 'appointment', 'menu', 'faq', 'work', 'portfolio', 'product', 'location'];

    const priorityLinks = priorityKeywords
      .map(kw => allDiscoveredUrls.find(l => l.toLowerCase().includes(kw)))
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 6);

    const remainingLinks = allDiscoveredUrls
      .filter(l => !priorityLinks.includes(l) && l !== url)
      .slice(0, 3);

    const allLinksToFetch = [...priorityLinks, ...remainingLinks];

    // Fetch all subpages in parallel
    const pageResults = await Promise.allSettled(
      allLinksToFetch.map(async (link) => {
        const pageName = new URL(link).pathname.replace(/\//g, '-').replace(/^-|-$/g, '') || 'page';
        const content = await fetchPage(link);
        return { pageName, link, content };
      })
    );

    for (const result of pageResults) {
      if (result.status === 'fulfilled' && result.value.content) {
        const { pageName, content } = result.value;
        if (content.clean && content.clean.length < 200) {
          unreliablePages.push(pageName);
        } else {
          siteData[pageName] = content.clean;
          allPageSignals[pageName] = content.signals;
        }
      }
    }
  } catch(e) {
    siteData['homepage'] = 'Could not fetch site.';
  }

  // Build enriched content with signals
  const homepageSignalsSummary = allPageSignals['homepage']
    ? formatHomepageSignals(allPageSignals['homepage'])
    : 'No homepage signals extracted';

  const subpageSignalsSummary = Object.entries(allPageSignals)
    .filter(([key]) => key !== 'homepage')
    .map(([page, signals]) => formatSignals(signals, page))
    .join('\n');

  const combinedContent = Object.entries(siteData)
    .map(([page, content]) => `=== ${page.toUpperCase()} ===\n${content}`)
    .join('\n\n');

  const unreliableNote = unreliablePages.length
    ? `\nUnreliable scrapes (returned < 200 chars, do NOT base findings on these): ${unreliablePages.join(', ')}`
    : '';

  const fullPromptContent = `Website URL: ${url}
Pages crawled: ${Object.keys(siteData).join(', ')}${unreliableNote}
Total pages discovered: ${Object.keys(siteData).length}

=== HOMEPAGE TECHNICAL SIGNALS ===
${homepageSignalsSummary}

=== SUBPAGE META SIGNALS ===
${subpageSignalsSummary || 'No subpage signals extracted'}

=== PAGE CONTENT ===
${combinedContent}`;

  // Fetch recent corrections and run generation in parallel
  console.log('[REPORT] Pages crawled:', Object.keys(siteData).join(', '));
  console.log('[REPORT] Starting AI generation (report + mockup in parallel)...');
  const aiStart = Date.now();

  const recentCorrections = await getRecentCorrections('paid-audit');
  const correctionsBlock = formatCorrectionsBlock(recentCorrections);

  const [reportResult, mockupResult] = await Promise.allSettled([
    generateReport(url, fullPromptContent, Object.keys(siteData), correctionsBlock),
    generateMockup(url, siteData['homepage'] || '', allPageSignals['homepage'] || {})
  ]);

  console.log('[REPORT] AI generation completed in', Date.now() - aiStart, 'ms');
  console.log('[REPORT] Report result:', reportResult.status, reportResult.status === 'rejected' ? reportResult.reason?.message : '');
  console.log('[REPORT] Mockup result:', mockupResult.status, mockupResult.status === 'rejected' ? mockupResult.reason?.message : '');

  let report = reportResult.status === 'fulfilled' ? reportResult.value : null;
  let mockupHtml = mockupResult.status === 'fulfilled' ? mockupResult.value : null;

  // Validate paid mockup for fabricated specifics
  if (mockupHtml) {
    const mockupValidation = await validateMockupContent({ mockupHtml, scrapedData: fullPromptContent, businessName: allPageSignals['homepage']?.metaTitle || url });
    if (!mockupValidation.valid) {
      console.log('[mockup-validator] ✗ paid mockup had fabricated content:', mockupValidation.issues.join('; '));
    }
  }

  if (!report) {
    const reason = reportResult.status === 'rejected' ? reportResult.reason?.message : 'Unknown error';
    console.error('[REPORT] FAILED — no report generated:', reason);
    return NextResponse.json({ error: 'Report generation failed' }, { status: 500 });
  }

  console.log('[REPORT] Report score:', report.score, '| Grade:', report.grade, '| Sections:', report.sections?.length);

  // Validate report findings against scraped data
  const businessName = allPageSignals['homepage']?.metaTitle || url;
  const originalReport = JSON.parse(JSON.stringify(report));
  const validation = await validateContent({
    contentType: 'paid-audit',
    businessName,
    website: url,
    generatedContent: report,
    scrapedData: fullPromptContent
  });
  if (validation.valid) {
    console.log('[validator] ✓ paid-audit passed');
  } else {
    if (validation.correctedContent) {
      try {
        report = JSON.parse(validation.correctedContent);
        console.log(`[validator] ✗ ${validation.issues.length} issue(s) — auto-corrected`);
      } catch {
        console.log('[validator] ✗ correction parse failed — using original');
      }
    } else {
      console.log('[validator] ✗ uncorrectable — fallback used');
    }
    logValidation({
      contentType: 'paid-audit',
      businessName,
      website: url,
      original: originalReport,
      issues: validation.issues,
      corrected: validation.correctedContent,
      industry: report.industry || ''
    }).catch(() => {});
  }

  // Screenshot the mockup
  let mockupImageData = null;
  if (mockupHtml) {
    console.log('[REPORT] Taking mockup screenshot...');
    mockupImageData = await screenshotHtml(mockupHtml);
    console.log('[REPORT] Screenshot result:', mockupImageData ? 'success' : 'failed');
  } else {
    console.log('[REPORT] No mockup HTML generated, skipping screenshot');
  }

  console.log('[REPORT] Sending email to:', email);
  try {
    await sendReportEmail(email, url, report, mockupImageData);
    console.log('[REPORT] Email sent successfully');
  } catch (emailErr) {
    console.error('[REPORT] EMAIL FAILED:', emailErr.message);
    throw emailErr;
  }

  const totalTime = Date.now() - reportStart;
  console.log('[REPORT] ========== COMPLETED in', totalTime, 'ms ==========');
  return NextResponse.json({ success: true });
}

async function generateReport(url, fullPromptContent, pagesCrawled, correctionsBlock = '') {
  const systemPrompt = `${correctionsBlock}You are a senior website strategist delivering a paid audit report to a small business owner. This is a premium $147 report — it should be thorough, specific, and genuinely useful. You have crawled multiple pages of their site and have both the page content AND detailed technical signals extracted from the HTML.

Return a JSON object with this exact structure:
{
  "score": number between 0-100,
  "grade": one of F, D, C-, C, C+, B-, B, B+, A-, A, A+,
  "summary": "2-3 sentence executive summary referencing specific things found on the site — mention their business name, platform, specific strengths or weaknesses by name",
  "sections": [
    {
      "title": "string",
      "score": number between 0-100,
      "findings": ["3-5 specific strings about what was found — reference actual page names, headlines, meta tags, or content"],
      "recommendations": [
        { "priority": "high|medium|low", "action": "specific action with exact details (which page, which element, what to change it to)", "impact": "expected outcome with specifics" }
      ]
    }
  ]
}

Include these 7 sections: First Impressions, SEO & Discoverability, Mobile Experience, Trust & Credibility, Calls to Action, Page Speed & Technical, Content Quality.

STRICT HALLUCINATION RULES — violations will cause this finding to be rejected by the validator:
- NEVER flag a feature as missing unless you have confirmed its absence across ALL scraped pages provided — a feature not found on the homepage may exist on /services or /contact
- NEVER reference competitors or industry benchmarks unless they appear verbatim in the scraped content
- NEVER quote or paraphrase page copy unless the exact text appears in the scraped content provided
- NEVER state a percentage or metric unless it is directly calculable from the scraped data (e.g. alt text ratio must be calculated from actual image count in scraped content, not estimated)
- NEVER flag the current year copyright as outdated — if the copyright year matches the current calendar year it is correct and must not be flagged
- NEVER describe a service as unique or premium unless the site explicitly positions it that way
- Every finding must identify which specific page or element it was observed on — findings without a source are not verifiable and will be rejected
- If you cannot find a specific verifiable issue, do not invent one — fewer accurate findings are better than more hallucinated ones
- NEVER generate percentage improvements, revenue estimates, or conversion claims in the "impact" field unless a specific number appears in the scraped data — describe what the fix enables functionally, not speculative metrics. Correct: "Allows potential clients to see results before booking". Violation: "Could increase conversions by 30%"
- NEVER embed percentage claims, traffic estimates, or revenue figures in findings or descriptions unless the number is directly calculable from the scraped data

Rules:
- Use the technical signals heavily: reference actual meta titles, missing descriptions, schema types present or absent, platform name, image alt text stats, social links, copyright year, heading structure
- Reference actual content, page names, copy, headlines, and structure you found
- If a meta title is generic like "Home" or "Welcome", call it out specifically
- If schema markup is missing, explain what types they should add (LocalBusiness, etc.)
- If images lack alt text, give the exact percentage and explain the SEO impact — only if the image count is from the scraped data
- Only flag a feature as missing if you have checked all scraped pages and confirmed it does not appear on any of them. State which pages you checked.
- High priority = likely costing them customers right now
- Be direct and specific — this is a paid report, not a free summary
- Recommendations should tell them exactly what to do, not vague suggestions. Example: "Rewrite your homepage H1 from 'Welcome' to '[City] [Service] — [Differentiator]'" instead of "Improve your headline"
- Never fabricate issues not supported by the content or signals
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
        content: fullPromptContent
      }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

async function generateMockup(url, homepageContent, signals) {
  const domain = new URL(url).hostname.replace('www.', '');
  const businessContext = signals.h1Text ? `Their current headline: "${signals.h1Text}". ` : '';
  const platformContext = signals.platform ? `They currently use ${signals.platform}. ` : '';

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
        content: `Business website: ${url}\nDomain: ${domain}\n${businessContext}${platformContext}\nCurrent homepage content:\n${homepageContent}\n\nGenerate an improved homepage design for this business.`
      }]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic mockup API error ${res.status}: ${errText}`);
  }

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

async function sendReportEmail(email, url, report, mockupImageData) {
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

  const sectionsHTML = (report.sections || []).map(section => {
    const sc = section.score >= 80 ? '#3B6D11' : section.score >= 60 ? '#854F0B' : '#993C1D';

    const findingsHTML = (section.findings || []).map(f =>
      `<tr><td style="padding:4px 0;font-family:Georgia,serif;font-size:14px;color:#4A4540;line-height:1.6;">&#8226;&nbsp;&nbsp;${f}</td></tr>`
    ).join('');

    const recsHTML = (section.recommendations || []).map(r => {
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

  // Hidden preheader text for email client previews
  const preheader = `Your site scored ${report.score}/100 (${report.grade}). Full 7-section audit with specific fixes inside.`;
  const preheaderHTML = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>`;

  return `
  ${preheaderHTML}
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
                    <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:15px;color:rgba(255,255,255,0.6);line-height:1.7;">You&#8217;ve just seen exactly what&#8217;s holding your website back. Everything in this report is fixable. I do flat-fee website rebuilds for local businesses at $1,500, delivered in two weeks. No ongoing fees, no surprises.</p>
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
              <p style="margin:0;font-family:Georgia,serif;font-size:12px;color:#9A9490;">Tim Shephard &middot; Creative Mind Ventures &middot; Dallas-Fort Worth, TX</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>`;
}
