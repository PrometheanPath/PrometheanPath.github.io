/**
 * SETUP INSTRUCTIONS
 * ─────────────────────────────────────────────────────────────────
 * 1. Store the reCAPTCHA secret key safely (one-time setup):
 *    - In the Apps Script editor click the gear icon → Project Settings
 *    - Scroll to "Script Properties" → Add property
 *    - Name: RECAPTCHA_SECRET
 *    - Value: 6Ld6KO0sAAAAAAcumE3-mGB22aVvPsN8f8igdpr9
 *    - Save. The key is now encrypted server-side and never in the code.
 *
 * 2. Open your Google Sheet → Extensions → Apps Script
 *    - Delete any existing code and paste everything below
 *    - Click Save (disk icon)
 *
 * 3. Deploy:
 *    - Click Deploy → New deployment
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 *    - Click Deploy → copy the Web app URL
 *    - Paste that URL into apply.html where it says SHEET_URL
 * ─────────────────────────────────────────────────────────────────
 */

// ========== CONFIGURATION ==========
var NOTIFY_EMAIL = 'theprometheanpath@gmail.com';
var RECAPTCHA_SECRET = PropertiesService.getScriptProperties().getProperty('RECAPTCHA_SECRET');
var SPREADSHEET_ID = '1eHw9Mu5uqtb6yDiC0mVU-2mwEcZ4HRCKYMC7mkRziEQ';

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Acquire lock to prevent concurrent submissions
    lock.waitLock(10000);
    
    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (jsonErr) {
      return createResponse({ error: 'Invalid JSON data' }, 400);
    }
    
    // ===== RECAPTCHA VERIFICATION =====
    // Required for application form; optional for contact form (which uses honeypot + rate limiting)
    var captchaToken = data['g-recaptcha-response'] || data.captcha;
    if (captchaToken) {
      var captchaValid = verifyRecaptcha(captchaToken);
      if (!captchaValid) {
        return createResponse({ error: 'CAPTCHA verification failed' }, 403);
      }
    }
    
    // ===== RATE LIMITING (basic) =====
    var userEmail = data.email ? data.email.toLowerCase().trim() : '';
    var ip = e.parameter.remoteAddress || '';
    
    if (isRateLimited(userEmail, ip)) {
      return createResponse({ error: 'Too many submissions. Please wait before submitting again.' }, 429);
    }
    
    // ===== VALIDATE REQUIRED FIELDS =====
    if (!data.name || !data.email || !data.message) {
      return createResponse({ error: 'Missing required fields' }, 400);
    }
    
    // Simple email validation
    if (!isValidEmail(data.email)) {
      return createResponse({ error: 'Invalid email address' }, 400);
    }
    
    // ===== SANITIZE INPUTS =====
    var sanitizedData = {
      name: sanitizeInput(data.name, 100),
      email: sanitizeInput(data.email, 255),
      guidance_type: sanitizeInput(data.guidance_type || '', 50),
      pathway: sanitizeInput(data.pathway || '', 200),
      message: sanitizeInput(data.message, 2000)
    };
    
    // ===== WRITE TO SPREADSHEET =====
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Promethean Path Apps') || ss.getActiveSheet();
    
    // Write header row on first submission
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'Name', 'Email', 'Guidance Type', 'Pathway(s)', 'Message', 'IP Address']);
    }
    
    sheet.appendRow([
      new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }),
      sanitizedData.name,
      sanitizedData.email,
      sanitizedData.guidance_type,
      sanitizedData.pathway,
      sanitizedData.message,
      ip
    ]);
    
    // ===== EMAIL NOTIFICATION =====
    try {
      sendNotificationEmail(sanitizedData);
    } catch (emailErr) {
      // Log but don't fail the submission if email fails
      Logger.log('Email notification failed: ' + emailErr.message);
    }
    
    // Record submission for rate limiting
    recordSubmission(userEmail, ip);
    
    return createResponse({ success: true });
    
  } catch (err) {
    Logger.log('Error in doPost: ' + err.message);
    return createResponse({ error: 'Internal server error' }, 500);
  } finally {
    lock.releaseLock();
  }
}

// ===== RECAPTCHA VERIFICATION =====
function verifyRecaptcha(token) {
  try {
    var payload = 'secret=' + encodeURIComponent(RECAPTCHA_SECRET) + 
                  '&response=' + encodeURIComponent(token);
    
    var options = {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    };
    
    var response = UrlFetchApp.fetch('https://www.google.com/recaptcha/api/siteverify', options);
    var result = JSON.parse(response.getContentText());
    
    return result.success && result.score >= 0.5;
  } catch (err) {
    Logger.log('reCAPTCHA verification error: ' + err.message);
    return false;
  }
}

// ===== RATE LIMITING =====
function getRateLimitKey(email, ip) {
  return 'rate_' + Utilities.base64Encode(email + '|' + ip);
}

function isRateLimited(email, ip) {
  try {
    var key = getRateLimitKey(email, ip);
    var submissions = JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '[]');
    var now = new Date().getTime();
    var oneHourAgo = now - (60 * 60 * 1000); // 1 hour window
    
    // Count recent submissions
    var recentCount = submissions.filter(function(time) {
      return time > oneHourAgo;
    }).length;
    
    return recentCount >= 3; // Max 3 submissions per hour per email/IP
  } catch (err) {
    return false; // Fail open if rate limiting breaks
  }
}

function recordSubmission(email, ip) {
  try {
    var key = getRateLimitKey(email, ip);
    var submissions = JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || '[]');
    var now = new Date().getTime();
    var oneHourAgo = now - (60 * 60 * 1000);
    
    // Keep only recent submissions
    submissions = submissions.filter(function(time) {
      return time > oneHourAgo;
    });
    
    submissions.push(now);
    
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(submissions));
  } catch (err) {
    // Silently fail if rate limiting storage fails
  }
}

// ===== INPUT VALIDATION & SANITIZATION =====
function sanitizeInput(input, maxLength) {
  if (!input || typeof input !== 'string') return '';
  
  // Trim and limit length
  var sanitized = input.trim().substring(0, maxLength);
  
  // Remove potential HTML/script injection
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=/gi, '');
  
  return sanitized;
}

function isValidEmail(email) {
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ===== EMAIL NOTIFICATION =====
function sendNotificationEmail(data) {
  var name = data.name || 'Not provided';
  var email = data.email || 'Not provided';
  var type = data.guidance_type || 'Not provided';
  var pathway = data.pathway || 'Not provided';
  var message = data.message || 'Not provided';
  
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    replyTo: email,
    subject: 'New Application — ' + name + ' (' + type + ')',
    htmlBody:
      '<div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1a1a;">' +
        '<div style="background:#07101c;padding:28px 36px;border-bottom:2px solid #6a90bc;">' +
          '<h2 style="color:#edf2f8;font-size:20px;margin:0;">New Application — The Promethean Path</h2>' +
        '</div>' +
        '<div style="padding:28px 36px;background:#f7f8fa;border:1px solid #e4e8ed;">' +
          '<table style="width:100%;border-collapse:collapse;">' +
            '<tr><td style="padding:10px 0;border-bottom:1px solid #e4e8ed;width:140px;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Name</td>' +
                '<td style="padding:10px 0;border-bottom:1px solid #e4e8ed;font-size:15px;font-weight:600;">' + escapeHtml(name) + '</td></tr>' +
            '<tr><td style="padding:10px 0;border-bottom:1px solid #e4e8ed;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Email</td>' +
                '<td style="padding:10px 0;border-bottom:1px solid #e4e8ed;font-size:15px;"><a href="mailto:' + escapeHtml(email) + '" style="color:#6a90bc;">' + escapeHtml(email) + '</a></td></tr>' +
            '<tr><td style="padding:10px 0;border-bottom:1px solid #e4e8ed;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Guidance</td>' +
                '<td style="padding:10px 0;border-bottom:1px solid #e4e8ed;font-size:15px;">' + escapeHtml(type) + '</td></tr>' +
            '<tr><td style="padding:10px 0;border-bottom:1px solid #e4e8ed;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Pathway(s)</td>' +
                '<td style="padding:10px 0;border-bottom:1px solid #e4e8ed;font-size:15px;">' + escapeHtml(pathway) + '</td></tr>' +
          '</table>' +
          '<div style="margin-top:24px;">' +
            '<p style="color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Message</p>' +
            '<p style="font-size:15px;line-height:1.8;white-space:pre-wrap;">' + escapeHtml(message) + '</p>' +
          '</div>' +
        '</div>' +
        '<div style="padding:16px 36px;background:#07101c;">' +
          '<p style="color:rgba(237,242,248,0.4);font-size:11px;margin:0;">Promethean Path &nbsp;·&nbsp; Reply to this email to respond to ' + escapeHtml(name) + '</p>' +
        '</div>' +
      '</div>'
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ===== RESPONSE HELPER =====
function createResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}