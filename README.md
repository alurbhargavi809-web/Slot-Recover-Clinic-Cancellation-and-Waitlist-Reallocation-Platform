# CAMPSHIELD: Evidence-Based Campus Maintenance & Complaint Tracking System

A full-stack, verifiable campus infrastructure maintenance and grievance redressal web application powered by **semantic HTML5/CSS3/Vanilla JavaScript**, **Node.js/Express REST API**, and **Supabase (PostgreSQL 17.11)**.

---

## 🏛️ System Overview & Problem Solved

Traditional campus complaint systems suffer from four fundamental failure modes:
1. **Fragmented Complaints**: Multiple students report the same water leak, power failure, or broken AC independently, cluttering operational queues.
2. **Unclear Ownership**: Work requests sit unassigned or bounce across electrical, civil, and plumbing divisions without SLA deadlines.
3. **Repeat Faults**: Chronic equipment failures (e.g. repeat tripping breakers, recurring water pipe bursts) are treated as isolated incidents rather than tracked to the root asset.
4. **Invisible / Ghost Repairs**: Technicians mark tickets resolved without empirical evidence, leaving students with unresolved issues and zero recourse.

**CampShield** solves these problems through:
- **Real-Time Duplicate Suggestion Radar**: Suggests existing active complaints in the same location and allows 1-click endorsement (`+1`) instead of filing duplicates.
- **Automated Priority SLA & Escalation Engine**: Strictly counts down resolution deadlines (`P1_CRITICAL`: 2h, `P2_HIGH`: 8h, `P3_MEDIUM`: 24h, `P4_ROUTINE`: 72h) and automatically flags overdue tickets on Directorate dashboards.
- **Cryptographic Proof-of-Work (PoW)**: Requires before & after visual evidence signed with SHA-256 digests, device timestamps, and geo-fence radius matching.
- **Student Right of Appeal (Dispute Workflow)**: Allows complainants to contest inadequate closures, automatically re-opening the ticket for Directorate inspection.
- **Repeat-Issue Analytics**: Clusters recurring incidents by physical asset and campus zone over 30/60/90 days to identify chronic equipment bottlenecks.

---

## 🚀 Live Supabase PostgreSQL Connection

| Parameter | Value / Endpoint | Details |
| :--- | :--- | :--- |
| **Project Ref** | `caairquvgshwizsgjvha` | Supabase Cloud |
| **Region** | `ap-south-1` (Mumbai) | AWS Region |
| **Database Engine** | PostgreSQL 17.11 (aarch64) | Active with RLS & Constraints |
| **Connection Pooler (IPv4)** | `aws-0-ap-south-1.pooler.supabase.com:6543` | Transaction pooler |
| **Direct Host (IPv6)** | `db.caairquvgshwizsgjvha.supabase.co:5432` | Direct PostgreSQL |

---

## 🛠️ Technology Stack

- **Frontend**: Semantic HTML5, Custom CSS3 Design System (Forest-green civic service theme with ivory canvas and safety-orange accents), and pure Vanilla JavaScript (ES6+ SPA architecture, no frontend frameworks).
- **Backend**: Node.js v24 & Express.js REST API.
- **Database**: Supabase PostgreSQL 17.11 with Row Level Security (RLS), check constraints, foreign keys, and indexes.
- **Cryptographic Security**: Node `crypto` SHA-256 file hashing, `bcryptjs` password hashing, and `jsonwebtoken` session authentication.

---

## 👥 Role Hierarchy & Access Model

CampShield implements 4 distinct roles using least-privilege access:

1. **Visitor (Public Mode)**:
   - Accesses campus landing page and live infrastructure performance ticker.
   - Searches and tracks any ticket by Reference Number (`CMP-YYYY-XXXXX`) without signing in.
   - Browses the Public Redressal Board.
2. **Requester (Student / Faculty)**:
   - Submits grievances with geo-tagged photographic evidence.
   - Receives proactive duplicate suggestions with similarity confidence scores.
   - Endorses open complaints in their building.
   - Rates completed work (1–5 stars) or files a formal dispute if the issue persists.
3. **Operator / Staff (Field Technician)**:
   - Views assigned operational dispatch queue.
   - Transitions tickets to `IN_PROGRESS` when starting repairs.
   - Submits Proof-of-Work: logs actions taken, materials/parts used, labor minutes, and uploads after-fix photo evidence.
4. **Administrator / Department Head**:
   - Operations Center: triages unassigned tickets and dispatches technicians.
   - Adjudicates student dispute appeals (accepts for re-work or confirms resolution).
   - Monitors Repeat-Issue Equipment hotspots, Mean Time to Resolution (MTTR), and SLA compliance.

### ⚡ 1-Click Demo Persona Switcher
For effortless evaluation, the top navigation bar includes an instant persona switcher:
- **Visitor**: Public Guest mode
- **Student**: Aarav Sharma (`student@campus.edu`)
- **Faculty**: Dr. Suresh Menon (`faculty@campus.edu`)
- **Technician**: Rajesh Kumar - Electrical Ops (`tech.rajesh@campus.edu`)
- **Dept Head**: Dr. Priya Nair - Electrical Maintenance (`head.priya@campus.edu`)
- **Admin**: Prof. Vikramaditya - Infrastructure Directorate (`admin@campus.edu`)
*(Standard demo password for all accounts: `Demo@123`)*

---

## 📦 Project Structure

```
├── config/
│   └── db.js                 # PostgreSQL connection pool with SSL (Supabase pooler)
├── middleware/
│   ├── auth.js               # JWT authentication & role-based access control
│   └── upload.js             # Multer upload & SHA-256 cryptographic hashing
├── public/                   # Frontend Web Application (Vanilla JS / HTML5 / CSS3)
│   ├── index.html            # Semantic HTML5 SPA
│   ├── css/
│   │   └── styles.css        # Custom Forest-Green Civic Design System
│   ├── js/
│   │   └── app.js            # Pure Vanilla JS application engine & state router
│   └── uploads/              # Evidence photographs with SHA-256 verification
├── routes/
│   ├── authRoutes.js         # Sign-in, student registration, demo switcher
│   ├── metadataRoutes.js     # Departments, zones, assets, live ticker metrics
│   ├── complaintRoutes.js    # Intake, duplicate radar, search, rating, endorsement
│   ├── technicianRoutes.js   # Active queue, start work, resolution proof submission
│   ├── disputeRoutes.js      # Student appeal submission & Directorate adjudication
│   └── analyticsRoutes.js    # Repeat equipment clusters, MTTR, zone hotspots
├── services/
│   ├── auditService.js       # Immutable system audit trail logger
│   ├── duplicateService.js   # Location, department & keyword similarity engine
│   └── slaService.js         # Priority countdown, SLA calculation & escalation sweep
├── tests/
│   ├── api_test.js           # 14 backend REST integration assertions
│   └── workflow_test.js      # 10 end-to-end domain lifecycle workflow tests
├── schema.sql                # Supabase PostgreSQL 17 DDL schema
├── seed_data.py              # Realistic synthetic seed generator
├── server.js                 # Express HTTP application server
├── package.json              # NPM dependencies & operational scripts
├── .env.example              # Environment variables template
└── README.md                 # Complete documentation
```

---

## 🏃‍♂️ Quick Start Instructions

### 1. Prerequisites
- **Node.js** (v18 or higher recommended; verified on Node.js v24.22.1)
- **Python 3** (for schema and seed execution)
- **Supabase PostgreSQL** credentials (configured in `.env`)

### 2. Install Dependencies
```powershell
npm install
```

### 3. Verify / Reseed Database
To re-apply schema upgrades and populate realistic synthetic data:
```powershell
python upgrade_schema.py
python seed_data.py
```

### 4. Execute Automated Test Suites
Run the backend API integration and domain workflow tests:
```powershell
npm test
node tests/workflow_test.js
```

### 5. Launch Application
```powershell
npm start
```
The application will boot at: **`http://localhost:3000`**

---

## 🧪 Verification & Test Results

The system has been verified using two comprehensive automated test suites:

### 1. Integration Suite (`tests/api_test.js` - 14/14 Passed)
- `[PASS] 1. System Health API (/api/health)`
- `[PASS] 2. Departments API (6 divisions loaded)`
- `[PASS] 3. Campus Zones API (6 geo-fenced zones)`
- `[PASS] 4. Campus Assets API (10 QR-tagged assets)`
- `[PASS] 5. Live Stats Ticker (Live counts & resolution rate)`
- `[PASS] 6. Demo Switch to Student Aarav Sharma`
- `[PASS] 7. Auth Verification (/api/auth/me)`
- `[PASS] 8. Complaints Listing API (Multi-facet query)`
- `[PASS] 9. Single Complaint Detail with Evidence & Timeline`
- `[PASS] 10. Duplicate Suggestions Engine`
- `[PASS] 11. Repeat-Issue Asset Clustering`
- `[PASS] 12. Metrics & MTTR Analytics (Compliance: 100%)`
- `[PASS] 13. Technician Work Queue`
- `[PASS] 14. Disputes Review API`

### 2. End-to-End Workflow Suite (`tests/workflow_test.js` - 10/10 Passed)
- `[PASS] Step 1: Authenticate as Student Aarav Sharma`
- `[PASS] Step 2: Proactive Duplicate Radar Check`
- `[PASS] Step 3: Complaint Endorsement (+1) Workflow`
- `[PASS] Step 4: Complaint Intake with SLA Deadline Calculation`
- `[PASS] Step 5: Department Head Triage & Technician Assignment`
- `[PASS] Step 6: Technician Commences Repair (IN_PROGRESS)`
- `[PASS] Step 7: Resolution Certified with Work Logs & Materials`
- `[PASS] Step 8: Complainant Verification & 5-Star Rating (CLOSED)`
- `[PASS] Step 9: Directorate Dispute Appeals Review Queue`
- `[PASS] Step 10: Repeat-Fault Hotspot Analytics Calculation`

---

## 🔒 Security & Data Integrity

- **Row Level Security (RLS)**: Enabled across all public tables in Supabase PostgreSQL 17.
- **SQL Injection Prevention**: Parameterized queries across all database drivers (`pg` in Node, `pg8000` in Python).
- **Cryptographic Hashing**: Uploaded evidence files are hashed using SHA-256 on arrival.
- **Location Verification**: Haversine distance verification checks that evidence photos fall within the designated building's geo-fence tolerance radius.
- **Immutable Audit Trail**: State transitions, assignments, resolutions, and dispute appeals are recorded in `public.audit_logs`.
