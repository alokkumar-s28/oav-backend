-- ============================================================================
-- OAV MANTRA E-LEARNING PLATFORM - POSTGRESQL PRODUCTION DATABASE SCHEMA
-- Compatible with PostgreSQL 12, 13, 14, 15, 16, and Cloud DBs (Neon, Supabase, Render, AWS RDS)
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. STUDENTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
    id BIGSERIAL PRIMARY KEY,
    enrollment_id VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    mobile VARCHAR(20) NOT NULL,
    email VARCHAR(150) NOT NULL,
    student_class VARCHAR(10) NOT NULL CHECK (student_class IN ('VI', 'VII', 'VIII', 'IX', 'X')),
    school_type VARCHAR(50),
    city VARCHAR(100) NOT NULL,
    school VARCHAR(200),
    photo TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'payment_review', 'active', 'suspended')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_students_enrollment_id ON students(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(student_class);
CREATE INDEX IF NOT EXISTS idx_students_mobile ON students(mobile);
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);

-- ----------------------------------------------------------------------------
-- 2. PAYMENTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id BIGSERIAL PRIMARY KEY,
    enrollment_id VARCHAR(50) NOT NULL REFERENCES students(enrollment_id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    transaction_id VARCHAR(100) NOT NULL UNIQUE,
    payment_date VARCHAR(50) NOT NULL,
    payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('quickupi', 'qr', 'netbanking', 'card')),
    status VARCHAR(30) NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'verified', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_payments_enrollment_id ON payments(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- ----------------------------------------------------------------------------
-- 3. COURSES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    student_class VARCHAR(10) NOT NULL CHECK (student_class IN ('VI', 'VII', 'VIII', 'IX', 'X')),
    description TEXT NOT NULL,
    thumbnail_url TEXT,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_courses_class_subject ON courses(student_class, subject);

-- ----------------------------------------------------------------------------
-- 4. LESSONS / VIDEOS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lessons (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_class VARCHAR(10) NOT NULL DEFAULT 'VI' CHECK (student_class IN ('VI', 'VII', 'VIII', 'IX', 'X')),
    subject VARCHAR(100) NOT NULL DEFAULT 'General',
    title VARCHAR(250) NOT NULL,
    video_url TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 15,
    lesson_type VARCHAR(30) NOT NULL DEFAULT 'video' CHECK (lesson_type IN ('video', 'live', 'document')),
    description TEXT DEFAULT '',
    position INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lessons_class ON lessons(student_class);
CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_type ON lessons(lesson_type);

-- ----------------------------------------------------------------------------
-- 5. LESSON PROGRESS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lesson_progress (
    enrollment_id VARCHAR(50) NOT NULL REFERENCES students(enrollment_id) ON DELETE CASCADE,
    lesson_id BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    watch_time_seconds INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(enrollment_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_enrollment ON lesson_progress(enrollment_id);

-- ----------------------------------------------------------------------------
-- 6. STUDY NOTES & PDF MATERIALS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS study_notes (
    id BIGSERIAL PRIMARY KEY,
    student_class VARCHAR(10) NOT NULL CHECK (student_class IN ('VI', 'VII', 'VIII', 'IX', 'X')),
    subject VARCHAR(100) NOT NULL,
    title VARCHAR(250) NOT NULL,
    file_url TEXT,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_study_notes_class_subject ON study_notes(student_class, subject);

-- ----------------------------------------------------------------------------
-- 7. ANNOUNCEMENTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(250) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(30) NOT NULL DEFAULT 'general' CHECK (type IN ('general', 'urgent', 'exam', 'holiday', 'live')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);

-- ----------------------------------------------------------------------------
-- 8. QUIZ RESULTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_results (
    id BIGSERIAL PRIMARY KEY,
    enrollment_id VARCHAR(50) NOT NULL REFERENCES students(enrollment_id) ON DELETE CASCADE,
    student_class VARCHAR(10) NOT NULL CHECK (student_class IN ('VI', 'VII', 'VIII', 'IX', 'X')),
    subject VARCHAR(100) NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    percentage NUMERIC(5, 2) GENERATED ALWAYS AS (ROUND((score::NUMERIC / total::NUMERIC) * 100, 2)) STORED,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quiz_results_enrollment ON quiz_results(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_class ON quiz_results(student_class);

-- ----------------------------------------------------------------------------
-- 9. SEED COURSES (Classes VI - X for Core Subjects)
-- ----------------------------------------------------------------------------
INSERT INTO courses (title, subject, student_class, description, published) VALUES
-- Class VI
('Mathematics Foundation', 'Mathematics', 'VI', 'Class VI Mathematics: Numbers, Algebra, Geometry, Mensuration', TRUE),
('General Science Explorations', 'Science', 'VI', 'Class VI Science: Food, Materials, Living World, Motion, Electricity', TRUE),
('English Language & Literature', 'English', 'VI', 'Class VI English Grammar, Honeysuckle & A Pact with the Sun', TRUE),
('Social Studies & Odisha Heritage', 'Social Studies', 'VI', 'Class VI History, Geography & Social and Political Life', TRUE),

-- Class VII
('Intermediate Mathematics', 'Mathematics', 'VII', 'Class VII Mathematics: Integers, Fractions, Decimals, Algebraic Expressions', TRUE),
('Integrated Science Concepts', 'Science', 'VII', 'Class VII Science: Nutrition, Heat, Acids, Bases, Salts, Physical & Chemical Changes', TRUE),
('English Composition & Prose', 'English', 'VII', 'Class VII English Grammar, Honeycomb & An Alien Hand', TRUE),
('Social Sciences & Medieval World', 'Social Studies', 'VII', 'Class VII Our Pasts II, Our Environment & Social and Political Life II', TRUE),

-- Class VIII
('Advanced Foundation Mathematics', 'Mathematics', 'VIII', 'Class VIII Mathematics: Rational Numbers, Linear Equations, Mensuration, Exponents', TRUE),
('Physical & Living Sciences', 'Science', 'VIII', 'Class VIII Science: Crop Production, Microorganisms, Synthetic Fibres, Coal & Petroleum', TRUE),
('English Rhetoric & Comprehension', 'English', 'VIII', 'Class VIII English Grammar, Honeydew & It So Happened', TRUE),
('Social Studies & Modern Era', 'Social Studies', 'VIII', 'Class VIII Our Pasts III, Resources and Development, Social & Political Life III', TRUE),

-- Class IX
('Secondary Mathematics Excellence', 'Mathematics', 'IX', 'Class IX Mathematics: Number Systems, Polynomials, Coordinate Geometry, Triangles, Circles', TRUE),
('Foundational Physics, Chemistry & Biology', 'Science', 'IX', 'Class IX Science: Matter, Atoms, Molecules, Cell, Tissues, Motion, Force, Gravitation', TRUE),
('English Core & Applied Grammar', 'English', 'IX', 'Class IX English: Beehive, Moments & Advanced Writing Skills', TRUE),
('Contemporary Social Sciences', 'Social Studies', 'IX', 'Class IX India and Contemporary World I, Contemporary India I, Democratic Politics I', TRUE),

-- Class X
('Board Examination Mastery Mathematics', 'Mathematics', 'X', 'Class X Mathematics: Real Numbers, Polynomials, Quadratic Equations, Arithmetic Progressions, Trigonometry', TRUE),
('Board Science Specialization', 'Science', 'X', 'Class X Science: Chemical Reactions, Acids & Bases, Life Processes, Light, Electricity, Magnetic Effects', TRUE),
('Board English Language & Literature', 'English', 'X', 'Class X English: First Flight, Footprints Without Feet, Formal Letters & Analytical Paragraphs', TRUE),
('India & Contemporary World (SST)', 'Social Studies', 'X', 'Class X History, Geography, Political Science & Economics Board Syllabus', TRUE)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 10. DEFAULT ANNOUNCEMENTS
-- ----------------------------------------------------------------------------
INSERT INTO announcements (title, message, type) VALUES
('Live Online Classes Active', 'Daily live lectures and chapter revisions are scheduled for Classes VI to X. Check your study rooms.', 'general'),
('Term Revision & Board Test Series', 'Chapter tests and sample board papers are now live for registered students.', 'exam')
ON CONFLICT DO NOTHING;
