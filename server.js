// server.js
// Local development entry point. Vercel uses api/index.js instead.
'use strict';

require('dotenv').config();
const { createApp } = require('./lib/app');

const PORT = Number(process.env.PORT || 5000);
const app = createApp();

// Serve static frontend (customer site + admin portal) locally
const path = require('path');
const fs = require('fs');
app.use(require('express').static(path.join(__dirname)));

// Dev convenience: also serve the admin portal (a sibling folder) so it can
// be opened at http://localhost:5000/admin/login.html with the /api routes
// on the same origin. Guarded so this never breaks Vercel deploys.
const adminDir = path.resolve(__dirname, '../admin');
if (fs.existsSync(path.join(adminDir, 'login.html'))) {
  app.use('/admin', require('express').static(adminDir));
  console.log('Serving admin portal at http://localhost:' + PORT + '/admin/login.html');
}

app.listen(PORT, () => {
  console.log(`APERO booking API + static site listening on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});
