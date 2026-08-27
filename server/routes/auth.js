const express = require('express');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const expectedUser = process.env.SHARED_USERNAME;
  const expectedPass = process.env.SHARED_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return res.status(500).json({ error: 'Server is missing SHARED_USERNAME/SHARED_PASSWORD configuration' });
  }
  if (username !== expectedUser || password !== expectedPass) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  req.session.authenticated = true;
  res.json({ authenticated: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ authenticated: false });
  });
});

router.get('/session', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

module.exports = router;
