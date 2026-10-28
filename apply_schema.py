"""
Supabase Schema Deployment Script
Executes schema.sql against the live Supabase PostgreSQL database via connection pooler.
"""

import os
import ssl
import pg8000.native

def load_env(path=".env"):
    env = {}
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    return env

def apply_schema(sql_file="schema.sql"):
    env = load_env()
    print("=" * 60)
    print(" DEPLOYING SCHEMA TO SUPABASE")
    print("=" * 60)

    if not os.path.exists(sql_file):
        print(f"[ERROR] SQL file not found: {sql_file}")
        return

    with open(sql_file, "r", encoding="utf-8") as f:
        sql_content = f.read()

    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    try:
        conn = pg8000.native.Connection(
            user=env.get("DB_USER"),
            password=env.get("DB_PASSWORD"),
            host="aws-0-ap-south-1.pooler.supabase.com",
            port=6543,
            database=env.get("DB_NAME", "postgres"),
            ssl_context=ssl_context,
            timeout=20
        )
        print("[INFO] Connected to Supabase PostgreSQL database.")
        print("[INFO] Executing schema.sql...")

        # Split and execute individual statements or block
        # pg8000 allows executing multi-statement SQL strings
        conn.run(sql_content)
        
        # Verify created tables
        tables = conn.run("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name;
        """)
        
        print("[OK] Schema applied successfully!")
        print(f"[OK] Total public tables created: {len(tables)}")
        for idx, (t_name,) in enumerate(tables, 1):
            print(f"     {idx}. {t_name}")
            
        conn.close()
    except Exception as e:
        print(f"[ERROR] Failed to apply schema: {e}")

if __name__ == "__main__":
    apply_schema()
