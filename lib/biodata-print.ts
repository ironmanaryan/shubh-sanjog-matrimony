// PRD high-priority #3 — clean, printable biodata layout for the Admin
// Customer Detail page. Pure HTML-string builder (no dependencies) so the
// output can be unit-tested; the page opens it in a print window where the
// browser's "Save as PDF" produces the export.

// Structural mirror of the /admin/customers/:id response (kept loose so the
// admin page's richer typed detail remains assignable).
export type BiodataPrintDetail = {
  customer?: { id?: string; identifier?: string } | null;
  profile?: {
    personal?: Record<string, unknown>;
    education?: Record<string, unknown>;
    family?: Record<string, unknown>;
    preferences?: Record<string, unknown>;
    status?: string;
  } | null;
};

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function text(value: unknown): string {
  const s = String(value ?? '').trim();
  return s === '' ? '—' : s;
}

type Row = { label: string; value: unknown };

function section(title: string, rows: Row[]): string {
  const body = rows
    .map(
      (row) => `
      <tr>
        <th scope="row">${esc(row.label)}</th>
        <td>${esc(text(row.value))}</td>
      </tr>`
    )
    .join('');
  return `
  <section>
    <h2>${esc(title)}</h2>
    <table>${body}</table>
  </section>`;
}

export function buildBiodataPrintHtml(detail: BiodataPrintDetail, opts: { bureau?: string; phone?: string; logoUrl?: string } = {}): string {
  const bureau = opts.bureau || 'Shubh Sanjog Matrimony';
  const phone = opts.phone || '+91 9034850873';
  // Print windows are opened about:blank (document.write), so a RELATIVE src
  // would not resolve — callers should pass an absolute URL (see printBiodata).
  const logo = opts.logoUrl || '/logo.png';
  const p = detail.profile;
  const personal = (p?.personal || {}) as Record<string, unknown>;
  const education = (p?.education || {}) as Record<string, unknown>;
  const family = (p?.family || {}) as Record<string, unknown>;
  const prefs = (p?.preferences || {}) as Record<string, unknown>;

  const name = text(`${String(personal.firstName ?? '')} ${String(personal.lastName ?? '')}`.trim() === '' ? detail.customer?.identifier : `${personal.firstName ?? ''} ${personal.lastName ?? ''}`.trim());
  const verified = p?.status === 'Approved';
  const siblings =
    family.numberOfBrothers !== undefined || family.numberOfSisters !== undefined
      ? `${Number(family.numberOfBrothers) || 0} brother(s), ${Number(family.numberOfSisters) || 0} sister(s)`
      : '';
  const ageRange = [prefs.minAge, prefs.maxAge].filter((v) => String(v ?? '').trim() !== '').join(' – ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Biodata — ${esc(name)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #2c0d16; margin: 0; }
  .letterhead { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px double #7b102d; padding-bottom: 10px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand-logo { width: 44px; height: 44px; border-radius: 50%; object-fit: contain; background: #fff; border: 2px solid #7b102d; }
  .brand-name { font-size: 20px; font-weight: bold; letter-spacing: 0.02em; }
  .brand-tag { font-size: 11px; color: #6a4a57; letter-spacing: 0.18em; text-transform: uppercase; }
  .bureau-contact { text-align: right; font-size: 11px; color: #5a3743; line-height: 1.5; }
  h1 { font-size: 24px; margin: 18px 0 2px; }
  .meta { font-size: 12px; color: #5a3743; margin-bottom: 4px; }
  .badge { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 10px; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; }
  .badge.verified { background: #eaf8ef; color: #0a7d4c; border: 1px solid #9ed6b4; }
  .badge.unverified { background: #f4e9ee; color: #8a5a6b; border: 1px solid #d9c2cb; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.14em; color: #7b102d; border-bottom: 1px solid #e5c88d; padding-bottom: 4px; margin: 22px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 5px 8px; font-size: 13px; border-bottom: 1px solid #f3e7d4; }
  th { width: 34%; color: #6a4a57; font-weight: normal; }
  td { font-weight: bold; }
  footer { margin-top: 26px; border-top: 1px solid #e5c88d; padding-top: 8px; font-size: 10px; color: #8a6a75; display: flex; justify-content: space-between; }
  .privacy-note { margin-top: 14px; background: #fffaf3; border: 1px solid #f2d9a8; padding: 8px 10px; font-size: 11px; color: #5a3743; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <div class="letterhead">
    <div class="brand">
      <img class="brand-logo" src="${esc(logo)}" alt="Shubh Sanjog Matrimony logo" />
      <div>
        <div class="brand-name">${esc(bureau)}</div>
        <div class="brand-tag">Matrimonial Biodata</div>
      </div>
    </div>
    <div class="bureau-contact">
      ${esc(phone)}<br />
      shubhsanjogmatrimony.in
    </div>
  </div>

  <h1>${esc(name)}</h1>
  <div class="meta">Profile ID ${esc(String(detail.customer?.id || '').slice(0, 8).toUpperCase())} · Status: ${esc(text(p?.status || 'Draft'))}</div>
  <div><span class="badge ${verified ? 'verified' : 'unverified'}">${verified ? 'Verified Profile' : 'Not yet verified'}</span></div>

  ${section('Personal details', [
    { label: 'Full name', value: `${personal.firstName ?? ''} ${personal.lastName ?? ''}`.trim() },
    { label: 'Gender', value: personal.gender },
    { label: 'Date of birth', value: personal.dob },
    { label: 'Height', value: personal.height },
    { label: 'Religion', value: personal.religion },
    { label: 'Caste / Community', value: personal.caste },
    { label: 'Sub-caste', value: personal.subCaste },
    { label: 'Mother tongue', value: personal.motherTongue },
    { label: 'Marital status', value: personal.maritalStatus },
    { label: 'Manglik status', value: personal.manglikStatus },
    { label: 'City / State', value: [personal.city, personal.state].filter((v) => String(v ?? '').trim()).join(', ') },
  ])}

  ${section('Education & career', [
    { label: 'Highest qualification', value: education.highestQualification },
    { label: 'Profession', value: education.profession },
    { label: 'Company / Organisation', value: education.company },
    { label: 'Annual income', value: education.annualIncome },
    { label: 'Work location', value: education.workLocation },
  ])}

  ${section('Family details', [
    { label: "Father's name", value: family.fatherName },
    { label: "Father's occupation", value: family.fatherOccupation },
    { label: "Mother's name", value: family.motherName },
    { label: "Mother's occupation", value: family.motherOccupation },
    { label: 'Siblings', value: siblings },
    { label: 'Family type', value: family.familyType },
    { label: 'Family status', value: family.familyStatus },
    { label: 'Family location', value: family.familyLocation },
    { label: 'Other family info', value: family.otherInfo },
  ])}

  ${section('Partner expectations', [
    { label: 'Preferred gender', value: prefs.preferredGender },
    { label: 'Age range', value: ageRange },
    { label: 'Religion', value: prefs.religion },
    { label: 'Caste / Community', value: prefs.caste },
    { label: 'Mother tongue', value: prefs.motherTongue },
    { label: 'Location', value: prefs.location },
    { label: 'Education / Profession', value: [prefs.education, prefs.profession].filter((v) => String(v ?? '').trim()).join(', ') },
    { label: 'Manglik preference', value: prefs.manglikPreference },
    { label: 'Partner expectations', value: prefs.partnerExpectationsText },
  ])}

  <div class="privacy-note">
    Confidential bureau document. Contact details are withheld by design — introductions are arranged only through Shubh Sanjog Matrimony after mutual interest is accepted.
  </div>

  <footer>
    <span>Generated ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · Internal admin console</span>
    <span>${esc(bureau)}</span>
  </footer>
</body>
</html>`;
}
