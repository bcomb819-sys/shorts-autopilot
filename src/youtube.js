// Official YouTube Data API v3 Multi-Account OAuth 2.0 + Resumable Video & Custom Thumbnail Upload
import fs from 'node:fs';
import { PORT } from './config.js';
import { addLog, getAccount, getAccounts, getActiveAccount, getState, upsertAccount } from './store.js';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'openid',
  'email',
  'profile',
].join(' ');

export function redirectUri() {
  return `http://127.0.0.1:${PORT}/api/youtube/callback`;
}

export function isYouTubeConnected() {
  const yt = getState().youtube;
  const active = getActiveAccount();
  return Boolean(yt.clientId && yt.clientSecret && active?.refreshToken);
}

export function getAuthUrl() {
  const yt = getState().youtube;
  if (!yt.clientId || !yt.clientSecret) {
    throw new Error('Save your Google Cloud OAuth Client ID and Client Secret first.');
  }
  const params = new URLSearchParams({
    client_id: yt.clientId.trim(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'select_account consent',
    include_granted_scopes: 'true',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function fetchGoogleProfile(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return {};
    const d = await res.json();
    return { email: d.email || '', name: d.name || '', picture: d.picture || '' };
  } catch {
    return {};
  }
}

async function fetchYouTubeChannel(accessToken) {
  try {
    const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      const urlMatch = msg.match(/https:\/\/[^\s)]+/);
      return {
        ok: false,
        apiWarning: msg,
        enableUrl: urlMatch ? urlMatch[0] : 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
      };
    }
    const item = data.items?.[0];
    if (!item) {
      return {
        ok: false,
        apiWarning: 'This Google account has no YouTube channel yet. Open youtube.com, create a channel, then click Refresh.',
        enableUrl: 'https://www.youtube.com/create_channel',
      };
    }
    return {
      ok: true,
      channelId: item.id,
      channelTitle: item.snippet?.title || 'My YouTube Channel',
      channelHandle: item.snippet?.customUrl || '',
      channelThumb: item.snippet?.thumbnails?.default?.url || '',
      apiWarning: '',
      enableUrl: '',
    };
  } catch (err) {
    return { ok: false, apiWarning: err.message, enableUrl: '' };
  }
}

export async function exchangeCode(code) {
  const yt = getState().youtube;
  const body = new URLSearchParams({
    code,
    client_id: yt.clientId.trim(),
    client_secret: yt.clientSecret.trim(),
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`OAuth token exchange failed: ${data.error_description || data.error || res.status}`);
  }

  const accessToken = data.access_token;
  const tokenExpiry = Date.now() + (data.expires_in || 3500) * 1000;
  const profile = await fetchGoogleProfile(accessToken);
  const chan = await fetchYouTubeChannel(accessToken);

  const saved = upsertAccount({
    email: profile.email || '',
    name: profile.name || '',
    picture: profile.picture || '',
    channelId: chan.channelId || '',
    channelTitle: chan.channelTitle || '',
    channelHandle: chan.channelHandle || '',
    channelThumb: chan.channelThumb || '',
    label: chan.channelTitle || profile.name || profile.email || `Account ${getAccounts().length + 1}`,
    refreshToken: data.refresh_token || '',
    accessToken,
    tokenExpiry,
    apiWarning: chan.apiWarning || '',
    enableUrl: chan.enableUrl || '',
    connectedAt: new Date().toISOString(),
  });

  if (chan.apiWarning) {
    addLog('WARN', `Added account (${saved.email || saved.label}), but YouTube API needs action: ${chan.apiWarning}`);
  } else {
    addLog('INFO', `YouTube account connected & active: ${saved.channelTitle} (${saved.email || saved.channelId})`);
  }
  return saved;
}

export async function getAccessToken(accountId = null) {
  const yt = getState().youtube;
  const acct = accountId ? getAccount(accountId) : getActiveAccount();
  if (!acct || !acct.refreshToken) {
    throw new Error('No YouTube account connected. Click "+ Add YouTube Account" in the dashboard.');
  }
  if (acct.accessToken && acct.tokenExpiry > Date.now() + 60_000) return acct.accessToken;

  const body = new URLSearchParams({
    client_id: yt.clientId.trim(),
    client_secret: yt.clientSecret.trim(),
    refresh_token: acct.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`YouTube token refresh failed: ${data.error_description || data.error || res.status}`);
  }
  upsertAccount({
    id: acct.id,
    accessToken: data.access_token,
    tokenExpiry: Date.now() + (data.expires_in || 3500) * 1000,
  });
  return data.access_token;
}

export async function refreshAccountInfo(accountId = null) {
  const acct = accountId ? getAccount(accountId) : getActiveAccount();
  if (!acct) throw new Error('Account not found');
  const token = await getAccessToken(acct.id);
  const profile = await fetchGoogleProfile(token);
  const chan = await fetchYouTubeChannel(token);
  const updated = upsertAccount({
    id: acct.id,
    email: profile.email || acct.email,
    name: profile.name || acct.name,
    picture: profile.picture || acct.picture,
    channelId: chan.channelId || acct.channelId,
    channelTitle: chan.channelTitle || acct.channelTitle,
    channelHandle: chan.channelHandle || acct.channelHandle,
    channelThumb: chan.channelThumb || acct.channelThumb,
    label: chan.channelTitle || profile.name || profile.email || acct.label,
    apiWarning: chan.apiWarning || '',
    enableUrl: chan.enableUrl || '',
  });
  addLog(chan.apiWarning ? 'WARN' : 'INFO', chan.apiWarning
    ? `Account ${updated.label}: ${chan.apiWarning}`
    : `Refreshed YouTube channel: ${updated.channelTitle} (${updated.email || updated.channelId})`);
  return updated;
}

async function waitForYouTubeProcessing(videoId, token, maxWaitMs = 120_000) {
  const start = Date.now();
  // Give YouTube a brief head-start before first poll
  await new Promise((r) => setTimeout(r, 6000));
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=processingDetails,status&id=${encodeURIComponent(videoId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        const item = data?.items?.[0];
        const pStatus = item?.processingDetails?.processingStatus;
        const uStatus = item?.status?.uploadStatus;
        if (pStatus === 'succeeded' || uStatus === 'processed') {
          return { ready: true, status: pStatus || uStatus };
        }
        if (pStatus === 'failed' || uStatus === 'failed' || uStatus === 'rejected') {
          return { ready: false, status: pStatus || uStatus };
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 6000));
  }
  return { ready: false, status: 'timeout' };
}

/**
 * Hands-free resumable upload to YouTube Shorts (Data API v3).
 * Ensures Shorts-only classification & vertical custom thumbnail:
 *  - Appends #Shorts to Title and Description
 *  - Waits for YouTube processing to finish before calling thumbnails.set with 9:16 vertical cover.jpg
 */
export async function uploadShort({ videoPath, thumbnailPath = null, title, description, tags = [], categoryId = '27', privacyStatus = 'public', publishAt = null, accountId = null }) {
  const token = await getAccessToken(accountId);
  const stat = fs.statSync(videoPath);
  const baseTitle = String(title || 'Amazing True Story').replace(/\s*#shorts\b/gi, '').trim().slice(0, 90);
  const safeTitle = `${baseTitle} #Shorts`;
  const cleanDesc = String(description || baseTitle).trim();
  const fullDesc = /#shorts\b/i.test(cleanDesc) ? cleanDesc : `${cleanDesc}\n\n#Shorts`;
  const cleanTags = [...new Set(['shorts', 'youtubeshorts', ...tags.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean)])].slice(0, 12);

  const statusObj = {
    privacyStatus: publishAt ? 'private' : (privacyStatus || 'public'),
    selfDeclaredMadeForKids: false,
    embeddable: true,
  };
  if (publishAt) statusObj.publishAt = publishAt;

  const metadata = {
    snippet: {
      title: safeTitle,
      description: fullDesc.slice(0, 4900),
      tags: cleanTags,
      categoryId: String(categoryId || '27'),
      defaultLanguage: 'en',
    },
    status: statusObj,
  };

  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(stat.size),
        'X-Upload-Content-Type': 'video/mp4',
      },
      body: JSON.stringify(metadata),
    },
  );
  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`YouTube upload init failed (${initRes.status}): ${errText.slice(0, 320)}`);
  }
  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) throw new Error('YouTube did not return a resumable upload Location header.');

  const videoBytes = fs.readFileSync(videoPath);
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Length': String(videoBytes.length),
      'Content-Type': 'video/mp4',
    },
    body: videoBytes,
  });
  const uploaded = await putRes.json();
  if (!putRes.ok || !uploaded.id) {
    throw new Error(`YouTube video upload failed (${putRes.status}): ${JSON.stringify(uploaded).slice(0, 320)}`);
  }

  let thumbnailUploaded = false;
  let thumbnailNote = '';
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    try {
      // CRITICAL for YouTube Shorts: wait until processing succeeds so YouTube does not overwrite/ignore the custom thumbnail
      const proc = await waitForYouTubeProcessing(uploaded.id, token);
      const thumbBytes = fs.readFileSync(thumbnailPath);
      const tRes = await fetch(
        `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(uploaded.id)}&uploadType=media`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'image/jpeg',
            'Content-Length': String(thumbBytes.length),
          },
          body: thumbBytes,
        },
      );
      if (tRes.ok) {
        thumbnailUploaded = true;
        thumbnailNote = proc.ready ? 'Vertical 9:16 Shorts cover attached after processing' : `Vertical cover attached (status: ${proc.status})`;
      } else {
        const errBody = (await tRes.text()).slice(0, 180);
        thumbnailNote = tRes.status === 403
          ? `Thumbnail blocked (403 — verify phone number in YouTube Studio -> Settings -> Channel -> Feature eligibility): ${errBody}`
          : `Thumbnail skipped (${tRes.status}): ${errBody}`;
      }
    } catch (err) {
      thumbnailNote = `Thumbnail error: ${err.message}`;
    }
  }

  return {
    videoId: uploaded.id,
    url: `https://www.youtube.com/shorts/${uploaded.id}`,
    watchUrl: `https://www.youtube.com/watch?v=${uploaded.id}`,
    thumbnailUploaded,
    thumbnailNote,
  };
}

export function extractYouTubeId(input) {
  const s = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:shorts\/|youtu\.be\/|[?&]v=|video\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * Attach a vertical 9:16 (1080x1920) cover.jpg thumbnail to an already-uploaded YouTube Short (costs only 50 API units).
 */
export async function attachCoverThumbnail({ videoIdOrUrl, thumbnailPath, accountId = null }) {
  const videoId = extractYouTubeId(videoIdOrUrl);
  if (!videoId) throw new Error('Invalid YouTube Short URL or 11-character Video ID.');
  if (!thumbnailPath || !fs.existsSync(thumbnailPath)) throw new Error('Cover thumbnail file not found on disk.');
  const token = await getAccessToken(accountId);
  const proc = await waitForYouTubeProcessing(videoId, token, 90_000);
  const thumbBytes = fs.readFileSync(thumbnailPath);
  const tRes = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'image/jpeg',
        'Content-Length': String(thumbBytes.length),
      },
      body: thumbBytes,
    },
  );
  if (!tRes.ok) {
    const errBody = (await tRes.text()).slice(0, 220);
    throw new Error(`YouTube thumbnail upload failed (${tRes.status}): ${errBody}`);
  }
  return { videoId, url: `https://www.youtube.com/shorts/${videoId}`, processingStatus: proc.status };
}
