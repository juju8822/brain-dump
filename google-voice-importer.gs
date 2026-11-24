// Install in a private Google Apps Script project owned by the receiving inbox.
function importGoogleVoice() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const settings = PropertiesService.getScriptProperties();
    const sender = (settings.getProperty('VOICE_SENDER') || '').trim().toLowerCase();
    const url = (settings.getProperty('BRAIN_DUMP_URL') || '').trim().replace(/\/$/, '');
    const secret = settings.getProperty('BRAIN_DUMP_SECRET') || '';
    if (!/^[a-z0-9._+-]+@txt\.voice\.google\.com$/.test(sender) ||
        !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(url) || secret.length < 32) {
      throw new Error('Set VOICE_SENDER, BRAIN_DUMP_URL, and BRAIN_DUMP_SECRET in Script Properties.');
    }
    const query = 'from:(' + sender + ') newer_than:7d';
    for (let start = 0; ; start += 50) {
      const threads = GmailApp.search(query, start, 50);
      for (const messages of GmailApp.getMessagesForThreads(threads)) {
        for (const message of messages) {
          const from = message.getFrom();
          const address = (from.match(/<([^<>]+)>\s*$/)?.[1] || from).trim().toLowerCase();
          const id = message.getId();
          if (address !== sender || Date.now() - message.getDate().getTime() > 7 * 86400000 ||
              settings.getProperty('imported.' + id)) continue;
          const text = voiceText(message.getPlainBody());
          if (!text) continue;
          const response = UrlFetchApp.fetch(url + '/google-voice', {
            method: 'post',
            contentType: 'application/json',
            headers: { Authorization: 'Bearer ' + secret },
            payload: JSON.stringify({ id, text }),
            followRedirects: false,
            muteHttpExceptions: true
          });
          if (response.getResponseCode() !== 200 || JSON.parse(response.getContentText()).ok !== true) {
            throw new Error('Brain Dump rejected the import (HTTP ' + response.getResponseCode() + ').');
          }
          settings.setProperty('imported.' + id, String(message.getDate().getTime()));
        }
      }
      if (threads.length < 50) break;
    }
    for (const [key, value] of Object.entries(settings.getProperties())) {
      if (key.startsWith('imported.') && Date.now() - Number(value) > 8 * 86400000) {
        settings.deleteProperty(key);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function voiceText(body) {
  return body.replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*(?:[-_]{3,}[ \t]*\n[ \t]*)?(?:To respond to this text message,|YOUR ACCOUNT[ \t]*\|[ \t]*HELP CENTER)/i, 1)[0]
    .trim();
}
