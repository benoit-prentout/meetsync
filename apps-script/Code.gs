/**
 * Google Meet Gemini Notes → NotebookLM Sync (v4.1)
 * 100% English Version with UI Refinements
 */

const CONFIG = {
  SOURCE_FOLDER_NAME: 'Meet Recordings',
  MAX_FILES_PER_RUN: 20,
  ENABLE_NOTIFICATIONS: true,

  // Max size of the master doc (in characters) before auto-archiving. 0 = disabled.
  ARCHIVE_THRESHOLD_CHARS: 800000,

  // Automatically archive at the start of a new month.
  ENABLE_MONTHLY_ARCHIVE: true,

  // Re-sync modified notes after their first sync.
  ENABLE_UPDATE_DETECTION: true,

  // Filter files older than N days. 0 = no filter.
  MAX_AGE_DAYS: 0,

  // Max retries for transient API errors.
  MAX_RETRIES: 3,

  // Number of syncs kept in history.
  HISTORY_SIZE: 20,

  // Google Drive folder ID for storing archive documents.
  // If set, archives will be moved to this folder.
  ARCHIVE_FOLDER_ID: '',

  // Master document ID for REST API mode.
  // When set, the script operates on this document instead of the active one.
  MASTER_DOC_ID: '',
};

(function() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('CONFIG_OVERRIDES');
    if (raw) Object.assign(CONFIG, JSON.parse(raw));
  } catch (_) {}
})();

function validateCaller_(accessToken) {
  if (!accessToken) return false;
  const cache = CacheService.getScriptCache();
  const cached = cache.get('auth_' + accessToken.slice(0, 32));
  if (cached === 'ok') return true;
  try {
    const resp = UrlFetchApp.fetch(
      'https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=' + encodeURIComponent(accessToken),
      { muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) return false;
    const info = JSON.parse(resp.getContentText());
    const ownerEmail = Session.getActiveUser().getEmail();
    if (!ownerEmail) {
      console.warn('validateCaller_: Session.getActiveUser().getEmail() returned empty — auth will fail until resolved');
      return false;
    }
    if (info.email && info.email === ownerEmail) {
      cache.put('auth_' + accessToken.slice(0, 32), 'ok', 300);
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

// ─── REST API ENDPOINTS ───────────────────────────────────────────────────────

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const authToken = e.parameter.token || '';
  if (!validateCaller_(authToken)) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const action = e.parameter.action;
  let result;

  try {
    switch (action) {
      case 'status':
        result = getStatus();
        break;
      case 'sync':
        result = runSync();
        break;
      case 'archive':
        result = runArchive();
        break;
      case 'history':
        result = getHistory();
        break;
      case 'settings':
        if (e.postData) {
          result = updateSettings(JSON.parse(e.postData.contents));
        } else {
          result = getSettings();
        }
        break;
      case 'files':
        result = getFiles();
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getStatus() {
  const props = PropertiesService.getScriptProperties();
  const estimatedChars = parseInt(props.getProperty('estimatedChars') || '0', 10);
  const lastSync = props.getProperty('lastSync');
  const isConfigured = Boolean(CONFIG.MASTER_DOC_ID && CONFIG.ARCHIVE_FOLDER_ID);

  return {
    success: true,
    lastSync: lastSync ? new Date(parseInt(lastSync, 10)).toISOString() : null,
    docSize: estimatedChars,
    isConfigured: isConfigured
  };
}

function getSettings() {
  return {
    success: true,
    settings: {
      sourceFolderName: CONFIG.SOURCE_FOLDER_NAME,
      maxFilesPerRun: CONFIG.MAX_FILES_PER_RUN,
      archiveThresholdChars: CONFIG.ARCHIVE_THRESHOLD_CHARS,
      enableMonthlyArchive: CONFIG.ENABLE_MONTHLY_ARCHIVE,
      enableUpdateDetection: CONFIG.ENABLE_UPDATE_DETECTION,
      maxAgeDays: CONFIG.MAX_AGE_DAYS,
      archiveFolderId: CONFIG.ARCHIVE_FOLDER_ID,
      masterDocId: CONFIG.MASTER_DOC_ID,
      maxRetries: CONFIG.MAX_RETRIES,
      historySize: CONFIG.HISTORY_SIZE
    }
  };
}

var SETTINGS_KEY_MAP_ = {
  sourceFolderName: 'SOURCE_FOLDER_NAME',
  maxFilesPerRun: 'MAX_FILES_PER_RUN',
  archiveThresholdChars: 'ARCHIVE_THRESHOLD_CHARS',
  enableMonthlyArchive: 'ENABLE_MONTHLY_ARCHIVE',
  enableUpdateDetection: 'ENABLE_UPDATE_DETECTION',
  maxAgeDays: 'MAX_AGE_DAYS',
  archiveFolderId: 'ARCHIVE_FOLDER_ID',
  masterDocId: 'MASTER_DOC_ID',
  maxRetries: 'MAX_RETRIES',
  historySize: 'HISTORY_SIZE'
};

function updateSettings(settings) {
  var toSave = {};
  for (var camelKey in SETTINGS_KEY_MAP_) {
    if (camelKey in settings) {
      var configKey = SETTINGS_KEY_MAP_[camelKey];
      CONFIG[configKey] = settings[camelKey];
      toSave[configKey] = settings[camelKey];
    }
  }
  var props = PropertiesService.getScriptProperties();
  // Merge toSave into existing persisted overrides
  var existing = {};
  try { existing = JSON.parse(props.getProperty('CONFIG_OVERRIDES') || '{}'); } catch (_) {}
  Object.assign(existing, toSave);
  props.setProperty('CONFIG_OVERRIDES', JSON.stringify(existing));
  return { success: true, message: 'Settings updated' };
}

function getHistory() {
  var props = PropertiesService.getScriptProperties();
  var raw = JSON.parse(props.getProperty('syncHistory') || '[]');
  var history = raw.map(function(r, i) {
    var filesProcessed = (r.synced || 0) + (r.updated || 0);
    var status = r.errors > 0 ? (filesProcessed > 0 ? 'partial' : 'error') : 'success';
    var message = (r.synced || 0) + ' synced, ' + (r.updated || 0) + ' updated' + (r.errors ? ', ' + r.errors + ' errors' : '');
    return {
      id: r.date,
      timestamp: r.date,
      filesProcessed: filesProcessed,
      status: status,
      message: message,
      syncedNames: r.syncedNames || [],
      updatedNames: r.updatedNames || [],
      duration: r.duration ?? null
    };
  });
  return { success: true, history: history };
}

function getFiles() {
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();
  var files = [];
  for (var key in allProps) {
    if (key.indexOf('SYNC_') !== 0) continue;
    var fileId = key.substring(5);
    var syncedAt = new Date(parseInt(allProps[key], 10)).toISOString();
    try {
      var meta = Drive.Files.get(fileId, { fields: 'name,size' });
      files.push({
        id: fileId,
        name: meta.name || fileId,
        lastSynced: syncedAt,
        size: parseInt(meta.size || '0', 10)
      });
    } catch (_) {
      files.push({ id: fileId, name: fileId, lastSynced: syncedAt, size: 0 });
    }
  }
  return { success: true, files: files };
}

function runSync() {
  const docId = CONFIG.MASTER_DOC_ID || DocumentApp.getActiveDocument().getId();
  const result = appendMeetNotesToMasterRestAPI(docId);

  return {
    success: true,
    result: result
  };
}

function runArchive() {
  const docId = CONFIG.MASTER_DOC_ID || DocumentApp.getActiveDocument().getId();
  const timezone = Session.getScriptTimeZone() || 'UTC';

  checkAndArchive_(docId, timezone, true);

  return {
    success: true,
    message: 'Archive created'
  };
}

function appendMeetNotesToMasterRestAPI(docId) {
  const startTime = Date.now();
  const timezone = Session.getScriptTimeZone() || 'UTC';
  const props = PropertiesService.getScriptProperties();

  const folderId = getFolderIdByName_(CONFIG.SOURCE_FOLDER_NAME);

  let query = `mimeType = 'application/vnd.google-apps.document' and trashed = false`;
  let folderQuery = folderId ? `'${folderId}' in parents` : '';
  let nameQuery = `(name contains 'Notes de la réunion' or name contains 'Meeting notes' or name contains 'Notes for' or name contains 'Notes by Gemini' or name contains 'Notes par Gemini')`;

  if (folderQuery) {
    query += ` and (${folderQuery} or ${nameQuery})`;
  } else {
    query += ` and ${nameQuery}`;
  }

  if (CONFIG.MAX_AGE_DAYS > 0) {
    const cutoff = new Date(Date.now() - CONFIG.MAX_AGE_DAYS * 86400000).toISOString();
    query += ` and modifiedTime > '${cutoff}'`;
  }

  const result = apiCall_(() => Drive.Files.list({
    q: query,
    pageSize: 100,
    fields: 'files(id, name, createdTime, modifiedTime)',
    orderBy: 'createdTime desc',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  }));

  if (!result.files || result.files.length === 0) {
    return { synced: 0, updated: 0, errors: 0, message: 'No meetings found' };
  }

  const toProcess = [];
  const updatedIds = [];

  for (const file of result.files) {
    const lastSyncTime = props.getProperty('SYNC_' + file.id);

    if (!lastSyncTime) {
      toProcess.push(file);
    } else if (CONFIG.ENABLE_UPDATE_DETECTION) {
      const modifiedDate = new Date(file.modifiedTime).getTime();
      const syncDate = parseInt(lastSyncTime, 10);
      const GRACE_MS = 5 * 60 * 1000;

      if (modifiedDate > syncDate + GRACE_MS) {
        toProcess.push(file);
        updatedIds.push(file.id);
      }
    }

    if (toProcess.length >= CONFIG.MAX_FILES_PER_RUN) break;
  }

  if (toProcess.length === 0) {
    return { synced: 0, updated: 0, errors: 0, message: 'All files are already synced' };
  }

  if (CONFIG.ARCHIVE_THRESHOLD_CHARS > 0) {
    checkAndArchive_(docId, timezone);
  }

  const filesToProcess = toProcess.reverse();
  const requests = [];
  const syncedEntries = [];
  const updatedNames = [];
  let errorCount = 0;

  for (const file of filesToProcess) {
    try {
      const rawText = apiCall_(() => exportFileAsText_(file.id));
      const participants = extractParticipants_(rawText);
      const cleanText = cleanGeminiText_(rawText);
      const isUpdate = updatedIds.indexOf(file.id) !== -1;
      if (isUpdate) updatedNames.push(file.name);
      const dateStr = Utilities.formatDate(new Date(file.createdTime), timezone, 'yyyy-MM-dd');

      const blockText = buildBlock_(file.name, dateStr, participants, cleanText, isUpdate);

      requests.push({
        insertText: {
          location: { index: 1 },
          text: blockText,
        },
      });

      props.setProperty('SYNC_' + file.id, String(new Date(file.modifiedTime).getTime()));
      syncedEntries.push({ name: file.name, date: dateStr });

    } catch (e) {
      errorCount++;
    }
  }

  if (requests.length > 0) {
    apiCall_(() => Docs.Documents.batchUpdate({ requests }, docId));
    updateDocSizeEstimate_(requests);

    try {
      updateSummaryTable_(docId, syncedEntries);
    } catch (e) {}

    if (CONFIG.ENABLE_NOTIFICATIONS) {
      try {
        sendNotification_(syncedEntries.map(e => e.name), updatedIds, errorCount, `https://docs.google.com/document/d/${docId}/edit`);
      } catch (e) {}
    }

    const duration = Date.now() - startTime;
    logSyncRun_({
      date: new Date().toISOString(),
      synced: syncedEntries.length,
      updated: updatedIds.length,
      errors: errorCount,
      duration,
      syncedNames: syncedEntries.map(e => e.name),
      updatedNames
    });
    props.setProperty('lastSync', String(Date.now()));
  }

  return {
    synced: syncedEntries.length,
    updated: updatedIds.length,
    errors: errorCount,
    duration: Date.now() - startTime
  };
}

// ─── MENU ─────────────────────────────────────────────────────────────────────

/**
 * Creates the custom menu when the document opens.
 */
function onOpen() {
  try {
    const ui = DocumentApp.getUi();
    ui.createMenu('🚀 NotebookLM')
      .addItem('❓ Start Here / Help', 'showHelp')
      .addSeparator()
      .addItem('🔄 Sync Now', 'appendMeetNotesToMaster')
      .addItem('⏰ Enable Auto-Sync (Every 15m)', 'setupTrigger')
      .addSeparator()
      .addItem('📜 View Sync History', 'showSyncHistory')
      .addItem('📦 Archive Document Now', 'forceArchive')
      .addItem('🧹 Reset Sync State (Full Re-sync)', 'resetSyncProperties')
      .addToUi();

    // First run logic
    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty('initialized')) {
      // Note: showHelp() might require authorization to run from a simple onOpen trigger
      insertWelcomeContent();
      props.setProperty('initialized', 'true');
    }
  } catch (e) {
    console.error('Menu creation failed:', e.message);
  }
}

/**
 * Automatically sets up a 15-minute time-based trigger.
 */
function setupTrigger() {
  const ui = DocumentApp.getUi();
  
  // Check if trigger already exists
  const allTriggers = ScriptApp.getProjectTriggers();
  const existing = allTriggers.find(t => t.getHandlerFunction() === 'appendMeetNotesToMaster');
  
  if (existing) {
    ui.alert('⏰ Auto-Sync is already active.');
    return;
  }

  try {
    ScriptApp.newTrigger('appendMeetNotesToMaster')
      .timeBased()
      .everyMinutes(15)
      .create();
      
    ui.alert('✅ Success!', 'Auto-sync is now active. This document will update every 15 minutes.', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Error', 'Could not set up trigger: ' + e.message + '\n\nMake sure you have approved all permissions.', ui.ButtonSet.OK);
  }
}

/**
 * Inserts a beautiful setup guide into the document body.
 */
function insertWelcomeContent() {
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  
  // Only insert if the document is essentially empty
  if (body.getText().trim().length > 100) return;

  body.clear();
  
  const title = body.appendParagraph('🚀 Welcome to NotebookLM Sync');
  title.setHeading(DocumentApp.ParagraphHeading.TITLE);
  title.setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  body.appendParagraph('Follow these 4 steps to activate your knowledge base:').setHeading(DocumentApp.ParagraphHeading.HEADING2);

  const list1 = body.appendListItem('Start Here: Go to the "🚀 NotebookLM" menu and click "❓ Start Here / Help" to understand how the tool works.');
  const list2 = body.appendListItem('Authorize & Sync: Click "🔄 Sync Now" in the same menu. Follow the Google prompts to give the script access to your documents (this is required once).');
  const list3 = body.appendListItem('Enable Auto-Sync: Click "⏰ Enable Auto-Sync" to fetch new meetings every 15 minutes automatically.');
  const list4 = body.appendListItem('Manage Archives: When this document reaches its size limit, a "Meeting Notes Archive" is created. Remember to add these archives to NotebookLM too!');

  body.appendParagraph('\n---').setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  
  const footer = body.appendParagraph('Note: You can delete these instructions once you are set up. Your meeting notes will appear below the summary table.');
  footer.setItalic(true);
  footer.setAttributes({[DocumentApp.Attribute.FOREGROUND_COLOR]: '#70757a'});
  footer.setAlignment(DocumentApp.HorizontalAlignment.CENTER);

  const githubLink = body.appendParagraph('Github Repository');
  githubLink.setLinkUrl('https://github.com/benoit-prentout/google-meet-gemini-to-notebooklm');
  githubLink.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  githubLink.setFontSize(8);
  githubLink.setAttributes({[DocumentApp.Attribute.FOREGROUND_COLOR]: '#70757a'});
  
  doc.saveAndClose();
}

/**
 * Displays a help dialog with instructions.
 */
function showHelp() {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 15px; color: #3c4043; line-height: 1.5;">
      <h2 style="color: #1a73e8; margin-top: 0;">🚀 NotebookLM Sync Help</h2>
      <p>This tool consolidates <b>Google Meet "Notes by Gemini"</b> into this document to create a powerful source for NotebookLM.</p>
      
      <div style="background: #f8f9fa; border-radius: 8px; padding: 12px; margin-bottom: 15px;">
        <div style="margin-bottom: 8px;"><b>🔄 Sync Now:</b> Manually fetch the latest meeting notes. This also acts as the <b>authorization</b> step.</div>
        <div style="margin-bottom: 8px;"><b>📜 View History:</b> Check the status of recent sync operations.</div>
        <div style="margin-bottom: 8px;"><b>📦 Archive:</b> Safely move current content to an archive file when it gets too large.</div>
        <div style="margin-bottom: 0;"><b>🧹 Reset:</b> Clear the sync database to re-import all meetings from scratch.</div>
      </div>

      <p style="font-size: 0.9em;"><b>Pro Tip:</b> Add this document to a <a href="https://notebooklm.google.com" target="_blank">NotebookLM</a> notebook and remember to <b>Refresh</b> the source after syncing!</p>
      
      <div style="text-align: center; margin: 10px 0;">
        <a href="https://github.com/benoit-prentout/google-meet-gemini-to-notebooklm" target="_blank" style="color: #70757a; text-decoration: none; font-size: 0.8em; border-bottom: 1px solid #70757a;">View on GitHub</a>
      </div>

      <hr style="border: 0; border-top: 1px solid #e8eaed; margin: 15px 0;">
      <div style="font-size: 0.8em; color: #70757a; text-align: center;">v4.1 • MIT License</div>
    </div>
  `;
  const userInterface = HtmlService.createHtmlOutput(html)
    .setTitle('Help & Documentation')
    .setWidth(450)
    .setHeight(400);
  DocumentApp.getUi().showModelessDialog(userInterface, ' ');
}

// ─── MAIN SYNC LOGIC ──────────────────────────────────────────────────────────

/**
 * Main function to find, clean, and append new meeting notes.
 */
function appendMeetNotesToMaster() {
  const startTime = Date.now();
  const docId = DocumentApp.getActiveDocument().getId();
  const timezone = Session.getScriptTimeZone() || 'UTC';
  const props = PropertiesService.getScriptProperties();

  console.time('Total Sync');

  // 1. Identify files to process
  // Search in: 
  // - Local "Meet Recordings" folder
  // - OR shared files with specific naming conventions
  const folderId = getFolderIdByName_(CONFIG.SOURCE_FOLDER_NAME);
  
  let query = `mimeType = 'application/vnd.google-apps.document' and trashed = false`;
  let folderQuery = folderId ? `'${folderId}' in parents` : '';
  let nameQuery = `(name contains 'Notes de la réunion' or name contains 'Meeting notes' or name contains 'Notes for' or name contains 'Notes by Gemini' or name contains 'Notes par Gemini')`;
  
  if (folderQuery) {
    query += ` and (${folderQuery} or ${nameQuery})`;
  } else {
    query += ` and ${nameQuery}`;
  }

  if (CONFIG.MAX_AGE_DAYS > 0) {
    const cutoff = new Date(Date.now() - CONFIG.MAX_AGE_DAYS * 86400000).toISOString();
    query += ` and modifiedTime > '${cutoff}'`;
  }

  const result = apiCall_(() => Drive.Files.list({
    q: query,
    pageSize: 100, 
    fields: 'files(id, name, createdTime, modifiedTime)',
    orderBy: 'createdTime desc',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  }));

  if (!result.files || result.files.length === 0) {
    console.log('No meetings found.');
    showAlert_('Everything is already up to date!');
    return;
  }

  // 2. Filter already synced files (using PropertiesService)
  const toProcess = [];
  const updatedIds = [];
  
  for (const file of result.files) {
    const lastSyncTime = props.getProperty('SYNC_' + file.id);
    
    if (!lastSyncTime) {
      toProcess.push(file);
    } else if (CONFIG.ENABLE_UPDATE_DETECTION) {
      // Update detection: compare modification dates
      const modifiedDate = new Date(file.modifiedTime).getTime();
      const syncDate = parseInt(lastSyncTime, 10);
      const GRACE_MS = 5 * 60 * 1000; // 5 min grace period
      
      if (modifiedDate > syncDate + GRACE_MS) {
        toProcess.push(file);
        updatedIds.push(file.id);
      }
    }
    
    if (toProcess.length >= CONFIG.MAX_FILES_PER_RUN) break;
  }

  if (toProcess.length === 0) {
    console.log('All files are already synced.');
    showAlert_('Everything is already up to date!');
    return;
  }

  // 3. Check for auto-archiving
  if (CONFIG.ARCHIVE_THRESHOLD_CHARS > 0) {
    checkAndArchive_(docId, timezone);
  }

  // 4. Process files
  const filesToProcess = toProcess.reverse();
  const requests = [];
  const syncedEntries = [];
  const updatedNames = [];
  let errorCount = 0;

  for (const file of filesToProcess) {
    try {
      console.log(`Processing: ${file.name}`);
      const rawText = apiCall_(() => exportFileAsText_(file.id));

      const participants = extractParticipants_(rawText);
      const cleanText = cleanGeminiText_(rawText);
      const isUpdate = updatedIds.indexOf(file.id) !== -1;
      if (isUpdate) updatedNames.push(file.name);
      const dateStr = Utilities.formatDate(new Date(file.createdTime), timezone, 'yyyy-MM-dd');

      const blockText = buildBlock_(file.name, dateStr, participants, cleanText, isUpdate);
      
      requests.push({
        insertText: {
          location: { index: 1 },
          text: blockText,
        },
      });

      // Store sync state locally (modification timestamp)
      props.setProperty('SYNC_' + file.id, String(new Date(file.modifiedTime).getTime()));
      syncedEntries.push({ name: file.name, date: dateStr });

    } catch (e) {
      errorCount++;
      console.error(`Error on ${file.name}: ${e.message}\n${e.stack}`);
    }
  }

  // 5. Batch update the document
  if (requests.length > 0) {
    apiCall_(() => Docs.Documents.batchUpdate({ requests }, docId));
    updateDocSizeEstimate_(requests);
    
    try {
      updateSummaryTable_(docId, syncedEntries);
    } catch (e) {
      console.error(`Summary table update failed: ${e.message}`);
    }

    if (CONFIG.ENABLE_NOTIFICATIONS) {
      try {
        sendNotification_(syncedEntries.map(e => e.name), updatedIds.map(id => id), errorCount, `https://docs.google.com/document/d/${docId}/edit`);
      } catch (e) {
        console.error(`Notification failed: ${e.message}`);
      }
    }

    const duration = Date.now() - startTime;
    console.timeEnd('Total Sync');
    logSyncRun_({
      date: new Date().toISOString(),
      synced: syncedEntries.length,
      updated: updatedIds.length,
      errors: errorCount,
      duration,
      syncedNames: syncedEntries.map(e => e.name),
      updatedNames
    });
    props.setProperty('lastSync', String(Date.now()));

    const errorMsg = errorCount > 0 ? ` ⚠️ ${errorCount} error(s) — check Stackdriver logs.` : '';
    showAlert_(`✅ ${syncedEntries.length} meeting(s) added.${errorMsg}`);
  }
}

// ─── ARCHIVING ────────────────────────────────────────────────────────────────

/**
 * Manually triggers an archive of the current document.
 */
function forceArchive() {
  const ui = DocumentApp.getUi();
  if (ui.alert('Archive', 'Copy this document to an archive and clear the current content?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const docId = DocumentApp.getActiveDocument().getId();
  const timezone = Session.getScriptTimeZone() || 'UTC';
  checkAndArchive_(docId, timezone, true);
  showAlert_('✅ Archive created. The master document has been cleared.');
}

/**
 * Checks document size and archives if threshold is reached.
 */
function checkAndArchive_(docId, timezone, force) {
  const props = PropertiesService.getScriptProperties();
  const estimatedChars = parseInt(props.getProperty('estimatedChars') || '0', 10);
  
  // 1. Check for Monthly Archive
  let shouldArchive = false;
  let archiveReason = "";
  
  if (CONFIG.ENABLE_MONTHLY_ARCHIVE) {
    const now = new Date();
    const currentMonth = Utilities.formatDate(now, timezone, "yyyy-MM");
    const lastMonth = props.getProperty('lastArchiveMonth');
    
    if (lastMonth && lastMonth !== currentMonth) {
      shouldArchive = true;
      archiveReason = `Start of new month (${currentMonth})`;
    }
    props.setProperty('lastArchiveMonth', currentMonth);
  }

  // 2. Check for Size Archive
  if (!shouldArchive && CONFIG.ARCHIVE_THRESHOLD_CHARS > 0 && (force || estimatedChars >= CONFIG.ARCHIVE_THRESHOLD_CHARS)) {
    shouldArchive = true;
    archiveReason = `Size limit reached (~${estimatedChars} chars)`;
  }

  if (!shouldArchive) return;

  console.log(`📦 Archiving triggered. Reason: ${archiveReason}. Archiving...`);

  try {
    const dateStr = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd — HH'h'mm");

    const copy = apiCall_(() => Drive.Files.copy({ name: `Meeting Notes Archive — ${dateStr}` }, docId));
    const archiveUrl = `https://docs.google.com/document/d/${copy.id}/edit`;

    // Move to configured archive folder if set
    if (CONFIG.ARCHIVE_FOLDER_ID) {
      try {
        const archiveFolder = DriveApp.getFolderById(CONFIG.ARCHIVE_FOLDER_ID);
        const archiveDoc = DriveApp.getFileById(copy.id);
        archiveFolder.addFile(archiveDoc);
        DriveApp.removeFile(archiveDoc);
      } catch (e) {
        console.error(`Failed to move archive to folder: ${e.message}`);
      }
    }

    // Mark the archive as synced locally
    props.setProperty('SYNC_' + copy.id, String(Date.now()));

    const metaUrl = `https://docs.googleapis.com/v1/documents/${docId}?fields=body.content.endIndex`;
    const metaResp = UrlFetchApp.fetch(metaUrl, {
      headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
    });
    const metaData = JSON.parse(metaResp.getContentText());
    const content = metaData.body.content;
    const endIndex = content[content.length - 1].endIndex - 1;

    const clearRequests = [];
    if (endIndex > 1) {
      clearRequests.push({ deleteContentRange: { range: { startIndex: 1, endIndex } } });
    }
    clearRequests.push({
      insertText: { location: { index: 1 }, text: `[Meeting Notes Archive — ${dateStr} → ${archiveUrl} ]\n\n` },
    });
    apiCall_(() => Docs.Documents.batchUpdate({ requests: clearRequests }, docId));

    props.setProperty('estimatedChars', '0');
    console.log(`✅ Archived: Meeting Notes Archive — ${dateStr} (${archiveUrl})`);

    // Send email notification for the archive
    try {
      const email = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
      if (email) {
        MailApp.sendEmail(
          email,
          `📦 Document Archived — NotebookLM Sync`,
          `The master document reached its size limit and has been archived.\n\n` +
          `Archive Name: Meeting Notes Archive — ${dateStr}\n` +
          `Archive Link: ${archiveUrl}\n\n` +
          `The master document has been cleared and is ready for new meetings.`
        );
      }
    } catch (e) {
      console.error(`Archive notification failed: ${e.message}`);
    }

  } catch (e) {
    console.error(`Archiving failed: ${e.message}`);
  }
}

/**
 * Updates the estimated document size based on inserted text.
 */
function updateDocSizeEstimate_(requests) {
  const props = PropertiesService.getScriptProperties();
  const current = parseInt(props.getProperty('estimatedChars') || '0', 10);
  const added = requests.reduce((sum, r) => sum + (r.insertText ? r.insertText.text.length : 0), 0);
  props.setProperty('estimatedChars', String(current + added));
}

// ─── RESET ────────────────────────────────────────────────────────────────────

/**
 * Resets the local sync database to allow re-importing all meetings.
 */
function resetSyncProperties() {
  const ui = DocumentApp.getUi();
  const response = ui.alert(
    'Confirmation',
    'Do you want to re-import everything?\nAll past meeting notes will be re-synced.',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;

  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  
  for (const key in allProps) {
    if (key.indexOf('SYNC_') === 0) {
      props.deleteProperty(key);
    }
  }

  props.deleteProperty('estimatedChars');
  ui.alert('🔄 Ready for re-importation.');
}

// ─── HISTORY ──────────────────────────────────────────────────────────────────

/**
 * Shows the history of recent sync operations.
 */
function showSyncHistory() {
  const props = PropertiesService.getScriptProperties();
  const history = JSON.parse(props.getProperty('syncHistory') || '[]');

  if (history.length === 0) {
    showAlert_('No sync history available.');
    return;
  }

  const lines = history.map(run => {
    const d = new Date(run.date).toLocaleString();
    const dur = run.duration != null ? `${(run.duration / 1000).toFixed(1)}s` : 'n/a';
    return `${d}  |  +${run.synced} new  |  ↻${run.updated} updates  |  ⚠️${run.errors} errors  |  ⏱${dur}`;
  });

  showAlert_(`Sync History (latest ${history.length} runs):\n\n${lines.join('\n')}`);
}

/**
 * Logs a sync run to the internal history.
 */
function logSyncRun_(run) {
  try {
    const props = PropertiesService.getScriptProperties();
    const history = JSON.parse(props.getProperty('syncHistory') || '[]');
    history.unshift(run);
    if (history.length > CONFIG.HISTORY_SIZE) history.length = CONFIG.HISTORY_SIZE;
    props.setProperty('syncHistory', JSON.stringify(history));
  } catch (e) {
    console.error(`logSyncRun_ failed: ${e.message}`);
  }
}

// ─── SUMMARY TABLE ────────────────────────────────────────────────────────────

/**
 * Updates the summary table at the top of the document.
 */
function updateSummaryTable_(docId, newEntries) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  
  let table = body.getTables()[0];
  
  if (!table) {
    table = body.insertTable(0, [['Date', 'Meeting Name']]);
    table.getRow(0).setAttributes({
      [DocumentApp.Attribute.BOLD]: true,
      [DocumentApp.Attribute.BACKGROUND_COLOR]: '#f3f3f3'
    });
    body.insertParagraph(1, '');
  }
  
  const entries = [...newEntries];
  for (const entry of entries) {
    const row = table.insertTableRow(1);
    row.appendTableCell(entry.date);
    row.appendTableCell(entry.name);
  }
  
  doc.saveAndClose();
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Finds a folder ID by its name.
 */
function getFolderIdByName_(name) {
  const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const res = apiCall_(() => Drive.Files.list({
    q: `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
  }));
  return res.files && res.files.length > 0 ? res.files[0].id : null;
}

/**
 * Extracts participant names from raw text.
 */
function extractParticipants_(text) {
  const match = text.match(/(?:Participants|Attendees|Présents)\s*:\s*([^\n]*)(\n(?!\n)[^\n]+)*/i);
  if (!match) return null;

  const raw = match[0].replace(/(?:Participants|Attendees|Présents)\s*:\s*/i, '');

  const entries = raw.split(/[\n,;]+/)
    .map(s => s
      .replace(/<[^>]+>/g, '')
      .replace(/\([^)]*@[^)]*\)/g, '')
      .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, '')
      .replace(/^[-•*]\s*/, '')
      .trim()
    )
    .filter(s => s.length > 0);

  return entries.length > 0 ? entries.join(', ') : null;
}

/**
 * Cleans Gemini notes text by removing metadata and simplifying formatting.
 */
function cleanGeminiText_(text) {
  return text
    .replace(/(?:Participants|Attendees|Présents)\s*:.*?(?=\n\n|\n[A-Z]|$)/is, '')
    .replace(/Notes\s+(?:par|by|generated by)\s+Gemini[^\n]*/gi, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Builds the text block for a meeting.
 */
function buildBlock_(name, dateStr, participants, cleanText, isUpdate) {
  const updateTag = isUpdate ? ' [UPDATED]' : '';
  const participantsLine = participants ? `👥 Participants: ${participants}\n` : '';
  return `\n\n${name}${updateTag}\n📅 Date: ${dateStr}\n${participantsLine}${'─'.repeat(58)}\n${cleanText}\n`;
}

/**
 * Sends an email notification after sync.
 */
function sendNotification_(newMeetings, updatedMeetings, errorCount, url) {
  const email = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  if (!email) return;

  const parts = [];
  if (newMeetings.length > 0) parts.push(`New meetings:\n- ${newMeetings.join('\n- ')}`);
  if (updatedMeetings.length > 0) parts.push(`Updates:\n- ${updatedMeetings.join('\n- ')}`);
  if (errorCount > 0) parts.push(`⚠️ ${errorCount} file(s) failed — check Stackdriver logs.`);

  MailApp.sendEmail(
    email,
    `✅ NotebookLM Sync Status (${newMeetings.length + updatedMeetings.length} meetings)`,
    `${parts.join('\n\n')}\n\nDocument: ${url}`
  );
}

/**
 * Displays a simple UI alert.
 */
function showAlert_(msg) {
  try { DocumentApp.getUi().alert(msg); } catch (e) {}
}

/**
 * Exports a Drive file as plain text.
 */
function exportFileAsText_(fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text%2Fplain`;
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) {
    throw new Error(`Export failed (${response.getResponseCode()}): ${response.getContentText().slice(0, 200)}`);
  }
  return response.getContentText();
}

/**
 * Helper to call APIs with automatic retries.
 */
function apiCall_(fn) {
  let lastError;
  for (let attempt = 0; attempt < CONFIG.MAX_RETRIES; attempt++) {
    try {
      return fn();
    } catch (e) {
      lastError = e;
      if (attempt < CONFIG.MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * 500;
        console.warn(`API error (attempt ${attempt + 1}/${CONFIG.MAX_RETRIES}): ${e.message}. Retrying in ${delay}ms`);
        Utilities.sleep(delay);
      }
    }
  }
  throw lastError;
}
