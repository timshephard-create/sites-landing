const VALIDATION_TABLE = 'ValidationLog';

/**
 * Fetch the last 10 validation rejections for a given content type.
 * Used to inject negative examples into generation prompts.
 * If industry is provided, only returns corrections from that industry.
 * Returns empty array (not unscoped fallback) when no matches found.
 */
export async function getRecentCorrections(contentType, industry = null) {
  try {
    let formula;
    if (industry) {
      formula = encodeURIComponent(`AND({contentType}="${contentType}", {industry}="${industry}")`);
    } else {
      formula = encodeURIComponent(`{contentType}="${contentType}"`);
    }
    const res = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(VALIDATION_TABLE)}?filterByFormula=${formula}&maxRecords=50`,
      { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.records || [])
      .sort((a, b) => (b.fields.timestamp || '').localeCompare(a.fields.timestamp || ''))
      .slice(0, 10)
      .map(r => ({ issues: r.fields.issues || '' }))
      .filter(r => r.issues);
  } catch (e) {
    console.error('[validator] getRecentCorrections error:', e.message);
    return [];
  }
}

/**
 * Build a "RECENT REJECTIONS" block to prepend to generation prompts.
 * Returns an empty string if there are no rejections to show.
 */
export function formatCorrectionsBlock(corrections) {
  if (!corrections.length) return '';
  const lines = corrections
    .flatMap(c => c.issues.split('\n').filter(Boolean))
    .slice(0, 10)
    .map(line => `- ${line.trim()}`);
  if (!lines.length) return '';
  return `RECENT REJECTIONS — these findings were rejected by the validator. These rejections are from audits of the same business type — apply them directly:\n${lines.join('\n')}\n\n`;
}

/**
 * Validate generated audit content against the scraped site data.
 * Uses claude-haiku-4-5 for speed and cost efficiency.
 * Retries once on API failure. Fails closed (valid: false) if both attempts fail.
 *
 * Returns: { valid: boolean, issues: string[], correctedContent: string | null }
 */
export async function validateContent({ contentType, businessName, website, generatedContent, scrapedData }) {
  const currentYear = new Date().getFullYear();

  const systemPrompt = `You are a quality control reviewer for a website audit service. Verify that the generated audit findings are accurate, specific, and grounded in the actual scraped website data provided.

Check for these problems:
1. HALLUCINATION — any specific claim (page name, feature, element, phone number) not supported by the scraped content
2. FACTUAL ERROR — incorrect statements, including: flagging ${currentYear} copyright as outdated (${currentYear} IS the current year and is valid), referencing pages that returned no content
3. GENERIC FILLER — findings with no reference to anything specific to this site that could apply to any business
4. TONE — should read as a trusted advisor, not a gotcha report

Return JSON:
{
  "valid": boolean,
  "issues": ["description of each problem found"],
  "correctedContent": "corrected JSON string matching input schema, or null if unable to correct confidently"
}

Rules:
- If valid is true, issues must be [] and correctedContent must be null
- If correcting, remove uncorrectable findings rather than fabricating replacements
- correctedContent must be complete valid JSON — never partial or truncated
- Return only valid JSON, no markdown, no preamble`;

  const userContent = `Content type: ${contentType}
Business: ${businessName || 'Unknown'}
Website: ${website}
Current year: ${currentYear}

=== GENERATED CONTENT TO VALIDATE ===
${typeof generatedContent === 'string' ? generatedContent : JSON.stringify(generatedContent, null, 2)}

=== SCRAPED SITE DATA (ground truth) ===
${scrapedData}`;

  const requestBody = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }]
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: requestBody
      });

      if (!res.ok) {
        console.error(`[validator] Haiku API error (attempt ${attempt + 1}):`, res.status, await res.text().catch(() => ''));
        if (attempt === 0) continue;
        return { valid: false, issues: ['validator_unavailable'], correctedContent: null };
      }

      const data = await res.json();
      const text = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim();
      const result = JSON.parse(text);
      return {
        valid: result.valid ?? true,
        issues: Array.isArray(result.issues) ? result.issues : [],
        correctedContent: result.correctedContent || null
      };
    } catch (e) {
      console.error(`[validator] validateContent error (attempt ${attempt + 1}):`, e.message);
      if (attempt === 0) continue;
      return { valid: false, issues: ['validator_unavailable'], correctedContent: null };
    }
  }
}

/**
 * Validate mockup HTML for fabricated specifics.
 * Checks for invented phone numbers, addresses, testimonial quotes,
 * staff names, and dollar amounts not present in scraped data.
 */
export async function validateMockupContent({ mockupHtml, scrapedData, businessName }) {
  const currentYear = new Date().getFullYear();

  const systemPrompt = `You are a quality control reviewer. Check the generated mockup HTML for fabricated business specifics that could mislead the recipient.

Flag these problems:
1. FAKE PHONE NUMBERS — any phone number not found in the scraped data
2. FAKE ADDRESSES — any street address, city, or zip code not found in the scraped data
3. FABRICATED TESTIMONIALS — any quoted testimonial with a specific person's name (e.g. "John S. said...") not found in the scraped data
4. INVENTED PRICES — any dollar amount or pricing not found in the scraped data
5. FAKE STAFF NAMES — any specific person's name presented as staff/team not found in the scraped data

Do NOT flag:
- Generic placeholder text like "Your Business Name" or "123 Main Street"
- Generic CTA text like "Book Now" or "Contact Us"
- Industry-typical section headings like "Our Services"

Return JSON:
{
  "valid": boolean,
  "issues": ["description of each fabricated element found"]
}

Return only valid JSON, no markdown, no preamble`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Business: ${businessName || 'Unknown'}\nCurrent year: ${currentYear}\n\n=== MOCKUP HTML ===\n${mockupHtml.slice(0, 8000)}\n\n=== SCRAPED SITE DATA (ground truth) ===\n${scrapedData.slice(0, 4000)}` }]
      })
    });

    if (!res.ok) {
      console.error('[validator] mockup validation API error:', res.status);
      return { valid: false, issues: ['mockup_validator_unavailable'] };
    }

    const data = await res.json();
    const text = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim();
    const result = JSON.parse(text);
    return {
      valid: result.valid ?? true,
      issues: Array.isArray(result.issues) ? result.issues : []
    };
  } catch (e) {
    console.error('[validator] validateMockupContent error:', e.message);
    return { valid: false, issues: ['mockup_validator_error'] };
  }
}

/**
 * Log a validation result (pass or correction) to Airtable ValidationLog.
 * Fire-and-forget — never throws.
 */
export async function logValidation({ contentType, businessName, website, original, issues, corrected, industry }) {
  try {
    await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(VALIDATION_TABLE)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`
        },
        body: JSON.stringify({
          fields: {
            contentType,
            businessName: businessName || '',
            website: website || '',
            industry: industry || '',
            original: (typeof original === 'string' ? original : JSON.stringify(original)).slice(0, 10000),
            issues: Array.isArray(issues) ? issues.join('\n') : String(issues),
            corrected: corrected
              ? (typeof corrected === 'string' ? corrected : JSON.stringify(corrected)).slice(0, 10000)
              : '',
            timestamp: new Date().toISOString()
          }
        })
      }
    );
  } catch (e) {
    console.error('[validator] logValidation error:', e.message);
  }
}
