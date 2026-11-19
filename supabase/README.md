# ⚡ OAV Mantra - Supabase Edge Function Backend

This directory contains the production serverless **Edge Function Backend** for OAV Mantra.
It replaces the need for a separate Node.js virtual server and runs globally on the edge with zero hosting costs and zero downtime.

---

## 📁 Structure

```
supabase/
├── config.toml              # Supabase Project Configuration (project_id: bnlymzocydhmpuzmiwlz)
├── README.md                # Edge Function Deployment Guide
└── functions/
    └── api/
        └── index.ts         # Complete Multi-Route Deno/TypeScript Edge API
```

---

## 🚀 Endpoints Included in Edge Function (`/functions/v1/api`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **GET** | `/health` | Edge function health check and latency test |
| **POST** | `/enroll` | Student registration & unique enrollment ID generation (`OAV-XXXXXX-XXXX`) |
| **POST** | `/payments` | UPI / QR transaction claim recording & student review queueing |
| **POST** | `/student/login` | Student authentication with enrollment ID & mobile verification |
| **GET** | `/dashboard` | Student profile and payment verification status lookup |
| **GET** | `/lessons?class=VI` | Video lessons for Classes VI to X |
| **GET** | `/notes?class=VI` | Study materials and PDF documents |
| **GET** | `/announcements` | Notice board and live updates |
| **POST** | `/progress` | Video lesson completion tracking |
| **GET** | `/admin/overview` | Admin dashboard counters (Total students, revenue, pending reviews) |
| **GET** | `/admin/payments` | Joined payments and student directory |
| **GET** | `/admin/students` | Registered student directory with filter support |
| **POST** | `/admin/payments/:id/verify` | Instant payment approval and student account unlock |
| **POST** | `/admin/payments/:id/reject` | Payment rejection handler |
| **POST** | `/admin/lessons` | Add new chapter video lesson to class portal |
| **DELETE**| `/admin/lessons/:id` | Remove lesson from portal |
| **POST** | `/admin/notes` | Add study note / PDF to class portal |
| **DELETE**| `/admin/notes/:id` | Remove study note |

---

## 🛠️ How to Deploy the Edge Function (Optional / 1 Command)

If you wish to deploy the Edge Function using the Supabase CLI:

```bash
# 1. Login to your Supabase account
npx supabase login

# 2. Link to your cloud project
npx supabase link --project-ref bnlymzocydhmpuzmiwlz

# 3. Deploy the Edge Function
npx supabase functions deploy api --no-verify-jwt
```

---

## 🌐 Direct Client Access (Already Enabled)

Because [`frontend/oav-frontend/supabase-client.js`](../frontend/oav-frontend/supabase-client.js) is already wired with your publishable key and database schema, **your frontend on [oavmantra.vercel.app](https://oavmantra.vercel.app/) works directly with Supabase even without deploying the CLI edge function!**