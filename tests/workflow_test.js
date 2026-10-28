const http = require('http');
const { app, server } = require('../server');

async function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    let port = 3000;
    try {
      if (server && server.address && server.address()) {
        port = server.address().port;
      }
    } catch (e) {
      port = 3000;
    }
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

async function runWorkflowTests() {
  console.log('\n===============================================================');
  console.log(' CAMPSHIELD END-TO-END DOMAIN WORKFLOW VERIFICATION');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // Step 1: Switch to Student Aarav
    const studentLogin = await makeRequest('/api/auth/demo-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { userId: '11111111-1111-1111-1111-111111111101' }
    });
    assert(studentLogin.status === 200, 'Step 1: Authenticate as Student Aarav Sharma');
    const studentToken = studentLogin.data.token;

    // Step 2: Test Real-Time Duplicate Detection
    // Query for electrical issues in Block A using zone and keywords
    const zonesRes0 = await makeRequest('/api/metadata/zones');
    const targetZone = zonesRes0.data.zones[0];
    const dupRes = await makeRequest(`/api/complaints/check-duplicates?zone_id=${targetZone.id}&title=power%20failure%20sparks`);
    assert(dupRes.status === 200 && Array.isArray(dupRes.data.suggestions), 'Step 2: Proactive Duplicate Radar Check');

    // Step 3: Endorse an Existing Complaint (Ticket 1)
    const endorseRes = await makeRequest('/api/complaints/c1111111-1111-1111-1111-111111111101/endorse', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    assert(endorseRes.status === 200 || endorseRes.status === 400, 'Step 3: Complaint Endorsement (+1) Workflow');

    // Step 4: Submit a New Verified Complaint
    // First fetch a valid zone and department
    const deptsRes = await makeRequest('/api/metadata/departments');
    const zonesRes = await makeRequest('/api/metadata/zones');
    const testDept = deptsRes.data.departments[0];
    const testZone = zonesRes.data.zones[0];

    const newComplaintRes = await makeRequest('/api/complaints', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${studentToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        title: 'Corridor ceiling tile fallen after monsoon storm',
        description: 'Large acoustic ceiling tile fell near staircase entrance. Debris on floor blocking passage.',
        priority: 'P2_HIGH',
        zone_id: testZone.id,
        department_id: testDept.id,
        latitude: testZone.center_latitude,
        longitude: testZone.center_longitude
      }
    });

    assert(newComplaintRes.status === 201 && newComplaintRes.data.complaint.ticket_number, `Step 4: Complaint Intake (${newComplaintRes.data.complaint?.ticket_number}) with SLA`);
    const createdTicket = newComplaintRes.data.complaint;

    // Step 5: Department Head Assigns Technician
    const headLogin = await makeRequest('/api/auth/demo-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { userId: '33333333-3333-3333-3333-333333333301' }
    });
    const headToken = headLogin.data.token;

    const assignRes = await makeRequest(`/api/complaints/${createdTicket.id}/assign`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${headToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        technician_id: '22222222-2222-2222-2222-222222222201', // Technician Rajesh
        priority: 'P2_HIGH'
      }
    });
    assert(assignRes.status === 200 && assignRes.data.complaint.status === 'ASSIGNED', 'Step 5: Department Head Triage & Technician Assignment');

    // Step 6: Technician Starts Work
    const techLogin = await makeRequest('/api/auth/demo-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { userId: '22222222-2222-2222-2222-222222222201' }
    });
    const techToken = techLogin.data.token;

    const startWorkRes = await makeRequest(`/api/technician/tickets/${createdTicket.id}/start`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${techToken}` }
    });
    assert(startWorkRes.status === 200 && startWorkRes.data.complaint.status === 'IN_PROGRESS', 'Step 6: Technician Commences Repair (IN_PROGRESS)');

    // Step 7: Technician Certifies Proof of Work
    const resolveRes = await makeRequest(`/api/technician/tickets/${createdTicket.id}/resolve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${techToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        action_taken: 'Replaced damaged acoustic gypsum tile and reinforced aluminum grid hanger wires.',
        materials_used: 'Gypsum tile 600x600mm, 2m galvanized tie wire',
        time_spent_minutes: 35
      }
    });
    assert(resolveRes.status === 200 && resolveRes.data.complaint.status === 'RESOLVED', 'Step 7: Resolution Certified with Work Logs & Materials');

    // Step 8: Complainant Submits 5-Star Feedback & Formally Closes Ticket
    const feedbackRes = await makeRequest(`/api/complaints/${createdTicket.id}/feedback`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${studentToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        rating: 5,
        feedback_notes: 'Ceiling looks clean and secure again. Fast response!'
      }
    });
    assert(feedbackRes.status === 200 && feedbackRes.data.complaint.status === 'CLOSED', 'Step 8: Complainant Verification & 5-Star Rating (CLOSED)');

    // Step 9: Dispute & Appeal Workflow on an existing disputed ticket
    const disputesRes = await makeRequest('/api/disputes', {
      headers: { 'Authorization': `Bearer ${headToken}` }
    });
    assert(disputesRes.status === 200 && disputesRes.data.disputes.length > 0, 'Step 9: Directorate Dispute Appeals Review Queue');

    // Step 10: Repeat-Issue Analytics
    const repeatRes = await makeRequest('/api/analytics/repeat-issues');
    assert(repeatRes.status === 200 && repeatRes.data.asset_repeat_clusters.length > 0, 'Step 10: Repeat-Fault Hotspot Analytics Calculation');

    console.log(`\n===============================================================`);
    console.log(` WORKFLOW VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED`);
    console.log(`===============================================================\n`);

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Workflow error:', err);
    process.exit(1);
  }
}

setTimeout(runWorkflowTests, 1000);
