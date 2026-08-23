const express = require('express');
const router = express.Router();
const { verifyTokenMiddleware } = require('../middleware/auth');
const { toggleShortlist, getShortlist, expressInterest, listInterests, respondToInterest, searchProfiles } = require('../controllers/matchesController');

router.get('/search', verifyTokenMiddleware, searchProfiles);
router.post('/shortlist', verifyTokenMiddleware, toggleShortlist);
router.get('/shortlist', verifyTokenMiddleware, getShortlist);
router.post('/interest', verifyTokenMiddleware, expressInterest);
router.get('/interests', verifyTokenMiddleware, listInterests);
router.post('/interest/respond', verifyTokenMiddleware, respondToInterest);

module.exports = router;
