/**
 * OAV Mantra - SQLite to PostgreSQL Data Exporter
 * Reads current SQLite database (oav-mantra.db) and exports
 * ready-to-run PostgreSQL INSERT queries into postgres_data_dump.sql
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'oav-mantra.db');
const OUTPUT_PATH = path.join(__dirname, 'postgres_data_dump.sql');

if (!fs.existsSync(DB_PATH)) {
    console.error('❌ SQLite database not found at:', DB_PATH);
    process.exit(1);
}

const db = new DatabaseSync(DB_PATH);

function escapePg(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return val;
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    return "'" + String(val).replace(/'/g, "''") + "'";
}

let dump = [];
dump.push('-- ============================================================================');
dump.push('-- OAV MANTRA - POSTGRESQL DATA DUMP');
dump.push('-- Exported at: ' + new Date().toISOString());
dump.push('-- ============================================================================');
dump.push('');
dump.push('BEGIN;');
dump.push('');

// 1. Students
try {
    const students = db.prepare('SELECT * FROM students').all();
    if (students.length > 0) {
        dump.push('-- Data for: students');
        students.forEach(s => {
            dump.push(`INSERT INTO students (enrollment_id, full_name, mobile, email, student_class, school_type, city, school, photo, status, created_at) VALUES (${escapePg(s.enrollment_id)}, ${escapePg(s.full_name)}, ${escapePg(s.mobile)}, ${escapePg(s.email)}, ${escapePg(s.student_class)}, ${escapePg(s.school_type)}, ${escapePg(s.city)}, ${escapePg(s.school)}, ${escapePg(s.photo)}, ${escapePg(s.status)}, ${escapePg(s.created_at)}) ON CONFLICT (enrollment_id) DO UPDATE SET status = EXCLUDED.status, full_name = EXCLUDED.full_name;`);
        });
        dump.push('');
    }
} catch (e) {
    console.warn('Students export warning:', e.message);
}

// 2. Payments
try {
    const payments = db.prepare('SELECT * FROM payments').all();
    if (payments.length > 0) {
        dump.push('-- Data for: payments');
        payments.forEach(p => {
            dump.push(`INSERT INTO payments (enrollment_id, amount, transaction_id, payment_date, payment_method, status, created_at) VALUES (${escapePg(p.enrollment_id)}, ${escapePg(p.amount)}, ${escapePg(p.transaction_id)}, ${escapePg(p.payment_date)}, ${escapePg(p.payment_method)}, ${escapePg(p.status)}, ${escapePg(p.created_at)}) ON CONFLICT (transaction_id) DO NOTHING;`);
        });
        dump.push('');
    }
} catch (e) {
    console.warn('Payments export warning:', e.message);
}

// 3. Courses
try {
    const courses = db.prepare('SELECT * FROM courses').all();
    if (courses.length > 0) {
        dump.push('-- Data for: courses');
        courses.forEach(c => {
            dump.push(`INSERT INTO courses (id, title, subject, student_class, description, published) VALUES (${c.id}, ${escapePg(c.title)}, ${escapePg(c.subject)}, ${escapePg(c.student_class)}, ${escapePg(c.description)}, ${c.published ? 'TRUE' : 'FALSE'}) ON CONFLICT (id) DO NOTHING;`);
        });
        dump.push('');
    }
} catch (e) {
    console.warn('Courses export warning:', e.message);
}

// 4. Lessons
try {
    const lessons = db.prepare('SELECT * FROM lessons').all();
    if (lessons.length > 0) {
        dump.push('-- Data for: lessons');
        lessons.forEach(l => {
            dump.push(`INSERT INTO lessons (id, course_id, student_class, subject, title, video_url, duration_minutes, lesson_type, description, position) VALUES (${l.id}, ${l.course_id}, ${escapePg(l.student_class)}, ${escapePg(l.subject)}, ${escapePg(l.title)}, ${escapePg(l.video_url)}, ${l.duration_minutes || 15}, ${escapePg(l.lesson_type || 'video')}, ${escapePg(l.description || '')}, ${l.position || 1}) ON CONFLICT (id) DO UPDATE SET video_url = EXCLUDED.video_url, title = EXCLUDED.title;`);
        });
        dump.push('');
    }
} catch (e) {
    console.warn('Lessons export warning:', e.message);
}

// 5. Announcements
try {
    const announcements = db.prepare('SELECT * FROM announcements').all();
    if (announcements.length > 0) {
        dump.push('-- Data for: announcements');
        announcements.forEach(a => {
            dump.push(`INSERT INTO announcements (id, title, message, type) VALUES (${a.id}, ${escapePg(a.title)}, ${escapePg(a.message)}, ${escapePg(a.type)}) ON CONFLICT (id) DO NOTHING;`);
        });
        dump.push('');
    }
} catch (e) {
    console.warn('Announcements export warning:', e.message);
}

// Reset Sequences to match max IDs
dump.push('-- Synchronize Serial Sequences');
dump.push("SELECT setval(pg_get_serial_sequence('students', 'id'), COALESCE(MAX(id), 1)) FROM students;");
dump.push("SELECT setval(pg_get_serial_sequence('payments', 'id'), COALESCE(MAX(id), 1)) FROM payments;");
dump.push("SELECT setval(pg_get_serial_sequence('courses', 'id'), COALESCE(MAX(id), 1)) FROM courses;");
dump.push("SELECT setval(pg_get_serial_sequence('lessons', 'id'), COALESCE(MAX(id), 1)) FROM lessons;");
dump.push("SELECT setval(pg_get_serial_sequence('announcements', 'id'), COALESCE(MAX(id), 1)) FROM announcements;");
dump.push('');
dump.push('COMMIT;');

fs.writeFileSync(OUTPUT_PATH, dump.join('\n'), 'utf8');
console.log('✅ PostgreSQL data dump exported successfully to:', OUTPUT_PATH);
