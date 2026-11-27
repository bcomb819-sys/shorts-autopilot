let latestState = null;
let initializedForm = false;

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), 3600);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function fmtCountdown(iso) {
  if (!iso) return 'Autopilot paused';
  const diff = Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 1000));
  const h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60), s = diff % 60;
  return `Next Short in ${h > 0 ? `${h}h ` : ''}${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

function render(st) {
  latestState = st;
  const s = st.settings;

  // Top bar & Autopilot button
  const btn = $('autopilotBtn');
  if (s.autopilotEnabled) {
    btn.textContent = 'Pause Autopilot';
    btn.className = 'btn btn-danger btn-lg';
    $('countdownBox').textContent = st.busy ? 'Rendering Short right now...' : fmtCountdown(s.nextRunAt);
  } else {
    btn.textContent = 'Start Autopilot';
    btn.className = 'btn btn-green btn-lg';
    $('countdownBox').textContent = 'Autopilot paused';
  }

  // Metrics
  $('mToday').textContent = `${st.stats.generatedToday} / ${st.stats.postedToday} API · ${st.stats.manualPostedToday || 0} manual`;
  $('mLimit').textContent = `Daily cap: ${s.dailyLimit} · Queue: ${st.queueLength}`;
  if ($('manualBadge')) {
    const mp = st.stats.manualPostedToday || 0;
    $('manualBadge').textContent = `${mp} / 5 MANUAL TODAY`;
    $('manualBadge').className = 'badge ' + (mp >= 5 ? 'ok' : 'warn');
  }
  if ($('manualReadyHint')) {
    const rdy = st.stats.manualReadyCount || 0;
    $('manualReadyHint').textContent = `${rdy} rendered Short${rdy === 1 ? '' : 's'} ready on disk for YouTube Studio drag-and-drop`;
  }
  $('mCadence').textContent = s.intervalMinutes % 60 === 0
    ? `Every ${s.intervalMinutes / 60}h`
    : `Every ${s.intervalMinutes}m`;
  $('mApproval').textContent = s.autoPost ? 'Auto-post ON (no approval)' : 'Preview-only mode';

  const accounts = st.youtube.accounts || [];
  const activeAcct = accounts.find((a) => a.active) || accounts[0];
  $('mYt').textContent = activeAcct
    ? (activeAcct.channelTitle || activeAcct.email || activeAcct.label || 'Connected')
    : 'Not Connected';
  $('mQuota').textContent = `${st.stats.quotaUnitsUsed.toLocaleString()} / 10,000 free units today`;
  $('ytBadge').textContent = st.youtube.connected
    ? (activeAcct?.apiWarning ? 'ACTION NEEDED' : `${accounts.length} CONNECTED`)
    : 'DISCONNECTED';
  $('ytBadge').className = 'badge ' + (st.youtube.connected ? (activeAcct?.apiWarning ? 'err' : 'ok') : 'warn');
  $('redirectUriText').textContent = st.system.redirectUri;

  // Render YouTube Accounts Manager list
  const acctBox = $('accountsList');
  if (!accounts.length) {
    acctBox.innerHTML = '<div class="hint" style="padding:10px;background:var(--panel-2);border-radius:10px;border:1px dashed var(--border);">No YouTube accounts added yet. Save your OAuth Client ID &amp; Secret below, then click <strong>+ Add YouTube Account</strong>.</div>';
  } else {
    acctBox.innerHTML = accounts.map((a) => {
      const pic = a.channelThumb || a.picture;
      const avatar = pic
        ? `<img class="acct-avatar" src="${pic}" alt="" />`
        : `<div class="acct-avatar">${(a.channelTitle || a.email || a.label || 'Y').slice(0, 1).toUpperCase()}</div>`;
      const title = a.channelTitle || a.name || a.label || 'YouTube Account';
      const sub = [a.channelHandle, a.email, a.channelId ? `ID: ${a.channelId}` : ''].filter(Boolean).join(' · ') || 'Authenticated (click Refresh after enabling API)';
      const warnHtml = a.apiWarning
        ? `<div class="acct-warn"><span><strong>YouTube API needs enabling:</strong> ${a.apiWarning}</span>${a.enableUrl ? `<a href="${a.enableUrl}" target="_blank">Enable YouTube Data API v3 in Google Cloud ↗</a>` : ''}<span>Then click <strong>Refresh Channel</strong> below.</span></div>`
        : '';
      return `<div class="acct-card ${a.active ? 'active' : ''}">
        <div class="acct-top">
          ${avatar}
          <div class="acct-info">
            <div class="acct-name">${title}</div>
            <div class="acct-sub">${sub}</div>
          </div>
          <span class="badge ${a.active ? 'ok' : ''}">${a.active ? 'ACTIVE' : 'SAVED'}</span>
        </div>
        ${warnHtml}
        <div class="row row-tight">
          ${a.active ? '' : `<button class="btn btn-sm btn-green" onclick="activateAccount('${a.id}')">Set Active</button>`}
          <button class="btn btn-sm btn-ghost" onclick="refreshAccount('${a.id}')">Refresh Channel</button>
          <button class="btn btn-sm btn-danger" onclick="removeAccount('${a.id}')">Remove</button>
        </div>
      </div>`;
    }).join('');
  }

  // Ollama & Bank
  if (st.ollama.running) {
    $('mOllama').textContent = `Ollama (${st.ollama.models.length} models)`;
    $('ollamaBadge').textContent = 'ONLINE';
    $('ollamaBadge').className = 'badge ok';
    const dl = $('ollamaModelsList');
    dl.innerHTML = st.ollama.models.map((m) => `<option value="${m}"></option>`).join('');
  } else {
    $('mOllama').textContent = 'Offline Bank Active';
    $('ollamaBadge').textContent = 'OLLAMA OFFLINE (FALLBACK READY)';
    $('ollamaBadge').className = 'badge warn';
  }
  $('mBank').textContent = `Bank: ${st.bank.remaining}/${st.bank.total} left · ${st.stats.totalUniqueUsed || 0} unique retired`;

  $('busyBadge').textContent = st.busy ? 'GENERATING...' : 'IDLE';
  $('busyBadge').className = 'badge ' + (st.busy ? 'warn' : 'ok');
  $('queueInfo').textContent = `Queue: ${st.queueLength} · Total: ${st.jobs.length}`;

  // Hydrate form inputs once
  if (!initializedForm) {
    initializedForm = true;
    $('intervalMinutes').value = s.intervalMinutes;
    $('dailyLimit').value = s.dailyLimit;
    $('privacyStatus').value = s.privacyStatus;
    $('draftMode').value = String(Boolean(s.draftMode));
    $('autoPost').checked = Boolean(s.autoPost);
    $('uploadThumbnail').checked = Boolean(s.uploadThumbnail);
    $('ollamaUrl').value = s.ollamaUrl;
    $('ollamaModel').value = s.ollamaModel;
    $('geminiApiKey').value = s.geminiApiKey || '';
    $('geminiModel').value = s.geminiModel || 'gemini-flash-lite-latest';
    $('storySource').value = s.storySource === 'hybrid' ? 'auto' : (s.storySource || 'auto');
    $('nicheTopics').value = s.nicheTopics;
    $('ytClientId').value = st.youtube.clientId || '';
    if (st.youtube.hasCredentials && (st.youtube.accounts || []).length > 0) {
      $('credsPanel').classList.add('hidden');
    }

    const sel = $('runStyle');
    const checks = $('styleChecks');
    sel.innerHTML = '<option value="">Auto-Rotate (All Enabled Styles)</option>';
    checks.innerHTML = '';
    st.styles.forEach((sty) => {
      const opt = document.createElement('option');
      opt.value = sty.id; opt.textContent = sty.name;
      sel.appendChild(opt);

      const lbl = document.createElement('label');
      lbl.className = 'style-item';
      const checked = s.enabledStyles.includes(sty.id) ? 'checked' : '';
      lbl.innerHTML = `<input type="checkbox" value="${sty.id}" ${checked} /><span>${sty.name}</span>`;
      checks.appendChild(lbl);
    });
  }

  // Jobs list
  const list = $('jobsList');
  if (!st.jobs.length) {
    list.innerHTML = '<div class="empty">No Shorts generated yet. Click <strong>Preview Only</strong> or <strong>Generate &amp; Auto-Post</strong> to create your first clip!</div>';
  } else {
    list.innerHTML = st.jobs.map((j) => {
      const badgeCls = j.status === 'posted' || j.status === 'completed' || j.status === 'manual_posted' ? 'ok'
        : j.status === 'failed' ? 'err' : 'warn';
      const mediaHtml = j.videoPath
        ? `<video src="/media/${j.id}/video.mp4" poster="${j.coverPath ? `/media/${j.id}/cover.jpg` : ''}" controls preload="metadata"></video>`
        : j.coverPath
          ? `<img src="/media/${j.id}/cover.jpg" alt="cover" />`
          : `<div style="width:126px;aspect-ratio:9/16;background:#0a0d16;border-radius:10px;display:grid;place-items:center;font-size:11px;color:#8892b0;padding:8px;text-align:center;">${j.stage || j.status}</div>`;
      const ytLink = j.youtubeUrl
        ? `<a class="btn btn-sm btn-green" href="${j.youtubeUrl}" target="_blank">Open YouTube Short ↗</a>`
        : j.videoPath && st.youtube.connected && j.status !== 'uploading'
          ? `<button class="btn btn-sm btn-primary" onclick="uploadOne('${j.id}')">API Upload Now</button>`
          : '';
      const manualKit = j.videoPath
        ? `<a class="btn btn-sm btn-accent" href="/media/${j.id}/download">⬇ MP4</a>`
          + (j.coverPath ? `<a class="btn btn-sm btn-ghost" href="/media/${j.id}/download-cover">⬇ Cover</a>` : '')
          + `<button class="btn btn-sm btn-ghost" onclick="copyJobField('${j.id}','title')">Copy Title</button>`
          + `<button class="btn btn-sm btn-ghost" onclick="copyJobField('${j.id}','desc')">Copy Desc</button>`
          + `<button class="btn btn-sm btn-ghost" onclick="copyJobField('${j.id}','tags')">Copy Tags</button>`
          + `<button class="btn btn-sm btn-ghost" onclick="openJobFolder('${j.id}')">Open Folder</button>`
          + (!j.youtubeUrl ? `<button class="btn btn-sm ${j.status === 'manual_posted' ? 'btn-green' : 'btn-ghost'}" onclick="markManualPosted('${j.id}')">${j.status === 'manual_posted' ? '✓ Manual Posted' : 'Mark Manual Posted'}</button>` : '')
        : '';
      const tagsText = (j.tags || []).map((t) => `#${t}`).join(' ');
      return `<div class="job-card">
        <div class="job-media">${mediaHtml}</div>
        <div class="job-body">
          <div class="job-meta">
            <span class="badge ${badgeCls}">${(j.status || '').replace('_', ' ').toUpperCase()}</span>
            <span>${j.styleName || j.style}</span>
            ${j.generatedBy ? `<span>· ${j.generatedBy}</span>` : ''}
            ${j.durationSec ? `<span>· ${j.durationSec.toFixed(1)}s · ${j.sizeMb} MB</span>` : ''}
          </div>
          <div class="job-title">${j.title || 'Generating story...'}</div>
          <div class="hint">${j.stage || ''}${j.error ? ` — <span style="color:var(--red)">${j.error}</span>` : ''}</div>
          ${j.description ? `<div class="job-desc">${j.description}</div>` : ''}
          ${tagsText ? `<div class="job-tags">${tagsText}</div>` : ''}
          <div class="job-actions">${manualKit}${ytLink}</div>
        </div>
      </div>`;
    }).join('');
  }

  // Logs
  $('logsBox').innerHTML = st.logs.map((l) => {
    const tm = (l.ts || '').slice(11, 19);
    return `<div class="log-line ${l.level}">[${tm}] [${l.level}] ${l.message}</div>`;
  }).join('');
}

async function refresh() {
  try {
    const st = await api('/api/state');
    render(st);
  } catch (err) {
    console.error(err);
  }
}

function collectSettings() {
  const enabledStyles = [...document.querySelectorAll('#styleChecks input:checked')].map((el) => el.value);
  return {
    intervalMinutes: Number($('intervalMinutes').value) || 120,
    dailyLimit: Number($('dailyLimit').value) || 12,
    privacyStatus: $('privacyStatus').value,
    draftMode: $('draftMode').value === 'true',
    autoPost: $('autoPost').checked,
    requireApproval: !$('autoPost').checked,
    uploadThumbnail: $('uploadThumbnail').checked,
    enabledStyles: enabledStyles.length ? enabledStyles : ['tall-tale'],
    ollamaUrl: $('ollamaUrl').value,
    ollamaModel: $('ollamaModel').value,
    geminiApiKey: $('geminiApiKey').value.trim(),
    geminiModel: $('geminiModel').value.trim() || 'gemini-flash-lite-latest',
    storySource: $('storySource').value,
    nicheTopics: $('nicheTopics').value,
  };
}

$('saveSettingsBtn').onclick = async () => {
  try {
    await api('/api/settings', { method: 'POST', body: collectSettings() });
    toast('Settings saved!');
    refresh();
  } catch (err) { toast('Error: ' + err.message); }
};

$('autopilotBtn').onclick = async () => {
  const next = !(latestState?.settings?.autopilotEnabled);
  try {
    await api('/api/settings', { method: 'POST', body: { ...collectSettings(), autopilotEnabled: next } });
    toast(next ? 'Autopilot STARTED! First Short starts in 5s.' : 'Autopilot paused.');
    refresh();
  } catch (err) { toast('Error: ' + err.message); }
};

document.querySelectorAll('.chip').forEach((ch) => {
  ch.onclick = async () => {
    $('intervalMinutes').value = ch.dataset.interval;
    $('dailyLimit').value = ch.dataset.limit;
    await api('/api/settings', { method: 'POST', body: collectSettings() });
    toast(`Preset applied: ${ch.textContent}`);
    refresh();
  };
});

$('runNowBtn').onclick = async () => {
  try {
    await api('/api/jobs/run', { method: 'POST', body: { style: $('runStyle').value || null, upload: true } });
    toast('Queued 1 Short for generation + hands-free auto-upload!');
    refresh();
  } catch (err) { toast('Error: ' + err.message); }
};

$('previewBtn').onclick = async () => {
  try {
    await api('/api/jobs/run', { method: 'POST', body: { style: $('runStyle').value || null, upload: false } });
    toast('Queued 1 Short (local preview only, no upload).');
    refresh();
  } catch (err) { toast('Error: ' + err.message); }
};

$('batch3Btn').onclick = async () => {
  await api('/api/jobs/batch', { method: 'POST', body: { count: 3, upload: true } });
  toast('Queued 3 unique Shorts!');
  refresh();
};

$('sched6Btn').onclick = async () => {
  try {
    const mins = Number($('intervalMinutes').value) || 120;
    const res = await api('/api/jobs/schedule-batch', { method: 'POST', body: { count: 6, intervalMinutes: mins } });
    toast(`Queued ${res.count} unique Shorts scheduled on YouTube every ${mins}m — they will post even when your laptop is OFF!`);
    refresh();
  } catch (err) { toast('Error: ' + err.message); }
};

$('copyEnvBtn').onclick = async () => {
  try {
    const { envText } = await api('/api/youtube/export-env');
    await navigator.clipboard.writeText(envText);
    toast('Copied all Cloud .env secrets to clipboard!');
  } catch (err) { toast('Copy failed: ' + err.message); }
};

document.querySelectorAll('.copy-key-btn').forEach((btn) => {
  btn.onclick = async () => {
    try {
      const key = btn.dataset.key;
      const { envText } = await api('/api/youtube/export-env');
      const line = envText.split('\n').find((l) => l.startsWith(key + '='));
      const val = line ? line.slice(key.length + 1).trim() : '';
      if (!val) return toast(`${key} is empty! Save it in the dashboard first.`);
      await navigator.clipboard.writeText(val);
      toast(`Copied ${key}! Now paste it in GitHub's "Secret" box.`);
    } catch (err) { toast('Copy failed: ' + err.message); }
  };
});

$('toggleCredsBtn').onclick = () => {
  $('credsPanel').classList.toggle('hidden');
};

$('saveCredsBtn').onclick = async () => {
  try {
    const clientId = $('ytClientId').value.trim();
    const clientSecret = $('ytClientSecret').value.trim();
    if (!clientId || !clientSecret) return toast('Enter both Client ID and Client Secret first.');
    await api('/api/youtube/credentials', { method: 'POST', body: { clientId, clientSecret } });
    toast('OAuth credentials saved! Now click + Add YouTube Account.');
    refresh();
  } catch (err) { toast('Error: ' + err.message); }
};

$('addAccountBtn').onclick = async () => {
  try {
    const clientId = $('ytClientId').value.trim();
    const clientSecret = $('ytClientSecret').value.trim();
    if (clientId && clientSecret) {
      await api('/api/youtube/credentials', { method: 'POST', body: { clientId, clientSecret } });
    }
    const { url } = await api('/api/youtube/auth-url');
    window.location.href = url;
  } catch (err) {
    $('credsPanel').classList.remove('hidden');
    toast('Error: ' + err.message);
  }
};

window.activateAccount = async (id) => {
  try {
    await api(`/api/youtube/accounts/${encodeURIComponent(id)}/activate`, { method: 'POST' });
    toast('Switched active YouTube account!');
    refresh();
  } catch (err) { toast('Error: ' + err.message); }
};

window.refreshAccount = async (id) => {
  try {
    toast('Checking YouTube channel info...');
    const res = await api(`/api/youtube/accounts/${encodeURIComponent(id)}/refresh`, { method: 'POST' });
    if (res.account?.apiWarning) toast('API action needed: check the warning link on the account card.');
    else toast(`Connected channel: ${res.account?.channelTitle || 'OK'}`);
    refresh();
  } catch (err) { toast('Refresh failed: ' + err.message); }
};

window.removeAccount = async (id) => {
  try {
    await api(`/api/youtube/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    toast('YouTube account removed.');
    refresh();
  } catch (err) { toast('Error: ' + err.message); }
};

$('manual1Btn').onclick = async () => {
  try {
    await api('/api/jobs/run', { method: 'POST', body: { style: $('runStyle').value || null, upload: false } });
    toast('Generating 1 Full HD Short for manual upload (0 API quota)!');
    refresh();
  } catch (err) { toast('Error: ' + err.message); }
};

$('manual5Btn').onclick = async () => {
  try {
    await api('/api/jobs/batch', { method: 'POST', body: { count: 5, upload: false } });
    toast('Queued 5 unique Shorts for manual upload (0 API quota)! They will appear on the right as each finishes.');
    refresh();
  } catch (err) { toast('Error: ' + err.message); }
};

$('openStudioBtn').onclick = () => {
  const chId = latestState?.youtube?.channelId;
  const url = chId
    ? `https://studio.youtube.com/channel/${encodeURIComponent(chId)}/videos/upload?d=ud`
    : 'https://studio.youtube.com/';
  window.open(url, '_blank');
};

window.copyJobField = async (id, field) => {
  const j = (latestState?.jobs || []).find((x) => x.id === id);
  if (!j) return;
  let text = '';
  if (field === 'title') {
    const base = String(j.title || '').replace(/\s*#shorts\b/gi, '').trim().slice(0, 90);
    text = `${base} #Shorts`;
  } else if (field === 'desc') {
    const d = String(j.description || j.title || '').trim();
    text = /#shorts\b/i.test(d) ? d : `${d}\n\n#Shorts`;
  } else if (field === 'tags') {
    text = [...new Set(['shorts', 'youtubeshorts', ...(j.tags || [])])].join(', ');
  }
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${field.toUpperCase()}! Ready to paste in YouTube Studio.`);
  } catch (err) { toast('Copy failed: ' + err.message); }
};

window.openJobFolder = async (id) => {
  try {
    await api(`/api/jobs/${encodeURIComponent(id)}/open-folder`, { method: 'POST' });
    toast('Opened folder in File Explorer — drag the MP4 into YouTube Studio!');
  } catch (err) { toast('Error: ' + err.message); }
};

window.markManualPosted = async (id) => {
  try {
    await api(`/api/jobs/${encodeURIComponent(id)}/mark-manual`, { method: 'POST' });
    toast('Updated manual post status!');
    refresh();
  } catch (err) { toast('Error: ' + err.message); }
};

window.uploadOne = async (id) => {
  try {
    toast('Uploading to YouTube...');
    await api(`/api/jobs/${encodeURIComponent(id)}/upload`, { method: 'POST' });
    toast('Published to YouTube!');
    refresh();
  } catch (err) { toast('Upload failed: ' + err.message); }
};

if (location.search.includes('yt=connected')) {
  toast('YouTube channel connected! Hands-free auto-posting is ready.');
  history.replaceState({}, '', '/');
}

refresh();
setInterval(refresh, 4000);
setInterval(() => {
  if (latestState?.settings?.autopilotEnabled && !latestState.busy) {
    $('countdownBox').textContent = fmtCountdown(latestState.settings.nextRunAt);
  }
}, 1000);
