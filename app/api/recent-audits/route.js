export const revalidate = 3600; // Cache for 1 hour

function inferBusinessType(name) {
  const n = (name || '').toLowerCase();
  if (/dental|dentist|orthodon|endodon|periodon/.test(n)) return 'Dental Office';
  if (/med spa|medspa|aestheti|botox|filler|laser skin|cosmetic/.test(n)) return 'Med Spa';
  if (/hair salon|hair studio|barber|stylist|blow dry/.test(n)) return 'Hair Salon';
  if (/hvac|heating|cooling|air condition|furnace/.test(n)) return 'HVAC Company';
  if (/chiro|chiropract/.test(n)) return 'Chiropractic';
  if (/plumb/.test(n)) return 'Plumbing Company';
  if (/law firm|attorney|legal|lawyer/.test(n)) return 'Law Firm';
  if (/restaurant|cafe|pizza|sushi|taco|diner|bistro|grill|bbq|barbeque|eatery|kitchen/.test(n)) return 'Restaurant';
  if (/gym|fitness|yoga|pilates|crossfit|personal train/.test(n)) return 'Fitness Studio';
  if (/auto|car wash|vehicle|mechanic|tire|collision|body shop/.test(n)) return 'Auto Shop';
  if (/real estate|realty|realtor|homes/.test(n)) return 'Real Estate';
  if (/insurance/.test(n)) return 'Insurance Agency';
  if (/accounting|cpa|bookkeeping|tax prep/.test(n)) return 'Accounting Firm';
  if (/veterinar|vet |animal hospital|pet clinic/.test(n)) return 'Veterinary';
  if (/landscap|lawn care|lawn service|irrigation/.test(n)) return 'Landscaping';
  if (/clean|maid|janitorial|house clean/.test(n)) return 'Cleaning Service';
  if (/roofing|roofer/.test(n)) return 'Roofing Company';
  if (/electric|electrician/.test(n)) return 'Electrician';
  if (/paint/.test(n)) return 'Painting Company';
  if (/photo|photography/.test(n)) return 'Photography';
  if (/physical therapy|pt clinic|rehab/.test(n)) return 'Physical Therapy';
  if (/optometry|optometrist|vision|eye care|eye clinic/.test(n)) return 'Eye Care';
  if (/spa|massage|wellness/.test(n)) return 'Wellness Spa';
  if (/flooring|floor install/.test(n)) return 'Flooring Company';
  if (/catering/.test(n)) return 'Catering';
  if (/tutoring|learning center|academy|education/.test(n)) return 'Education';
  if (/therapy|therapist|counseling|mental health/.test(n)) return 'Therapy Practice';
  return 'Local Business';
}

function extractCity(address) {
  if (!address) return null;
  // Handle "City, ST ZIP" or "Street, City, ST ZIP" formats
  const parts = address.split(',').map(p => p.trim());
  if (parts.length >= 3) {
    // "Street, City, ST ZIP" — city is second-to-last before state
    const cityPart = parts[parts.length - 2];
    return cityPart || null;
  }
  if (parts.length === 2) {
    return parts[0] || null;
  }
  return null;
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
  return null; // Too old — filter these out
}

export async function GET() {
  try {
    const params = new URLSearchParams({
      maxRecords: '20',
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
      console.error('[recent-audits] Airtable error:', res.status);
      return Response.json({ audits: [] });
    }

    const data = await res.json();
    const audits = (data.records || [])
      .map(record => {
        const f = record.fields;
        const time = relativeTime(f.dateAdded);
        if (!time) return null; // Drop records older than ~1 month
        return {
          businessType: inferBusinessType(f.businessName),
          city: extractCity(f.address),
          opportunityScore: typeof f.opportunityScore === 'number' ? f.opportunityScore : null,
          dateAdded: f.dateAdded || null,
          relativeTime: time,
        };
      })
      .filter(Boolean);

    return Response.json({ audits });
  } catch (e) {
    console.error('[recent-audits] Error:', e.message);
    return Response.json({ audits: [] });
  }
}
