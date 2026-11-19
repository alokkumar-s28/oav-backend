// ============================================================================
// OAV MANTRA - SUPABASE EDGE FUNCTION BACKEND API
// Framework: Deno / TypeScript (Supabase Edge Runtime)
// Project: bnlymzocydhmpuzmiwlz (https://bnlymzocydhmpuzmiwlz.supabase.co)
// Frontend: https://oavmantra.vercel.app
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://bnlymzocydhmpuzmiwlz.supabase.co";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "sb_publishable_K9N6nBr03U4ZgtX1cFdERQ_1uppv6uO";

const supabase = createClient(supabaseUrl, supabaseKey);

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function generateEnrollmentId(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `OAV-${num}-${suffix}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  let pathname = url.pathname.replace(/^\/functions\/v1\/api/, "").replace(/^\/api/, "");
  if (!pathname || pathname === "") pathname = "/";
  const method = req.method;

  try {
    // Health check
    if (pathname === "/" || pathname === "/health") {
      return jsonResponse({
        status: "online",
        engine: "Supabase Edge Function (Deno Runtime)",
        project: "bnlymzocydhmpuzmiwlz",
        timestamp: new Date().toISOString(),
      });
    }

    // POST /enroll
    if (pathname === "/enroll" && method === "POST") {
      const body = await req.json();
      const enrollment_id = body.enrollmentId || body.enrollment_id || generateEnrollmentId();
      const mobile = String(body.mobile || "").trim();
      const email = String(body.email || "").trim();

      // Check for existing active student to prevent enrollment hijacking
      if (mobile || email) {
        const { data: existing } = await supabase
          .from("students")
          .select("enrollment_id, status")
          .or(`mobile.eq.${mobile},email.eq.${email}`)
          .maybeSingle();

        if (existing && (existing.status === "active" || existing.status === "verified")) {
          return jsonResponse({
            error: "An active student account is already registered with this mobile number or email. Please log in directly to your study room dashboard."
          }, 409);
        }
      }

      const payload = {
        enrollment_id,
        full_name: String(body.name || body.fullName || body.full_name || "").trim(),
        mobile,
        email,
        student_class: String(body.class || body.studentClass || body.student_class || "VI").trim(),
        school_type: String(body.schoolType || body.school_type || "OAV").trim(),
        city: String(body.city || "").trim(),
        school: String(body.school || "").trim(),
        status: "pending_payment",
      };
      if (!payload.full_name || !payload.mobile) {
        return jsonResponse({ error: "Name and Mobile number are required." }, 400);
      }
      const { data, error } = await supabase.from("students").insert([payload]).select().single();
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true, enrollmentId: enrollment_id, student: data }, 201);
    }

    // POST /payments
    if ((pathname === "/payments" || pathname === "/payment") && method === "POST") {
      const body = await req.json();
      const rawTx = String(body.transactionId || body.transaction_id || "").trim();
      const rawScreenshot = typeof body.paymentScreenshot === "string" ? body.paymentScreenshot : (typeof body.payment_screenshot === "string" ? body.payment_screenshot : "");
      const hasTx = rawTx.length >= 5;
      const hasScreenshot = rawScreenshot.startsWith("data:image/") || rawScreenshot.length > 50;

      if (!hasTx && !hasScreenshot) {
        return jsonResponse({ error: "Payment proof required: Please enter a Transaction ID OR upload a screenshot." }, 400);
      }

      const enrollment_id = String(body.enrollmentId || body.enrollment_id || "").trim();
      const txnToSave = hasTx ? rawTx : `PROOF-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // Upload payment screenshot to Google Drive if configured
      let driveFileUrl = "";
      const driveWebhookUrl = Deno.env.get("GOOGLE_DRIVE_WEBHOOK_URL") || "";
      if (driveWebhookUrl && hasScreenshot) {
        try {
          const driveRes = await fetch(driveWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "upload_payment",
              folderType: "payments",
              base64Data: rawScreenshot,
              studentName: body.studentName || body.full_name || enrollment_id,
              enrollmentId: enrollment_id,
              transactionId: txnToSave,
              amount: 500,
              paymentDate: String(body.paymentDate || body.payment_date || new Date().toISOString().slice(0, 10))
            })
          });
          const driveJson = await driveRes.json().catch(() => ({}));
          if (driveJson && (driveJson.webViewLink || driveJson.fileUrl)) {
            driveFileUrl = driveJson.webViewLink || driveJson.fileUrl;
          }
        } catch (driveErr: any) {
          console.warn("[Drive Webhook] Payment upload error:", driveErr.message);
        }
      }

      const payload: Record<string, unknown> = {
        enrollment_id,
        amount: Number(body.amount) || 500,
        transaction_id: txnToSave,
        payment_date: String(body.paymentDate || body.payment_date || new Date().toISOString().slice(0, 10)),
        payment_method: String(body.paymentMethod || body.payment_method || "quickupi").trim(),
        status: "pending_verification",
      };

      if (hasScreenshot) {
        payload.payment_screenshot = rawScreenshot;
      }
      if (driveFileUrl) {
        payload.drive_file_url = driveFileUrl;
      }

      let { error: payErr } = await supabase.from("payments").insert([payload]);
      if (payErr && String(payErr.message).includes("drive_file_url")) {
        delete payload.drive_file_url;
        const retry = await supabase.from("payments").insert([payload]);
        payErr = retry.error;
      }
      if (payErr && String(payErr.message).includes("payment_screenshot")) {
        delete payload.payment_screenshot;
        const retry = await supabase.from("payments").insert([payload]);
        payErr = retry.error;
      }
      if (payErr) return jsonResponse({ error: payErr.message }, 400);
      await supabase.from("students").update({ status: "payment_review" }).eq("enrollment_id", payload.enrollment_id);
      return jsonResponse({
        success: true,
        message: "Payment recorded successfully.",
        driveUploaded: Boolean(driveFileUrl),
        driveFileUrl: driveFileUrl || null
      }, 200);
    }

    // POST /student/photo
    if ((pathname === "/student/photo" || pathname === "/photo") && method === "POST") {
      const body = await req.json();
      const enrollment_id = String(body.enrollmentId || body.enrollment_id || "").trim();
      const photo = body.photo || body.highResPhoto || "";
      if (!enrollment_id || !photo) {
        return jsonResponse({ error: "Enrollment ID and Photo are required." }, 400);
      }

      let drivePhotoUrl = "";
      const driveWebhookUrl = Deno.env.get("GOOGLE_DRIVE_WEBHOOK_URL") || "";
      if (driveWebhookUrl && typeof photo === "string" && photo.startsWith("data:image/")) {
        try {
          const driveRes = await fetch(driveWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "upload_photo",
              folderType: "photos",
              base64Data: photo,
              studentName: body.studentName || enrollment_id,
              enrollmentId: enrollment_id,
              studentClass: body.studentClass || body.class || "VI"
            })
          });
          const driveJson = await driveRes.json().catch(() => ({}));
          if (driveJson && (driveJson.webViewLink || driveJson.fileUrl)) {
            drivePhotoUrl = driveJson.webViewLink || driveJson.fileUrl;
          }
        } catch (driveErr: any) {
          console.warn("[Drive Webhook] Photo upload error:", driveErr.message);
        }
      }

      const updatePayload: Record<string, unknown> = { photo };
      if (drivePhotoUrl) {
        updatePayload.drive_photo_url = drivePhotoUrl;
      }

      let { data, error } = await supabase
        .from("students")
        .update(updatePayload)
        .eq("enrollment_id", enrollment_id)
        .select()
        .single();

      if (error && String(error.message).includes("drive_photo_url")) {
        delete updatePayload.drive_photo_url;
        const retry = await supabase
          .from("students")
          .update(updatePayload)
          .eq("enrollment_id", enrollment_id)
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({
        success: true,
        photo,
        driveUploaded: Boolean(drivePhotoUrl),
        drivePhotoUrl: drivePhotoUrl || null,
        student: data
      }, 200);
    }

    // POST /student/login with security gates
    if ((pathname === "/student/login" || pathname === "/login") && method === "POST") {
      const body = await req.json();
      const cleanId = String(body.enrollmentId || body.enrollment_id || "").trim().toUpperCase();
      const cleanMobile = String(body.mobile || "").replace(/\D/g, "").slice(-10);
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .or(`enrollment_id.eq.${cleanId},enrollment_id.eq.OAV-${cleanId}`)
        .eq("mobile", cleanMobile);
      if (error) return jsonResponse({ error: error.message }, 400);
      if (!data || data.length === 0) {
        return jsonResponse({ error: "Invalid Enrollment ID or Registered Mobile number." }, 401);
      }
      const student = data[0];

      // SECURITY GATES
      if (student.status === "payment_review" || student.status === "pending_verification") {
        return jsonResponse({
          code: "PAYMENT_UNDER_REVIEW",
          status: student.status,
          error: "⏳ Verification Pending: Your payment has been received and is currently under review by our admin team. Once approved in the admin control panel, you will be able to log in. Please try again in some time."
        }, 403);
      }
      if (student.status === "pending_payment") {
        return jsonResponse({
          code: "PAYMENT_REQUIRED",
          status: "pending_payment",
          error: "💳 Payment Required: Please complete your ₹500 enrollment fee payment and submit your transaction ID on the homepage."
        }, 403);
      }
      if (student.status === "rejected") {
        return jsonResponse({
          code: "PAYMENT_REJECTED",
          status: "rejected",
          error: "❌ Payment Rejected: Your payment claim could not be verified by the admin team. Please contact helpline at +91 89175 31123."
        }, 403);
      }
      if (student.status === "suspended") {
        return jsonResponse({
          code: "ACCOUNT_SUSPENDED",
          status: "suspended",
          error: "⛔ Account Suspended: Your access has been paused by the administrator. Please contact helpline at +91 89175 31123."
        }, 403);
      }

      return jsonResponse({ success: true, student, redirect: "dashboard.html" }, 200);
    }

    // GET /dashboard or GET /student/me
    if ((pathname === "/dashboard" || pathname === "/student/me") && method === "GET") {
      const enrollmentId = url.searchParams.get("enrollment_id") || url.searchParams.get("enrollmentId");
      if (!enrollmentId) return jsonResponse({ error: "Enrollment ID required" }, 400);
      const { data: student, error } = await supabase.from("students").select("*").eq("enrollment_id", enrollmentId).single();
      if (error || !student) return jsonResponse({ error: "Student not found" }, 404);
      const { data: payments } = await supabase.from("payments").select("*").eq("enrollment_id", enrollmentId);
      return jsonResponse({ student, payments: payments || [] }, 200);
    }

    // GET /lessons
    if (pathname === "/lessons" && method === "GET") {
      const studentClass = url.searchParams.get("class") || "VI";
      const { data, error } = await supabase
        .from("lessons")
        .select("*")
        .eq("student_class", studentClass.toUpperCase())
        .order("position", { ascending: true })
        .order("id", { ascending: true });
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse(data || [], 200);
    }

    // GET /notes
    if (pathname === "/notes" && method === "GET") {
      const studentClass = url.searchParams.get("class") || "VI";
      const { data, error } = await supabase
        .from("study_notes")
        .select("*")
        .eq("student_class", studentClass.toUpperCase())
        .order("id", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse(data || [], 200);
    }

    // GET /announcements
    if (pathname === "/announcements" && method === "GET") {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse(data || [], 200);
    }

    // POST /progress
    if (pathname === "/progress" && method === "POST") {
      const body = await req.json();
      const payload = {
        enrollment_id: body.enrollmentId || body.enrollment_id,
        lesson_id: Number(body.lessonId || body.lesson_id),
        completed_at: new Date().toISOString(),
      };
      if (payload.enrollment_id && payload.lesson_id) {
        await supabase.from("lesson_progress").upsert(payload);
      }
      return jsonResponse({ success: true }, 200);
    }

    // Validate Admin Token on all /admin/* routes
    if (pathname.startsWith("/admin")) {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      const validToken = Deno.env.get("ADMIN_TOKEN") || "oav-mantra.2026";
      if (token !== validToken) {
        return jsonResponse({ error: "Unauthorized admin access. Invalid password." }, 401);
      }
    }

    // GET /admin/overview
    if (pathname === "/admin/overview" && method === "GET") {
      const [sRes, pRes, lRes, nRes] = await Promise.all([
        supabase.from("students").select("status"),
        supabase.from("payments").select("amount, status"),
        supabase.from("lessons").select("id"),
        supabase.from("study_notes").select("id"),
      ]);
      const students = sRes.data || [];
      const payments = pRes.data || [];
      const lessons = lRes.data || [];
      const notes = nRes.data || [];
      return jsonResponse({
        totalStudents: students.length,
        activeStudents: students.filter((s: any) => s.status === "active").length,
        pendingPayments: payments.filter((p: any) => p.status === "pending_verification").length,
        paymentReview: students.filter((s: any) => s.status === "payment_review" || s.status === "pending_payment").length,
        verifiedRevenue: payments.filter((p: any) => p.status === "verified").reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0),
        totalLessons: lessons.length,
        totalNotes: notes.length,
      }, 200);
    }

    // GET /admin/payments
    if (pathname === "/admin/payments" && method === "GET") {
      const [pRes, sRes] = await Promise.all([
        supabase.from("payments").select("*").order("id", { ascending: false }),
        supabase.from("students").select("enrollment_id, full_name, mobile, student_class, school, city, photo, drive_photo_url"),
      ]);
      const payments = pRes.data || [];
      const students = sRes.data || [];
      const map: Record<string, any> = {};
      students.forEach((s: any) => { map[s.enrollment_id] = s; });
      const formatted = payments.map((p: any) => {
        const s = map[p.enrollment_id] || {};
        return {
          ...p,
          full_name: s.full_name || "Enrolled Student",
          mobile: s.mobile || "-",
          student_class: s.student_class || "-",
          school: s.school || "-",
          city: s.city || "-",
          photo: s.photo || null,
          drive_photo_url: s.drive_photo_url || null,
        };
      });
      return jsonResponse({ payments: formatted }, 200);
    }

    // GET /admin/students
    if (pathname === "/admin/students" && method === "GET") {
      const [sRes, pRes] = await Promise.all([
        supabase.from("students").select("*").order("id", { ascending: false }),
        supabase.from("payments").select("*").order("id", { ascending: false }),
      ]);
      const students = sRes.data || [];
      const payments = pRes.data || [];
      const formatted = students.map((s: any) => {
        const p = payments.find((pay: any) => pay.enrollment_id === s.enrollment_id);
        return {
          ...s,
          payment_status: p ? p.status : (s.status === "active" ? "verified" : "unpaid"),
          transaction_id: p ? p.transaction_id : null,
          amount: p ? p.amount : null,
          payment_id: p ? p.id : null,
        };
      });
      return jsonResponse({ students: formatted }, 200);
    }

    // POST /admin/payments/:id/verify
    if (pathname.match(/\/admin\/payments\/[^\/]+\/verify/) && method === "POST") {
      const match = pathname.match(/\/admin\/payments\/([^\/]+)\/verify/);
      const paymentId = match ? match[1] : "";
      const { data: pData } = await supabase.from("payments").select("*").eq("id", paymentId).single();
      if (pData) {
        await Promise.all([
          supabase.from("payments").update({ status: "verified", verified_at: new Date().toISOString() }).eq("id", paymentId),
          supabase.from("students").update({ status: "active" }).eq("enrollment_id", pData.enrollment_id),
        ]);
      }
      return jsonResponse({ success: true }, 200);
    }

    // POST /admin/payments/:id/reject
    if (pathname.match(/\/admin\/payments\/[^\/]+\/reject/) && method === "POST") {
      const match = pathname.match(/\/admin\/payments\/([^\/]+)\/reject/);
      const paymentId = match ? match[1] : "";
      const { data: pData } = await supabase.from("payments").select("*").eq("id", paymentId).single();
      if (pData) {
        await Promise.all([
          supabase.from("payments").update({ status: "rejected" }).eq("id", paymentId),
          supabase.from("students").update({ status: "rejected" }).eq("enrollment_id", pData.enrollment_id),
        ]);
      }
      return jsonResponse({ success: true }, 200);
    }

    // DELETE /admin/students/:id
    if (pathname.startsWith("/admin/students/") && method === "DELETE") {
      const parts = pathname.split("/");
      const idOrEnrollment = decodeURIComponent(parts[parts.length - 1]);
      let enrollmentId = idOrEnrollment;
      if (!isNaN(Number(idOrEnrollment))) {
        const { data: s } = await supabase.from("students").select("enrollment_id").eq("id", idOrEnrollment).single();
        if (s) enrollmentId = s.enrollment_id;
      }
      await Promise.all([
        supabase.from("payments").delete().eq("enrollment_id", enrollmentId),
        supabase.from("lesson_progress").delete().eq("enrollment_id", enrollmentId),
        supabase.from("quiz_results").delete().eq("enrollment_id", enrollmentId),
        supabase.from("students").delete().eq("enrollment_id", enrollmentId),
      ]);
      return jsonResponse({ success: true }, 200);
    }

    // POST /admin/lessons
    if (pathname === "/admin/lessons" && method === "POST") {
      const body = await req.json();
      const payload = {
        student_class: body.student_class || body.studentClass || "VI",
        subject: body.subject || "General",
        title: body.title,
        video_url: body.video_url || body.videoUrl,
        lesson_type: body.lesson_type || body.lessonType || "video",
        description: body.description || "",
      };
      const { error } = await supabase.from("lessons").insert([payload]);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true }, 201);
    }

    // DELETE /admin/lessons/:id
    if (pathname.startsWith("/admin/lessons/") && method === "DELETE") {
      const parts = pathname.split("/");
      const id = parts[parts.length - 1];
      const { error } = await supabase.from("lessons").delete().eq("id", id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true }, 200);
    }

    // POST /admin/notes
    if (pathname === "/admin/notes" && method === "POST") {
      const body = await req.json();
      const payload = {
        student_class: body.student_class || body.studentClass || "VI",
        subject: body.subject || "General",
        title: body.title,
        file_url: body.file_url || body.fileUrl || "",
        content: body.content || "",
      };
      const { error } = await supabase.from("study_notes").insert([payload]);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true }, 201);
    }

    // DELETE /admin/notes/:id
    if (pathname.startsWith("/admin/notes/") && method === "DELETE") {
      const parts = pathname.split("/");
      const id = parts[parts.length - 1];
      const { error } = await supabase.from("study_notes").delete().eq("id", id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true }, 200);
    }

    // POST /admin/announcements
    if (pathname === "/admin/announcements" && method === "POST") {
      const body = await req.json();
      const payload = {
        title: body.title,
        message: body.message,
        type: body.type || "general",
        is_active: true,
      };
      const { error } = await supabase.from("announcements").insert([payload]);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true }, 201);
    }

    // Fallback 404
    return jsonResponse({ error: `Endpoint not found: ${method} ${pathname}` }, 404);
  } catch (err: any) {
    return jsonResponse({ error: err.message || "Internal edge function error" }, 500);
  }
});