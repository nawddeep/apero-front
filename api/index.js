// api/index.js
// Vercel serverless entry point — forwards all /api/* to the shared Express app.
// vercel.json rewrites all /api/* to this function.
'use strict';

require('dotenv').config();
const { createApp } = require('../lib/app');

const app = createApp();

module.exports = app;
