const express = require('express');
const { RESOURCE_COLORS, RESOURCE_ORDER, textColorForBackground } = require('../../config/resources');

const router = express.Router();

router.get('/resources', (req, res) => {
  res.json({
    order: RESOURCE_ORDER,
    colors: RESOURCE_COLORS,
    textColors: Object.fromEntries(RESOURCE_ORDER.map((r) => [r, textColorForBackground(RESOURCE_COLORS[r])])),
  });
});

module.exports = router;
