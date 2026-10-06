-- ============================================================================
-- OAV MANTRA - SUPABASE POSTGRESQL PRODUCTION DATABASE SCHEMA & RLS POLICIES
-- Project Reference: bnlymzocydhmpuzmiwlz (https://bnlymzocydhmpuzmiwlz.supabase.co)
-- Frontend URL: https://oavmantra.vercel.app
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. STUDENTS TABLE
CREATE TABLE IF NOT EXISTS public.students (
    id BIGSERIAL PRIMARY KEY,
    enrollment_id VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    mobile VARCHAR(20) NOT NULL,
    email VARCHAR(150) NOT NULL,
    student_class VARCHAR(10) NOT NULL CHECK (student_class IN ('VI', 'VII', 'VIII', 'IX', 'X')),
    school_type VARCHAR(50) DEFAULT 'OAV',
    city VARCHAR(100) NOT NULL,
    school VARCHAR(200),
    photo TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'payment_review', 'active', 'suspended')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_students_enrollment ON public.students(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students(student_class);
CREATE INDEX IF NOT EXISTS idx_students_mobile ON public.students(mobile);
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);

-- 2. PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.payments (
    id BIGSERIAL PRIMARY KEY,
    enrollment_id VARCHAR(50) NOT NULL REFERENCES public.students(enrollment_id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 500.00 CHECK (amount > 0),
    transaction_id VARCHAR(100) NOT NULL UNIQUE,
    payment_date VARCHAR(50) NOT NULL DEFAULT CURRENT_DATE::TEXT,
    payment_method VARCHAR(30) NOT NULL DEFAULT 'quickupi' CHECK (payment_method IN ('quickupi', 'qr', 'netbanking', 'card')),
    status VARCHAR(30) NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'verified', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_payments_enrollment ON public.payments(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_payments_txn ON public.payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- 3. COURSES TABLE
CREATE TABLE IF NOT EXISTS public.courses (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    student_class VARCHAR(10) NOT NULL CHECK (student_class IN ('VI', 'VII', 'VIII', 'IX', 'X')),
    description TEXT NOT NULL DEFAULT '',
    thumbnail_url TEXT,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_courses_class_sub ON public.courses(student_class, subject);

-- 4. LESSONS / VIDEOS TABLE
CREATE TABLE IF NOT EXISTS public.lessons (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT REFERENCES public.courses(id) ON DELETE SET NULL,
    student_class VARCHAR(10) NOT NULL DEFAULT 'VI' CHECK (student_class IN ('VI', 'VII', 'VIII', 'IX', 'X')),
    subject VARCHAR(100) NOT NULL DEFAULT 'General',
    title VARCHAR(250) NOT NULL,
    video_url TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 20,
    lesson_type VARCHAR(30) NOT NULL DEFAULT 'video' CHECK (lesson_type IN ('video', 'live', 'document')),
    description TEXT DEFAULT '',
    position INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lessons_class ON public.lessons(student_class);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON public.lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_type ON public.lessons(lesson_type);

-- 5. LESSON PROGRESS TABLE
CREATE TABLE IF NOT EXISTS public.lesson_progress (
    enrollment_id VARCHAR(50) NOT NULL REFERENCES public.students(enrollment_id) ON DELETE CASCADE,
    lesson_id BIGINT NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    watch_time_seconds INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(enrollment_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_enrollment ON public.lesson_progress(enrollment_id);

-- 6. STUDY NOTES & PDF MATERIALS TABLE
CREATE TABLE IF NOT EXISTS public.study_notes (
    id BIGSERIAL PRIMARY KEY,
    student_class VARCHAR(10) NOT NULL CHECK (student_class IN ('VI', 'VII', 'VIII', 'IX', 'X')),
    subject VARCHAR(100) NOT NULL,
    title VARCHAR(250) NOT NULL,
    file_url TEXT,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_study_notes_class_sub ON public.study_notes(student_class, subject);

-- 7. ANNOUNCEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.announcements (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(250) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(30) NOT NULL DEFAULT 'general' CHECK (type IN ('general', 'urgent', 'exam', 'holiday', 'live')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. QUIZ RESULTS TABLE
CREATE TABLE IF NOT EXISTS public.quiz_results (
    id BIGSERIAL PRIMARY KEY,
    enrollment_id VARCHAR(50) NOT NULL REFERENCES public.students(enrollment_id) ON DELETE CASCADE,
    student_class VARCHAR(10) NOT NULL CHECK (student_class IN ('VI', 'VII', 'VIII', 'IX', 'X')),
    subject VARCHAR(100) NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    percentage NUMERIC(5, 2) GENERATED ALWAYS AS (CASE WHEN total > 0 THEN ROUND((score::NUMERIC / total::NUMERIC) * 100, 2) ELSE 0 END) STORED,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quiz_results_enrollment ON public.quiz_results(enrollment_id);

-- 9. ROW LEVEL SECURITY (RLS) POLICIES FOR SUPABASE
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public announcements policy" ON public.announcements;
DROP POLICY IF EXISTS "Public courses policy" ON public.courses;
DROP POLICY IF EXISTS "Public lessons policy" ON public.lessons;
DROP POLICY IF EXISTS "Public study notes policy" ON public.study_notes;
DROP POLICY IF EXISTS "Public students policy" ON public.students;
DROP POLICY IF EXISTS "Public payments policy" ON public.payments;
DROP POLICY IF EXISTS "Public lesson progress policy" ON public.lesson_progress;
DROP POLICY IF EXISTS "Public quiz results policy" ON public.quiz_results;

CREATE POLICY "Public announcements policy" ON public.announcements FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Public courses policy" ON public.courses FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Public lessons policy" ON public.lessons FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Public study notes policy" ON public.study_notes FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Public students policy" ON public.students FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Public payments policy" ON public.payments FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Public lesson progress policy" ON public.lesson_progress FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "Public quiz results policy" ON public.quiz_results FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- 10. SEED DATA - CORE COURSES (CLASSES VI TO X)
INSERT INTO public.courses (id, title, subject, student_class, description, published) VALUES
(1, 'Science Foundations', 'Science', 'VI', 'Concepts, experiments and chapter summaries for Class VI scholars.', TRUE),
(2, 'Mathematics Mastery', 'Mathematics', 'VII', 'Integers, fractions, decimals, algebraic expressions and geometry.', TRUE),
(3, 'English Communication & Literature', 'English', 'VIII', 'Grammar essentials, reading comprehension and literature composition.', TRUE),
(4, 'Board Examination Mathematics', 'Mathematics', 'X', 'Full 10th Board exam revision, previous question papers & test series.', TRUE),
(5, 'Advanced Secondary Science', 'Science', 'IX', 'Matter, atoms, cell structure, motion, force and gravitation.', TRUE),
(6, 'Mathematics Mastery', 'Mathematics', 'VI', 'Whole numbers, basic geometry, fractions and decimals.', TRUE),
(7, 'English Communication', 'English', 'VI', 'Grammar essentials, comprehension and vocabulary building.', TRUE),
(8, 'Social Studies Explorer', 'Social Studies', 'VI', 'Our earth, early civilizations, geography and civic life.', TRUE),
(9, 'Science Mastery', 'Science', 'VII', 'Nutrition, heat, physical & chemical changes, respiration.', TRUE),
(10, 'English Communication & Prose', 'English', 'VII', 'Grammar, prose, poetry and creative writing skills.', TRUE),
(11, 'Social Studies Explorer', 'Social Studies', 'VII', 'Medieval history, environment and our democratic government.', TRUE),
(12, 'Science Advanced Concepts', 'Science', 'VIII', 'Force, pressure, cell structure, synthetic fibers and reproduction.', TRUE),
(13, 'Mathematics Foundation Mastery', 'Mathematics', 'VIII', 'Rational numbers, linear equations, geometry, and mensuration.', TRUE),
(14, 'Social Studies Explorer', 'Social Studies', 'VIII', 'Modern Indian history, resources, industries, and Indian constitution.', TRUE),
(15, 'Mathematics Board Foundation', 'Mathematics', 'IX', 'Number systems, polynomials, coordinate geometry, triangles, circles.', TRUE),
(16, 'English Literature & Language', 'English', 'IX', 'Literature analysis, descriptive writing, and advanced grammar.', TRUE),
(17, 'Social Sciences Comprehensive', 'Social Studies', 'IX', 'Democratic politics, contemporary India, economics and geography.', TRUE),
(18, 'Board Physics & Chemistry Special', 'Science', 'X', 'Chemical reactions, electricity, magnetic effects, life processes.', TRUE),
(19, 'Board Examination English Language', 'English', 'X', 'First Flight, Footprints without Feet, analytical paragraphs.', TRUE),
(20, 'Board Social Sciences Mastery', 'Social Studies', 'X', 'Nationalism in India, resources, power sharing, and economic development.', TRUE)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description;

-- 11. SEED DATA - DEFAULT ANNOUNCEMENTS
INSERT INTO public.announcements (id, title, message, type, is_active) VALUES
(1, 'Welcome to OAV Mantra Academic Portal', 'Live interactive lectures and recorded study materials for Classes VI to X are active. Complete your verification to access.', 'general', TRUE),
(2, 'Online Chapter Quizzes & Mock Test Series', 'Chapter tests and state board mock question solving are live in your respective class study portals.', 'exam', TRUE)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, message = EXCLUDED.message;

-- 12. SAMPLE INITIAL LESSONS
INSERT INTO public.lessons (id, course_id, student_class, subject, title, video_url, duration_minutes, lesson_type, description, position) VALUES
(33, 6, 'VI', 'Mathematics', 'Chapter 1: Number Systems & Concepts', 'https://www.youtube.com/watch?v=r4GiEbwrYSs', 20, 'video', 'Comprehensive foundation covering real numbers, place values, and estimation.', 1),
(35, 6, 'VI', 'Mathematics', 'Chapter 2: Whole Numbers & Problem Solving', 'https://www.youtube.com/watch?v=zHM20wmkvg4', 20, 'video', 'Properties of whole numbers, number line operations, and solved examples.', 2)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, video_url = EXCLUDED.video_url;

-- Synchronize sequence values
SELECT setval(pg_get_serial_sequence('public.courses', 'id'), COALESCE(MAX(id), 1)) FROM public.courses;
SELECT setval(pg_get_serial_sequence('public.announcements', 'id'), COALESCE(MAX(id), 1)) FROM public.announcements;
SELECT setval(pg_get_serial_sequence('public.lessons', 'id'), COALESCE(MAX(id), 1)) FROM public.lessons;