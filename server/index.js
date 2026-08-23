const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Mount routes (routes require middleware which may need DB initialized for auth fallback)
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const customerRoutes = require('./routes/customer');
const documentsRoutes = require('./routes/documents');
const dashboardRoutes = require('./routes/dashboard');
const matchesRoutes = require('./routes/matches');
const appointmentsRoutes = require('./routes/appointments');
const adminRoutes = require('./routes/admin');
const notificationsRoutes = require('./routes/notifications');
const paymentsRoutes = require('./routes/payments');
const inquiriesRoutes = require('./routes/inquiries');

// basic health
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// initialize DB then mount routes and start
const db = require('./db');
(async () => {
  try {
    const _db = await db.init();
    db._db = _db;
    await db.hydrateStore(_db);
    // now mount routes
    app.use('/api/auth', authRoutes);
    app.use('/api/profile', profileRoutes);
    app.use('/api/customer', customerRoutes);
    app.use('/api/documents', documentsRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.use('/api/matches', matchesRoutes);
    app.use('/api/appointments', appointmentsRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/notifications', notificationsRoutes);
    app.use('/api/payments', paymentsRoutes);
    app.use('/api/inquiries', inquiriesRoutes);

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => console.log(`Shubh-Sanjog API listening on port ${PORT}`));
  } catch (err) {
    console.error('DB init failed', err);
    process.exit(1);
  }
})();
