"use strict";

const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
let google = null;
try {
  google = require("googleapis").google;
} catch (e) {
  // googleapis optional if using webhook mode
}

let driveClient = null;

function readEnvSetting(name) {
  if (process.env[name]) return process.env[name];
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return "";
  try {
    const line = fs.readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find(item => item.trim().startsWith(`${name}=`));
    return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "") : "";
  } catch (e) {
    return "";
  }
}

/**
 * Loads service account credentials from file or environment variable.
 */
function getCredentials() {
  // Option 1: Inline JSON in environment variable (great for cloud hosts like Vercel / Render)
  const envKey = readEnvSetting("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (envKey) {
    try {
      return JSON.parse(envKey);
    } catch (e) {
      console.error("[Google Drive] Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON:", e.message);
    }
  }

  // Option 2: Path in GOOGLE_APPLICATION_CREDENTIALS
  const appCredsPath = readEnvSetting("GOOGLE_APPLICATION_CREDENTIALS");
  if (appCredsPath) {
    const credPath = path.resolve(appCredsPath);
    if (fs.existsSync(credPath)) {
      try {
        return JSON.parse(fs.readFileSync(credPath, "utf8"));
      } catch (e) {
        console.error("[Google Drive] Failed to read credentials from GOOGLE_APPLICATION_CREDENTIALS:", e.message);
      }
    }
  }

  // Option 3: Default local file in backend directory: google-service-account.json
  const defaultPath = path.join(__dirname, "google-service-account.json");
  if (fs.existsSync(defaultPath)) {
    try {
      return JSON.parse(fs.readFileSync(defaultPath, "utf8"));
    } catch (e) {
      console.error("[Google Drive] Failed to read google-service-account.json:", e.message);
    }
  }

  return null;
}

function getWebhookUrl() {
  const url = readEnvSetting("GOOGLE_DRIVE_WEBHOOK_URL");
  return url && url.startsWith("https://") ? url : "";
}

function getSecretKey() {
  return readEnvSetting("OAV_DRIVE_SECRET_KEY") || "oav_mantra_vault_secure_2026_9971";
}

function getFolderId(type = "photos") {
  if (type === "payments") {
    const payFolder = readEnvSetting("GOOGLE_DRIVE_PAYMENTS_FOLDER_ID");
    if (payFolder && payFolder !== "your_google_drive_folder_id_here") return payFolder;
  }
  const folder = readEnvSetting("GOOGLE_DRIVE_FOLDER_ID");
  return folder && folder !== "your_google_drive_folder_id_here" ? folder : "";
}

/**
 * Returns true if Google Drive service account or Google Apps Script Webhook is configured.
 */
function isGoogleDriveConfigured() {
  if (getWebhookUrl()) return true;
  const creds = getCredentials();
  const folderId = getFolderId();
  return Boolean(creds && folderId);
}

/**
 * Initializes and caches the Google Drive client.
 */
function getDriveClient() {
  if (driveClient) return driveClient;
  if (!google) {
    throw new Error("googleapis package not installed. Required for Service Account mode.");
  }

  const credentials = getCredentials();
  if (!credentials) {
    throw new Error("Google Drive Service Account credentials not found. Please provide google-service-account.json or set GOOGLE_DRIVE_WEBHOOK_URL.");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"]
  });

  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

/**
 * Parses buffer or base64 data:image strings.
 */
function parseMedia(mediaData) {
  let buffer;
  let mimeType = "image/jpeg";
  let base64String = "";

  if (Buffer.isBuffer(mediaData)) {
    buffer = mediaData;
    base64String = mediaData.toString("base64");
  } else if (typeof mediaData === "string") {
    const match = mediaData.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64String = match[2];
      buffer = Buffer.from(match[2], "base64");
    } else {
      base64String = mediaData;
      buffer = Buffer.from(mediaData, "base64");
    }
  } else {
    throw new Error("Invalid mediaData supplied: Expected Buffer or Base64 string.");
  }

  let ext = "jpg";
  if (mimeType.includes("png")) ext = "png";
  else if (mimeType.includes("webp")) ext = "webp";
  else if (mimeType.includes("pdf")) ext = "pdf";

  return { buffer, mimeType, ext, base64String };
}

/**
 * Uploads media via Google Apps Script Webhook directly into OAV Mantra Google Drive.
 */
async function uploadViaWebhook(payload) {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) throw new Error("GOOGLE_DRIVE_WEBHOOK_URL not configured");

  const securePayload = {
    secretKey: getSecretKey(),
    ...payload
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(securePayload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Webhook upload failed with status ${res.status}`);
  }

  return {
    fileId: data.fileId || "gdrive-webhook-" + Date.now(),
    fileName: data.fileName || payload.fileName,
    webViewLink: data.fileUrl || data.webViewLink || data.url || "",
    webContentLink: data.downloadUrl || data.webContentLink || data.url || "",
    embedUrl: data.embedUrl || (data.fileId ? `https://drive.google.com/thumbnail?id=${data.fileId}&sz=w1000` : ""),
    directUrl: data.directUrl || (data.fileId ? `https://lh3.googleusercontent.com/d/${data.fileId}` : "")
  };
}

/**
 * Uploads a student photo to Google Drive (via Service Account or Webhook).
 */
async function uploadStudentPhotoToDrive({ photoData, studentName, enrollmentId, studentClass }) {
  const { buffer, mimeType, ext, base64String } = parseMedia(photoData);

  const safeName = (studentName || "Student").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeId = (enrollmentId || "UNKNOWN").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeClass = (studentClass || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `PHOTO_${safeId}_${safeName}${safeClass ? `_Class_${safeClass}` : ""}.${ext}`;
  const description = `Student Identity Photo for ${studentName} (Enrollment: ${enrollmentId}, Class: ${studentClass || "N/A"})`;

  // 1. Try Google Apps Script Webhook first if configured
  if (getWebhookUrl()) {
    try {
      return await uploadViaWebhook({
        folderType: "photos",
        fileName,
        mimeType,
        base64Data: base64String,
        studentName,
        enrollmentId,
        studentClass,
        description
      });
    } catch (err) {
      console.warn("[Google Drive] Webhook upload failed, attempting Service Account fallback:", err.message);
    }
  }

  // 2. Use official Google Drive API via Service Account
  const drive = getDriveClient();
  const folderId = getFolderId("photos");

  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const fileMetadata = {
    name: fileName,
    description,
    parents: folderId ? [folderId] : []
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: { mimeType, body: stream },
    fields: "id, name, webViewLink, webContentLink"
  });

  return {
    fileId: response.data.id,
    fileName: response.data.name,
    webViewLink: response.data.webViewLink,
    webContentLink: response.data.webContentLink
  };
}

/**
 * Uploads a payment proof screenshot to Google Drive (via Service Account or Webhook).
 */
async function uploadPaymentScreenshotToDrive({ screenshotData, studentName, enrollmentId, transactionId, studentClass, amount, paymentDate }) {
  const { buffer, mimeType, ext, base64String } = parseMedia(screenshotData);

  const safeName = (studentName || "Student").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeId = (enrollmentId || "UNKNOWN").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeTx = (transactionId || "NoUTR").trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
  const safeDate = (paymentDate || new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, "");

  const fileName = `PAYMENT_PROOF_${safeId}_${safeName}_UTR_${safeTx}_${safeDate}.${ext}`;
  const description = `Payment Proof Screenshot (₹${amount || 500}) for ${studentName} (Enrollment: ${enrollmentId}) - UTR: ${transactionId || "N/A"}`;

  // 1. Try Google Apps Script Webhook first if configured
  if (getWebhookUrl()) {
    try {
      return await uploadViaWebhook({
        folderType: "payments",
        fileName,
        mimeType,
        base64Data: base64String,
        studentName,
        enrollmentId,
        transactionId,
        studentClass,
        amount: amount || 500,
        paymentDate: safeDate,
        description
      });
    } catch (err) {
      console.warn("[Google Drive] Webhook payment upload failed, attempting Service Account fallback:", err.message);
    }
  }

  // 2. Use official Google Drive API via Service Account
  const drive = getDriveClient();
  const folderId = getFolderId("payments");

  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const fileMetadata = {
    name: fileName,
    description,
    parents: folderId ? [folderId] : []
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: { mimeType, body: stream },
    fields: "id, name, webViewLink, webContentLink"
  });

  return {
    fileId: response.data.id,
    fileName: response.data.name,
    webViewLink: response.data.webViewLink,
    webContentLink: response.data.webContentLink
  };
}

module.exports = {
  isGoogleDriveConfigured,
  uploadStudentPhotoToDrive,
  uploadPaymentScreenshotToDrive,
  getCredentials,
  getWebhookUrl,
  getSecretKey,
  getFolderId
};
