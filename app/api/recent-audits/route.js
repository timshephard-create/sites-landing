export const revalidate = 3600;

// DFW-area cities to scan for in business names
const DFW_CITIES = [
  'Dallas', 'Fort Worth', 'Plano', 'Arlington', 'Frisco', 'McKinney', 'Allen',
  'Garland', 'Irving', 'Mesquite', 'Carrollton', 'Denton', 'Richardson',
  'Lewisville', 'Flower Mound', 'Grand Prairie', 'Euless', 'Bedford',
  'Grapevine', 'Colleyville', 'Keller', 'Southlake', 'Mansfield', 'Burleson',
  'Cedar Hill', 'DeSoto', 'Duncanville', 'Rowlett', 'Rockwall', 'Wylie',
  'Coppell', 'Addison', 'Farmers Branch', 'Highland Park', 'Prosper',
];

const BUSINESS_TYPES = [
  // Pattern, label, badge
  [/dental|dentist|orthodon|endodon|periodon/, 'Dental Office', 'HOT'],
  [/plastic surgery|cosmetic surgery/, 'Plastic Surgery', 'HOT'],
  [/med spa|medspa|aestheti|botox|filler|laser skin/, 'Med Spa', 'HOT'],
  [/hvac|heating|cooling|air condition|furnace/, 'HVAC Company', 'HOT'],
  [/law firm|attorney|legal|lawyer/, 'Law Firm', 'HOT'],
  [/chiro|chiropract/, 'Chiropractic', 'WARM'],
  [/physical therapy|pt clinic|rehab center/, 'Physical Therapy', 'WARM'],
  [/optometry|optometrist|vision|eye care|eye clinic/, 'Eye Care', 'WARM'],
  [/veterinar|vet |animal hospital|pet clinic/, 'Veterinary', 'WARM'],
  [/hair salon|hair studio|barber|stylist|blow dry|nail salon|nail spa|beauty salon|salon suite/, 'Salon', 'WARM'],
  [/spa|massage|wellness/, 'Wellness Spa', 'WARM'],
  [/gym|fitness|yoga|pilates|crossfit|personal train|boxing/, 'Gym', 'WARM'],
  [/plumb/, 'Plumbing Company', 'WARM'],
  [/electric|electrician/, 'Electrician', 'WARM'],
  [/roofing|roofer/, 'Roofing Company', 'WARM'],
  [/auto repair|auto shop|car repair|mechanic|tire shop|collision|body shop|oil change/, 'Auto Repair', 'LOW'],
  [/restaurant|cafe|pizza|sushi|taco|diner|bistro|grill|bbq|barbeque|eatery|kitchen|steakhouse|seafood/, 'Restaurant', 'LOW'],
  [/florist|flowers|floral/, 'Florist', 'LOW'],
  [/landscap|lawn care|lawn service|irrigation/, 'Landscaping', 'LOW'],
  [/clean|maid|janitorial|house clean/, 'Cleaning Service', 'LOW'],
  [/paint/, 'Painting Company', 'LOW'],
  [/flooring|floor install/, 'Flooring Company', 'LOW'],
  [/photo|photography/, 'Photography', 'LOW'],
  [/catering/, 'Catering', 'LOW'],
  [/real estate|realty|realtor|homes/, 'Real Estate', 'LOW'],
  [/insurance/, 'Insurance Agency', 'LOW'],
  [/accounting|cpa|bookkeeping|tax prep/, 'Accounting Firm', 'LOW'],
  [/tutoring|learning center|academy|education/, 'Education', 'LOW'],
  [/therapy|therapist|counseling|mental health/, 'Therapy Practice', 'LOW'],
];

function inferBusiness(name) {
  const n = (name || '').toLowerCase();
  for (const [pattern, label, badge] of BUSINESS_TYPES) {
    if (pattern.test(n)) return { label, badge };
  }
  return null; // Skip unrecognized
}

function extractCity(businessName) {
  if (!businessName) return null;
  // Check for "City, TX" pattern first
  const txMatch = businessName.match(/([A-Za-z\s]+),\s*TX/i);
  if (txMatch) return txMatch[1].trim();
  // Scan for known DFW cities
  for (const city of DFW_CITIES) {
    if (businessName.includes(city)) return city;
  }
  return null;
}

function relativeTime(dateStr) {
  if (!dateStr) return null;
  const diffDays = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  const w = Math.floor(diffDays / 7);
  if (w < 5) return w === 1 ? '1 week ago' : `${w} weeks ago`;
  return null;
}

export async function GET() {
  try {
    const params = new URLSearchParams({
      maxRecords: '40',
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
        const business = inferBusiness(f.businessName);
        if (!business) return null;
        const time = relativeTime(f.dateAdded);
        if (!time) return null;
        return {
          businessType: business.label,
          badge: business.badge,
          city: extractCity(f.businessName),
          relativeTime: time,
        };
      })
      .filter(Boolean)
      .slice(0, 6);

    return Response.json({ audits });
  } catch (e) {
    console.error('[recent-audits] Error:', e.message);
    return Response.json({ audits: [] });
  }
}
