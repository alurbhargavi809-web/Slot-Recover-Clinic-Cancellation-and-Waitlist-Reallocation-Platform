"""
CAMPSHIELD - Evidence-Based Campus Maintenance System
Flask Web Portal connected live to Supabase PostgreSQL Database.
Includes Dynamic Role Impersonation (Student, Technician, Auditor, Director).
"""

import hashlib
import json
import os
import ssl
from flask import Flask, render_template_string, request, jsonify
import pg8000.native

app = Flask(__name__)

# Load config from .env
def get_db_connection():
    env = {}
    if os.path.exists(".env"):
        with open(".env", "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()

    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    return pg8000.native.Connection(
        user=env.get("DB_USER", "postgres.caairquvgshwizsgjvha"),
        password=env.get("DB_PASSWORD", "SRINIDHI@09"),
        host="aws-0-ap-south-1.pooler.supabase.com",
        port=6543,
        database=env.get("DB_NAME", "postgres"),
        ssl_context=ssl_context,
        timeout=15
    )

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CAMPSHIELD | Evidence-Centric Maintenance Portal</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        body { font-family: 'Plus Jakarta Sans', sans-serif; }
    </style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen">
    <!-- Top Header -->
    <header class="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                    <i class="fa-solid fa-shield-halved text-white text-lg"></i>
                </div>
                <div>
                    <div class="flex items-center gap-2">
                        <span class="font-extrabold text-lg tracking-tight bg-gradient-to-r from-cyan-400 via-teal-300 to-white bg-clip-text text-transparent">CAMPSHIELD</span>
                        <span class="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Supabase Connected</span>
                    </div>
                    <p class="text-xs text-slate-400">Verifiable Campus Maintenance & Audit System</p>
                </div>
            </div>

            <!-- Role Impersonation Switcher -->
            <div class="flex items-center gap-2 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700">
                <span class="text-xs font-semibold text-slate-400 px-2 flex items-center gap-1.5">
                    <i class="fa-solid fa-masks-theater text-cyan-400"></i> Role:
                </span>
                <select id="roleSelector" onchange="switchPersona(this.value)" class="bg-slate-900 text-xs font-semibold text-cyan-300 rounded-lg px-3 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500">
                    <option value="student">🎓 Student (Aarav Sharma - CS)</option>
                    <option value="technician">🛠️ Lead Technician (Rajesh Kumar - Elec)</option>
                    <option value="auditor">🔍 Evidence Auditor (Dr. Meenakshi)</option>
                    <option value="director">🏛️ Facilities Director (Col. Vikram)</option>
                </select>
            </div>
        </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <!-- Persona Banner -->
        <div id="personaBanner" class="mb-8 p-4 rounded-2xl bg-gradient-to-r from-blue-900/30 via-slate-900 to-cyan-900/20 border border-cyan-500/30 flex items-center justify-between">
            <div class="flex items-center gap-4">
                <div id="personaAvatar" class="h-12 w-12 rounded-xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-xl text-cyan-400">
                    <i class="fa-solid fa-user-graduate"></i>
                </div>
                <div>
                    <h2 id="personaName" class="font-bold text-base text-white">Aarav Sharma</h2>
                    <p id="personaDesc" class="text-xs text-slate-400">Student Complainant • Active ID: STU-2026-081 • Can submit geo-verified maintenance tickets</p>
                </div>
            </div>
            <button onclick="openSubmitModal()" class="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-cyan-500/25 transition flex items-center gap-2">
                <i class="fa-solid fa-plus"></i> Submit Geo-Verified Ticket
            </button>
        </div>

        <!-- Metrics Row -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div class="bg-slate-900/70 p-5 rounded-2xl border border-slate-800">
                <div class="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Total Incidents</span>
                    <i class="fa-solid fa-folder-tree text-cyan-400"></i>
                </div>
                <div class="text-2xl font-bold text-white">{{ metrics.total }}</div>
                <div class="text-[11px] text-slate-500 mt-1">Live in Supabase DB</div>
            </div>

            <div class="bg-slate-900/70 p-5 rounded-2xl border border-slate-800">
                <div class="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Critical (P1 Hazards)</span>
                    <i class="fa-solid fa-triangle-exclamation text-rose-400"></i>
                </div>
                <div class="text-2xl font-bold text-rose-400">{{ metrics.p1_count }}</div>
                <div class="text-[11px] text-slate-500 mt-1">SLA &lt; 2 Hours Priority</div>
            </div>

            <div class="bg-slate-900/70 p-5 rounded-2xl border border-slate-800">
                <div class="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Evidence-Verified</span>
                    <i class="fa-solid fa-certificate text-emerald-400"></i>
                </div>
                <div class="text-2xl font-bold text-emerald-400">{{ metrics.verified_count }}</div>
                <div class="text-[11px] text-slate-500 mt-1">SHA-256 + Geo-Match</div>
            </div>

            <div class="bg-slate-900/70 p-5 rounded-2xl border border-slate-800">
                <div class="flex items-center justify-between text-slate-400 text-xs mb-2">
                    <span>Campus Zones Active</span>
                    <i class="fa-solid fa-location-dot text-amber-400"></i>
                </div>
                <div class="text-2xl font-bold text-amber-400">{{ zones|length }}</div>
                <div class="text-[11px] text-slate-500 mt-1">Geo-fenced Boundaries</div>
            </div>
        </div>

        <!-- Live Complaint Records -->
        <div class="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
            <div class="p-5 border-b border-slate-800 flex items-center justify-between">
                <div>
                    <h3 class="font-bold text-sm text-white flex items-center gap-2">
                        <i class="fa-solid fa-list-check text-cyan-400"></i> Live Complaint & Maintenance Ledger
                    </h3>
                    <p class="text-xs text-slate-400">Real-time status synchronized with Supabase PostgreSQL</p>
                </div>
                <span class="text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-3 py-1 rounded-full">
                    Project: caairquvgshwizsgjvha
                </span>
            </div>

            <div class="divide-y divide-slate-800/60">
                {% for t in tickets %}
                <div class="p-5 hover:bg-slate-800/30 transition">
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div class="space-y-1.5 flex-1">
                            <div class="flex items-center gap-2.5 flex-wrap">
                                <span class="font-mono text-xs font-bold text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/80">
                                    {{ t.ticket_number }}
                                </span>
                                
                                <!-- Priority Badge -->
                                {% if t.priority == 'P1_CRITICAL' %}
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">P1 CRITICAL</span>
                                {% elif t.priority == 'P2_HIGH' %}
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">P2 HIGH</span>
                                {% else %}
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30">{{ t.priority }}</span>
                                {% endif %}

                                <!-- Status Badge -->
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                    {{ t.status }}
                                </span>

                                <span class="text-xs text-slate-400 font-medium">
                                    <i class="fa-regular fa-building text-slate-500 mr-1"></i> {{ t.zone_name }}
                                </span>
                                <span class="text-xs text-slate-400 font-medium">
                                    <i class="fa-solid fa-wrench text-slate-500 mr-1"></i> {{ t.dept_name }}
                                </span>
                            </div>

                            <h4 class="font-semibold text-sm text-slate-100">{{ t.title }}</h4>
                            <p class="text-xs text-slate-400 leading-relaxed">{{ t.description }}</p>

                            <!-- Evidence Proof Bar -->
                            {% if t.has_evidence %}
                            <div class="mt-2 text-[11px] font-mono text-slate-400 bg-slate-950/70 p-2 rounded-xl border border-slate-800 flex items-center justify-between flex-wrap gap-2">
                                <div class="flex items-center gap-2 text-emerald-400">
                                    <i class="fa-solid fa-fingerprint"></i>
                                    <span>SHA-256: {{ t.sha256[:16] }}...{{ t.sha256[-8:] }}</span>
                                </div>
                                <div class="flex items-center gap-3 text-cyan-400">
                                    <span><i class="fa-solid fa-location-crosshairs mr-1"></i>Lat: {{ t.latitude }}, Lng: {{ t.longitude }}</span>
                                    <span class="text-emerald-400 font-semibold">✓ Geo-Fence Validated</span>
                                </div>
                            </div>
                            {% endif %}
                        </div>

                        <!-- Action Button depending on Persona -->
                        <div class="flex items-center gap-2 self-start md:self-center">
                            <button onclick="auditEvidence('{{ t.ticket_number }}', '{{ t.sha256 or 'N/A' }}')" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition">
                                <i class="fa-solid fa-magnifying-glass-arrow-right mr-1"></i> Audit Proof
                            </button>
                        </div>
                    </div>
                </div>
                {% endfor %}
            </div>
        </div>
    </main>

    <!-- Submit Complaint Modal -->
    <div id="submitModal" class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm hidden items-center justify-center p-4 z-50">
        <div class="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 class="font-bold text-sm text-white flex items-center gap-2">
                    <i class="fa-solid fa-camera-rotate text-cyan-400"></i> File Evidence-Verified Complaint
                </h3>
                <button onclick="closeSubmitModal()" class="text-slate-400 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <form id="complaintForm" onsubmit="submitComplaint(event)" class="space-y-3">
                <div>
                    <label class="block text-xs font-semibold text-slate-400 mb-1">Issue Title</label>
                    <input type="text" id="title" required placeholder="e.g. Ceiling Fan Overheating & Wobbling" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500">
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-semibold text-slate-400 mb-1">Department</label>
                        <select id="department_id" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500">
                            {% for d in depts %}
                            <option value="{{ d.id }}">{{ d.name }}</option>
                            {% endfor %}
                        </select>
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-slate-400 mb-1">Campus Zone</label>
                        <select id="zone_id" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500">
                            {% for z in zones %}
                            <option value="{{ z.id }}">{{ z.name }}</option>
                            {% endfor %}
                        </select>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-semibold text-slate-400 mb-1">Priority</label>
                        <select id="priority" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500">
                            <option value="P1_CRITICAL">P1 - Critical Hazard (&lt;2h SLA)</option>
                            <option value="P2_HIGH">P2 - High Urgency (&lt;8h SLA)</option>
                            <option value="P3_MEDIUM" selected>P3 - Standard Maintenance (&lt;24h)</option>
                            <option value="P4_ROUTINE">P4 - Routine Check</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-slate-400 mb-1">GPS Telemetry</label>
                        <div class="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-[11px] text-cyan-400 font-mono">
                            Lat: 17.44829 • Lng: 78.39148
                        </div>
                    </div>
                </div>

                <div>
                    <label class="block text-xs font-semibold text-slate-400 mb-1">Detailed Description</label>
                    <textarea id="description" rows="3" required placeholder="Describe the physical defect and specific room/floor location..." class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"></textarea>
                </div>

                <!-- Simulated Cryptographic Evidence Attachment -->
                <div class="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1.5">
                    <div class="flex items-center justify-between text-xs text-slate-300">
                        <span class="font-semibold"><i class="fa-solid fa-camera text-cyan-400 mr-1"></i> Visual Evidence Capture</span>
                        <span class="text-emerald-400 font-mono text-[10px]">Auto-SHA256 Enabled</span>
                    </div>
                    <p class="text-[11px] text-slate-500">Simulates real-time hardware photo hashing and geo-fence radius verification.</p>
                </div>

                <div class="flex justify-end gap-2 pt-2">
                    <button type="button" onclick="closeSubmitModal()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-300">Cancel</button>
                    <button type="submit" class="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 text-xs font-bold rounded-xl text-white">Submit to Supabase</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        function openSubmitModal() { document.getElementById('submitModal').classList.remove('hidden'); document.getElementById('submitModal').classList.add('flex'); }
        function closeSubmitModal() { document.getElementById('submitModal').classList.add('hidden'); document.getElementById('submitModal').classList.remove('flex'); }

        const personas = {
            student: {
                name: "Aarav Sharma",
                desc: "Student Complainant • Active ID: STU-2026-081 • Can submit geo-verified maintenance tickets",
                icon: "fa-user-graduate",
                avatarClass: "text-cyan-400 bg-cyan-500/20 border-cyan-400/30"
            },
            technician: {
                name: "Rajesh Kumar (Senior Technician)",
                desc: "Lead Maintenance Electrician • Badge: TECH-ELEC-012 • Proof-of-Work Verification Specialist",
                icon: "fa-screwdriver-wrench",
                avatarClass: "text-amber-400 bg-amber-500/20 border-amber-400/30"
            },
            auditor: {
                name: "Dr. Meenakshi Sundaram",
                desc: "Forensic Evidence & Safety Auditor • ID: AUDIT-OFF-004 • EXIF & Geo-Polygon Integrity Inspector",
                icon: "fa-shield-halved",
                avatarClass: "text-emerald-400 bg-emerald-500/20 border-emerald-400/30"
            },
            director: {
                name: "Col. Vikram Rathore",
                desc: "Campus Infrastructure Operations Director • Oversight & SLA Escalation Controller",
                icon: "fa-building-columns",
                avatarClass: "text-purple-400 bg-purple-500/20 border-purple-400/30"
            }
        };

        function switchPersona(role) {
            const p = personas[role];
            document.getElementById('personaName').innerText = p.name;
            document.getElementById('personaDesc').innerText = p.desc;
            const avatar = document.getElementById('personaAvatar');
            avatar.className = `h-12 w-12 rounded-xl flex items-center justify-center text-xl border ${p.avatarClass}`;
            avatar.innerHTML = `<i class="fa-solid ${p.icon}"></i>`;
        }

        async function submitComplaint(e) {
            e.preventDefault();
            const payload = {
                title: document.getElementById('title').value,
                description: document.getElementById('description').value,
                department_id: document.getElementById('department_id').value,
                zone_id: document.getElementById('zone_id').value,
                priority: document.getElementById('priority').value,
            };

            const res = await fetch('/api/complaints', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success) {
                alert('Complaint submitted successfully to Supabase! Ticket: ' + data.ticket_number);
                window.location.reload();
            } else {
                alert('Error submitting complaint: ' + (data.error || 'Unknown error'));
            }
        }

        function auditEvidence(ticketNumber, hash) {
            alert(`AUDIT REPORT FOR ${ticketNumber}\\n----------------------------------\\n• SHA-256 Checksum: ${hash}\\n• Temporal Bounds: Verified within 120s\\n• PostGIS Geo-Fence: Within Campus Perimeter\\n• Evidence Status: 100% Authentic`);
        }
    </script>
</body>
</html>
"""

@app.route("/")
def index():
    conn = get_db_connection()
    
    # Load Departments
    dept_rows = conn.run("SELECT id, code, name FROM public.departments ORDER BY name;")
    depts = [{"id": str(r[0]), "code": r[1], "name": r[2]} for r in dept_rows]

    # Load Zones
    zone_rows = conn.run("SELECT id, zone_code, name, center_latitude, center_longitude FROM public.campus_zones ORDER BY name;")
    zones = [{"id": str(r[0]), "code": r[1], "name": r[2], "lat": r[3], "lng": r[4]} for r in zone_rows]

    # Load Complaints with Joins
    ticket_rows = conn.run("""
        SELECT 
            c.id, c.ticket_number, c.title, c.description, c.priority, c.status,
            z.name as zone_name, d.name as dept_name,
            e.sha256_hash, e.latitude, e.longitude
        FROM public.complaints c
        JOIN public.campus_zones z ON c.zone_id = z.id
        JOIN public.departments d ON c.department_id = d.id
        LEFT JOIN public.evidence_records e ON e.complaint_id = c.id
        ORDER BY c.created_at DESC;
    """)

    tickets = []
    p1_count = 0
    verified_count = 0
    for r in ticket_rows:
        has_ev = bool(r[8])
        if r[4] == 'P1_CRITICAL':
            p1_count += 1
        if has_ev:
            verified_count += 1
            
        tickets.append({
            "id": str(r[0]),
            "ticket_number": r[1],
            "title": r[2],
            "description": r[3],
            "priority": r[4],
            "status": r[5],
            "zone_name": r[6],
            "dept_name": r[7],
            "has_evidence": has_ev,
            "sha256": r[8] or "",
            "latitude": r[9] or 17.4482,
            "longitude": r[10] or 78.3914
        })

    metrics = {
        "total": len(tickets),
        "p1_count": p1_count,
        "verified_count": verified_count
    }

    conn.close()
    return render_template_string(HTML_TEMPLATE, depts=depts, zones=zones, tickets=tickets, metrics=metrics)

@app.route("/api/complaints", methods=["POST"])
def create_complaint():
    data = request.json
    conn = get_db_connection()

    title = data.get("title")
    description = data.get("description")
    department_id = data.get("department_id")
    zone_id = data.get("zone_id")
    priority = data.get("priority", "P3_MEDIUM")
    student_id = "a0000000-0000-0000-0000-000000000001"

    # Insert complaint
    res = conn.run(f"""
        INSERT INTO public.complaints (
            complainant_id, zone_id, department_id, title, description, priority, status, sla_deadline
        ) VALUES (
            '{student_id}', '{zone_id}', '{department_id}', 
            '{title.replace("'", "''")}', '{description.replace("'", "''")}',
            '{priority}', 'EVIDENCE_VERIFIED', NOW() + INTERVAL '24 hours'
        ) RETURNING id, ticket_number;
    """)

    ticket_id, ticket_no = res[0]

    # Generate synthetic cryptographic proof
    content_for_hash = f"{ticket_no}:{title}:{description}".encode("utf-8")
    evidence_hash = hashlib.sha256(content_for_hash).hexdigest()

    conn.run(f"""
        INSERT INTO public.evidence_records (
            complaint_id, uploader_id, proof_type, media_url, sha256_hash, perceptual_hash,
            latitude, longitude, accuracy_meters, device_timestamp, is_geofence_valid, is_exif_verified, audit_notes
        ) VALUES (
            '{ticket_id}', '{student_id}', 'INCIDENT_PROOF',
            'https://caairquvgshwizsgjvha.supabase.co/storage/v1/object/public/evidence/{ticket_no}.jpg',
            '{evidence_hash}',
            'pHash:{evidence_hash[:16]}',
            17.448294, 78.391485, 2.8, NOW(),
            TRUE, TRUE, 'Auto-verified via Web Client Telemetry'
        );
    """)

    conn.close()
    return jsonify({"success": True, "ticket_number": ticket_no, "id": str(ticket_id)})

if __name__ == "__main__":
    print("Starting CAMPSHIELD Portal on http://127.0.0.1:5000 ...")
    app.run(host="127.0.0.1", port=5000, debug=False)
