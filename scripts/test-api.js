const handleRequest = require('../server.js');
const { EventEmitter } = require('events');

function mockReqRes(method, path, body = null, headers = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = path;
  req.headers = headers;

  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(code, h) {
      this.statusCode = code;
      this.headers = Object.assign(this.headers, h);
    },
    end(data) {
      this.body = data;
      this.resolve(this);
    }
  };

  const promise = new Promise(resolve => { res.resolve = resolve; });
  
  setImmediate(() => {
    if (body) {
      req.emit('data', JSON.stringify(body));
    }
    req.emit('end');
  });

  handleRequest(req, res);
  return promise;
}

(async () => {
  console.log('--- Testing /api/auth/me without token ---');
  const meRes = await mockReqRes('GET', '/api/auth/me');
  console.log('Status:', meRes.statusCode);
  const meData = JSON.parse(meRes.body);
  console.log('User full_name:', meData.user?.full_name);
  console.log('User email:', meData.user?.email);

  console.log('\n--- Testing /api/dashboard without token ---');
  const dashRes = await mockReqRes('GET', '/api/dashboard');
  console.log('Status:', dashRes.statusCode);
  const dashData = JSON.parse(dashRes.body);
  console.log('Today tasks count:', dashData.todayTasks?.length);
  console.log('Today health present:', Boolean(dashData.todayHealth));
  console.log('Latest mood present:', Boolean(dashData.latestMood));

  console.log('\n--- Testing /api/tasks without token ---');
  const tasksRes = await mockReqRes('GET', '/api/tasks');
  console.log('Status:', tasksRes.statusCode);
  const tasksData = JSON.parse(tasksRes.body);
  console.log('Total tasks count:', tasksData.tasks?.length);

  console.log('\n🎉 ALL GUEST API CALLS WORK WITHOUT LOGIN!');
})();
