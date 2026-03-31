export const revalidate = 3600;

const DFW_CITIES = [
  'Dallas', 'Fort Worth', 'Plano', 'Arlington', 'Frisco', 'McKinney', 'Allen',
  'Garland', 'Irving', 'Mesquite', 'Carrollton', 'Denton', 'Richardson',
  'Lewisville', 'Flower Mound', 'Grand Prairie', 'Euless', 'Bedford',
  'Grapevine', 'Colleyville', 'Keller', 'Southlake', 'Mansfield', 'Burleson',
  'Cedar Hill', 'DeSoto', 'Duncanville', 'Rowlett', 'Rockwall', 'Wylie',
  'Coppell', 'Addison', 'Farmers Branch', 'Highland Park', 'Prosper',
];

const BUSINESS_TYPES = [
  [/dental|dentist|orthodon|endodon|periodon/, 'Dental Office', 'HOT', 'no online booking'],
  [/plastic surgery|cosmetic surgery/, 'Plastic Surgery', 'HOT', 'no before/after gallery'],
  [/med spa|medspa|aestheti|botox|filler|laser skin/, 'Med Spa', 'HOT', 'missing service menu'],
  [/hvac|heating|cooling|air condition|furnace/, 'HVAC Company', 'HOT', 'no quote request form'],
  [/law firm|attorney|legal|lawyer/, 'Law Firm', 'HOT', 'no client testimonials'],
  [/chiro|chiropract/, 'Chiropractic', 'WARM', 'outdated design'],
  [/physical therapy|pt clinic|rehab center/, 'Physical Therapy', 'WARM', 'no appointment booking'],
  [/optometry|optometrist|vision|eye care|eye clinic/, 'Eye Care', 'WARM', 'missing online scheduling'],
  [/veterinar|vet |animal hospital|pet clinic/, 'Veterinary', 'WARM', 'no online booking'],
  [/hair salon|hair studio|barber|stylist|blow dry|nail salon|nail spa|beauty salon|salon suite/, 'Salon', 'WARM', 'no service menu'],
  [/spa|massage|wellness/, 'Wellness Spa', 'WARM', 'slow load time'],
  [/gym|fitness|yoga|pilates|crossfit|personal train|boxing/, 'Gym', 'WARM', 'no class schedule'],
  [/plumb/, 'Plumbing Company', 'WARM', 'no emergency contact CTA'],
  [/electric|electrician/, 'Electrician', 'WARM', 'no service area listed'],
  [/roofing|roofer/, 'Roofing Company', 'WARM', 'missing photo gallery'],
  [/auto repair|auto shop|car repair|mechanic|tire shop|collision|body shop|oil change/, 'Auto Repair', 'LOW', 'no mobile optimization'],
  [/restaurant|cafe|pizza|sushi|taco|diner|bistro|grill|bbq|barbeque|eatery|kitchen|steakhouse|seafood/, 'Restaurant', 'LOW', 'no online menu'],
  [/florist|flowers|floral/, 'Florist', 'LOW', 'no online ordering'],
  [/landscap|lawn care|lawn service|irrigation/, 'Landscaping', 'LOW', 'outdated design'],
  [/clean|maid|janitorial|house clean/, 'Cleaning Service', 'LOW', 'no instant quote'],
  [/paint/, 'Painting Company', 'LOW', 'missing portfolio'],
  [/flooring|floor install/, 'Flooring Company', 'LOW', 'no photo gallery'],
  [/photo|photography/, 'Photography', 'LOW', 'slow image loading'],
  [/catering/, 'Catering', 'LOW', 'no menu or pricing'],
  [/real estate|realty|realtor|homes/, 'Real Estate', 'LOW', 'no search functionality'],
  [/insurance/, 'Insurance Agency', 'LOW', 'no quote tool'],
  [/accounting|cpa|bookkeeping|tax prep/, 'Accounting Firm', 'LOW', 'no contact form'],
  [/tutoring|learning center|academy|education/, 'Education', 'LOW', 'no enrollment info'],
  [/therapy|therapist|counseling|mental health/, 'Therapy Practice', 'LOW', 'missing intake form'],
];

function inferBusiness(name) {
  const n = (name || '').toLowerCase();
  for (const [pattern, label, badge, defaultIssue] of BUSINESS_TYPES) {
    if (pattern.test(n)) return { label, badge, defaultIssue };
  }
  return null;
}

function extractCity(businessName) {
  if (!businessName) return null;
  const txMatch = businessName.match(/([A-Za-z\s]+),\s*TX/i);
  if (txMatch) return txMatch[1].trim();
  for (const city of DFW_CITIES) {
    if (businessName.includes(city)) return city;
  }
  return null;
}

// Deterministic score within badge range — stable per business name
function generateScore(businessName, badge) {
  let hash = 0;
  for (const c of (businessName || '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  const ranges = { HOT: [24, 44], WARM: [45, 64], LOW: [65, 79] };
  const [min, max] = ranges[badge] || [40, 70];
  return min + (hash % (max - min + 1));
}

// Extract a short pain point from customSubject email subject line
function extractIssue(customSubject, defaultIssue) {
  if (!customSubject) return defaultIssue;
  const s = customSubject.toLowerCase();
  if (/slow|speed|load|performance/.test(s)) return 'slow load time';
  if (/mobile|phone|responsive/.test(s)) return 'not mobile-friendly';
  if (/google|seo|search|rank|found/.test(s)) return 'not ranking on Google';
  if (/contact|form|booking|appointment|schedul/.test(s)) return 'no booking option';
  if (/review|testimonial|trust/.test(s)) return 'no social proof';
  if (/design|outdated|old|dated/.test(s)) return 'outdated design';
  if (/missing|no |lack/.test(s)) return 'missing key content';
  if (/convert|lead|customer/.test(s)) return 'low conversion rate';
  return defaultIssue;
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
          score: generateScore(f.businessName, business.badge),
          issue: extractIssue(f.customSubject, business.defaultIssue),
          relativeTime: time,
        };
      })
      .filter(Boolean)
      .slice(0, 5);

    return Response.json({ audits });
  } catch (e) {
    console.error('[recent-audits] Error:', e.message);
    return Response.json({ audits: [] });
  }
}
