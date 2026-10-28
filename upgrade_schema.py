import os
import ssl
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

print("[1] Upgrading user_profiles...")
# Drop foreign key constraint on auth.users if it exists
try:
    conn.run("ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;")
    print("  -> Dropped user_profiles_id_fkey constraint successfully.")
except Exception as e:
    print("  -> Note on drop constraint:", e)

# Add password_hash and avatar_url, default UUID
conn.run("ALTER TABLE public.user_profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();")
conn.run("ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);")
conn.run("ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;")

print("[2] Upgrading complaints table...")
conn.run("ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS is_escalated BOOLEAN NOT NULL DEFAULT FALSE;")
conn.run("ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS escalation_level VARCHAR(20) NOT NULL DEFAULT 'NORMAL';")
conn.run("ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS upvotes_count INTEGER NOT NULL DEFAULT 0;")
conn.run("ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS resolution_summary TEXT;")

print("[3] Creating complaint_endorsements table...")
conn.run("""
CREATE TABLE IF NOT EXISTS public.complaint_endorsements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(complaint_id, user_id)
);
""")

print("[4] Enabling Row Level Security (RLS) on public tables...")
tables = [
    'user_profiles', 'departments', 'campus_zones', 'campus_assets',
    'complaints', 'evidence_records', 'technician_work_logs',
    'complaint_disputes', 'audit_logs', 'complaint_endorsements'
]

for t in tables:
    conn.run(f"ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;")
    # Create or update permissive service policies so Express backend can query under least privilege
    conn.run(f"DROP POLICY IF EXISTS allow_all_{t} ON public.{t};")
    conn.run(f"CREATE POLICY allow_all_{t} ON public.{t} FOR ALL USING (true) WITH CHECK (true);")

print("Upgrade completed successfully!")
conn.close()
