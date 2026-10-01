"use strict";

const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { google } = require("googleapis");

let driveClient = null;
let cachedFolderId = null;

/**
 * Loads service account credentials from file or environment variable.
 */
function getCredentials() {
  // Option 1: Inline JSON in environment variable (great for cloud hosts like Vercel / Render)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    } catch (e) {
      console.error("[Google Drive] Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY JSON:", e.message);
    }
  }

  // Option 2: Path in GOOGLE_APPLICATION_CREDENTIALS
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
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

/**
 * Returns true if Google Drive service account and folder ID are configured.
 */
function isGoogleDriveConfigured() {
  const creds = getCredentials();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  return Boolean(creds && folderId && folderId !== "your_google_drive_folder_id_here");
}

/**
 * Initializes and caches the Google Drive client.
 */
function getDriveClient() {
  if (driveClient) return driveClient;

  const credentials = getCredentials();
  if (!credentials) {
    throw new Error("Google Drive Service Account credentials not found. Please provide google-service-account.json or set GOOGLE_SERVICE_ACCOUNT_KEY.");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"]
  });

  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

/**
 * Uploads a student photo Buffer or Base64 string directly to Google Drive.
 * 
 * @param {Object} params
 * @param {Buffer|string} params.photoData - Buffer or base64 data:image string
 * @param {string} params.studentName - Full student name
 * @param {string} params.enrollmentId - Student enrollment ID
 * @param {string} [params.studentClass] - Student class (e.g. VI, VII, VIII, IX, X)
 * @returns {Promise<{fileId: string, fileName: string, webViewLink: string}>}
 */
async function uploadStudentPhotoToDrive({ photoData, studentName, enrollmentId, studentClass }) {
  const drive = getDriveClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  let buffer;
  let mimeType = "image/jpeg";

  if (Buffer.isBuffer(photoData)) {
    buffer = photoData;
  } else if (typeof photoData === "string") {
    const match = photoData.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      buffer = Buffer.from(match[2], "base64");
    } else {
      buffer = Buffer.from(photoData, "base64");
    }
  } else {
    throw new Error("Invalid photoData supplied to Google Drive uploader.");
  }

  // Build clean, professional filename e.g.: OAV-123456_Alok_Kumar_Class_X_Photo.jpg
  const safeName = (studentName || "Student").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeId = (enrollmentId || "UNKNOWN").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeClass = (studentClass || "").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const fileName = `${safeId}_${safeName}${safeClass ? `_Class_${safeClass}` : ""}_Photo.${ext}`;

  // Create stream from buffer
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const fileMetadata = {
    name: fileName,
    description: `Student Identity Photo for ${studentName} (Enrollment: ${enrollmentId}, Class: ${studentClass || "N/A"})`,
    parents: folderId ? [folderId] : []
  };

  const media = {
    mimeType: mimeType,
    body: stream
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
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
  getCredentials
};
