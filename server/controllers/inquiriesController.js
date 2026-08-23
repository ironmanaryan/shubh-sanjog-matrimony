// Contact Us inquiries (scope: Inquiry Management).
//
// createInquiry is public — anyone can reach out from the Contact page.
// listInquiries / updateInquiryStatus are staff-only and mounted under
// /api/admin/inquiries for the dedicated Admin Inquiries management route.
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const INQUIRY_STATUSES = ['New', 'In Progress', 'Resolved'];

// In-memory fallback so the feature still works if SQLite is unavailable
// (mirrors how other controllers degrade to the hydrated store).
const memoryInquiries = [];

function sanitize(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

// POST /api/inquiries — public Contact Us submission
async function createInquiry(req, res) {
  try {
    const body = req.body || {};
    const name = sanitize(body.name, 120);
    const mobile = sanitize(body.mobile, 20);
    const email = sanitize(body.email, 160);
    const subject = sanitize(body.subject, 200) || 'General enquiry';
    const message = sanitize(body.message, 3000);

    if (!name) return res.status(400).json({ ok: false, error: 'Please enter your name' });
    if (!mobile && !email) {
      return res.status(400).json({ ok: false, error: 'Provide a mobile number or an email so we can reach you' });
    }
    if (mobile && !/^[+]?[\d\s-]{10,15}$/.test(mobile)) {
      return res.status(400).json({ ok: false, error: 'Enter a valid mobile number' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Enter a valid email address' });
    }
    if (!message) return res.status(400).json({ ok: false, error: 'Please tell us how we can help' });

    const inquiry = {
      id: uuidv4(),
      name,
      mobile: mobile || null,
      email: email || null,
      subject,
      message,
      status: 'New',
      adminNote: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    let persisted = false;
    try {
      if (db._db) {
        await db.saveInquiryDb(db._db, inquiry);
        persisted = true;
      }
    } catch (e) {
      console.error('save inquiry failed', e);
    }
    if (!persisted) memoryInquiries.unshift(inquiry);

    return res.status(201).json({ ok: true, message: 'Thank you! Our team will reach out to you shortly.' });
  } catch (error) {
    console.error('create inquiry error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// GET /api/admin/inquiries?status=New|In Progress|Resolved
async function listInquiries(req, res) {
  try {
    const status = String(req.query.status || '').trim();
    if (status && !INQUIRY_STATUSES.includes(status)) {
      return res.status(400).json({ ok: false, error: `status must be one of: ${INQUIRY_STATUSES.join(', ')}` });
    }

    if (db._db) {
      const inquiries = await db.listInquiriesDb(db._db, status || null);
      return res.json({ ok: true, count: inquiries.length, statuses: INQUIRY_STATUSES, inquiries });
    }

    const filtered = memoryInquiries.filter((i) => !status || i.status === status);
    return res.json({ ok: true, count: filtered.length, statuses: INQUIRY_STATUSES, inquiries: filtered });
  } catch (error) {
    console.error('list inquiries error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

// POST /api/admin/inquiries/status { id, status, adminNote? }
async function updateInquiryStatus(req, res) {
  try {
    const { id, status, adminNote } = req.body || {};
    const nextStatus = String(status || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    if (!INQUIRY_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ ok: false, error: `status must be one of: ${INQUIRY_STATUSES.join(', ')}` });
    }

    const note = adminNote === undefined ? undefined : sanitize(adminNote, 2000) || null;

    if (db.isReady()) {
      await db.setInquiryStatusDb(db._db, id, nextStatus, note);
      const inquiry = await db.getInquiryByIdDb(db._db, id);
      if (!inquiry) return res.status(404).json({ ok: false, error: 'Inquiry not found' });
      return res.json({ ok: true, inquiry });
    }

    const inquiry = memoryInquiries.find((i) => i.id === id);
    if (!inquiry) return res.status(404).json({ ok: false, error: 'Inquiry not found' });
    inquiry.status = nextStatus;
    if (note !== undefined) inquiry.adminNote = note;
    inquiry.updatedAt = Date.now();
    return res.json({ ok: true, inquiry });
  } catch (error) {
    console.error('update inquiry status error', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

module.exports = { createInquiry, listInquiries, updateInquiryStatus, INQUIRY_STATUSES };
