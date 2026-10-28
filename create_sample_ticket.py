"""
Creates a verified sample incident ticket with cryptographic evidence in Supabase.
"""

import ssl
import pg8000.native
from apply_schema import load_env

def create_sample():
    env = load_env()
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    conn = pg8000.native.Connection(
        user=env.get("DB_USER"),
        password=env.get("DB_PASSWORD"),
        host="aws-0-ap-south-1.pooler.supabase.com",
        port=6543,
        database=env.get("DB_NAME", "postgres"),
        ssl_context=ctx
    )

    elec_res = conn.run("SELECT id FROM public.departments WHERE code = 'ELEC';")
    zone_res = conn.run("SELECT id FROM public.campus_zones WHERE zone_code = 'BLOCK_A';")
    
    if not elec_res or not zone_res:
        print("[ERROR] Departments or Zones not found.")
        conn.close()
        return

    elec_id = elec_res[0][0]
    zone_id = zone_res[0][0]
    student_id = "a0000000-0000-0000-0000-000000000001"
    tech_id = "b0000000-0000-0000-0000-000000000002"

    # Insert complaint
    res = conn.run(f"""
        INSERT INTO public.complaints (
            complainant_id, zone_id, department_id, title, description, priority, status, assigned_technician_id, sla_deadline
        ) VALUES (
            '{student_id}', '{zone_id}', '{elec_id}', 
            'High-Voltage Sparking in Lab 304 Distribution Board',
            'Visible electrical arcing and burning smell from the main 3-phase DB panel on the third floor.',
            'P1_CRITICAL', 'EVIDENCE_VERIFIED', '{tech_id}', NOW() + INTERVAL '2 hours'
        ) RETURNING id, ticket_number;
    """)
    ticket_id, ticket_no = res[0]
    print(f"[OK] Created Complaint Ticket: {ticket_no} (ID: {ticket_id})")

    # Insert Evidence
    conn.run(f"""
        INSERT INTO public.evidence_records (
            complaint_id, uploader_id, proof_type, media_url, sha256_hash, perceptual_hash,
            latitude, longitude, accuracy_meters, device_timestamp, is_geofence_valid, is_exif_verified, audit_notes
        ) VALUES (
            '{ticket_id}', '{student_id}', 'INCIDENT_PROOF',
            'https://caairquvgshwizsgjvha.supabase.co/storage/v1/object/public/evidence/sparking_db.jpg',
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            'pHash:8f9a2b3c4d5e6f70',
            17.448294, 78.391485, 3.5, NOW() - INTERVAL '5 minutes',
            TRUE, TRUE, 'Cryptographic and Geospatial boundary check passed within 3.5m accuracy.'
        );
    """)
    print("[OK] Attached Cryptographic & Geospatial Evidence Record to Supabase!")

    # Insert second complaint in Library
    plumb_res = conn.run("SELECT id FROM public.departments WHERE code = 'PLUMB';")
    lib_res = conn.run("SELECT id FROM public.campus_zones WHERE zone_code = 'CENTRAL_LIB';")
    if plumb_res and lib_res:
        plumb_id = plumb_res[0][0]
        lib_id = lib_res[0][0]
        res2 = conn.run(f"""
            INSERT INTO public.complaints (
                complainant_id, zone_id, department_id, title, description, priority, status, sla_deadline
            ) VALUES (
                '{student_id}', '{lib_id}', '{plumb_id}', 
                'Water Leakage near Central Library Server Room',
                'Continuous dripping from ceiling pipe directly above network rack in second floor archive room.',
                'P2_HIGH', 'SUBMITTED', NOW() + INTERVAL '6 hours'
            ) RETURNING id, ticket_number;
        """)
        print(f"[OK] Created Complaint Ticket: {res2[0][1]} (ID: {res2[0][0]})")

    conn.close()

if __name__ == "__main__":
    create_sample()
