"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { isGoogleDriveConfigured, uploadStudentPhotoToDrive } = require("./google-drive.js");

const PORT = Number(process.env.PORT || 3000);
const BACKEND_ROOT = __dirname;

// --- Robust Database Path Resolution ---
let dbPath = path.join(BACKEND_ROOT, "oav-mantra.db");
if (!fs.existsSync(dbPath)) {
  const altDb1 = path.resolve(BACKEND_ROOT, "..", "..", "database", "oav-mantra.db");
  const altDb2 = path.resolve(BACKEND_ROOT, "..", "database", "oav-mantra.db");
  if (fs.existsSync(altDb1)) dbPath = altDb1;
  else if (fs.existsSync(altDb2)) dbPath = altDb2;
}

// --- Robust Frontend Path Resolution ---
const candidateFrontendDirs = [
  path.resolve(BACKEND_ROOT, "..", "..", "frontend", "oav-frontend"),
  path.resolve(BACKEND_ROOT, "..", "frontend", "oav-frontend"),
  path.resolve(BACKEND_ROOT, "..", "..", "frontend"),
  path.resolve(BACKEND_ROOT, "..", "frontend"),
  path.resolve(BACKEND_ROOT, "frontend")
];

let FRONTEND_ROOT = candidateFrontendDirs.find(dir => fs.existsSync(path.join(dir, "index.html")) || fs.existsSync(path.join(dir, "Index.html"))) || path.resolve(BACKEND_ROOT, "..", "..", "frontend", "oav-frontend");

function localSetting(name) {
  const configPath = path.join(BACKEND_ROOT, ".env");
  if (!fs.existsSync(configPath)) return "";
  const line = fs.readFileSync(configPath, "utf8").split(/\r?\n/).find(item => item.trim().startsWith(`${name}=`));
  return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "") : "";
}

// --- Admin token with fallback and logging ---
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || localSetting("ADMIN_TOKEN") || "oav-mantra.2026";
if (!process.env.ADMIN_TOKEN && !localSetting("ADMIN_TOKEN")) {
  console.warn("⚠️  ADMIN_TOKEN not set. Using default 'oav-mantra.2026' for development.");
}

// --- Database connection ---
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    enrollment_id TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    mobile TEXT NOT NULL,
    email TEXT NOT NULL,
    student_class TEXT NOT NULL,
    school_type TEXT,
    city TEXT NOT NULL,
    school TEXT,
    status TEXT NOT NULL DEFAULT 'pending_payment' CHECK(status IN ('pending_payment','payment_review','active','suspended')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    enrollment_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK(amount > 0),
    transaction_id TEXT NOT NULL UNIQUE,
    payment_date TEXT NOT NULL,
    payment_method TEXT NOT NULL CHECK(payment_method IN ('quickupi','qr')),
    status TEXT NOT NULL DEFAULT 'pending_verification' CHECK(status IN ('pending_verification','verified','rejected')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(enrollment_id) REFERENCES students(enrollment_id)
  );
  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    student_class TEXT NOT NULL,
    description TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    student_class TEXT NOT NULL DEFAULT 'VI',
    subject TEXT NOT NULL DEFAULT 'General',
    title TEXT NOT NULL,
    video_url TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 15,
    lesson_type TEXT NOT NULL DEFAULT 'video',
    description TEXT DEFAULT '',
    position INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(course_id) REFERENCES courses(id)
  );
  CREATE TABLE IF NOT EXISTS lesson_progress (
    enrollment_id TEXT NOT NULL,
    lesson_id INTEGER NOT NULL,
    completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(enrollment_id, lesson_id),
    FOREIGN KEY(enrollment_id) REFERENCES students(enrollment_id),
    FOREIGN KEY(lesson_id) REFERENCES lessons(id)
  );
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'general' CHECK(type IN ('general','urgent','exam','holiday')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS quiz_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    enrollment_id TEXT NOT NULL,
    student_class TEXT NOT NULL,
    subject TEXT NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(enrollment_id) REFERENCES students(enrollment_id)
  );
  CREATE TABLE IF NOT EXISTS study_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_class TEXT NOT NULL,
    subject TEXT NOT NULL,
    title TEXT NOT NULL,
    file_url TEXT,
    content TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// --- Ensure existing database columns and constraints are migrated ---
try {
  const lessonSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='lessons'").get()?.sql || "";
  if (lessonSql.includes("CHECK(lesson_type IN ('video','document','quiz'))")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS lessons_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        student_class TEXT NOT NULL DEFAULT 'VI',
        subject TEXT NOT NULL DEFAULT 'General',
        title TEXT NOT NULL,
        video_url TEXT,
        duration_minutes INTEGER NOT NULL DEFAULT 15,
        lesson_type TEXT NOT NULL DEFAULT 'video',
        description TEXT DEFAULT '',
        position INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(course_id) REFERENCES courses(id)
      );
      INSERT INTO lessons_migrated (id, course_id, student_class, subject, title, video_url, duration_minutes, lesson_type, description, position)
      SELECT id, course_id, student_class, subject, title, video_url, duration_minutes, lesson_type, description, position FROM lessons;
      DROP TABLE lessons;
      ALTER TABLE lessons_migrated RENAME TO lessons;
    `);
  }

  const lessonCols = db.prepare("PRAGMA table_info(lessons)").all().map(c => c.name);
  if (!lessonCols.includes("student_class")) {
    db.exec("ALTER TABLE lessons ADD COLUMN student_class TEXT NOT NULL DEFAULT 'VI'");
  }
  if (!lessonCols.includes("subject")) {
    db.exec("ALTER TABLE lessons ADD COLUMN subject TEXT NOT NULL DEFAULT 'General'");
  }
  if (!lessonCols.includes("video_url")) {
    db.exec("ALTER TABLE lessons ADD COLUMN video_url TEXT");
  }
  if (!lessonCols.includes("description")) {
    db.exec("ALTER TABLE lessons ADD COLUMN description TEXT DEFAULT ''");
  }

  // Ensure photo column exists on students table
  const studentCols = db.prepare("PRAGMA table_info(students)").all().map(c => c.name);
  if (!studentCols.includes("photo")) {
    db.exec("ALTER TABLE students ADD COLUMN photo TEXT");
  }

  // Clear out any old default fake lessons from previous builds
  db.exec(`
    DELETE FROM lessons 
    WHERE video_url LIKE '%youtube-nocookie.com%'
       OR video_url LIKE '%5qap5aO4i9A%'
       OR video_url LIKE '%3G1P20vgggs%'
       OR video_url LIKE '%ysz5S6PUM-U%'
       OR video_url LIKE '%kJQP7kiw5Fk%'
       OR title LIKE 'Knowing Our Numbers%'
       OR title LIKE 'Whole Numbers%'
       OR title LIKE 'Components of Food%'
       OR title LIKE 'Living Organisms%'
       OR title LIKE 'Parts of Speech%'
       OR title LIKE 'The Earth in the Solar System%'
       OR title LIKE 'Integers &%'
       OR title LIKE 'Simple Equations%'
       OR title LIKE 'Nutrition in Plants%'
       OR title LIKE 'Heat, Temperature%'
       OR title LIKE 'Rational Numbers%'
       OR title LIKE 'Linear Equations in One Variable%'
       OR title LIKE 'Crop Production%'
       OR title LIKE 'Microorganisms:%'
       OR title LIKE 'Motion:%'
       OR title LIKE 'Fundamental Unit of Life%'
       OR title LIKE 'Number Systems%'
       OR title LIKE 'Polynomials &%'
       OR title LIKE 'Chemical Reactions%'
       OR title LIKE 'Life Processes%'
       OR title LIKE 'Real Numbers%'
       OR title LIKE 'Trigonometry Basics%'
       OR title LIKE 'Class % Foundation & Solved Examples'
       OR title LIKE 'Class % Core Concepts & Experiments'
       OR title LIKE 'Class % Grammar & Reading Comprehension'
       OR title LIKE 'Class % Maps, Dates & Geography';
  `);
} catch (err) {
  console.warn("Migration warning:", err.message);
}

// Seed courses
const seedCourses = [
  ["Science foundations", "Science", "VI", "Concepts, experiments and practice questions."],
  ["Mathematics mastery", "Mathematics", "VI", "Whole numbers, basic geometry, fractions and decimals."],
  ["English communication", "English", "VI", "Grammar essentials, comprehension and vocabulary."],
  ["Social Studies explorer", "Social Studies", "VI", "Our earth, early civilizations and community."],
  
  ["Science mastery", "Science", "VII", "Nutrition, heat, physical & chemical changes, respiration."],
  ["Mathematics mastery", "Mathematics", "VII", "Integers, fractions, algebraic expressions and simple equations."],
  ["English communication", "English", "VII", "Grammar, prose, poetry and writing skills."],
  ["Social Studies explorer", "Social Studies", "VII", "Medieval history, environment and our government."],

  ["Science advanced", "Science", "VIII", "Force, pressure, cell structure, synthetic fibers and reproduction."],
  ["Mathematics mastery", "Mathematics", "VIII", "Rational numbers, linear equations, geometry, and mensuration."],
  ["English communication", "English", "VIII", "Advanced grammar, essays, reading comprehension."],
  ["Social Studies explorer", "Social Studies", "VIII", "Modern Indian history, resources, and Indian constitution."],

  ["Advanced Science & Physics", "Science", "IX", "Matter in our surroundings, motion, force & laws, cell biology."],
  ["Mathematics Board Foundation", "Mathematics", "IX", "Number systems, polynomials, coordinate geometry, triangles."],
  ["English Literature & Language", "English", "IX", "Language and literature for competitive excellence."],
  ["Social Sciences comprehensive", "Social Studies", "IX", "Democratic politics, contemporary India, economics."],

  ["Board Examination Physics & Chem", "Science", "X", "Chemical reactions, electricity, magnetic effects, life processes."],
  ["Board Examination Mathematics", "Mathematics", "X", "Real numbers, quadratic equations, trigonometry, statistics."],
  ["Board Examination English", "English", "X", "First Flight, Footprints without Feet, advanced composition."],
  ["Board Examination Social Sciences", "Social Studies", "X", "Nationalism in India, resources and development, power sharing."]
];

const addCourse = db.prepare("INSERT INTO courses (title, subject, student_class, description) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM courses WHERE student_class = ? AND subject = ?)");
seedCourses.forEach(c => addCourse.run(c[0], c[1], c[2], c[3], c[2], c[1]));

// Seed Initial Announcement if none exists
const checkAnnouncements = db.prepare("SELECT COUNT(*) AS count FROM announcements").get();
if (checkAnnouncements.count === 0) {
  const insertAnn = db.prepare("INSERT INTO announcements (title, message, type) VALUES (?, ?, ?)");
  insertAnn.run("Welcome to OAV Mantra Academic Session 2025-26", "Live classes for Classes VI-X are scheduled Monday through Saturday. Make sure your registration fee is verified.", "general");
  insertAnn.run("Online Mock Tests Schedule Announced", "Interactive chapter-wise quizzes and term mock examinations are now live in your respective class study portals.", "exam");
}

// --- Utility functions ---
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json"
};

const rateLimit = new Map();
const sessions = new Map();
const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000; // 24 hours

function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 5_000_000) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > limit) {
        reject(new Error("Request payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

function clean(value, max = 150) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function validId(value) {
  return /^OAV-[A-Za-z0-9_-]{4,35}$/i.test(value);
}

function extractYouTubeId(url) {
  if (!url) return null;
  let str = String(url).trim();
  const srcMatch = str.match(/src=["']([^"']+)["']/i);
  if (srcMatch) str = srcMatch[1];
  const match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|live\/|watch\?v=|watch\?.+?&v=))([\w-]{11})/i);
  if (match && match[1]) return match[1];
  const simple = str.match(/^[\w-]{11}$/);
  if (simple) return simple[0];
  return null;
}

function formatVideoUrl(url) {
  if (!url) return "";
  let trimmed = String(url).trim();

  const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
  if (srcMatch && srcMatch[1]) {
    trimmed = srcMatch[1].trim();
  }

  const ytId = extractYouTubeId(trimmed);
  if (ytId) {
    return `https://www.youtube.com/embed/${ytId}`;
  }

  // Vimeo
  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)/i);
  if (vimeoMatch && vimeoMatch[3]) {
    return `https://player.vimeo.com/video/${vimeoMatch[3]}`;
  }

  // Google Drive preview links
  if (trimmed.includes("drive.google.com/file/d/")) {
    return trimmed.replace(/\/view.*$/, "/preview");
  }

  return trimmed;
}


function allow(req) {
  const key = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const previous = rateLimit.get(key) || [];
  const recent = previous.filter(time => now - time < 60_000);
  recent.push(now);
  rateLimit.set(key, recent);
  return recent.length <= 120; // 120 requests per minute
}

function isAdmin(req) {
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!ADMIN_TOKEN || supplied.length !== ADMIN_TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(ADMIN_TOKEN));
}


function cookieValue(req, name) {
  return String(req.headers.cookie || "").split(";").map(item => item.trim())
    .find(item => item.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

function studentSession(req) {
  const token = cookieValue(req, "oav_session");
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return getStudent(session.enrollmentId);
}

function createStudentSession(req, res, enrollmentId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { enrollmentId, expiresAt: Date.now() + SESSION_LIFETIME_MS });
  const secure = process.env.NODE_ENV === "production" || req.socket.encrypted ? "; Secure" : "";
  res.setHeader("Set-Cookie", `oav_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_LIFETIME_MS / 1000}${secure}`);
}

function clearStudentSession(res) {
  res.setHeader("Set-Cookie", "oav_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function getStudent(enrollmentId) {
  if (!enrollmentId) return null;
  const cleanId = String(enrollmentId).trim().toUpperCase();
  return db.prepare(`
    SELECT enrollment_id, full_name, mobile, email, student_class, school_type, city, school, photo, status, created_at 
    FROM students 
    WHERE UPPER(TRIM(enrollment_id)) = ? OR UPPER(TRIM(enrollment_id)) = ?
  `).get(cleanId, cleanId.startsWith("OAV-") ? cleanId.replace(/^OAV-/, "") : `OAV-${cleanId}`);
}

// --- HTTP server ---
const server = http.createServer(async (req, res) => {
  const clientOrigin = req.headers.origin || `http://${req.headers.host || "localhost:3000"}`;
  res.setHeader("Access-Control-Allow-Origin", clientOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Cookie");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (!allow(req)) return send(res, 429, { error: "Too many requests. Please try again in a minute." });

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  try {
    // --- Student Auth: Check current active session ---
    if (req.method === "GET" && url.pathname === "/api/student/me") {
      const student = studentSession(req);
      if (!student) return send(res, 401, { authenticated: false });
      if (student.status !== "active" && student.status !== "verified") {
        clearStudentSession(res);
        return send(res, 403, { authenticated: false, error: "Your account is pending admin approval." });
      }
      return send(res, 200, { authenticated: true, student });
    }

    // --- Student login ---
    if (req.method === "POST" && url.pathname === "/api/student/login") {
      const body = await readBody(req);
      const rawEnrollment = clean(body.enrollmentId, 50);
      const rawMobile = clean(body.mobile, 25);
      
      // Clean mobile number (extract last 10 digits)
      const mobile = rawMobile.replace(/\D/g, "").slice(-10);
      
      // Clean enrollment ID
      let enrollmentId = rawEnrollment.trim().toUpperCase();
      if (enrollmentId.startsWith("OAV-")) {
        enrollmentId = enrollmentId.replace(/^OAV-+/i, "OAV-");
      }

      if (!mobile || mobile.length !== 10) {
        return send(res, 400, { error: "Please enter your valid 10-digit registered mobile number." });
      }
      if (!enrollmentId) {
        return send(res, 400, { error: "Please enter your Enrollment ID." });
      }

      // 1. Primary Search: Match Enrollment ID (case-insensitive, with or without OAV- prefix) AND mobile number
      let student = db.prepare(`
        SELECT enrollment_id, full_name, mobile, email, student_class, school_type, city, school, photo, status 
        FROM students 
        WHERE (UPPER(TRIM(enrollment_id)) = UPPER(TRIM(?)) OR UPPER(TRIM(enrollment_id)) = UPPER(TRIM(?)))
          AND (mobile = ? OR mobile = ?)
      `).get(enrollmentId, enrollmentId.startsWith("OAV-") ? enrollmentId.replace(/^OAV-/, "") : `OAV-${enrollmentId}`, mobile, rawMobile);

      // 2. Secondary Search: If mobile matched, check if enrollment ID belongs to this student
      if (!student) {
        student = db.prepare(`
          SELECT enrollment_id, full_name, mobile, email, student_class, school_type, city, school, photo, status 
          FROM students 
          WHERE (UPPER(TRIM(enrollment_id)) = UPPER(TRIM(?)) OR UPPER(TRIM(enrollment_id)) = UPPER(TRIM(?)))
        `).get(enrollmentId, enrollmentId.startsWith("OAV-") ? enrollmentId.replace(/^OAV-/, "") : `OAV-${enrollmentId}`);
      }

      // 3. Fallback Search: If student has their 10-digit mobile number in database
      if (!student) {
        student = db.prepare(`
          SELECT enrollment_id, full_name, mobile, email, student_class, school_type, city, school, photo, status 
          FROM students 
          WHERE mobile = ?
        `).get(mobile);
      }

      if (!student) {
        return send(res, 401, { error: "No student account found with this Enrollment ID or Mobile Number. Please check your details or enroll on the homepage." });
      }

      // SECURITY GATE: Check if administrator has approved this student
      if (student.status === "payment_review" || student.status === "pending_verification") {
        return send(res, 403, {
          code: "PAYMENT_UNDER_REVIEW",
          status: student.status,
          error: "⏳ Verification Pending: Your payment has been received and is currently under review by our admin team. Once approved in the admin control panel, you will be able to log in. Please try again in some time (usually 15-30 minutes)."
        });
      }

      if (student.status === "pending_payment") {
        return send(res, 403, {
          code: "PAYMENT_REQUIRED",
          status: "pending_payment",
          error: "💳 Payment Required: Please complete your ₹500 enrollment fee payment and submit your transaction ID on the homepage."
        });
      }

      if (student.status === "rejected") {
        return send(res, 403, {
          code: "PAYMENT_REJECTED",
          status: "rejected",
          error: "❌ Payment Rejected: Your payment claim could not be verified by the admin team. Please contact helpline at +91 89175 31123."
        });
      }

      if (student.status === "suspended") {
        return send(res, 403, {
          code: "ACCOUNT_SUSPENDED",
          status: "suspended",
          error: "⛔ Account Suspended: Your access has been paused by the administrator. Please contact helpline at +91 89175 31123."
        });
      }

      // Allow verified/active students
      createStudentSession(req, res, student.enrollment_id);
      return send(res, 200, {
        success: true,
        status: student.status,
        student: {
          enrollment_id: student.enrollment_id,
          full_name: student.full_name,
          student_class: student.student_class,
          school_type: student.school_type,
          city: student.city,
          school: student.school,
          mobile: student.mobile,
          email: student.email,
          photo: student.photo || "",
          status: student.status
        },
        redirect: "dashboard.html"
      });
    }

    // --- Student Photo Upload (Compressed Avatar + Google Drive Storage) ---
    if (req.method === "POST" && url.pathname === "/api/student/photo") {
      const student = studentSession(req);
      if (!student) return send(res, 401, { error: "Please log in to update your photo." });

      const body = await readBody(req, 6_000_000);
      const photo = typeof body.photo === "string" ? body.photo.slice(0, 300_000) : "";
      const highResPhoto = typeof body.highResPhoto === "string" ? body.highResPhoto : (typeof body.originalPhoto === "string" ? body.originalPhoto : photo);

      if (!photo || !photo.startsWith("data:image/")) {
        return send(res, 400, { error: "Invalid photo format. Please upload a valid image." });
      }

      // Update student photo in database for ID card & Dashboard
      const cleanId = String(student.enrollment_id).trim().toUpperCase();
      const altId = cleanId.startsWith("OAV-") ? cleanId.replace(/^OAV-/, "") : `OAV-${cleanId}`;
      db.prepare("UPDATE students SET photo = ? WHERE UPPER(TRIM(enrollment_id)) = ? OR UPPER(TRIM(enrollment_id)) = ?").run(photo, cleanId, altId);

      // Attempt Google Drive upload if configured
      let driveResult = null;
      let driveError = null;

      if (isGoogleDriveConfigured()) {
        try {
          const photoToUpload = highResPhoto && highResPhoto.startsWith("data:image/") ? highResPhoto : photo;
          driveResult = await uploadStudentPhotoToDrive({
            photoData: photoToUpload,
            studentName: student.full_name,
            enrollmentId: student.enrollment_id,
            studentClass: student.student_class
          });
          console.log(`[Google Drive] Photo uploaded for ${student.enrollment_id} (${driveResult.fileName}) -> File ID: ${driveResult.fileId}`);
        } catch (err) {
          console.error(`[Google Drive] Upload failed for ${student.enrollment_id}:`, err.message);
          driveError = err.message;
        }
      } else {
        console.log(`[Google Drive] Skipped upload for ${student.enrollment_id}: Google Drive is not configured.`);
      }

      return send(res, 200, {
        success: true,
        photo,
        driveUploaded: Boolean(driveResult),
        driveFileUrl: driveResult ? driveResult.webViewLink : null,
        driveFileName: driveResult ? driveResult.fileName : null,
        driveConfigured: isGoogleDriveConfigured(),
        driveError: driveError
      });
    }

    // --- Student logout ---
    if (req.method === "POST" && url.pathname === "/api/student/logout") {
      clearStudentSession(res);
      return send(res, 200, { success: true });
    }

    // --- Public Announcements ---
    if (req.method === "GET" && url.pathname === "/api/announcements") {
      const announcements = db.prepare("SELECT id, title, message, type, created_at FROM announcements ORDER BY id DESC LIMIT 10").all();
      return send(res, 200, { announcements });
    }

    // --- Admin API endpoints ---
    if (url.pathname.startsWith("/api/admin/")) {
      if (!isAdmin(req)) return send(res, 401, { error: "Administrator authentication required." });

      // Admin Overview Stats
      if (req.method === "GET" && url.pathname === "/api/admin/overview") {
        const count = status => db.prepare("SELECT COUNT(*) AS count FROM students WHERE status = ?").get(status).count;
        const totalRevenue = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'verified'").get().total;
        
        // Distribution by class
        const classDist = db.prepare("SELECT student_class, COUNT(*) as count FROM students GROUP BY student_class").all();

        return send(res, 200, {
          totalStudents: db.prepare("SELECT COUNT(*) AS count FROM students").get().count,
          activeStudents: count("active"),
          paymentReview: count("payment_review"),
          pendingPayments: db.prepare("SELECT COUNT(*) AS count FROM payments WHERE status = 'pending_verification'").get().count,
          totalRevenue,
          classDistribution: classDist
        });
      }

      // Admin Payments List
      if (req.method === "GET" && url.pathname === "/api/admin/payments") {
        const payments = db.prepare(`
          SELECT p.id, p.amount, p.transaction_id, p.payment_date, p.payment_method, p.status,
                 s.enrollment_id, s.full_name, s.student_class, s.mobile, s.city
          FROM payments p
          JOIN students s ON s.enrollment_id = p.enrollment_id
          ORDER BY p.id DESC
        `).all();
        return send(res, 200, { payments });
      }

      // Admin Students List
      if (req.method === "GET" && url.pathname === "/api/admin/students") {
        const query = clean(url.searchParams.get("q"), 80);
        const classFilter = clean(url.searchParams.get("class"), 10);
        const statusFilter = clean(url.searchParams.get("status"), 20);

        let sql = `SELECT enrollment_id, full_name, mobile, email, student_class, school_type, city, school, photo, status, created_at FROM students WHERE 1=1`;
        const params = [];

        if (query) {
          sql += ` AND (full_name LIKE ? OR enrollment_id LIKE ? OR mobile LIKE ? OR city LIKE ?)`;
          const p = `%${query}%`;
          params.push(p, p, p, p);
        }
        if (classFilter) {
          sql += ` AND student_class = ?`;
          params.push(classFilter);
        }
        if (statusFilter) {
          sql += ` AND status = ?`;
          params.push(statusFilter);
        }

        sql += ` ORDER BY created_at DESC LIMIT 300`;
        const students = db.prepare(sql).all(...params);
        return send(res, 200, { students });
      }

      // Admin Verify Payment
      const matchVerify = url.pathname.match(/^\/api\/admin\/payments\/(\d+)\/verify$/);
      if (req.method === "POST" && matchVerify) {
        const paymentId = Number(matchVerify[1]);
        const payment = db.prepare("SELECT enrollment_id FROM payments WHERE id = ?").get(paymentId);
        if (!payment) return send(res, 404, { error: "Payment record not found." });
        db.prepare("UPDATE payments SET status = 'verified' WHERE id = ?").run(paymentId);
        db.prepare("UPDATE students SET status = 'active' WHERE enrollment_id = ?").run(payment.enrollment_id);
        return send(res, 200, { success: true });
      }

      // Admin Reject Payment
      const matchReject = url.pathname.match(/^\/api\/admin\/payments\/(\d+)\/reject$/);
      if (req.method === "POST" && matchReject) {
        const paymentId = Number(matchReject[1]);
        const payment = db.prepare("SELECT enrollment_id FROM payments WHERE id = ?").get(paymentId);
        if (!payment) return send(res, 404, { error: "Payment record not found." });
        db.prepare("UPDATE payments SET status = 'rejected' WHERE id = ?").run(paymentId);
        db.prepare("UPDATE students SET status = 'rejected' WHERE enrollment_id = ?").run(payment.enrollment_id);
        return send(res, 200, { success: true });
      }


      // Admin Update Student Status
      const matchStatus = url.pathname.match(/^\/api\/admin\/students\/([A-Za-z0-9-]+)\/status$/);
      if (req.method === "POST" && matchStatus) {
        const enrollmentId = matchStatus[1];
        const body = await readBody(req);
        const newStatus = clean(body.status, 20);
        if (!['active', 'pending_payment', 'payment_review', 'suspended'].includes(newStatus)) {
          return send(res, 400, { error: "Invalid status value." });
        }
        db.prepare("UPDATE students SET status = ? WHERE enrollment_id = ?").run(newStatus, enrollmentId);
        return send(res, 200, { success: true });
      }

      // Admin Delete Student Permanently
      const matchDeleteStudent = url.pathname.match(/^\/api\/admin\/students\/([A-Za-z0-9_-]+)$/);
      if (req.method === "DELETE" && matchDeleteStudent) {
        const enrollmentId = matchDeleteStudent[1];
        db.prepare("DELETE FROM lesson_progress WHERE enrollment_id = ?").run(enrollmentId);
        db.prepare("DELETE FROM quiz_results WHERE enrollment_id = ?").run(enrollmentId);
        db.prepare("DELETE FROM payments WHERE enrollment_id = ?").run(enrollmentId);
        db.prepare("DELETE FROM students WHERE enrollment_id = ?").run(enrollmentId);
        return send(res, 200, { success: true, message: `Student ${enrollmentId} permanently removed.` });
      }

      // Admin Get All Lessons (with optional class filter)
      if (req.method === "GET" && url.pathname === "/api/admin/lessons") {
        const classFilter = clean(url.searchParams.get("class"), 10);
        let sql = "SELECT id, course_id, student_class, subject, title, video_url, duration_minutes, lesson_type, description, position FROM lessons";
        const params = [];
        if (classFilter) {
          sql += " WHERE student_class = ?";
          params.push(classFilter);
        }
        sql += " ORDER BY student_class ASC, position ASC, id DESC";
        const lessons = db.prepare(sql).all(...params);
        return send(res, 200, { lessons });
      }

      // Admin Add New Lesson / Video Link / Live Stream
      if (req.method === "POST" && url.pathname === "/api/admin/lessons") {
        const body = await readBody(req);
        const studentClass = clean(body.studentClass || body.student_class, 10);
        const subject = clean(body.subject, 60);
        const title = clean(body.title, 200);
        const rawVideoUrl = clean(body.videoUrl || body.video_url, 500);
        const lessonType = clean(body.lessonType || body.lesson_type, 20) === 'live' ? 'live' : 'video';
        const duration = Number(body.durationMinutes || body.duration_minutes) || 20;
        const description = clean(body.description, 1000);

        if (!studentClass || !subject || !title || !rawVideoUrl) {
          return send(res, 400, { error: "Class, Subject, Title, and Video/Live URL are required." });
        }

        const videoUrl = formatVideoUrl(rawVideoUrl);

        // Find or fallback course
        const course = db.prepare("SELECT id FROM courses WHERE student_class = ? AND subject = ? LIMIT 1").get(studentClass, subject);
        const courseId = course ? course.id : 1;

        // Position
        const maxPos = db.prepare("SELECT COALESCE(MAX(position), 0) AS maxPos FROM lessons WHERE student_class = ?").get(studentClass).maxPos;

        const result = db.prepare(`
          INSERT INTO lessons (course_id, student_class, subject, title, video_url, duration_minutes, description, position, lesson_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(courseId, studentClass, subject, title, videoUrl, duration, description, maxPos + 1, lessonType);

        return send(res, 201, { success: true, lessonId: Number(result.lastInsertRowid), videoUrl, lessonType });
      }

      // Admin Delete Lesson
      const matchDeleteLesson = url.pathname.match(/^\/api\/admin\/lessons\/(\d+)$/);
      if (req.method === "DELETE" && matchDeleteLesson) {
        const lessonId = Number(matchDeleteLesson[1]);
        db.prepare("DELETE FROM lesson_progress WHERE lesson_id = ?").run(lessonId);
        db.prepare("DELETE FROM lessons WHERE id = ?").run(lessonId);
        return send(res, 200, { success: true });
      }

      // Admin Get All Study Notes
      if (req.method === "GET" && url.pathname === "/api/admin/notes") {
        const classFilter = clean(url.searchParams.get("class"), 10);
        let sql = "SELECT id, student_class, subject, title, file_url, content, created_at FROM study_notes";
        const params = [];
        if (classFilter) {
          sql += " WHERE student_class = ?";
          params.push(classFilter);
        }
        sql += " ORDER BY student_class ASC, id DESC";
        const notes = db.prepare(sql).all(...params);
        return send(res, 200, { notes });
      }

      // Admin Add New Study Note
      if (req.method === "POST" && url.pathname === "/api/admin/notes") {
        const body = await readBody(req);
        const studentClass = clean(body.studentClass || body.student_class, 10);
        const subject = clean(body.subject, 60);
        const title = clean(body.title, 200);
        const fileUrl = clean(body.fileUrl || body.file_url, 500);
        const content = clean(body.content, 5000);

        if (!studentClass || !subject || !title) {
          return send(res, 400, { error: "Class, Subject, and Note Title are required." });
        }

        const result = db.prepare(`
          INSERT INTO study_notes (student_class, subject, title, file_url, content)
          VALUES (?, ?, ?, ?, ?)
        `).run(studentClass, subject, title, fileUrl, content);

        return send(res, 201, { success: true, noteId: Number(result.lastInsertRowid) });
      }

      // Admin Delete Study Note
      const matchDeleteNote = url.pathname.match(/^\/api\/admin\/notes\/(\d+)$/);
      if (req.method === "DELETE" && matchDeleteNote) {
        const noteId = Number(matchDeleteNote[1]);
        db.prepare("DELETE FROM study_notes WHERE id = ?").run(noteId);
        return send(res, 200, { success: true });
      }


      // Admin Create Announcement
      if (req.method === "POST" && url.pathname === "/api/admin/announcements") {
        const body = await readBody(req);
        const title = clean(body.title, 120);
        const message = clean(body.message, 500);
        const type = ['general', 'urgent', 'exam', 'holiday'].includes(body.type) ? body.type : 'general';
        if (!title || !message) return send(res, 400, { error: "Title and message are required." });
        db.prepare("INSERT INTO announcements (title, message, type) VALUES (?, ?, ?)").run(title, message, type);
        return send(res, 201, { success: true });
      }

      // Admin CSV Export Endpoint
      if (req.method === "GET" && url.pathname === "/api/admin/export") {
        const rows = db.prepare(`
          SELECT s.enrollment_id, s.full_name, s.mobile, s.email, s.student_class, s.school_type, s.city, s.school, s.status, s.created_at,
                 p.transaction_id, p.amount, p.payment_date, p.payment_method, p.status as payment_status
          FROM students s
          LEFT JOIN payments p ON p.enrollment_id = s.enrollment_id
          ORDER BY s.created_at DESC
        `).all();
        return send(res, 200, { data: rows });
      }


      return send(res, 404, { error: "Admin API route not found." });
    }

    // --- Student Enrollment ---
    if (req.method === "POST" && url.pathname === "/api/enroll") {
      const body = await readBody(req);
      const record = {
        enrollmentId: clean(body.enrollmentId, 35),
        name: clean(body.name, 80),
        mobile: clean(body.mobile, 10),
        email: clean(body.email, 120).toLowerCase(),
        studentClass: clean(body.class || body.studentClass, 4).toUpperCase(),
        city: clean(body.city, 60),
        school: clean(body.school, 120),
        schoolType: clean(body.schoolType, 20) || "Normal"
      };

      if (!validId(record.enrollmentId) ||
          !/^[A-Za-z .'-]{2,80}$/.test(record.name) ||
          !/^[6-9]\d{9}$/.test(record.mobile) ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email) ||
          !/^(VI|VII|VIII|IX|X)$/i.test(record.studentClass) ||
          !record.city) {
        return send(res, 400, { error: "Please provide valid student enrollment details." });
      }

      // Check if student already enrolled
      const existing = db.prepare("SELECT enrollment_id FROM students WHERE mobile = ? OR email = ?").get(record.mobile, record.email);
      if (existing) {
        // Update details
        db.prepare(`
          UPDATE students SET full_name = ?, student_class = ?, school_type = ?, city = ?, school = ?
          WHERE enrollment_id = ?
        `).run(record.name, record.studentClass, record.schoolType, record.city, record.school || null, existing.enrollment_id);
        return send(res, 200, { success: true, enrollmentId: existing.enrollment_id, updated: true });
      }

      db.prepare(`
        INSERT INTO students (enrollment_id, full_name, mobile, email, student_class, school_type, city, school)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.enrollmentId,
        record.name,
        record.mobile,
        record.email,
        record.studentClass,
        record.schoolType || "Normal",
        record.city,
        record.school || null
      );

      return send(res, 201, { success: true, enrollmentId: record.enrollmentId });
    }

    // --- Payment Submission ---
    if (req.method === "POST" && url.pathname === "/api/payments") {
      const body = await readBody(req);
      const rawEnrollment = clean(body.enrollmentId, 40);
      const tx = clean(body.transactionId, 80);
      const paymentDate = clean(body.paymentDate, 10);
      const method = clean(body.paymentMethod, 15);

      const student = getStudent(rawEnrollment);
      if (!student) return send(res, 404, { error: "Enrollment record not found. Please verify your Enrollment ID or enroll on the homepage." });

      if (!tx || tx.length < 5) {
        return send(res, 400, { error: "Please enter a valid Transaction / UTR reference number (at least 5 characters)." });
      }

      db.prepare(`
        INSERT INTO payments (enrollment_id, amount, transaction_id, payment_date, payment_method)
        VALUES (?, 500, ?, ?, ?)
      `).run(student.enrollment_id, tx, paymentDate || new Date().toISOString().slice(0, 10), method || "quickupi");

      db.prepare("UPDATE students SET status = 'payment_review' WHERE enrollment_id = ?").run(student.enrollment_id);

      return send(res, 201, {
        success: true,
        status: "pending_verification",
        redirect: `login.html?enrollment=${encodeURIComponent(student.enrollment_id)}&mobile=${encodeURIComponent(student.mobile)}&status=review`
      });
    }

    // --- Student Dashboard Data ---
    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      const student = studentSession(req);
      if (!student) return send(res, 401, { error: "Please log in to view your dashboard." });

      const courses = student.status === "active"
        ? db.prepare("SELECT id, title, subject, description FROM courses WHERE published = 1 AND student_class = ?").all(student.student_class)
        : [];

      const payments = db.prepare("SELECT amount, transaction_id, payment_date, payment_method, status FROM payments WHERE enrollment_id = ? ORDER BY id DESC").all(student.enrollment_id);

      // Lessons and overall progress
      const totalLessons = db.prepare("SELECT COUNT(*) AS count FROM lessons WHERE student_class = ?").get(student.student_class).count;
      const completedLessons = db.prepare(`
        SELECT COUNT(*) AS count FROM lesson_progress lp
        JOIN lessons l ON l.id = lp.lesson_id
        WHERE lp.enrollment_id = ? AND l.student_class = ?
      `).get(student.enrollment_id, student.student_class).count;

      const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      return send(res, 200, {
        student,
        courses,
        payments,
        progress: {
          totalLessons,
          completedLessons,
          percentage: progressPercent
        }
      });
    }

    // --- Lessons for Class / Student ---
    if (req.method === "GET" && url.pathname === "/api/lessons") {
      const student = studentSession(req);
      const studentClass = clean(url.searchParams.get("class"), 10) || (student ? student.student_class : "VI");
      
      let lessons;
      if (student) {
        lessons = db.prepare(`
          SELECT l.id, l.title, l.subject, l.student_class, l.video_url, l.duration_minutes, l.lesson_type, l.description, l.position,
                 CASE WHEN lp.completed_at IS NOT NULL THEN 1 ELSE 0 END AS is_completed
          FROM lessons l
          LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.enrollment_id = ?
          WHERE l.student_class = ?
          ORDER BY l.position ASC, l.id DESC
        `).all(student.enrollment_id, studentClass);
      } else {
        lessons = db.prepare(`
          SELECT id, title, subject, student_class, video_url, duration_minutes, lesson_type, description, position, 0 AS is_completed
          FROM lessons
          WHERE student_class = ?
          ORDER BY position ASC, id DESC
        `).all(studentClass);
      }

      return send(res, 200, { lessons, studentClass });
    }

    // --- Study Notes for Class / Student ---
    if (req.method === "GET" && url.pathname === "/api/notes") {
      const student = studentSession(req);
      const studentClass = clean(url.searchParams.get("class"), 10) || (student ? student.student_class : "VI");
      const notes = db.prepare(`
        SELECT id, student_class, subject, title, file_url, content, created_at
        FROM study_notes
        WHERE student_class = ?
        ORDER BY id DESC
      `).all(studentClass);

      return send(res, 200, { notes, studentClass });
    }


    // --- Mark Lesson Progress ---
    if (req.method === "POST" && url.pathname === "/api/progress") {
      const student = studentSession(req);
      if (!student) return send(res, 401, { error: "Please log in to record your progress." });

      const body = await readBody(req);
      const lessonId = Number(body.lessonId);
      if (!Number.isInteger(lessonId) || lessonId < 1) {
        return send(res, 400, { error: "Invalid lesson ID provided." });
      }

      db.prepare("INSERT OR IGNORE INTO lesson_progress (enrollment_id, lesson_id) VALUES (?, ?)").run(student.enrollment_id, lessonId);

      const total = db.prepare("SELECT COUNT(*) AS count FROM lessons WHERE student_class = ?").get(student.student_class).count;
      const completed = db.prepare(`
        SELECT COUNT(*) AS count FROM lesson_progress lp
        JOIN lessons l ON l.id = lp.lesson_id
        WHERE lp.enrollment_id = ? AND l.student_class = ?
      `).get(student.enrollment_id, student.student_class).count;

      return send(res, 200, {
        success: true,
        completedLessons: completed,
        totalLessons: total,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 100
      });
    }

    // --- Submit Quiz Score ---
    if (req.method === "POST" && url.pathname === "/api/quiz") {
      const student = studentSession(req);
      const body = await readBody(req);
      const studentClass = clean(body.class, 10) || (student ? student.student_class : "VI");
      const subject = clean(body.subject, 50) || "General";
      const score = Number(body.score) || 0;
      const total = Number(body.total) || 5;

      if (student) {
        db.prepare("INSERT INTO quiz_results (enrollment_id, student_class, subject, score, total) VALUES (?, ?, ?, ?, ?)")
          .run(student.enrollment_id, studentClass, subject, score, total);
      }

      return send(res, 200, { success: true, score, total, percentage: Math.round((score / total) * 100) });
    }

    // --- Health Check ---
    if (req.method === "GET" && url.pathname === "/health") {
      return send(res, 200, { status: "ok", time: new Date().toISOString() });
    }

    // --- Static File Serving ---
    if (req.method !== "GET" && req.method !== "HEAD") {
      return send(res, 405, { error: "Method not allowed." });
    }

    let requested = decodeURIComponent((url.pathname === "/" || url.pathname === "/index" || url.pathname === "/Index") ? "/index.html" : url.pathname);
    requested = requested.replace(/^[/\\]+/, "");
    let filePath = path.resolve(FRONTEND_ROOT, requested);

    // If requested file doesn't exist directly, check with .html or case-insensitively
    if (!fs.existsSync(filePath)) {
      if (fs.existsSync(filePath + ".html")) {
        filePath = filePath + ".html";
        requested = requested + ".html";
      } else {
        try {
          const files = fs.readdirSync(FRONTEND_ROOT);
          const lowerReq = requested.toLowerCase();
          const match = files.find(f => f.toLowerCase() === lowerReq || f.toLowerCase() === lowerReq + ".html");
          if (match) {
            filePath = path.join(FRONTEND_ROOT, match);
            requested = match;
          }
        } catch (e) {}
      }
    }

    if (!filePath.startsWith(FRONTEND_ROOT + path.sep) ||
        !fs.existsSync(filePath) ||
        fs.statSync(filePath).isDirectory()) {
      return send(res, 404, { error: "File not found" });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": contentType
      });
      if (req.method === "HEAD") return res.end();
      file.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Accept-Ranges": "bytes",
        "Content-Type": contentType
      });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(filePath).pipe(res);
    }

  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return send(res, 409, { error: "This enrollment or transaction ID is already registered." });
    }
    console.error("Server error:", error.message);
    return send(res, 500, { error: "An unexpected server error occurred. Please try again." });
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`
============================================================
✅ THE SERVER IS ALREADY RUNNING AND READY!
============================================================
Port ${PORT} is currently active and serving the OAV Mantra platform.


🌐 Open Website:    http://localhost:${PORT}/index.html
🔐 Admin Control:   http://localhost:${PORT}/admin.html (Token: admin123)
📚 Student Portal:  http://localhost:${PORT}/dashboard.html

💡 If you want to restart the server, simply close any other open
   server terminal window, or run "start_server.bat".
============================================================
`);
    process.exit(0);
  } else {
    console.error("Server startup error:", err);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`
============================================================
🚀 OAV MANTRA ACADEMIC SERVER STARTED SUCCESSFULLY!
============================================================
🌐 Website URL:     http://localhost:${PORT}/index.html
🔐 Admin Panel:     http://localhost:${PORT}/admin.html
🔑 Admin Password:  admin123
📚 Database:        database/oav-mantra.db (SQLite Secure)
============================================================
`);
});