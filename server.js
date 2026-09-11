// server.js
// Local development entry point. Vercel uses api/index.js instead.
'use strict';

require('dotenv').config();
const { createApp } = require('./lib/app');

const PORT = Number(process.env.PORT || 5000);
const app = createApp();

// Serve static frontend (customer site + admin portal) locally
const path = require('path');
app.use(require('express').static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`APERO booking API + static site listening on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});
