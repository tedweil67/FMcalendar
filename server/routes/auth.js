const crypto = require('crypto');
const express = require('express');

const router = express.Router();

// Constant-time string compare so a mismatched login/token can't be timed to
// leak how many leading characters were correct.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const expectedUser = process.env.SHARED_USERNAME;
  const expectedPass = process.env.SHARED_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return res.status(500).json({ error: 'Server is missing SHARED_USERNAME/SHARED_PASSWORD configuration' });
  }
  if (!safeEqual(username || '', expectedUser) || !safeEqual(password || '', expectedPass)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  req.session.authenticated = true;
  res.json({ authenticated: true });
});

// Silent login for the FileMaker Web Viewer: a long-lived secret token baked
// into the Web Viewer's calculated URL (kept separate from the human-facing
// shared username/password) so staff never see a login screen inside
// FileMaker. The frontend sends the token via POST body, never a query
// string, and reads it from the URL fragment (#token=...) so it's never even
// sent to - let alone logged by - the server as part of the page request.
router.post('/login-token', (req, res) => {
  const { token } = req.body || {};
  const expectedToken = process.env.WEBVIEWER_TOKEN;

  if (!expectedToken) {
    return res.status(500).json({ error: 'Server is missing WEBVIEWER_TOKEN configuration' });
  }
  if (!token || !safeEqual(token, expectedToken)) {
    return res.status(401).json({ error: 'Invalid token' });
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
