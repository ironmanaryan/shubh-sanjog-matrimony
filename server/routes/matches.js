const express = require('express');
const router = express.Router();
const { verifyTokenMiddleware } = require('../middleware/auth');
const { requireProfileStatus } = require('../middleware/onboarding');
const { toggleShortlist, getShortlist, expressInterest, listInterests, respondToInterest, searchProfiles } = require('../controllers/matchesController');

// Matching engine (PRD funnel): unlocks once the profile is Approved by admin.
const approvedOnly = [requireProfileStatus('Approved')];

router.get('/search', verifyTokenMiddleware, ...approvedOnly, searchProfiles);
router.post('/shortlist', verifyTokenMiddleware, ...approvedOnly, toggleShortlist);
router.get('/shortlist', verifyTokenMiddleware, getShortlist);
router.post('/interest', verifyTokenMiddleware, ...approvedOnly, expressInterest);
router.get('/interests', verifyTokenMiddleware, listInterests);
router.post('/interest/respond', verifyTokenMiddleware, respondToInterest);

module.exports = router;
