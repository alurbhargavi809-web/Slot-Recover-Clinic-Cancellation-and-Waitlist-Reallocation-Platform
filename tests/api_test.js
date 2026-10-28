const http = require('http');
const { app, server } = require('../server');

async function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: 'localhost',
      port: port,
      path: path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n--- EXECUTING CAMPSHIELD BACKEND INTEGRATION TEST SUITE ---\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    // 1. Health check
    const health = await makeRequest('/api/health');
    assert(health.status === 200 && health.data.status === 'ONLINE', '1. System Health API (/api/health)');

    // 2. Metadata: Departments
    const depts = await makeRequest('/api/metadata/departments');
    assert(depts.status === 200 && depts.data.departments.length >= 6, `2. Departments API (${depts.data.departments.length} departments)`);

    // 3. Metadata: Zones
    const zones = await makeRequest('/api/metadata/zones');
    assert(zones.status === 200 && zones.data.zones.length >= 6, `3. Campus Zones API (${zones.data.zones.length} zones)`);

    // 4. Metadata: Assets
    const assets = await makeRequest('/api/metadata/assets');
    assert(assets.status === 200 && assets.data.assets.length >= 10, `4. Campus Assets API (${assets.data.assets.length} assets)`);

    // 5. Metadata: Live Ticker
    const ticker = await makeRequest('/api/metadata/stats-ticker');
    assert(ticker.status === 200 && ticker.data.total_tickets >= 10, `5. Live Stats Ticker (${ticker.data.total_tickets} tickets tracked)`);

    // 6. Auth: Demo Switch to Student
    const demoStudent = await makeRequest('/api/auth/demo-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { userId: '11111111-1111-1111-1111-111111111101' }
    });
    assert(demoStudent.status === 200 && demoStudent.data.token, '6. Demo Switch to Student Aarav Sharma');
    const studentToken = demoStudent.data.token;

    // 7. Auth: Me endpoint
    const me = await makeRequest('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert(me.status === 200 && me.data.user.email === 'student@campus.edu', '7. Auth Verification (/api/auth/me)');

    // 8. Complaints List
    const complaints = await makeRequest('/api/complaints');
    assert(complaints.status === 200 && complaints.data.complaints.length > 0, `8. Complaints Listing API (${complaints.data.complaints.length} tickets retrieved)`);

    // 9. Single Complaint Detail with Evidence & Timeline
    const firstComplaint = complaints.data.complaints[0];
    const detail = await makeRequest(`/api/complaints/${firstComplaint.ticket_number}`);
    assert(detail.status === 200 && detail.data.complaint.ticket_number === firstComplaint.ticket_number, `9. Single Complaint Detail (${firstComplaint.ticket_number}) with Evidence`);

    // 10. Duplicate Suggestions Engine
    const dupCheck = await makeRequest(`/api/complaints/check-duplicates?zone_id=${firstComplaint.zone_id}&department_id=${firstComplaint.department_id}&title=${encodeURIComponent(firstComplaint.title)}`);
    assert(dupCheck.status === 200 && Array.isArray(dupCheck.data.suggestions), `10. Duplicate Suggestions Engine (${dupCheck.data.suggestions.length} candidates found)`);

    // 11. Repeat-Issue Analytics
    const repeatIssues = await makeRequest('/api/analytics/repeat-issues');
    assert(repeatIssues.status === 200 && repeatIssues.data.asset_repeat_clusters.length > 0, `11. Repeat-Issue Asset Clustering (${repeatIssues.data.asset_repeat_clusters.length} equipment clusters)`);

    // 12. Operational Metrics & MTTR
    const metrics = await makeRequest('/api/analytics/metrics');
    assert(metrics.status === 200 && metrics.data.overall_sla_compliance_percent >= 0, `12. Metrics & MTTR Analytics (Compliance: ${metrics.data.overall_sla_compliance_percent}%)`);

    // 13. Technician Work Queue (Switch to Technician Rajesh)
    const demoTech = await makeRequest('/api/auth/demo-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { userId: '22222222-2222-2222-2222-222222222201' }
    });
    const techToken = demoTech.data.token;
    const techQueue = await makeRequest('/api/technician/queue', {
      headers: { 'Authorization': `Bearer ${techToken}` }
    });
    assert(techQueue.status === 200 && techQueue.data.tasks !== undefined, `13. Technician Work Queue (${techQueue.data.count} assigned tasks)`);

    // 14. Disputes Review (Switch to Admin)
    const demoAdmin = await makeRequest('/api/auth/demo-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { userId: '44444444-4444-4444-4444-444444444401' }
    });
    const adminToken = demoAdmin.data.token;
    const disputes = await makeRequest('/api/disputes', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert(disputes.status === 200 && disputes.data.disputes.length > 0, `14. Disputes Review API (${disputes.data.count} active student disputes)`);

    console.log(`\n=======================================================`);
    console.log(` TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`=======================================================\n`);

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (e) {
    console.error('Test execution error:', e);
    process.exit(1);
  }
}

// Allow server to listen before testing
setTimeout(runTests, 1000);
