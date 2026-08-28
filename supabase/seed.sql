-- Clinical Ledger HMS deterministic demonstration data for Supabase PostgreSQL.
-- Run after supabase/migrations/0000_rainy_maelstrom.sql in the Supabase SQL Editor.
-- All statements are idempotent and preserve existing rows.

INSERT INTO public.users ("openId", name, email, "loginMethod", password_hash, role, is_active)
VALUES
  ('demo_hms_admin', 'Amelia Rahman', 'admin@clinicalledger.demo', 'credential-demo', '73a5b98a3b9297374a8c141ace206e9e:db040ccf69e944325b6b0c5bf85b3ec4c0a4acc27560a40687d2cda16b64aa3bfbd20a0ce5fbe9d187eac4d88b7e4b3d346c539085fa0991b0f2db1807527306', 'admin', 'yes'),
  ('demo_hms_doctor', 'Dr. Samira Ahmed', 'doctor@clinicalledger.demo', 'credential-demo', '8aa44b54d3e5c66062947db3a2830fe2:926e375cec3aa559a0fb4ce6028fffacd678f62f31a8c3018025fb13087509fb2c819d3d05c8b0ffd8437c8824c229d46422f075de263f359ee46d015cef4c41', 'doctor', 'yes'),
  ('demo_hms_reception', 'Nusrat Jahan', 'reception@clinicalledger.demo', 'credential-demo', 'dc8c723d22173b3394c792b7f4362998:575d153b4cd069a669b8df4719fe9a93984b013e81d5e804c25e4469642649bebffa9fbd47fc470405b3cf525ca9e3de3f5e4350e39145daf7e6be277940c91d', 'receptionist', 'yes')
ON CONFLICT ("openId") DO NOTHING;

INSERT INTO public.hms_clinicians (user_id, full_name, specialty, department, color, is_active)
SELECT (SELECT id FROM public.users WHERE "openId" = 'demo_hms_doctor'), 'Dr. Samira Ahmed', 'Cardiology', 'Cardiology', '#007C83', 'yes'
WHERE NOT EXISTS (SELECT 1 FROM public.hms_clinicians WHERE full_name = 'Dr. Samira Ahmed');
INSERT INTO public.hms_clinicians (full_name, specialty, department, color, is_active)
SELECT 'Dr. Mahmud Hasan', 'Endocrinology', 'Internal Medicine', '#386B9D', 'yes'
WHERE NOT EXISTS (SELECT 1 FROM public.hms_clinicians WHERE full_name = 'Dr. Mahmud Hasan');
INSERT INTO public.hms_clinicians (full_name, specialty, department, color, is_active)
SELECT 'Dr. Tahmina Noor', 'Pathology', 'Laboratory', '#8A5A9B', 'yes'
WHERE NOT EXISTS (SELECT 1 FROM public.hms_clinicians WHERE full_name = 'Dr. Tahmina Noor');
INSERT INTO public.hms_clinicians (full_name, specialty, department, color, is_active)
SELECT 'Dr. Imran Kabir', 'General Medicine', 'Outpatient', '#A56B31', 'yes'
WHERE NOT EXISTS (SELECT 1 FROM public.hms_clinicians WHERE full_name = 'Dr. Imran Kabir');

UPDATE public.hms_clinicians
SET user_id = (SELECT id FROM public.users WHERE "openId" = 'demo_hms_doctor')
WHERE full_name = 'Dr. Samira Ahmed' AND user_id IS NULL;

INSERT INTO public.hms_patients (patient_code, full_name, gender, phone, care_context)
VALUES
  ('P-1001', 'Ayesha Rahman', 'Female', '+8801711234890', 'Hypertension review'),
  ('P-1002', 'Karim Hossain', 'Male', '+8801814876122', 'Diabetes follow-up'),
  ('P-1003', 'Nabila Islam', 'Female', '+8801612551809', 'Laboratory order'),
  ('P-1004', 'Rafiq Ahmed', 'Male', '+8801911204778', 'Cardiology consult'),
  ('P-1005', 'Farzana Khan', 'Female', '+8801755660009', 'Medication refill')
ON CONFLICT (patient_code) DO NOTHING;

INSERT INTO public.hms_availability_windows (clinician_id, weekday, start_minute, end_minute, slot_minutes)
SELECT c.id, weekday, 540, 1020, 30
FROM public.hms_clinicians c
CROSS JOIN generate_series(1, 5) AS weekday
ON CONFLICT (clinician_id, weekday, start_minute, end_minute) DO NOTHING;

INSERT INTO public.hms_appointments (appointment_code, patient_id, clinician_id, starts_at, ends_at, display_name, reason, status)
VALUES
  ('A-4016', (SELECT id FROM public.hms_patients WHERE patient_code = 'P-1001'), (SELECT id FROM public.hms_clinicians WHERE full_name = 'Dr. Samira Ahmed'), date_trunc('day', now()) + interval '9 hours', date_trunc('day', now()) + interval '9 hours 30 minutes', 'Cardiac follow-up', 'Follow-up ECG', 'Scheduled'),
  ('A-4017', (SELECT id FROM public.hms_patients WHERE patient_code = 'P-1002'), (SELECT id FROM public.hms_clinicians WHERE full_name = 'Dr. Mahmud Hasan'), date_trunc('day', now()) + interval '10 hours 30 minutes', date_trunc('day', now()) + interval '11 hours', 'Diabetes review', 'Diabetes review', 'Checked in'),
  ('A-4018', (SELECT id FROM public.hms_patients WHERE patient_code = 'P-1003'), (SELECT id FROM public.hms_clinicians WHERE full_name = 'Dr. Tahmina Noor'), date_trunc('day', now()) + interval '11 hours 15 minutes', date_trunc('day', now()) + interval '11 hours 45 minutes', 'CBC review', 'CBC result review', 'Scheduled'),
  ('A-4019', (SELECT id FROM public.hms_patients WHERE patient_code = 'P-1004'), (SELECT id FROM public.hms_clinicians WHERE full_name = 'Dr. Samira Ahmed'), date_trunc('day', now()) + interval '13 hours 45 minutes', date_trunc('day', now()) + interval '14 hours 15 minutes', 'New consultation', 'New consultation', 'Scheduled')
ON CONFLICT (appointment_code) DO NOTHING;

INSERT INTO public.hms_bills (bill_code, patient_id, appointment_id, total_amount, status)
VALUES
  ('B-5001', (SELECT id FROM public.hms_patients WHERE patient_code = 'P-1001'), (SELECT id FROM public.hms_appointments WHERE appointment_code = 'A-4016'), 5420.00, 'Partial'),
  ('B-5002', (SELECT id FROM public.hms_patients WHERE patient_code = 'P-1002'), (SELECT id FROM public.hms_appointments WHERE appointment_code = 'A-4017'), 3200.00, 'Paid'),
  ('B-5003', (SELECT id FROM public.hms_patients WHERE patient_code = 'P-1003'), (SELECT id FROM public.hms_appointments WHERE appointment_code = 'A-4018'), 2750.00, 'Due')
ON CONFLICT (bill_code) DO NOTHING;

INSERT INTO public.hms_payments (bill_id, amount, method)
SELECT id, 2400.00, 'Mobile banking' FROM public.hms_bills WHERE bill_code = 'B-5001'
AND NOT EXISTS (SELECT 1 FROM public.hms_payments p WHERE p.bill_id = public.hms_bills.id AND p.amount = 2400.00);
INSERT INTO public.hms_payments (bill_id, amount, method)
SELECT id, 3200.00, 'Card' FROM public.hms_bills WHERE bill_code = 'B-5002'
AND NOT EXISTS (SELECT 1 FROM public.hms_payments p WHERE p.bill_id = public.hms_bills.id AND p.amount = 3200.00);

INSERT INTO public.hms_clinical_notes (patient_id, appointment_id, author_clinician_id, subjective, assessment, plan)
SELECT p.id, a.id, c.id,
  'Reports intermittent headaches with home blood-pressure readings above baseline.',
  'Essential hypertension requiring adherence review and cardiovascular risk follow-up.',
  'Continue amlodipine, review ECG, and repeat blood-pressure check in four weeks.'
FROM public.hms_patients p, public.hms_appointments a, public.hms_clinicians c
WHERE p.patient_code = 'P-1001' AND a.appointment_code = 'A-4016' AND c.full_name = 'Dr. Samira Ahmed'
AND NOT EXISTS (SELECT 1 FROM public.hms_clinical_notes n WHERE n.patient_id = p.id AND n.subjective LIKE 'Reports intermittent headaches%');

INSERT INTO public.hms_prescriptions (prescription_code, patient_id, appointment_id, prescriber_clinician_id, notes)
SELECT 'RX-7001', p.id, a.id, c.id, 'Take consistently and bring home blood-pressure readings to follow-up.'
FROM public.hms_patients p, public.hms_appointments a, public.hms_clinicians c
WHERE p.patient_code = 'P-1001' AND a.appointment_code = 'A-4016' AND c.full_name = 'Dr. Samira Ahmed'
ON CONFLICT (prescription_code) DO NOTHING;

INSERT INTO public.hms_prescription_items (prescription_id, medicine_name, dosage, route, frequency, duration_days, instructions)
SELECT id, 'Amlodipine', '5 mg', 'Oral', 'Once daily', 30, 'Take in the morning.'
FROM public.hms_prescriptions WHERE prescription_code = 'RX-7001'
AND NOT EXISTS (SELECT 1 FROM public.hms_prescription_items i WHERE i.prescription_id = public.hms_prescriptions.id AND i.medicine_name = 'Amlodipine');

INSERT INTO public.hms_laboratory_orders (order_code, patient_id, appointment_id, ordering_clinician_id, test_name, priority, status, clinical_question)
SELECT 'LAB-8101', p.id, a.id, c.id, 'Lipid profile', 'Routine', 'Resulted', 'Cardiovascular risk review in hypertension follow-up.'
FROM public.hms_patients p, public.hms_appointments a, public.hms_clinicians c
WHERE p.patient_code = 'P-1001' AND a.appointment_code = 'A-4016' AND c.full_name = 'Dr. Samira Ahmed'
ON CONFLICT (order_code) DO NOTHING;

INSERT INTO public.hms_laboratory_results (laboratory_order_id, reported_by_clinician_id, result_summary, reference_range, result_value)
SELECT o.id, c.id, 'Lipid profile completed and available for treating clinician review.', 'Laboratory reference interval', 'Result available'
FROM public.hms_laboratory_orders o, public.hms_clinicians c
WHERE o.order_code = 'LAB-8101' AND c.full_name = 'Dr. Tahmina Noor'
ON CONFLICT (laboratory_order_id) DO NOTHING;
