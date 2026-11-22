const handleRequest = require('../server.js');
const { initDatabase } = require('../server/db.js');
const { ensureDemoUser } = require('../server/auth.js');

let initialized = false;

module.exports = async (req, res) => {
  if (!initialized) {
    try {
      await initDatabase();
      await ensureDemoUser();
      initialized = true;
    } catch (e) {
      console.error('Error initializing database/demo data in serverless environment:', e);
    }
  }
  return handleRequest(req, res);
};
