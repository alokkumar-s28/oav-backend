/**
 * ============================================================================
 * OAV MANTRA - GOOGLE APPS SCRIPT CLOUD DRIVE CONNECTOR
 * ============================================================================
 * 
 * This script automatically receives Student Photos and Payment Screenshots
 * from OAV Mantra (localhost or Vercel) and stores them directly into your
 * personal Google Drive (oavmantra@gmail.com).
 * 
 * 🚀 60-SECOND SETUP INSTRUCTIONS:
 * 1. Log in to your Google Account (oavmantra@gmail.com) in your browser.
 * 2. Open https://script.google.com and click "New project".
 * 3. Delete any default code in Code.gs, paste this entire file, and click Save (Ctrl+S).
 * 4. Click the blue "Deploy" button at the top right -> Choose "New deployment".
 * 5. Click the gear icon next to "Select type" -> Choose "Web app".
 * 6. Set the following options:
 *    - Description: "OAV Mantra Upload Bridge"
 *    - Execute as: "Me (oavmantra@gmail.com)"
 *    - Who has access: "Anyone"  <-- IMPORTANT so website can upload
 * 7. Click "Deploy", grant the necessary Google permissions when prompted.
 * 8. Copy the generated "Web app URL" (looks like: https://script.google.com/macros/s/AKfycb.../exec).
 * 9. Paste this URL into your backend/oav-backend/.env:
 *    GOOGLE_DRIVE_WEBHOOK_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
 * 
 * That's it! All photos and payment screenshots will immediately save into
 * two organized folders in your Google Drive:
 *   📁 OAV Mantra - Student Photos
 *   📁 OAV Mantra - Payment Proofs
 * ============================================================================
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "No payload received"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);
    var folderType = data.folderType || (data.action === "upload_payment" || data.action === "upload_payment_screenshot" ? "payments" : "photos");
    var base64Data = data.base64Data || data.fileData || data.screenshotData || data.photoData;
    var fileName = data.fileName || (folderType === "payments" ? "PAYMENT_PROOF_" + new Date().getTime() + ".jpg" : "PHOTO_" + new Date().getTime() + ".jpg");
    var mimeType = data.mimeType || "image/jpeg";
    var description = data.description || "";

    if (!base64Data) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "Missing base64Data payload"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Strip data URI scheme prefix if present
    if (base64Data.indexOf(",") > -1) {
      base64Data = base64Data.split(",")[1];
    }

    // Target folder name in Google Drive
    var folderName = folderType === "payments" ? "📁 OAV Mantra - Payment Proofs" : "📁 OAV Mantra - Student Photos";
    var targetFolder = getOrCreateFolder(folderName);

    // Decode base64 to Blob
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, mimeType, fileName);

    // Create file in target folder
    var file = targetFolder.createFile(blob);
    if (description) {
      file.setDescription(description);
    }

    // Set file to be viewable with link
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // Permission fallback
    }

    var result = {
      success: true,
      fileId: file.getId(),
      fileName: file.getName(),
      fileUrl: file.getUrl(),
      downloadUrl: file.getDownloadUrl(),
      folderName: folderName
    };

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "OAV Mantra Google Drive Upload Bridge is active.",
    account: "oavmantra@gmail.com",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}
