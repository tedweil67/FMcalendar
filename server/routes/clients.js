const express = require('express');
const adapter = require('../adapters');

const router = express.Router();

// Backs the "new appointment for this client" flow: a FileMaker script
// hands the web app an Intake ID (via URL - see README) and this does one
// fast, targeted two-hop key lookup (Schedule.kf_Intake_ID's target ->
// Intake_System -> Client Records), not a table scan - unlike the bulk
// client-search feature this replaced, which timed out against the live
// Client Records table.
router.get('/by-intake/:intakeId', async (req, res, next) => {
  try {
    const client = await adapter.hydrateClientForAppointment(req.params.intakeId);
    if (!client) return res.status(404).json({ error: 'No client found for that Intake ID' });
    res.json(client);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
