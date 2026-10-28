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

print("Tables in public schema:")
rows = conn.run("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;")
for r in rows:
    count = conn.run(f"SELECT COUNT(*) FROM public.{r[0]};")[0][0]
    print(f"  - {r[0]}: {count} rows")

conn.close()
