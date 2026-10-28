"""
Campus Maintenance System - Supabase Service Manager
Provides high-level helpers for ticket submission, evidence hashing, and queries.
"""

import hashlib
import json
import os
import ssl
import pg8000.native

class SupabaseManager:
    def __init__(self, env_path=".env"):
        self.config = self._load_env(env_path)
        self.ssl_context = ssl.create_default_context()
        self.ssl_context.check_hostname = False
        self.ssl_context.verify_mode = ssl.CERT_NONE

    def _load_env(self, path):
        env = {}
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        env[k.strip()] = v.strip()
        return env

    def get_connection(self):
        """Returns a connected pg8000 connection using the IPv4 Supavisor pooler."""
        return pg8000.native.Connection(
            user=self.config.get("DB_USER", "postgres.caairquvgshwizsgjvha"),
            password=self.config.get("DB_PASSWORD", "SRINIDHI@09"),
            host="aws-0-ap-south-1.pooler.supabase.com",
            port=6543,
            database=self.config.get("DB_NAME", "postgres"),
            ssl_context=self.ssl_context,
            timeout=15
        )

    @staticmethod
    def calculate_file_sha256(file_bytes: bytes) -> str:
        """Calculates cryptographic SHA-256 checksum for tamper-proof evidence records."""
        return hashlib.sha256(file_bytes).hexdigest()

    def list_departments(self):
        conn = self.get_connection()
        res = conn.run("SELECT id, code, name FROM public.departments ORDER BY name;")
        conn.close()
        return [{"id": str(r[0]), "code": r[1], "name": r[2]} for r in res]

    def list_campus_zones(self):
        conn = self.get_connection()
        res = conn.run("SELECT id, zone_code, name, center_latitude, center_longitude, geo_fence_radius_meters FROM public.campus_zones ORDER BY name;")
        conn.close()
        return [
            {
                "id": str(r[0]),
                "code": r[1],
                "name": r[2],
                "lat": r[3],
                "lng": r[4],
                "radius": r[5]
            }
            for r in res
        ]

    def get_dashboard_metrics(self):
        conn = self.get_connection()
        stats = conn.run("""
            SELECT 
                COUNT(*) as total_tickets,
                COUNT(*) FILTER (WHERE status = 'SUBMITTED') as pending,
                COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as in_progress,
                COUNT(*) FILTER (WHERE status = 'RESOLVED') as resolved,
                COUNT(*) FILTER (WHERE status = 'DISPUTED') as disputed
            FROM public.complaints;
        """)
        conn.close()
        row = stats[0]
        return {
            "total_tickets": row[0],
            "pending": row[1],
            "in_progress": row[2],
            "resolved": row[3],
            "disputed": row[4]
        }

if __name__ == "__main__":
    manager = SupabaseManager()
    print("--- CAMPUS MAINTENANCE SUPABASE MANAGER TEST ---")
    depts = manager.list_departments()
    print(f"Loaded {len(depts)} maintenance departments:")
    for d in depts:
        print(f"  [{d['code']}] {d['name']}")
    
    metrics = manager.get_dashboard_metrics()
    print("\nLive Dashboard Metrics:", metrics)
