// End-to-end smoke test for UPI payments, advanced matchmaking, interests and privacy.
// Usage: start the API server (node server/index.js), then `node scripts/smoke_payments.js`
const fs = require('fs');
const path = require('path');

const BASE = process.env.SMOKE_BASE || 'http://localhost:4000';
const stamp = Date.now();

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name} ${extra}`);
  }
}

async function api(pathname, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(`${BASE}/api${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* non-json */ }
  return { status: res.status, json };
}

async function login(identifier) {
  const otpRes = await api('/auth/send-otp', { method: 'POST', body: { identifier } });
  const code = otpRes.json.demoOtp;
  const verifyRes = await api('/auth/verify-otp', { method: 'POST', body: { identifier, code } });
  if (!verifyRes.json.token) throw new Error(`login failed for ${identifier}: ${JSON.stringify(verifyRes.json)}`);
  return verifyRes.json.token;
}

(async () => {
  // health
  const health = await api('/health');
  check('server health', health.status === 200 && health.json.ok === true);

  // --- accounts -------------------------------------------------------------
  const tokenA = await login(`asha${stamp}@test.local`);
  const tokenB = await login(`brij${stamp}@test.local`);
  const tokenAdmin = await login(`admin${stamp}@test.local`);

  const profA = await api('/customer/profile', {
    method: 'PUT',
    token: tokenA,
    body: {
      personal: { firstName: 'Asha', lastName: 'Sharma', gender: 'Female', dob: '1998-05-10', height: '5ft 4in', weight: '54', religion: 'Hindu', caste: 'Brahmin', subCaste: '', motherTongue: 'Hindi', maritalStatus: 'Never Married', city: 'Mumbai', state: 'Maharashtra', country: 'India', citizenship: 'Indian', nriStatus: false, manglikStatus: 'No', mobile: '9876543210', foodPreference: 'Vegetarian', smoking: 'No', drinking: 'No', hobbies: 'Reading', interests: 'Music', about: 'Family-oriented product manager.' },
      education: { highestQualification: 'MBA', educationDetails: 'Marketing', profession: 'Product Manager', jobType: 'Job', company: 'TCS', annualIncome: '₹20L+', workLocation: 'Mumbai', experience: '4 years' },
      family: { fatherName: 'Suresh Sharma', fatherOccupation: 'Businessman', motherName: 'Kiran Sharma', motherOccupation: 'Homemaker', numberOfBrothers: 1, numberOfSisters: 0, familyType: 'Nuclear', familyStatus: 'Middle Class', familyLocation: 'Mumbai' },
      preferences: { preferredGender: 'Male', minAge: 27, maxAge: 34, heightRange: "5ft 8in+", religion: 'Hindu', caste: 'Any', motherTongue: 'Hindi', maritalStatus: 'Never Married', education: 'Post Graduate', profession: 'Any', incomeRange: '₹18L+', location: 'Mumbai', nriPreference: false, manglikPreference: 'No' },
    },
  });
  await api('/customer/profile', {
    method: 'PUT',
    token: tokenB,
    body: {
      personal: { firstName: 'Brij', lastName: 'Verma', gender: 'Male', dob: '1994-02-14', height: '5ft 10in', weight: '72', religion: 'Hindu', caste: 'Brahmin', subCaste: '', motherTongue: 'Hindi', maritalStatus: 'Never Married', city: 'Pune', state: 'Maharashtra', country: 'India', citizenship: 'Indian', nriStatus: false, manglikStatus: 'No', mobile: '9000011111', foodPreference: 'Vegetarian', smoking: 'No', drinking: 'Occasionally', hobbies: 'Cricket', interests: 'Startups', about: 'Consultant who enjoys weekend treks.' },
      education: { highestQualification: 'MBA', educationDetails: 'Finance', profession: 'Consultant', jobType: 'Job', company: 'Deloitte', annualIncome: '₹24L+', workLocation: 'Pune', experience: '6 years' },
      family: { fatherName: 'Anil Verma', fatherOccupation: 'Banker', motherName: 'Usha Verma', motherOccupation: 'Teacher', numberOfBrothers: 0, numberOfSisters: 1, familyType: 'Joint', familyStatus: 'Middle Class', familyLocation: 'Pune' },
      preferences: { preferredGender: 'Female', minAge: 24, maxAge: 30, heightRange: "5ft 2in+", religion: 'Hindu', caste: 'Any', motherTongue: 'Hindi', maritalStatus: 'Never Married', education: 'Graduate', profession: 'Any', incomeRange: 'Any', location: 'Pune, Mumbai', nriPreference: false, manglikPreference: 'No' },
    },
  });
  const profAResolved = await api('/customer/profile', { token: tokenA });
  const profBResolved = await api('/customer/profile', { token: tokenB });
  const userIdA = profAResolved.json.profile?.userId;
  const userIdB = profBResolved.json.profile?.userId;
  check('profiles saved with ids', Boolean(userIdA && userIdB), JSON.stringify({ userIdA, userIdB }));

  // --- profile review workflow (scope §22): submit + admin approval ------------
  const submitA = await api('/profile/submit', { method: 'POST', token: tokenA });
  check('profile A submitted for review', submitA.status === 200 && submitA.json.status === 'Submitted', JSON.stringify(submitA.json));
  await api('/profile/submit', { method: 'POST', token: tokenB });

  const pendingQueue = await api('/admin/profiles?status=Submitted', { token: tokenAdmin });
  check('admin sees submitted profiles', (pendingQueue.json.profiles || []).some((p) => p.userId === userIdA), JSON.stringify(pendingQueue.json).slice(0, 200));

  const approveA = await api('/admin/profiles/approve', { method: 'POST', token: tokenAdmin, body: { userId: userIdA } });
  const approveB = await api('/admin/profiles/approve', { method: 'POST', token: tokenAdmin, body: { userId: userIdB } });
  check('admin approved profiles', approveA.status === 200 && approveB.status === 200);

  // --- plans ------------------------------------------------------------------
  const plans = await api('/payments/plans', { token: tokenA });
  check('3 plans listed', (plans.json.plans || []).length === 3);
  const tiers = (plans.json.plans || []).map((p) => p.tier).sort().join(',');
  check('plans are Consultation/Gold/Premium', tiers === 'Consultation,Gold,Premium', tiers);
  const consultation = (plans.json.plans || []).find((p) => p.tier === 'Consultation');
  const gold = (plans.json.plans || []).find((p) => p.tier === 'Gold');
  const premium = (plans.json.plans || []).find((p) => p.tier === 'Premium');
  check('prices 599/5100/11000', consultation?.price === 599 && gold?.price === 5100 && premium?.price === 11000);
  check('upi id placeholder', plans.json.upiId === 'shubhsanjog@upi', String(plans.json.upiId));

  // --- submit UPI payment ------------------------------------------------------
  const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('plan', 'Gold');
  form.append('utr', 'UTR123456789');
  form.append('file', new Blob([pngBytes], { type: 'image/png' }), 'receipt.png');

  const submitNoAuth = await fetch(`${BASE}/api/payments`, { method: 'POST', body: form });
  check('payment submit requires auth', submitNoAuth.status === 401);

  const submit = await api('/payments', { method: 'POST', token: tokenA, body: form });
  check('payment submitted', submit.status === 201 && submit.json.payment?.status === 'Pending Verification', JSON.stringify(submit.json));
  const paymentId = submit.json.payment?.id;

  const badUtr = await api('/payments', { method: 'POST', token: tokenA, body: (() => { const f = new FormData(); f.append('plan', 'Consultation'); f.append('utr', 'x'); f.append('file', new Blob([pngBytes], { type: 'image/png' }), 'r.png'); return f; })() });
  check('invalid utr rejected', badUtr.status === 400);

  const mine = await api('/payments/mine', { token: tokenA });
  check('my payments lists submission', (mine.json.payments || []).some((p) => p.id === paymentId && p.status === 'Pending Verification'));

  // --- admin approvals ---------------------------------------------------------
  const denied = await api('/admin/payments', { token: tokenA });
  check('admin list denies customer', denied.status === 403);

  const adminList = await api('/admin/payments', { token: tokenAdmin });
  const row = (adminList.json.payments || []).find((p) => p.id === paymentId);
  check('admin sees payment w/ utr + receipt', Boolean(row && row.utr === 'UTR123456789' && row.hasReceipt));

  const receipt = await fetch(`${BASE}/api/admin/payments/${paymentId}/receipt`, { headers: { Authorization: `Bearer ${tokenAdmin}` } });
  check('admin can download receipt', receipt.status === 200 && (receipt.headers.get('content-type') || '').includes('image/png'));

  const approve = await api('/admin/payments/approve', { method: 'POST', token: tokenAdmin, body: { id: paymentId } });
  check('payment approved', approve.status === 200 && approve.json.status === 'Approved');

  const statsAfter = await api('/dashboard/stats', { token: tokenA });
  check('membership activated as Gold', statsAfter.json.stats?.membership?.tier === 'Gold' && statsAfter.json.stats?.membership?.active !== false, JSON.stringify(statsAfter.json.stats?.membership || {}));

  const reApprove = await api('/admin/payments/approve', { method: 'POST', token: tokenAdmin, body: { id: paymentId } });
  check('double approve blocked', reApprove.status === 409);

  // --- privacy toggles ----------------------------------------------------------
  const privacySet = await api('/customer/privacy', { method: 'PUT', token: tokenB, body: { hidePhoto: true, hidePhone: true } });
  check('privacy toggles saved', privacySet.json.privacy?.hidePhoto === true && privacySet.json.privacy?.hidePhone === true);

  const searchHidden = await api(`/matches/search?religion=Hindu&minAge=21&maxAge=40`, { token: tokenA });
  const bHidden = (searchHidden.json.profiles || []).find((p) => p.id === userIdB);
  check('search finds approved profile B with filters', Boolean(bHidden));
  check('photo hidden while toggles on', bHidden?.photoVisible === false);
  check('phone masked while toggles on', bHidden?.phoneVisible === false && String(bHidden?.phone || '').startsWith('•'), String(bHidden?.phone));

  const tallOnly = await api(`/matches/search?religion=Hindu&minHeightFt=6`, { token: tokenA });
  check('height filter excludes B', !(tallOnly.json.profiles || []).some((p) => p.id === userIdB));

  const eduOnly = await api(`/matches/search?education=MBA`, { token: tokenA });
  check('education filter matches B', (eduOnly.json.profiles || []).some((p) => p.id === userIdB));

  // --- express interest lifecycle ----------------------------------------------
  const interest = await api('/matches/interest', { method: 'POST', token: tokenA, body: { profileId: userIdB } });
  check('interest sent pending', interest.json.request?.status === 'Pending');

  const duplicate = await api('/matches/interest', { method: 'POST', token: tokenA, body: { profileId: userIdB } });
  check('duplicate interest flagged', duplicate.json.alreadySent === true);

  const inboxB = await api('/matches/interests', { token: tokenB });
  const received = (inboxB.json.received || []).find((r) => r.status === 'Pending' && r.fromUserId === userIdA);
  check('B received pending interest', Boolean(received && received.toProfileId === userIdB));
  if (!received) {
    console.log(`${failures} SMOKE TEST(S) FAILED (cannot continue interest flow)`);
    process.exit(1);
  }

  const respond = await api('/matches/interest/respond', { method: 'POST', token: tokenB, body: { requestId: received.id, action: 'Accepted' } });
  check('B accepted interest', respond.json.request?.status === 'Accepted');

  // B lifts personal toggles; acceptance alone now unmasks photo + contact
  await api('/customer/privacy', { method: 'PUT', token: tokenB, body: { hidePhoto: false, hidePhone: false } });

  const searchOpen = await api(`/matches/search?religion=Hindu`, { token: tokenA });
  const bOpen = (searchOpen.json.profiles || []).find((p) => p.id === userIdB);
  check('photo visible after acceptance', bOpen?.photoVisible === true);
  check('phone visible after acceptance', bOpen?.phoneVisible === true && bOpen?.phone === '9000011111', String(bOpen?.phone));

  // --- admin stats includes payment metrics --------------------------------------
  const adminStats = await api('/admin/stats', { token: tokenAdmin });
  check('stats include payment counters', typeof adminStats.json.stats?.pendingPayments === 'number' && Array.isArray(adminStats.json.attention?.pendingPayments));

  console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} SMOKE TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
  console.error('smoke test crashed', err);
  process.exit(1);
});
