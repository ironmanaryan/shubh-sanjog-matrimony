const fetch = require('node-fetch');

(async () => {
  const base = 'http://localhost:4000/api';
  const identifier = 'end-to-end@test.local';
  const send = await fetch(`${base}/auth/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier }) });
  const sendJson = await send.json();
  console.log('send', sendJson);
  const code = sendJson.demoOtp;
  const verify = await fetch(`${base}/auth/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, code }) });
  const verifyJson = await verify.json();
  console.log('verify', verifyJson);
  const token = verifyJson.token;
  const headers = { Authorization: `Bearer ${token}` };
  const profile = await fetch(`${base}/profile`, { headers });
  console.log('profile status', profile.status);
  console.log(await profile.text());
  const dashboard = await fetch(`${base}/dashboard/stats`, { headers });
  console.log('dashboard status', dashboard.status, await dashboard.text());
  const docs = await fetch(`${base}/documents`, { headers });
  console.log('documents status', docs.status, await docs.text());
})();
