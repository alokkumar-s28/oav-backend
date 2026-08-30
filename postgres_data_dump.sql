-- ============================================================================
-- OAV MANTRA - POSTGRESQL DATA DUMP
-- Exported at: 2026-08-30T09:51:18.373Z
-- ============================================================================

BEGIN;

-- Data for: students
INSERT INTO students (enrollment_id, full_name, mobile, email, student_class, school_type, city, school, photo, status, created_at) VALUES ('OAV-345794-1YN5', 'diptiranjan sahoo', '8926109490', 'a@gmail.com', 'VI', 'OAV', 'Angul', 'OAV BANMALIPUR ATHMALLIK', NULL, 'active', '2026-08-24 06:19:05') ON CONFLICT (enrollment_id) DO UPDATE SET status = EXCLUDED.status, full_name = EXCLUDED.full_name;

-- Data for: payments
INSERT INTO payments (enrollment_id, amount, transaction_id, payment_date, payment_method, status, created_at) VALUES ('OAV-345794-1YN5', 500, '454884gshdhgssdghj', '2026-08-24', 'quickupi', 'verified', '2026-08-24 06:19:31') ON CONFLICT (transaction_id) DO NOTHING;

-- Data for: courses
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (1, 'Science foundations', 'Science', 'VI', 'Concepts, experiments and practice questions.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (2, 'Mathematics mastery', 'Mathematics', 'VII', 'Clear explanations and guided problem solving.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (3, 'English communication', 'English', 'VIII', 'Grammar, reading and writing practice.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (4, 'Board preparation', 'Mathematics', 'X', 'Focused revision for final examinations.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (5, 'Advanced studies', 'Science', 'IX', 'Concepts, experiments and practice questions.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (6, 'Mathematics mastery', 'Mathematics', 'VI', 'Whole numbers, basic geometry, fractions and decimals.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (7, 'English communication', 'English', 'VI', 'Grammar essentials, comprehension and vocabulary.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (8, 'Social Studies explorer', 'Social Studies', 'VI', 'Our earth, early civilizations and community.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (9, 'Science mastery', 'Science', 'VII', 'Nutrition, heat, physical & chemical changes, respiration.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (10, 'English communication', 'English', 'VII', 'Grammar, prose, poetry and writing skills.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (11, 'Social Studies explorer', 'Social Studies', 'VII', 'Medieval history, environment and our government.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (12, 'Science advanced', 'Science', 'VIII', 'Force, pressure, cell structure, synthetic fibers and reproduction.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (13, 'Mathematics mastery', 'Mathematics', 'VIII', 'Rational numbers, linear equations, geometry, and mensuration.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (14, 'Social Studies explorer', 'Social Studies', 'VIII', 'Modern Indian history, resources, and Indian constitution.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (15, 'Mathematics Board Foundation', 'Mathematics', 'IX', 'Number systems, polynomials, coordinate geometry, triangles.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (16, 'English Literature & Language', 'English', 'IX', 'Language and literature for competitive excellence.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (17, 'Social Sciences comprehensive', 'Social Studies', 'IX', 'Democratic politics, contemporary India, economics.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (18, 'Board Examination Physics & Chem', 'Science', 'X', 'Chemical reactions, electricity, magnetic effects, life processes.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (19, 'Board Examination English', 'English', 'X', 'First Flight, Footprints without Feet, advanced composition.', TRUE) ON CONFLICT (id) DO NOTHING;
INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (20, 'Board Examination Social Sciences', 'Social Studies', 'X', 'Nationalism in India, resources and development, power sharing.', TRUE) ON CONFLICT (id) DO NOTHING;

-- Data for: lessons
INSERT INTO lessons (id, course_id, student_class, subject, title, video_url, duration_minutes, lesson_type, description, position) VALUES (33, 6, 'VI', 'Mathematics', 'ffffffff', 'https://www.youtube.com/embed/r4GiEbwrYSs', 20, 'video', 'ggfffdfddd', 1) ON CONFLICT (id) DO UPDATE SET video_url = EXCLUDED.video_url, title = EXCLUDED.title;
INSERT INTO lessons (id, course_id, student_class, subject, title, video_url, duration_minutes, lesson_type, description, position) VALUES (35, 6, 'VI', 'Mathematics', 'jagannath', 'https://www.youtube.com/embed/zHM20wmkvg4', 20, 'video', 'shree krishna', 2) ON CONFLICT (id) DO UPDATE SET video_url = EXCLUDED.video_url, title = EXCLUDED.title;

-- Data for: announcements
INSERT INTO announcements (id, title, message, type) VALUES (1, 'Welcome to OAV Mantra Academic Session 2025-26', 'Live classes for Classes VI-X are scheduled Monday through Saturday. Make sure your registration fee is verified.', 'general') ON CONFLICT (id) DO NOTHING;
INSERT INTO announcements (id, title, message, type) VALUES (2, 'Online Mock Tests Schedule Announced', 'Interactive chapter-wise quizzes and term mock examinations are now live in your respective class study portals.', 'exam') ON CONFLICT (id) DO NOTHING;

-- Synchronize Serial Sequences
SELECT setval(pg_get_serial_sequence('students', 'id'), COALESCE(MAX(id), 1)) FROM students;
SELECT setval(pg_get_serial_sequence('payments', 'id'), COALESCE(MAX(id), 1)) FROM payments;
SELECT setval(pg_get_serial_sequence('courses', 'id'), COALESCE(MAX(id), 1)) FROM courses;
SELECT setval(pg_get_serial_sequence('lessons', 'id'), COALESCE(MAX(id), 1)) FROM lessons;
SELECT setval(pg_get_serial_sequence('announcements', 'id'), COALESCE(MAX(id), 1)) FROM announcements;

COMMIT;