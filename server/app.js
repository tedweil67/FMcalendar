require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const requireAuth = require('./middleware/requireAuth');
const authRoutes = require('./routes/auth');
const appointmentsRoutes = require('./routes/appointments');
const clientsRoutes = require('./routes/clients');
const configRoutes = require('./routes/config');
const adapter = require('./adapters');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  app.set('trust proxy', 1); // Render sits behind a proxy; needed for secure cookies
}

app.use(express.json());

// This app's API responses reflect live, frequently-changing FileMaker data.
// Express auto-generates an ETag for every res.json() by default and will
// silently answer matching conditional requests with a bodyless 304 - fine
// for static assets, actively wrong here, since two genuinely different
// server states (e.g. before/after a bugfix, or "no appointments" now vs.
// "some appointments" later) can hash to an identical or previously-cached
// ETag and leave the browser trusting stale data. Disable it API-wide.
app.set('etag', false);
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 12, // 12 hours
    },
  })
);

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', fmMode: adapter.mode });
});

app.use('/api', authRoutes);
app.use('/api/appointments', requireAuth, appointmentsRoutes);
app.use('/api/clients', requireAuth, clientsRoutes);
app.use('/api/config', requireAuth, configRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FMcalendar listening on port ${PORT} (FM_MODE=${adapter.mode})`);
  if (!process.env.SESSION_SECRET) {
    console.warn('WARNING: SESSION_SECRET not set - using an insecure default. Set it before deploying.');
  }
  if (!process.env.SHARED_USERNAME || !process.env.SHARED_PASSWORD) {
    console.warn('WARNING: SHARED_USERNAME/SHARED_PASSWORD not set - login will always fail.');
  }
});
