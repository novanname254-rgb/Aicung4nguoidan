const handleRequest = require('../server.js');
const { ensureDemoUser } = require('../server/auth.js');

let initialized = false;

module.exports = async (req, res) => {
  if (!initialized) {
    try {
      ensureDemoUser();
      initialized = true;
    } catch (e) {
      console.error('Error initializing demo data in serverless environment:', e);
    }
  }
  return handleRequest(req, res);
};
