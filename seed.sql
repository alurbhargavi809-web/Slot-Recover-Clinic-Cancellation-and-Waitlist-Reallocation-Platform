-- Seed Initial Campus Departments and Zones
INSERT INTO public.departments (code, name) VALUES
    ('ELEC', 'Electrical Maintenance & Grid Operations'),
    ('PLUMB', 'Water Supply & Plumbing Services'),
    ('HVAC', 'Air Conditioning & Climate Systems'),
    ('CIVIL', 'Civil, Carpentry & Structural Infrastructure'),
    ('IT_INFRA', 'Campus Network & Smart Classroom Hardware'),
    ('SANITATION', 'Waste Management & Hygiene Services')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.campus_zones (zone_code, name, center_latitude, center_longitude, geo_fence_radius_meters) VALUES
    ('BLOCK_A', 'Academic Block A (Engineering & Tech)', 17.448294, 78.391485, 75.0),
    ('BLOCK_B', 'Academic Block B (Sciences & Labs)', 17.449102, 78.392010, 60.0),
    ('CENTRAL_LIB', 'Dr. Sarvepalli Radhakrishnan Central Library', 17.448850, 78.390500, 50.0),
    ('STUDENT_DORM_1', 'Boys Hostel Block 1', 17.446500, 78.389200, 80.0),
    ('STUDENT_DORM_2', 'Girls Hostel Block 2', 17.446100, 78.390100, 80.0),
    ('SPORTS_COMPLEX', 'Indoor & Outdoor Sports Arena', 17.447300, 78.393400, 100.0)
ON CONFLICT (zone_code) DO NOTHING;
