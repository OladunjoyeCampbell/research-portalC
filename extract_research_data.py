import csv
import re
import sys
import os
import datetime

# ------------------------------------------------------------
# CONFIGURATION
# ------------------------------------------------------------
CSV_FILE = sys.argv[1] if len(sys.argv) > 1 else 'study_2_export (3).csv'
TARGET_MONTH = '09/2026'          # set to None to ignore month filter
MATRIC_RE = re.compile(r'^(HNDNCC|NDCS)/(025|026)/\d{4}$', re.IGNORECASE)

# ------------------------------------------------------------
# EXTRACT
# ------------------------------------------------------------
completed = []
in_progress = []

with open(CSV_FILE, newline='', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        status = row.get('enrolment_status', '').strip().lower()
        matric = row.get('participant_matric', '').strip().replace('\\', '/')
        completed_at = row.get('enrolment_completed_at', '').strip()

        if not MATRIC_RE.match(matric):
            continue

        record = {
            'enrolment_id': row.get('enrolment_id', ''),
            'name': row.get('participant_name', ''),
            'matric': matric,
            'email': row.get('participant_email', ''),
            'participant_code': row.get('participant_participant_code', ''),
            'status': status,
            'started_at': row.get('enrolment_started_at', ''),
            'last_active': row.get('enrolment_last_active', ''),
            'completed_at': completed_at,
        }

        if status == 'completed':
            # Only include if within target month (if set)
            if TARGET_MONTH and TARGET_MONTH not in completed_at:
                continue
            completed.append(record)
        elif status in ('in_progress', 'enrolled'):
            in_progress.append(record)

# ------------------------------------------------------------
# OUTPUT
# ------------------------------------------------------------
print(f"Completed (September 2026): {len(completed)}")
print(f"In progress / enrolled: {len(in_progress)}\n")

for label, lst in [('COMPLETED', completed), ('IN PROGRESS / ENROLLED', in_progress)]:
    print(f"--- {label} ---")
    for r in lst:
        print(r)
    print()

# Write safely to a timestamped file inside output/
os.makedirs('output', exist_ok=True)
timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
out_file = f'output/extracted_research_data_{timestamp}.csv'

all_rows = completed + in_progress
if all_rows:
    with open(out_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=all_rows[0].keys())
        writer.writeheader()
        writer.writerows(all_rows)
    print(f"✅ Saved {len(all_rows)} rows to {out_file}")
else:
    print("⚠️ No matching records found.")