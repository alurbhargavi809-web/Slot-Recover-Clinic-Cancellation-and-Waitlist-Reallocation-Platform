-- =========================================================================
-- EVIDENCE-BASED CAMPUS MAINTENANCE & COMPLAINT TRACKING SYSTEM (CAMPSHIELD)
-- Database Migration & DDL Schema for Supabase (PostgreSQL 17)
-- =========================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUM TYPES
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'student',
        'faculty',
        'technician',
        'department_head',
        'auditor',
        'admin'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ticket_priority AS ENUM (
        'P1_CRITICAL',    -- Safety hazards, campus-wide outages (SLA < 2 hrs)
        'P2_HIGH',        -- Lab/classroom blockers, water leaks (SLA < 8 hrs)
        'P3_MEDIUM',      -- Standard furniture, room lighting (SLA < 24 hrs)
        'P4_ROUTINE'      -- Cosmetic, preventive touch-ups (SLA < 72 hrs)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ticket_status AS ENUM (
        'SUBMITTED',
        'EVIDENCE_VERIFIED',
        'ASSIGNED',
        'IN_PROGRESS',
        'PENDING_VERIFICATION',
        'RESOLVED',
        'DISPUTED',
        'CLOSED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE evidence_type AS ENUM (
        'INCIDENT_PROOF',      -- Complainant visual & location evidence
        'RESOLUTION_PROOF',    -- Technician proof-of-work (PoW)
        'AUDITOR_INSPECTION'   -- Third-party audit evidence
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. CORE TABLES

-- User Profiles (Augmenting Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(120) NOT NULL,
    institutional_id VARCHAR(50) UNIQUE NOT NULL, -- e.g. Student ID or Employee Code
    email VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'student',
    phone_number VARCHAR(20),
    department_name VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Maintenance Departments
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL, -- e.g. 'ELEC', 'CIVIL', 'PLUMB', 'HVAC', 'IT_INFRA'
    name VARCHAR(100) NOT NULL,
    head_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Campus Zones / Buildings
CREATE TABLE IF NOT EXISTS public.campus_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_code VARCHAR(30) UNIQUE NOT NULL, -- e.g. 'BLOCK_A', 'LIB_WING_NORTH', 'DORM_5'
    name VARCHAR(150) NOT NULL,
    center_latitude DOUBLE PRECISION NOT NULL,
    center_longitude DOUBLE PRECISION NOT NULL,
    geo_fence_radius_meters DOUBLE PRECISION NOT NULL DEFAULT 60.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Campus Physical Assets (QR Tagged)
CREATE TABLE IF NOT EXISTS public.campus_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_tag VARCHAR(60) UNIQUE NOT NULL, -- e.g. 'QR-AC-BLK_A-304'
    name VARCHAR(150) NOT NULL,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    zone_id UUID REFERENCES public.campus_zones(id) ON DELETE RESTRICT,
    location_details VARCHAR(255), -- e.g. 'Room 304, Third Floor'
    is_operational BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Complaints / Maintenance Tickets
CREATE TABLE IF NOT EXISTS public.complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(30) UNIQUE NOT NULL,
    complainant_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    asset_id UUID REFERENCES public.campus_assets(id) ON DELETE SET NULL,
    zone_id UUID NOT NULL REFERENCES public.campus_zones(id) ON DELETE RESTRICT,
    department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    priority ticket_priority NOT NULL DEFAULT 'P3_MEDIUM',
    status ticket_status NOT NULL DEFAULT 'SUBMITTED',
    assigned_technician_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    sla_deadline TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    rating SMALLINT CHECK (rating >= 1 AND rating <= 5),
    feedback_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Evidence Records (Cryptographically and Geographically Verified)
CREATE TABLE IF NOT EXISTS public.evidence_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
    uploader_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    proof_type evidence_type NOT NULL,
    media_url TEXT NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    perceptual_hash VARCHAR(64),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy_meters DOUBLE PRECISION,
    device_timestamp TIMESTAMPTZ NOT NULL,
    server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_geofence_valid BOOLEAN NOT NULL DEFAULT FALSE,
    is_exif_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_tamper_flagged BOOLEAN NOT NULL DEFAULT FALSE,
    audit_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Technician Work Logs
CREATE TABLE IF NOT EXISTS public.technician_work_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
    technician_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    action_taken TEXT NOT NULL,
    materials_used TEXT,
    time_spent_minutes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dispute / Appeal Records (For false resolution claims)
CREATE TABLE IF NOT EXISTS public.complaint_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
    disputed_by UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED'
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- System Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    entity_name VARCHAR(50) NOT NULL,
    entity_id UUID,
    actor_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TICKET SEQUENCE GENERATOR
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix TEXT;
    next_val INT;
BEGIN
    year_prefix := TO_CHAR(NOW(), 'YYYY');
    SELECT COUNT(*) + 1 INTO next_val FROM public.complaints;
    NEW.ticket_number := 'CMP-' || year_prefix || '-' || LPAD(next_val::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_ticket_number ON public.complaints;
CREATE TRIGGER trg_assign_ticket_number
BEFORE INSERT ON public.complaints
FOR EACH ROW
WHEN (NEW.ticket_number IS NULL OR NEW.ticket_number = '')
EXECUTE FUNCTION generate_ticket_number();

-- 5. INDEXES FOR HIGH-PERFORMANCE QUERIES
CREATE INDEX IF NOT EXISTS idx_complaints_status ON public.complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_priority ON public.complaints(priority);
CREATE INDEX IF NOT EXISTS idx_complaints_complainant ON public.complaints(complainant_id);
CREATE INDEX IF NOT EXISTS idx_complaints_technician ON public.complaints(assigned_technician_id);
CREATE INDEX IF NOT EXISTS idx_complaints_department ON public.complaints(department_id);
CREATE INDEX IF NOT EXISTS idx_evidence_complaint_id ON public.evidence_records(complaint_id);
CREATE INDEX IF NOT EXISTS idx_evidence_sha256 ON public.evidence_records(sha256_hash);
