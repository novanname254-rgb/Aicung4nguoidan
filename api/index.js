// Điểm vào serverless trên Vercel. Khởi tạo dữ liệu (nạp từ Google Sheet, seed tài khoản demo)
// được handleRequest lo ở request /api đầu tiên.
const handleRequest = require('../server.js');

module.exports = (req, res) => handleRequest(req, res);
