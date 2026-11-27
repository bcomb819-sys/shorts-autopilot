// Zero-cost instant phone alert bot — fires automatically the second a Short goes live!
// Supports:
//  1. ntfy.sh (100% free, zero signup, instant phone push notification with clickable YouTube Short link!)
//  2. CallMeBot WhatsApp (optional if CALLMEBOT_API_KEY is set)
//  3. Telegram Bot (optional if TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are set)
import { addLog, getState } from './store.js';

export async function sendUploadNotification({ title, styleName, youtubeUrl, jobId = null, customText = null }) {
  const st = getState();
  const ntfyTopic = (process.env.NTFY_TOPIC || st.settings.ntfyTopic || 'storybyte-boss-701927').trim();
  const waPhone = (process.env.WHATSAPP_PHONE || st.settings.whatsappPhone || '+917019192787').trim();
  const waKey = (process.env.CALLMEBOT_API_KEY || st.settings.callmebotApiKey || '').trim();
  const tgToken = (process.env.TELEGRAM_BOT_TOKEN || st.settings.telegramBotToken || '').trim();
  const tgChat = (process.env.TELEGRAM_CHAT_ID || st.settings.telegramChatId || '').trim();

  const text = customText || `Heyyy boss! I have posted the video, look at it:\n${title}${styleName ? ` (${styleName})` : ''}\n${youtubeUrl || ''}`.trim();
  const results = [];

  // 1. Instant Phone Push Notification via ntfy.sh (FREE, zero signup, works 24/7 from GitHub Cloud & Local App)
  if (ntfyTopic) {
    try {
      const headers = {
        Title: 'Heyyy boss! Video Posted',
        Priority: '4',
        Tags: 'clapper,fire',
      };
      if (youtubeUrl) {
        headers.Click = youtubeUrl;
        headers.Actions = `view, Watch Short, ${youtubeUrl}`;
      }
      const res = await fetch(`https://ntfy.sh/${encodeURIComponent(ntfyTopic)}`, {
        method: 'POST',
        headers,
        body: text,
      });
      if (res.ok) {
        results.push(`ntfy:${ntfyTopic}`);
        addLog('INFO', `Sent phone alert via ntfy (${ntfyTopic})`, jobId);
      } else {
        addLog('WARN', `ntfy alert returned HTTP ${res.status}`, jobId);
      }
    } catch (err) {
      addLog('WARN', `ntfy alert failed: ${err.message}`, jobId);
    }
  }

  // 2. Optional CallMeBot WhatsApp message
  if (waPhone && waKey) {
    try {
      const cleanPhone = waPhone.replace(/[^\d+]/g, '');
      const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(cleanPhone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(waKey)}`;
      const res = await fetch(url);
      if (res.ok) {
        results.push('whatsapp');
        addLog('INFO', `Sent WhatsApp alert to ${cleanPhone}`, jobId);
      } else {
        addLog('WARN', `WhatsApp alert returned HTTP ${res.status}`, jobId);
      }
    } catch (err) {
      addLog('WARN', `WhatsApp alert failed: ${err.message}`, jobId);
    }
  }

  // 3. Optional Telegram Bot message
  if (tgToken && tgChat) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(tgToken)}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChat, text }),
      });
      if (res.ok) {
        results.push('telegram');
        addLog('INFO', `Sent Telegram alert`, jobId);
      } else {
        addLog('WARN', `Telegram alert returned HTTP ${res.status}`, jobId);
      }
    } catch (err) {
      addLog('WARN', `Telegram alert failed: ${err.message}`, jobId);
    }
  }

  return { sent: results, ntfyTopic, text };
}
