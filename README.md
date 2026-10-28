# CAMPSHIELD: Evidence-Based Campus Maintenance & Complaint Tracking System

A verifiable, tamper-resistant campus infrastructure maintenance and grievance redressal platform powered by **Supabase (PostgreSQL 17)** and **Antigravity**.

---

## 🚀 Supabase Integration Overview

| Resource | Value / Endpoint | Notes |
| :--- | :--- | :--- |
| **Project Ref** | `caairquvgshwizsgjvha` | Supabase Cloud |
| **Region** | `ap-south-1` (Mumbai) | AWS Region |
| **Project URL** | `https://caairquvgshwizsgjvha.supabase.co` | REST & Auth Endpoint |
| **Connection Pooler (IPv4)** | `aws-0-ap-south-1.pooler.supabase.com:6543` | Recommended for all clients |
| **Database Engine** | PostgreSQL 17.11 (aarch64) | Extensions: `uuid-ossp`, `pgcrypto` |

> [!IMPORTANT]
> **Password URL Encoding Note**: Because the database password contains an `@` symbol (`SRINIDHI@09`), standard URI connection strings must encode it as `%40`:
> `postgresql://postgres.caairquvgshwizsgjvha:SRINIDHI%4009@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require`

---

## 🗄️ Database Architecture & Schemas

The database schema (`schema.sql`) implements the core evidence-based verification architecture:

1. **`user_profiles`**: Integrated with Supabase Auth with dynamic role assignment (`student`, `faculty`, `technician`, `department_head`, `auditor`, `admin`).
2. **`departments`**: Pre-seeded with 6 departments (`ELEC`, `PLUMB`, `HVAC`, `CIVIL`, `IT_INFRA`, `SANITATION`).
3. **`campus_zones`**: Geo-fenced campus locations (Block A, Block B, Central Library, Hostels, Sports Complex) with lat/lng coordinates and radii.
4. **`campus_assets`**: Physical infrastructure items with QR asset tags.
5. **`complaints`**: Automated ticket numbering (`CMP-YYYY-XXXXX`), SLA deadlines, priority (`P1_CRITICAL` to `P4_ROUTINE`), and lifecycle statuses.
6. **`evidence_records`**: Cryptographic SHA-256 and perceptual hash verification, EXIF timestamp audit, geo-fence matching, and tamper flags.
7. **`technician_work_logs`**: Logs of parts, labor time, and resolution actions.
8. **`complaint_disputes`**: Student appeal workflow for contested ticket closures.
9. **`audit_logs`**: Immutable event trail for institutional oversight.

---

## 🛠️ Quick Commands

### 1. Test Connection & Health
```powershell
python test_connection.py
```

### 2. Verify Database Service Manager
```powershell
python supabase_manager.py
```

### 3. Re-apply / Update Schema
```powershell
python apply_schema.py
```
