import os
import ssl
import json
import hashlib
import datetime
import pg8000.native

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

conn = pg8000.native.Connection(
    user="postgres.caairquvgshwizsgjvha",
    password="SRINIDHI@09",
    host="aws-0-ap-south-1.pooler.supabase.com",
    port=6543,
    database="postgres",
    ssl_context=ctx
)

print("--- SEEDING REALISTIC DATA FOR EVIDENCE-BASED CAMPUS MAINTENANCE ---")

# 1. Clear existing complaints and child records to ensure clean reproducible demo
print("[1] Resetting dynamic tables...")
conn.run("DELETE FROM public.audit_logs;")
conn.run("DELETE FROM public.complaint_disputes;")
conn.run("DELETE FROM public.technician_work_logs;")
conn.run("DELETE FROM public.evidence_records;")
conn.run("DELETE FROM public.complaint_endorsements;")
conn.run("DELETE FROM public.complaints;")
conn.run("DELETE FROM public.campus_assets;")
conn.run("DELETE FROM public.user_profiles;")

# Standard precomputed bcrypt hash for 'Demo@123'
demo_password_hash = "$2a$10$7EqJtq98hPqEX7fNZaFWoO0L/VvLh9hK5Kq94i7uM2wT4V8u8jC5."

# 2. Seed Users
print("[2] Seeding Users across all required roles...")
users = [
    # Students / Faculty (Requesters)
    ("11111111-1111-1111-1111-111111111101", "Aarav Sharma", "CS-2023-042", "student@campus.edu", "student", "+91 98765 43210", "Computer Science", demo_password_hash),
    ("11111111-1111-1111-1111-111111111102", "Ananya Roy", "EC-2023-118", "student2@campus.edu", "student", "+91 98765 43211", "Electronics & Comm", demo_password_hash),
    ("11111111-1111-1111-1111-111111111103", "Dr. Suresh Menon", "FAC-PHY-09", "faculty@campus.edu", "faculty", "+91 98765 43212", "Physics & Materials", demo_password_hash),
    
    # Technicians / Operators (Staff)
    ("22222222-2222-2222-2222-222222222201", "Rajesh Kumar", "TECH-ELEC-01", "tech.rajesh@campus.edu", "technician", "+91 98765 43220", "Electrical Ops", demo_password_hash),
    ("22222222-2222-2222-2222-222222222202", "Vikram Singh", "TECH-HVAC-02", "tech.vikram@campus.edu", "technician", "+91 98765 43221", "HVAC Operations", demo_password_hash),
    ("22222222-2222-2222-2222-222222222203", "Manoj Verma", "TECH-PLUMB-03", "tech.manoj@campus.edu", "technician", "+91 98765 43222", "Plumbing & Piping", demo_password_hash),
    
    # Department Heads
    ("33333333-3333-3333-3333-333333333301", "Dr. Priya Nair", "HOD-ELEC-01", "head.priya@campus.edu", "department_head", "+91 98765 43230", "Electrical Maintenance", demo_password_hash),
    ("33333333-3333-3333-3333-333333333302", "Dr. Arun Patel", "HOD-CIVIL-02", "head.arun@campus.edu", "department_head", "+91 98765 43231", "Civil & Structural", demo_password_hash),
    
    # Administrator
    ("44444444-4444-4444-4444-444444444401", "Prof. Vikramaditya", "ADMIN-DIR-01", "admin@campus.edu", "admin", "+91 98765 43240", "Campus Infrastructure Directorate", demo_password_hash)
]

for u in users:
    conn.run("""
        INSERT INTO public.user_profiles (id, full_name, institutional_id, email, role, phone_number, department_name, password_hash)
        VALUES (:id, :name, :inst_id, :email, :role::user_role, :phone, :dept, :pw)
        ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash;
    """, id=u[0], name=u[1], inst_id=u[2], email=u[3], role=u[4], phone=u[5], dept=u[6], pw=u[7])

print("  -> Inserted 9 user profiles.")

# 3. Retrieve Departments and Zones
dept_rows = conn.run("SELECT id, code FROM public.departments;")
depts = {r[1]: str(r[0]) for r in dept_rows}

zone_rows = conn.run("SELECT id, zone_code FROM public.campus_zones;")
zones = {r[1]: str(r[0]) for r in zone_rows}

# 4. Seed Assets
print("[3] Seeding Campus Physical Assets...")
assets = [
    ("a1111111-1111-1111-1111-111111111101", "QR-ELEC-BLK_A-102", "Smart Projector & Power Distribution Rack", depts.get('ELEC'), zones.get('BLOCK_A'), "Lecture Hall 102, 1st Floor", True),
    ("a1111111-1111-1111-1111-111111111102", "QR-HVAC-BLK_A-304", "2-Ton High Efficiency Inverter Split AC", depts.get('HVAC'), zones.get('BLOCK_A'), "Room 304, Mechanical CAD Lab", True),
    ("a1111111-1111-1111-1111-111111111103", "QR-ELEC-BLK_A-CORR", "Main Corridor Motion-Sensor LED Array", depts.get('ELEC'), zones.get('BLOCK_A'), "2nd Floor Main Corridor East Wing", True),
    ("a1111111-1111-1111-1111-111111111104", "QR-PLUMB-BLK_B-GF", "Dual-Stage Water Dispenser & RO Plant", depts.get('PLUMB'), zones.get('BLOCK_B'), "Ground Floor Central Atrium", True),
    ("a1111111-1111-1111-1111-111111111105", "QR-IT-BLK_B-LAB3", "Cisco 48-Port PoE Layer 3 Switch Rack", depts.get('IT_INFRA'), zones.get('BLOCK_B'), "Advanced AI & Robotics Lab 3", True),
    ("a1111111-1111-1111-1111-111111111106", "QR-CIVIL-BLK_B-201", "Emergency Fire Exit Door & Hydraulic Arm", depts.get('CIVIL'), zones.get('BLOCK_B'), "North Staircase Landing 2nd Floor", True),
    ("a1111111-1111-1111-1111-111111111107", "QR-HVAC-LIB-READ", "Central AHU Chilled Water Heat Exchanger", depts.get('HVAC'), zones.get('CENTRAL_LIB'), "North Reading Wing, 2nd Floor", True),
    ("a1111111-1111-1111-1111-111111111108", "QR-PLUMB-DORM1-W3", "Solar Thermal Water Line Pressure Regulator", depts.get('PLUMB'), zones.get('STUDENT_DORM_1'), "Boys Hostel 1, Roof Utility Room", True),
    ("a1111111-1111-1111-1111-111111111109", "QR-SANITATION-DORM2", "Automated Organic Waste Recycling Chute", depts.get('SANITATION'), zones.get('STUDENT_DORM_2'), "Girls Hostel 2 Courtyard", True),
    ("a1111111-1111-1111-1111-111111111110", "QR-ELEC-SPORTS-FLD", "High-Mast Stadium Floodlight Bank A", depts.get('ELEC'), zones.get('SPORTS_COMPLEX'), "Outdoor Football & Track Field", True),
]

for a in assets:
    conn.run("""
        INSERT INTO public.campus_assets (id, asset_tag, name, department_id, zone_id, location_details, is_operational)
        VALUES (:id, :tag, :name, :dept_id, :zone_id, :loc, :op)
        ON CONFLICT (id) DO NOTHING;
    """, id=a[0], tag=a[1], name=a[2], dept_id=a[3], zone_id=a[4], loc=a[5], op=a[6])

print(f"  -> Inserted {len(assets)} campus assets.")

# 5. Helper function for SHA-256
def mock_hash(string_seed):
    return hashlib.sha256(string_seed.encode('utf-8')).hexdigest()

now = datetime.datetime.now(datetime.timezone.utc)

# 6. Seed Complaints
print("[4] Seeding Complaints across various stages (Intake, Duplicate, Assigned, In-Progress, Resolved, Disputed, Escalated)...")

c_aarav = "11111111-1111-1111-1111-111111111101"
c_ananya = "11111111-1111-1111-1111-111111111102"
c_suresh = "11111111-1111-1111-1111-111111111103"

t_rajesh = "22222222-2222-2222-2222-222222222201"
t_vikram = "22222222-2222-2222-2222-222222222202"
t_manoj = "22222222-2222-2222-2222-222222222203"

complaints = [
    # Ticket 1: Escalated P1 Critical Issue (SLA Breached)
    {
        "id": "c1111111-1111-1111-1111-111111111101",
        "ticket_number": "CMP-2026-00101",
        "complainant_id": c_suresh,
        "asset_id": "a1111111-1111-1111-1111-111111111101",
        "zone_id": zones['BLOCK_A'],
        "department_id": depts['ELEC'],
        "title": "Severe Sparking and Power Failure in Smart Lab 102",
        "description": "The main circuit breaker panel is sparking visibly during class sessions. Burning smell reported by multiple students. Complete blackout on Rows 3 to 6.",
        "priority": "P1_CRITICAL",
        "status": "ASSIGNED",
        "assigned_technician_id": t_rajesh,
        "created_at": now - datetime.timedelta(hours=5),
        "sla_deadline": now - datetime.timedelta(hours=3), # Overdue!
        "is_escalated": True,
        "escalation_level": "ESCALATED",
        "upvotes_count": 8,
        "evidence": {
            "proof_type": "INCIDENT_PROOF",
            "media_url": "/uploads/evidence_sparking_panel.jpg",
            "hash": mock_hash("sparking_panel_blk_a_102"),
            "lat": 17.448294, "lng": 78.391485,
            "tamper": False, "audit": "EXIF timestamp verified; matches campus GPS radius."
        }
    },
    
    # Ticket 2: Duplicate Candidate in Block A (Room 102 Electrical)
    {
        "id": "c1111111-1111-1111-1111-111111111102",
        "ticket_number": "CMP-2026-00102",
        "complainant_id": c_aarav,
        "asset_id": "a1111111-1111-1111-1111-111111111101",
        "zone_id": zones['BLOCK_A'],
        "department_id": depts['ELEC'],
        "title": "Smart Board power socket dead in Lecture Hall 102",
        "description": "Projector unit loses power intermittently. Connected to the tripped breaker panel.",
        "priority": "P2_HIGH",
        "status": "SUBMITTED",
        "assigned_technician_id": None,
        "created_at": now - datetime.timedelta(hours=2),
        "sla_deadline": now + datetime.timedelta(hours=6),
        "is_escalated": False,
        "escalation_level": "NORMAL",
        "upvotes_count": 4,
        "evidence": {
            "proof_type": "INCIDENT_PROOF",
            "media_url": "/uploads/evidence_socket_burnt.jpg",
            "hash": mock_hash("socket_burnt_blk_a_102"),
            "lat": 17.448290, "lng": 78.391490,
            "tamper": False, "audit": "Photo verified with location tag."
        }
    },

    # Ticket 3: In Progress with Technician Work Log
    {
        "id": "c1111111-1111-1111-1111-111111111103",
        "ticket_number": "CMP-2026-00103",
        "complainant_id": c_ananya,
        "asset_id": "a1111111-1111-1111-1111-111111111102",
        "zone_id": zones['BLOCK_A'],
        "department_id": depts['HVAC'],
        "title": "AC Compressor Vibrating Excessively & Blowing Warm Air in CAD Lab",
        "description": "Room 304 temperature is exceeding 34°C during afternoon design labs. Strong metallic rattling from ceiling unit.",
        "priority": "P2_HIGH",
        "status": "IN_PROGRESS",
        "assigned_technician_id": t_vikram,
        "created_at": now - datetime.timedelta(hours=6),
        "sla_deadline": now + datetime.timedelta(hours=2),
        "is_escalated": False,
        "escalation_level": "WARNING", # Less than 25% remaining
        "upvotes_count": 6,
        "work_log": {
            "action": "Inspected compressor housing. Detected refrigerant leak at high-pressure flare valve. Replaced copper gasket and recharged R-410A gas.",
            "materials": "R-410A canister (1.2 kg), 1/2-inch copper flare union, nitrile O-rings",
            "time_spent": 75
        },
        "evidence": {
            "proof_type": "INCIDENT_PROOF",
            "media_url": "/uploads/evidence_ac_ice_leak.jpg",
            "hash": mock_hash("ac_leak_cad_lab"),
            "lat": 17.448310, "lng": 78.391480,
            "tamper": False, "audit": "Valid geofence within 15m."
        }
    },

    # Ticket 4: Resolved with Cryptographic Proof of Work (Ready for Rating)
    {
        "id": "c1111111-1111-1111-1111-111111111104",
        "ticket_number": "CMP-2026-00104",
        "complainant_id": c_aarav,
        "asset_id": "a1111111-1111-1111-1111-111111111104",
        "zone_id": zones['BLOCK_B'],
        "department_id": depts['PLUMB'],
        "title": "Drinking Water Fountain Pipe Burst on Block B Ground Floor",
        "description": "High pressure pipe burst spraying water across corridor walkway. Slip hazard near main entrance.",
        "priority": "P1_CRITICAL",
        "status": "RESOLVED",
        "assigned_technician_id": t_manoj,
        "created_at": now - datetime.timedelta(hours=14),
        "sla_deadline": now - datetime.timedelta(hours=12),
        "resolved_at": now - datetime.timedelta(hours=13),
        "is_escalated": False,
        "escalation_level": "NORMAL",
        "upvotes_count": 12,
        "resolution_summary": "Replaced ruptured 1.25 inch CPVC pressure coupling and installed new brass ball isolation valve.",
        "work_log": {
            "action": "Shut off sub-riser manifold. Cut damaged PVC section and glued high-pressure Astral CPVC collar with Teflon wrap. Pressure tested to 4.5 bar.",
            "materials": "1.25 inch CPVC pipe segment (1m), CPVC heavy duty solvent cement, brass 1.25 inch ball valve",
            "time_spent": 50
        },
        "evidence_before": {
            "proof_type": "INCIDENT_PROOF",
            "media_url": "/uploads/water_fountain_burst_before.jpg",
            "hash": mock_hash("water_burst_before_proof"),
            "lat": 17.449102, "lng": 78.392010,
            "tamper": False, "audit": "Original incident photo verified."
        },
        "evidence_after": {
            "proof_type": "RESOLUTION_PROOF",
            "media_url": "/uploads/water_fountain_fixed_after.jpg",
            "hash": mock_hash("water_fixed_after_proof"),
            "lat": 17.449105, "lng": 78.392015,
            "tamper": False, "audit": "Technician Proof-of-Work verified. Geo-fence accurate to 3 meters."
        }
    },

    # Ticket 5: Disputed Closure (Student Appeal Workflow)
    {
        "id": "c1111111-1111-1111-1111-111111111105",
        "ticket_number": "CMP-2026-00105",
        "complainant_id": c_ananya,
        "asset_id": "a1111111-1111-1111-1111-111111111108",
        "zone_id": zones['STUDENT_DORM_1'],
        "department_id": depts['PLUMB'],
        "title": "No Hot Water Supply in Hostel 1 Third Floor Washrooms",
        "description": "Solar water heating line has zero pressure since Tuesday. Over 80 students affected during morning hours.",
        "priority": "P2_HIGH",
        "status": "DISPUTED",
        "assigned_technician_id": t_manoj,
        "created_at": now - datetime.timedelta(days=2),
        "sla_deadline": now - datetime.timedelta(days=1, hours=16),
        "resolved_at": now - datetime.timedelta(days=1),
        "is_escalated": True,
        "escalation_level": "ESCALATED",
        "upvotes_count": 19,
        "resolution_summary": "Technician marked as resolved claiming valve was open, but water remains freezing.",
        "dispute": {
            "disputed_by": c_ananya,
            "reason": "Technician claimed valve was reopened, but water temperature measured only 18°C this morning. Roof solar collector sensor is burnt out. Premature closure!",
            "status": "UNDER_REVIEW"
        }
    },

    # Ticket 6: Closed with Feedback and 5-Star Rating
    {
        "id": "c1111111-1111-1111-1111-111111111106",
        "ticket_number": "CMP-2026-00106",
        "complainant_id": c_suresh,
        "asset_id": "a1111111-1111-1111-1111-111111111105",
        "zone_id": zones['BLOCK_B'],
        "department_id": depts['IT_INFRA'],
        "title": "Ethernet Drop Offline on Faculty Research Benches",
        "description": "Bench port numbers 14 through 20 have no carrier signal. Gigabit switch port orange LED blinking fault.",
        "priority": "P3_MEDIUM",
        "status": "CLOSED",
        "assigned_technician_id": t_rajesh,
        "created_at": now - datetime.timedelta(days=3),
        "sla_deadline": now - datetime.timedelta(days=2),
        "resolved_at": now - datetime.timedelta(days=2, hours=8),
        "rating": 5,
        "feedback_notes": "Prompt resolution within 4 hours. Rajesh re-crimped the patch cables and tested throughput with Fluke tester. Outstanding work!",
        "is_escalated": False,
        "escalation_level": "NORMAL",
        "upvotes_count": 3,
        "resolution_summary": "Re-crimped RJ45 connectors and replaced patch cable 17 with shielded Cat6."
    },

    # Ticket 7: Repeat Fault Candidate (Lighting in Block A)
    {
        "id": "c1111111-1111-1111-1111-111111111107",
        "ticket_number": "CMP-2026-00107",
        "complainant_id": c_aarav,
        "asset_id": "a1111111-1111-1111-1111-111111111103",
        "zone_id": zones['BLOCK_A'],
        "department_id": depts['ELEC'],
        "title": "Flickering Corridor Emergency Lights East Wing",
        "description": "Third time this month the LED driver has tripped. Dark corridor creates hazard during evening hours.",
        "priority": "P3_MEDIUM",
        "status": "SUBMITTED",
        "assigned_technician_id": None,
        "created_at": now - datetime.timedelta(hours=8),
        "sla_deadline": now + datetime.timedelta(hours=16),
        "is_escalated": False,
        "escalation_level": "NORMAL",
        "upvotes_count": 5
    },

    # Ticket 8: Library Reading Wing HVAC
    {
        "id": "c1111111-1111-1111-1111-111111111108",
        "ticket_number": "CMP-2026-00108",
        "complainant_id": c_suresh,
        "asset_id": "a1111111-1111-1111-1111-111111111107",
        "zone_id": zones['CENTRAL_LIB'],
        "department_id": depts['HVAC'],
        "title": "High Humidity & Odor from Central Library Duct A4",
        "description": "Students complaining of musty damp smell near reference book stacks. Condensate drip pan overflowing onto tray.",
        "priority": "P2_HIGH",
        "status": "ASSIGNED",
        "assigned_technician_id": t_vikram,
        "created_at": now - datetime.timedelta(hours=4),
        "sla_deadline": now + datetime.timedelta(hours=4),
        "is_escalated": False,
        "escalation_level": "NORMAL",
        "upvotes_count": 7
    },

    # Ticket 9: Civil Maintenance - Fire Door Closer
    {
        "id": "c1111111-1111-1111-1111-111111111109",
        "ticket_number": "CMP-2026-00109",
        "complainant_id": c_ananya,
        "asset_id": "a1111111-1111-1111-1111-111111111106",
        "zone_id": zones['BLOCK_B'],
        "department_id": depts['CIVIL'],
        "title": "Fire Exit Heavy Door Slamming Violently on 2nd Floor",
        "description": "Hydraulic closer leaked oil and has zero dampening. Heavy steel door slammed on student's hand yesterday.",
        "priority": "P1_CRITICAL",
        "status": "IN_PROGRESS",
        "assigned_technician_id": t_rajesh,
        "created_at": now - datetime.timedelta(hours=1),
        "sla_deadline": now + datetime.timedelta(hours=1),
        "is_escalated": False,
        "escalation_level": "WARNING",
        "upvotes_count": 14
    },

    # Ticket 10: Sanitation Chute Clog
    {
        "id": "c1111111-1111-1111-1111-111111111110",
        "ticket_number": "CMP-2026-00110",
        "complainant_id": c_ananya,
        "asset_id": "a1111111-1111-1111-1111-111111111109",
        "zone_id": zones['STUDENT_DORM_2'],
        "department_id": depts['SANITATION'],
        "title": "Bio-Waste Chute Blocked & Overflowing in Hostel 2",
        "description": "Garbage chute blocked between 2nd and 3rd floor. Waste accumulating on floor landings, hygiene concern.",
        "priority": "P2_HIGH",
        "status": "SUBMITTED",
        "assigned_technician_id": None,
        "created_at": now - datetime.timedelta(hours=3),
        "sla_deadline": now + datetime.timedelta(hours=5),
        "is_escalated": False,
        "escalation_level": "NORMAL",
        "upvotes_count": 11
    }
]

for c in complaints:
    conn.run("""
        INSERT INTO public.complaints (
            id, ticket_number, complainant_id, asset_id, zone_id, department_id,
            title, description, priority, status, assigned_technician_id,
            sla_deadline, resolved_at, rating, feedback_notes, created_at, updated_at,
            is_escalated, escalation_level, upvotes_count, resolution_summary
        ) VALUES (
            :id, :ticket_number, :complainant_id, :asset_id, :zone_id, :department_id,
            :title, :description, :priority::ticket_priority, :status::ticket_status, :assigned_technician_id,
            :sla_deadline, :resolved_at, :rating, :feedback_notes, :created_at, :updated_at,
            :is_escalated, :escalation_level, :upvotes_count, :resolution_summary
        ) ON CONFLICT (id) DO NOTHING;
    """,
        id=c["id"],
        ticket_number=c["ticket_number"],
        complainant_id=c["complainant_id"],
        asset_id=c["asset_id"],
        zone_id=c["zone_id"],
        department_id=c["department_id"],
        title=c["title"],
        description=c["description"],
        priority=c["priority"],
        status=c["status"],
        assigned_technician_id=c["assigned_technician_id"],
        sla_deadline=c.get("sla_deadline"),
        resolved_at=c.get("resolved_at"),
        rating=c.get("rating"),
        feedback_notes=c.get("feedback_notes"),
        created_at=c["created_at"],
        updated_at=c["created_at"],
        is_escalated=c["is_escalated"],
        escalation_level=c["escalation_level"],
        upvotes_count=c["upvotes_count"],
        resolution_summary=c.get("resolution_summary")
    )

    # Insert evidence if defined
    if "evidence" in c:
        e = c["evidence"]
        conn.run("""
            INSERT INTO public.evidence_records (
                complaint_id, uploader_id, proof_type, media_url, sha256_hash,
                latitude, longitude, accuracy_meters, device_timestamp,
                is_geofence_valid, is_exif_verified, is_tamper_flagged, audit_notes
            ) VALUES (
                :complaint_id, :uploader_id, :proof_type::evidence_type, :media_url, :hash,
                :lat, :lng, 4.2, :ts, TRUE, TRUE, :tamper, :notes
            );
        """,
            complaint_id=c["id"],
            uploader_id=c["complainant_id"],
            proof_type=e["proof_type"],
            media_url=e["media_url"],
            hash=e["hash"],
            lat=e["lat"],
            lng=e["lng"],
            ts=c["created_at"],
            tamper=e["tamper"],
            notes=e["audit"]
        )

    if "evidence_before" in c:
        e = c["evidence_before"]
        conn.run("""
            INSERT INTO public.evidence_records (
                complaint_id, uploader_id, proof_type, media_url, sha256_hash,
                latitude, longitude, accuracy_meters, device_timestamp,
                is_geofence_valid, is_exif_verified, is_tamper_flagged, audit_notes
            ) VALUES (
                :complaint_id, :uploader_id, :proof_type::evidence_type, :media_url, :hash,
                :lat, :lng, 3.5, :ts, TRUE, TRUE, :tamper, :notes
            );
        """,
            complaint_id=c["id"],
            uploader_id=c["complainant_id"],
            proof_type=e["proof_type"],
            media_url=e["media_url"],
            hash=e["hash"],
            lat=e["lat"],
            lng=e["lng"],
            ts=c["created_at"],
            tamper=e["tamper"],
            notes=e["audit"]
        )

    if "evidence_after" in c:
        e = c["evidence_after"]
        conn.run("""
            INSERT INTO public.evidence_records (
                complaint_id, uploader_id, proof_type, media_url, sha256_hash,
                latitude, longitude, accuracy_meters, device_timestamp,
                is_geofence_valid, is_exif_verified, is_tamper_flagged, audit_notes
            ) VALUES (
                :complaint_id, :uploader_id, :proof_type::evidence_type, :media_url, :hash,
                :lat, :lng, 2.1, :ts, TRUE, TRUE, :tamper, :notes
            );
        """,
            complaint_id=c["id"],
            uploader_id=c["assigned_technician_id"],
            proof_type=e["proof_type"],
            media_url=e["media_url"],
            hash=e["hash"],
            lat=e["lat"],
            lng=e["lng"],
            ts=c.get("resolved_at", now),
            tamper=e["tamper"],
            notes=e["audit"]
        )

    if "work_log" in c:
        w = c["work_log"]
        conn.run("""
            INSERT INTO public.technician_work_logs (
                complaint_id, technician_id, action_taken, materials_used, time_spent_minutes
            ) VALUES (
                :cid, :tid, :action, :mat, :time
            );
        """, cid=c["id"], tid=c["assigned_technician_id"], action=w["action"], mat=w["materials"], time=w["time_spent"])

    if "dispute" in c:
        d = c["dispute"]
        conn.run("""
            INSERT INTO public.complaint_disputes (
                complaint_id, disputed_by, reason, status
            ) VALUES (
                :cid, :dby, :reason, :status
            );
        """, cid=c["id"], dby=d["disputed_by"], reason=d["reason"], status=d["status"])

    # Log creation audit event
    conn.run("""
        INSERT INTO public.audit_logs (
            event_type, entity_name, entity_id, actor_id, payload
        ) VALUES (
            'COMPLAINT_CREATED', 'complaints', :cid, :actor_id, :payload
        );
    """, cid=c["id"], actor_id=c["complainant_id"], payload=json.dumps({"ticket": c["ticket_number"], "title": c["title"]}))

print(f"  -> Inserted {len(complaints)} complaints with complete evidence, work logs, disputes, and audit records.")

conn.close()
print("--- SEEDING COMPLETED WITH ZERO ERRORS ---")
