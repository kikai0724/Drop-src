const configFields = [
  { key: 'port', label: 'Port', type: 'number' },
  { key: 'bEnableDebugLogs', label: 'Debug Logs', type: 'boolean' },
  { key: 'bEnableReports', label: 'Reports Enabled', type: 'boolean' },
  { key: 'bReportChannelId', label: 'Report Notification Channel ID', type: 'text' },
  { key: 'bEnableHTTPS', label: 'HTTPS Enabled', type: 'boolean' },
  { key: 'bEnableBattlepass', label: 'Battle Pass Enabled', type: 'boolean' },
  { key: 'bBattlePassSeason', label: 'Battle Pass Season', type: 'number' },
  { key: 'bEnableLoginGrantSkin', label: 'Login Reward Enabled', type: 'boolean' },
  { key: 'bLoginGrantSkinTemplateId', label: 'Login Reward templateId', type: 'text' },
  { key: 'bLoginGrantSkinStartAt', label: 'Login Reward Start Date/Time', type: 'datetime-local' },
  { key: 'bLoginGrantSkinEndAt', label: 'Login Reward End Date/Time', type: 'datetime-local' },
  { key: 'bLoginGrantSkinDurationDays', label: 'Login Reward Valid Days', type: 'number' },
  { key: 'bUseAutoRotate', label: 'Auto Shop Rotation', type: 'boolean' },
  { key: 'bEnableAutoRotateDebugLogs', label: 'Auto Rotation Debug Logs', type: 'boolean' },
  { key: 'bEnableDiscordWebhook', label: 'Discord Webhook', type: 'boolean' },
  { key: 'bEnableDiscordBot', label: 'Discord Bot', type: 'boolean', group: 'discord' },
  { key: 'bEnableInGamePlayerCount', label: 'In-Game Player Count', type: 'boolean', group: 'discord' },
  { key: 'EnableGlobalChat', label: 'Global Chat', type: 'boolean', group: 'chat' },
  { key: 'bApiKey', label: 'API Key', type: 'text', group: 'Api' },
  { key: 'bUseWebsite', label: 'Website Enabled', type: 'boolean', group: 'Website' },
  { key: 'websiteport', label: 'Website Port', type: 'number', group: 'Website' }
];

const shopFields = [
  { key: 'bChapterlimit', label: 'Chapter Limit', type: 'text' },
  { key: 'bSeasonlimit', label: 'Season Limit', type: 'text' },
  { key: 'bRotateTime', label: 'Rotation Time (HH:mm)', type: 'text' },
  { key: 'bDailyItemsAmount', label: 'Daily Count', type: 'number' },
  { key: 'bFeaturedItemsAmount', label: 'Featured Count', type: 'number' },
  { key: 'bItemShopWebhook', label: 'Webhook URL', type: 'text' }
];

let settings = {};

async function loadSettings() {
  const res = await fetch('/api/admin/settings');
  const data = await res.json();
  settings = data.settings || {};
  renderFields();
  renderShopFields();
  await loadCatalogJson();
  await loadMotdJson();
}

function renderFields() {
  const container = document.getElementById('settingsGrid');
  container.innerHTML = '';

  configFields.forEach(field => {
    const value = getFieldValue(field);
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <label for="${field.key}">${field.label}</label>
      <input id="${field.key}" type="${field.type === 'boolean' ? 'checkbox' : field.type}" ${field.type === 'boolean' ? (value ? 'checked' : '') : ''} value="${value ?? ''}" />
    `;
    container.appendChild(wrap);
  });
}

function renderShopFields() {
  const container = document.getElementById('shopGrid');
  container.innerHTML = '';

  shopFields.forEach(field => {
    const value = settings[field.key] ?? '';
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <label for="shop_${field.key}">${field.label}</label>
      <input id="shop_${field.key}" type="${field.type === 'boolean' ? 'checkbox' : field.type}" ${field.type === 'boolean' ? (value ? 'checked' : '') : ''} value="${value ?? ''}" />
    `;
    container.appendChild(wrap);
  });
}

function getFieldValue(field) {
  const source = field.group ? settings[field.group] : settings;
  return source?.[field.key];
}

function buildPayload() {
  const updates = {};
  configFields.forEach(field => {
    const input = document.getElementById(field.key);
    if (!input) return;
    const value = field.type === 'boolean' ? input.checked : input.value;
    const key = field.key;
    if (field.group) {
      updates[`${field.group}.${key}`] = value;
    } else {
      updates[key] = value;
    }
  });
  return { updates };
}

function buildShopPayload() {
  const updates = {};
  shopFields.forEach(field => {
    const input = document.getElementById(`shop_${field.key}`);
    if (!input) return;
    updates[field.key] = field.type === 'number' ? Number(input.value) : input.value;
  });
  return { updates };
}

async function saveSettings() {
  const status = document.getElementById('status');
  status.textContent = 'Saving...';
  const res = await fetch('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload())
  });
  const data = await res.json();
  status.textContent = data.message || (data.success ? 'Saved successfully' : 'Failed to save');
  await loadSettings();
}

async function saveShopSettings() {
  const status = document.getElementById('shopStatus');
  status.textContent = 'Saving shop settings...';
  const res = await fetch('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildShopPayload())
  });
  const data = await res.json();
  status.textContent = data.message || (data.success ? 'Shop settings saved successfully' : 'Failed to save');
  await loadSettings();
}

async function loadCatalogJson() {
  const res = await fetch('/api/admin/shop-catalog');
  const data = await res.json();
  const textarea = document.getElementById('catalogJson');
  if (textarea) {
    textarea.value = JSON.stringify(data.catalog || {}, null, 2);
  }
}

async function saveCatalogJson() {
  const status = document.getElementById('catalogStatus');
  const textarea = document.getElementById('catalogJson');
  status.textContent = 'Saving Catalog...';

  try {
    const parsed = JSON.parse(textarea.value);
    const res = await fetch('/api/admin/shop-catalog', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    });
    const data = await res.json();
    status.textContent = data.message || (data.success ? 'Catalog saved successfully' : 'Failed to save');
  } catch (err) {
    status.textContent = 'Invalid JSON format';
  }
}

async function loadAdminStatus() {
  const res = await fetch('/api/admin/status');
  const data = await res.json();
  if (!data.success) {
    document.getElementById('serverStatus').textContent = 'Failed to retrieve status';
    return;
  }

  document.getElementById('statusOnline').textContent = data.onlineUsers;
  document.getElementById('statusPartyCount').textContent = data.partyCount;
  document.getElementById('statusMatchmakerConnected').textContent = data.matchmakerStatus?.connectedClients ?? '-';
  document.getElementById('serverStatus').textContent = 'Retrieved latest status';

  const partyList = document.getElementById('partyList');
  if (partyList) {
    partyList.innerHTML = data.parties.map(p => `
      <div class="user-row">
        <div>
          <div><strong>Party ${p.id}</strong></div>
          <div class="muted">Members: ${p.members}</div>
          <div class="muted">Join: ${p.joinability || 'n/a'}</div>
        </div>
      </div>
    `).join('') || '<div class="muted">No parties</div>';
  }
}

async function loadMatchmaker() {
  const res = await fetch('/api/admin/matchmaker');
  const data = await res.json();
  if (!data.success) {
    document.getElementById('matchmakerStatus').textContent = 'Failed to retrieve matchmaker data';
    return;
  }

  const status = data.matchmaker;
  if (!status) {
    document.getElementById('matchmakerStatus').textContent = 'No matchmaker information available';
    return;
  }

  document.getElementById('matchmakerStatus').innerHTML = `
    <div class="muted">Connected clients: ${status.connectedClients}</div>
    <div class="muted">SOLO open: ${status.gameOpen.solo} / ready: ${status.hostReady.solo} / waiting: ${status.poolCounts.solo}</div>
    <div class="muted">DUO open: ${status.gameOpen.duo} / ready: ${status.hostReady.duo} / waiting: ${status.poolCounts.duo}</div>
    <div class="muted">LOW SOLO open: ${status.gameOpen.low_solo} / ready: ${status.hostReady.low_solo} / waiting: ${status.poolCounts.low_solo}</div>
    <div class="muted">CREATIVE open: ${status.gameOpen.creative} / ready: ${status.hostReady.creative} / waiting: ${status.poolCounts.creative}</div>
  `;
}

async function setMatchmaker(mode, action) {
  const btnStatus = document.getElementById('matchmakerStatus');
  btnStatus.textContent = `${mode} is ${action === 'open' ? 'opening' : 'closing'}...`;
  const res = await fetch(`/api/admin/matchmaker/${encodeURIComponent(mode)}/${encodeURIComponent(action)}`, {
    method: 'POST'
  });
  const data = await res.json();
  btnStatus.textContent = data.message || (data.success ? 'Updated successfully' : 'Failed');
  await loadMatchmaker();
}

async function loadParties() {
  const res = await fetch('/api/admin/parties');
  const data = await res.json();
  const partyList = document.getElementById('partyList');
  if (!data.success) {
    partyList.innerHTML = '<div class="muted">Failed to retrieve party information</div>';
    return;
  }
  partyList.innerHTML = data.parties.map(p => `
    <div class="user-row">
      <div>
        <div><strong>ID:</strong> ${p.id}</div>
        <div class="muted">Members: ${p.members.length}</div>
        <div class="muted">Created: ${p.created_at}</div>
      </div>
    </div>
  `).join('') || '<div class="muted">No parties</div>';
}

async function loadMotdJson() {
  const res = await fetch('/api/admin/motd');
  const data = await res.json();
  const textarea = document.getElementById('motdJson');
  if (textarea) {
    textarea.value = JSON.stringify(data.items || [], null, 2);
  }
}

async function saveMotdJson() {
  const status = document.getElementById('motdStatus');
  const textarea = document.getElementById('motdJson');
  try {
    const parsed = JSON.parse(textarea.value);
    const res = await fetch('/api/admin/motd', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: parsed })
    });
    const data = await res.json();
    status.textContent = data.message || (data.success ? 'MOTD saved successfully' : 'Failed to save');
  } catch (err) {
    status.textContent = 'Invalid JSON format';
  }
}

async function grantXp() {
  const status = document.getElementById('userActionStatus');
  const accountId = document.getElementById('targetAccountId').value.trim();
  const amount = Number(document.getElementById('xpAmount').value);
  if (!accountId || Number.isNaN(amount)) {
    status.textContent = 'Please enter an Account ID and XP amount';
    return;
  }
  status.textContent = 'Updating XP...';
  const res = await fetch(`/api/admin/users/${encodeURIComponent(accountId)}/xp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount })
  });
  const data = await res.json();
  status.textContent = data.message || (data.success ? 'XP updated successfully' : 'Failed to update');
}

async function grantVbucks() {
  const status = document.getElementById('userActionStatus');
  const accountId = document.getElementById('targetAccountId').value.trim();
  const amount = Number(document.getElementById('vbucksAmount').value);
  if (!accountId || Number.isNaN(amount) || amount === 0) {
    status.textContent = 'Please enter an Account ID and V-Bucks amount';
    return;
  }
  status.textContent = 'Updating V-Bucks...';
  const res = await fetch(`/api/admin/users/${encodeURIComponent(accountId)}/vbucks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount })
  });
  const data = await res.json();
  status.textContent = data.message || (data.success ? 'V-Bucks updated successfully' : 'Failed to update');
}

async function grantItem() {
  const status = document.getElementById('userActionStatus');
  const accountId = document.getElementById('targetAccountId').value.trim();
  const templateId = document.getElementById('itemTemplateId').value.trim();
  const quantity = Number(document.getElementById('itemQuantity').value) || 1;
  if (!accountId || !templateId) {
    status.textContent = 'Please enter an Account ID and templateId';
    return;
  }
  status.textContent = 'Granting item...';
  const res = await fetch(`/api/admin/users/${encodeURIComponent(accountId)}/items/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ templateId, quantity }] })
  });
  const data = await res.json();
  status.textContent = data.message || (data.success ? 'Item granted successfully' : 'Failed to grant item');
}

async function restartBackend() {
  const status = document.getElementById('status');
  status.textContent = 'Stopping backend...';
  await fetch('/api/admin/restart', { method: 'POST' });
  status.textContent = 'Force-stop command sent';
}

async function loadUsers() {
  const query = document.getElementById('userSearch').value;
  const list = document.getElementById('userList');
  list.innerHTML = 'Loading...';

  const res = await fetch(`/api/admin/users?search=${encodeURIComponent(query)}`);
  const data = await res.json();

  if (!data.success) {
    list.innerHTML = '<div class="muted">Load failed</div>';
    return;
  }

  if (!data.users.length) {
    list.innerHTML = '<div class="muted">No users found</div>';
    return;
  }

  list.innerHTML = data.users.map(user => `
    <div class="user-row">
      <div class="user-main">
        <div class="avatar">${user.avatarUrl ? `<img src="${user.avatarUrl}" alt="avatar" />` : '👤'}</div>
        <div>
          <div><strong>${user.username}</strong> ${user.banned ? '<span class="badge banned">BAN</span>' : '<span class="badge">ACTIVE</span>'}</div>
          <div class="muted">Account: ${user.accountId}</div>
          <div class="muted">Email: ${user.email}</div>
        </div>
      </div>
      <div class="user-actions">
        ${user.banned ? `<button onclick="toggleBan('${user.accountId}', false)">Unban</button>` : `<button onclick="toggleBan('${user.accountId}', true)">BAN</button>`}
      </div>
    </div>
  `).join('');
}

async function toggleBan(accountId, ban) {
  const res = await fetch(`/api/admin/users/${accountId}/${ban ? 'ban' : 'unban'}`, { method: 'POST' });
  const data = await res.json();
  alert(data.message || 'Done');
  loadUsers();
}

loadSettings();
loadUsers();
loadAdminStatus();
loadMatchmaker();
loadParties();
