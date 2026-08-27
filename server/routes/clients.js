const express = require('express');
const adapter = require('../adapters');

const router = express.Router();

router.get('/search', async (req, res, next) => {
  try {
    const results = await adapter.findClients(req.query.q || '');
    res.json(results);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
