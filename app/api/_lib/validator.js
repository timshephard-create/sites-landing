const VALIDATION_TABLE = 'ValidationLog';

/**
 * Fetch the last 5 validation corrections for a given content type.
 * Used to inject negative examples into generation prompts.
 */
export async function getRecentCorrections(contentType) {
  try {
    const filter = encodeURIComponent(`{contentType}="${contentType}"`);
    const res = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(VALIDATION_TABLE)}?filterByFormula=${filter}&maxRecords=20`,
      { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.records || [])
      .sort((a, b) => (b.fields.timestamp || '').localeCompare(a.fields.timestamp || ''))
      .slice(0, 5)
      .map(r => ({ issues: r.fields.issues || '' }))
      .filter(r => r.issues);
  } catch (e) {
    console.error('[validator] getRecentCorrections error:', e.message);
    return [];
  }
}

/**
 * Build a "RECENT CORRECTIONS" block to prepend to generation prompts.
 * Returns an empty string if there are no corrections to show.
 */
export function formatCorrectionsBlock(corrections) {
  if (!corrections.length) return '';
  const lines = corrections
    .flatMap(c => c.issues.split('\n').filter(Boolean))
    .slice(0, 5)
    .map(line => `- ${line.trim()}`);
  if (!lines.length) return '';
  return `RECENT CORRECTIONS — avoid repeating these mistakes:\n${lines.join('\n')}\n\n`;
}

/**
 * Validate generated audit content against the scraped site data.
 * Uses claude-haiku-4-5 for speed and cost efficiency.
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
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if (!res.ok) {
      console.error('[validator] Haiku API error:', res.status, await res.text().catch(() => ''));
      return { valid: true, issues: [], correctedContent: null };
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
    console.error('[validator] validateContent error:', e.message);
    return { valid: true, issues: [], correctedContent: null };
  }
}

/**
 * Log a validation result (pass or correction) to Airtable ValidationLog.
 * Fire-and-forget — never throws.
 */
export async function logValidation({ contentType, businessName, website, original, issues, corrected }) {
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
