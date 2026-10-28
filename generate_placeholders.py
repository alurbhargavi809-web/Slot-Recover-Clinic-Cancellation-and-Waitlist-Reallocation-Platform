import os
from PIL import Image, ImageDraw, ImageFont

uploads_dir = os.path.join(os.path.dirname(__file__), 'public', 'uploads')
os.makedirs(uploads_dir, exist_ok=True)

placeholders = [
    ("evidence_sparking_panel.jpg", "CRITICAL ELECTRICAL FAULT", "Panel Sparks - Lecture Hall 102", (180, 50, 40)),
    ("evidence_socket_burnt.jpg", "BURNT POWER SOCKET", "Smart Board Terminal Burnt", (170, 75, 45)),
    ("evidence_ac_ice_leak.jpg", "AC COMPRESSOR VIBRATION", "CAD Lab Room 304 AC Unit", (45, 90, 140)),
    ("water_fountain_burst_before.jpg", "BURST CPVC WATER RISER", "Block B Ground Floor Fountain", (35, 110, 130)),
    ("water_fountain_fixed_after.jpg", "RESOLVED: NEW CPVC VALVE", "Installed 1.25in Ball Valve & Tested", (30, 130, 80))
]

for filename, title, subtitle, bg_color in placeholders:
    filepath = os.path.join(uploads_dir, filename)
    if not os.path.exists(filepath):
        img = Image.new('RGB', (640, 400), color=bg_color)
        draw = ImageDraw.Draw(img)
        
        # Grid overlay for evidence look
        for x in range(0, 640, 40):
            draw.line([(x, 0), (x, 400)], fill=(255, 255, 255, 30), width=1)
        for y in range(0, 400, 40):
            draw.line([(0, y), (640, y)], fill=(255, 255, 255, 30), width=1)
            
        # Draw border
        draw.rectangle([(10, 10), (630, 390)], outline=(255, 255, 255), width=3)
        
        # Header banner
        draw.rectangle([(10, 10), (630, 60)], fill=(0, 0, 0, 180))
        draw.text((25, 25), f"[CAMPSHIELD VERIFIED EVIDENCE] {title}", fill=(255, 255, 255))
        
        # Center text
        draw.text((50, 180), subtitle, fill=(255, 255, 255))
        draw.text((50, 220), "Geo-Fence: 17.448294, 78.391485 | SHA-256 Validated", fill=(220, 220, 220))
        draw.text((50, 250), "EXIF Metadata: Untampered Timestamp Verified", fill=(200, 250, 200))
        
        # Bottom stamp
        draw.rectangle([(420, 330), (620, 380)], fill=(0, 0, 0, 150))
        draw.text((435, 345), "CAMPUS AUDIT LOG", fill=(255, 200, 50))
        
        img.save(filepath, "JPEG")
        print(f"Generated synthetic evidence image: {filename}")

print("Placeholder evidence images created successfully.")
