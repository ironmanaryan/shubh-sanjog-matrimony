const express = require('express');
const router = express.Router();
const { verifyTokenMiddleware } = require('../middleware/auth');
const { getProfile, saveProfile, savePersonal, saveEducation, saveFamily, savePreferences, submitForReview } = require('../controllers/profileController');

router.get('/', verifyTokenMiddleware, getProfile);
router.put('/', verifyTokenMiddleware, saveProfile);
router.post('/personal', verifyTokenMiddleware, savePersonal);
router.post('/education', verifyTokenMiddleware, saveEducation);
router.post('/family', verifyTokenMiddleware, saveFamily);
router.post('/preferences', verifyTokenMiddleware, savePreferences);
// NOTE: Lifestyle fields (scope PDF §5) are stored inside the personal section —
// saved via POST /personal together with Personal Details. No duplicate route.
router.post('/submit', verifyTokenMiddleware, submitForReview);

module.exports = router;
