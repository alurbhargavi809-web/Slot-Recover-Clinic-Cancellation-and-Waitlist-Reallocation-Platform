"""
Supabase Connection Verification Script
Tests REST API, Auth service, and PostgreSQL Pooler connectivity.
"""

import os
import ssl
import urllib.request
import urllib.error
import json
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

def test_supabase_connection():
    env = load_env()
    print("=" * 60)
    print(" SUPABASE CONNECTION DIAGNOSTICS")
    print("=" * 60)
    
    url = env.get("SUPABASE_URL")
    anon_key = env.get("SUPABASE_ANON_KEY")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    
    print(f"\n[1] Checking Supabase REST & Auth Services: {url}")
    
    # Check Auth Service
    auth_url = f"{url}/auth/v1/health"
    req = urllib.request.Request(auth_url, headers={"apikey": anon_key})
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"  [OK] Auth Service Health Check: HTTP {resp.status}")
    except Exception as e:
        print(f"  [ERROR] Auth Service Error: {e}")
        
    # Check OpenAPI / PostgREST endpoint
    rest_url = f"{url}/rest/v1/"
    req = urllib.request.Request(
        rest_url, 
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/openapi+json"
        }
    )
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"  [OK] PostgREST Service API: HTTP {resp.status}")
    except Exception as e:
        print(f"  [ERROR] PostgREST Error: {e}")

    # Check Database Connection via Pooler
    print(f"\n[2] Checking PostgreSQL Database Connection (aws-0-ap-south-1.pooler.supabase.com:6543)")
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
            timeout=10
        )
        version_row = conn.run("SELECT version();")
        time_row = conn.run("SELECT NOW();")
        tables = conn.run("SELECT table_name FROM information_schema.tables WHERE table_schema='public';")
        
        print("  [OK] Database Connection Established Successfully!")
        print(f"  [INFO] Database Engine: {version_row[0][0][:45]}...")
        print(f"  [INFO] Supabase Server Time: {time_row[0][0]}")
        print(f"  [INFO] Existing Public Tables ({len(tables)}): {[t[0] for t in tables] if tables else 'None (Clean Database)'}")
        conn.close()
    except Exception as e:
        print(f"  [ERROR] PostgreSQL Connection Failed: {e}")

    print("\n" + "=" * 60)
    print(" ALL CHECKS FINISHED")
    print("=" * 60)

if __name__ == "__main__":
    test_supabase_connection()
