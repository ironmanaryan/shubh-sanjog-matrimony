const http = require('http');
const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const { signToken } = require('../middleware/auth');

(async () => {
  const _db = await db.init();
  db._db = _db;
  // create a test user in DB
  const user = { id: uuidv4(), identifier: 'smoke@test.local', createdAt: Date.now() };
  await db.createUser(_db, user);
  console.log('Created user', user.id);
  const token = signToken({ userId: user.id });

  function req(path, method = 'GET') {
    return new Promise((resolve, reject) => {
      const options = { hostname: 'localhost', port: 4000, path, method, headers: { Authorization: `Bearer ${token}` } };
      const r = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: data });
        });
      });
      r.on('error', reject);
      r.end();
    });
  }

  try {
    console.log('health...');
    console.log(await req('/api/health'));
    console.log('profile...');
    console.log(await req('/api/profile'));
    console.log('dashboard...');
    console.log(await req('/api/dashboard/stats'));
    console.log('documents (list)...');
    console.log(await req('/api/documents'));
    console.log('matches shortlist...');
    console.log(await req('/api/matches/shortlist'));
    console.log('notifications...');
    console.log(await req('/api/notifications'));
  } catch (err) {
    console.error('smoke failed', err);
    process.exit(2);
  }
  process.exit(0);
})();
