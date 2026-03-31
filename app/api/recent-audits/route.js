export const revalidate = 3600; // Cache for 1 hour

function inferBusinessType(name) {
  const n = (name || '').toLowerCase();
  if (/dental|dentist|orthodon|endodon|periodon/.test(n)) return 'Dental Office';
  if (/plastic surgery|cosmetic surgery|rhinoplast|augmentation/.test(n)) return 'Plastic Surgery';
  if (/med spa|medspa|aestheti|botox|filler|laser skin/.test(n)) return 'Med Spa';
  if (/chiro|chiropract/.test(n)) return 'Chiropractic';
  if (/physical therapy|pt clinic|rehab center/.test(n)) return 'Physical Therapy';
  if (/optometry|optometrist|vision|eye care|eye clinic/.test(n)) return 'Eye Care';
  if (/veterinar|vet |animal hospital|pet clinic/.test(n)) return 'Veterinary';
  if (/hair salon|hair studio|barber|stylist|blow dry|nail salon|nail spa|beauty salon/.test(n)) return 'Salon';
  if (/spa|massage|wellness/.test(n)) return 'Wellness Spa';
  if (/hvac|heating|cooling|air condition|furnace/.test(n)) return 'HVAC Company';
  if (/plumb/.test(n)) return 'Plumbing Company';
  if (/electric|electrician/.test(n)) return 'Electrician';
  if (/roofing|roofer/.test(n)) return 'Roofing Company';
  if (/landscap|lawn care|lawn service|irrigation/.test(n)) return 'Landscaping';
  if (/clean|maid|janitorial|house clean/.test(n)) return 'Cleaning Service';
  if (/paint/.test(n)) return 'Painting Company';
  if (/flooring|floor install/.test(n)) return 'Flooring Company';
  if (/auto repair|auto shop|car repair|mechanic|tire shop|collision|body shop|oil change/.test(n)) return 'Auto Repair';
  if (/car wash|detailing/.test(n)) return 'Auto Detailing';
  if (/restaurant|cafe|pizza|sushi|taco|diner|bistro|grill|bbq|barbeque|eatery|kitchen|steakhouse|seafood/.test(n)) return 'Restaurant';
  if (/gym|fitness|yoga|pilates|crossfit|personal train|boxing/.test(n)) return 'Gym';
  if (/law firm|attorney|legal|lawyer/.test(n)) return 'Law Firm';
  if (/real estate|realty|realtor|homes/.test(n)) return 'Real Estate';
  if (/insurance/.test(n)) return 'Insurance Agency';
  if (/accounting|cpa|bookkeeping|tax prep/.test(n)) return 'Accounting Firm';
  if (/florist|flowers|floral/.test(n)) return 'Florist';
  if (/photo|photography/.test(n)) return 'Photography';
  if (/catering/.test(n)) return 'Catering';
  if (/tutoring|learning center|academy|education/.test(n)) return 'Education';
  if (/therapy|therapist|counseling|mental health/.test(n)) return 'Therapy Practice';
  return null; // Unrecognized — caller will skip this record
}

function extractCity(fields) {
  // Try multiple possible field name variations for address
  const addr = fields.address || fields.Address || fields['Business Address']
    || fields.businessAddress || fields['Full Address'] || null;
  if (!addr) return null;
  const parts = addr.split(',').map(p => p.trim());
  if (parts.length >= 3) return parts[parts.length - 2]; // "Street, City, ST ZIP"
  if (parts.length === 2) return parts[0];
  return null;
}

function getOpportunityScore(fields) {
  // Try multiple possible field name variations
  const raw = fields.opportunityScore ?? fields.OpportunityScore
    ?? fields['Opportunity Score'] ?? fields['opportunity_score']
    ?? fields.score ?? fields.Score ?? null;
  return typeof raw === 'number' ? raw : null;
}

function relativeTime(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return '1 week ago';
  if (diffWeeks < 5) return `${diffWeeks} weeks ago`;
  return null;
}

export async function GET() {
  try {
    const params = new URLSearchParams({
      maxRecords: '30', // Fetch more to allow for skipped "unrecognized" records
      'sort[0][field]': 'dateAdded',
      'sort[0][direction]': 'desc',
    });
    const res = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Imported%20table?${params}`,
      {
        headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
        next: { revalidate: 3600 },
      }
    );

    if (!res.ok) {
      console.error('[recent-audits] Airtable error:', res.status, await res.text());
      return Response.json({ audits: [] });
    }

    const data = await res.json();

    // Expose field keys for one-time diagnosis — remove after confirming
    const _debugFields = data.records?.[0] ? Object.keys(data.records[0].fields) : [];

    const audits = (data.records || [])
      .map(record => {
        const f = record.fields;
        const businessType = inferBusinessType(f.businessName || f['Business Name'] || f.name || f.Name || '');
        if (!businessType) return null; // Skip unrecognized business types
        const time = relativeTime(f.dateAdded || f['Date Added'] || f.dateadded || '');
        if (!time) return null;
        return {
          businessType,
          city: extractCity(f),
          opportunityScore: getOpportunityScore(f),
          relativeTime: time,
        };
      })
      .filter(Boolean)
      .slice(0, 6); // Cap at 6 entries

    return Response.json({ audits, _debugFields });
  } catch (e) {
    console.error('[recent-audits] Error:', e.message);
    return Response.json({ audits: [] });
  }
}
