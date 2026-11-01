const socket = io();

// State
let currentRoomCode = '';
let isHost = false;
let allowGuestControls = false;
let roomUsers = [];
let myNickname = localStorage.getItem('ktv_nickname') || 'มือถือ ' + Math.floor(Math.random() * 900 + 100);
let currentSong = null;
let currentQueue = [];
let playerState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 100,
  sfxVolume: 100,
  speed: 1.0,
  keyShift: 0,
  isVocalCut: false
};
let searchDebounceTimer = null;

// DOM Elements: Header & Room
const roomBadgeBtn = document.getElementById('roomBadgeBtn');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const userAvatarIcon = document.getElementById('userAvatarIcon');
const userNameDisplay = document.getElementById('userNameDisplay');
const userBadgeBtn = document.getElementById('userBadgeBtn');
const shareRemoteBtn = document.getElementById('shareRemoteBtn');

// Modals: Room Join & Details
const roomJoinModal = document.getElementById('roomJoinModal');
const roomPinInput = document.getElementById('roomPinInput');
const joinNicknameInput = document.getElementById('joinNicknameInput');
const btnJoinRoomSubmit = document.getElementById('btnJoinRoomSubmit');
const btnCreateRoomSubmit = document.getElementById('btnCreateRoomSubmit');

const roomDetailsModal = document.getElementById('roomDetailsModal');
const detailsRoomCodeText = document.getElementById('detailsRoomCodeText');
const detailsShareUrlText = document.getElementById('detailsShareUrlText');
const btnCopyRoomLink = document.getElementById('btnCopyRoomLink');
const closeRoomDetailsBtn = document.getElementById('closeRoomDetailsBtn');
const hostOnlySettingsBox = document.getElementById('hostOnlySettingsBox');
const allowGuestControlsToggle = document.getElementById('allowGuestControlsToggle');
const roomMembersList = document.getElementById('roomMembersList');
const detailsMembersCount = document.getElementById('detailsMembersCount');
const btnSwitchRoom = document.getElementById('btnSwitchRoom');

const nicknameModal = document.getElementById('nicknameModal');
const nicknameInput = document.getElementById('nicknameInput');
const saveNicknameBtn = document.getElementById('saveNicknameBtn');
const cancelNicknameBtn = document.getElementById('cancelNicknameBtn');

const guestControlNotice = document.getElementById('guestControlNotice');

// Mini Player
const miniThumb = document.getElementById('miniThumb');
const miniTitle = document.getElementById('miniTitle');
const miniRequester = document.getElementById('miniRequester');
const miniStatus = document.getElementById('miniStatus');
const miniPlayBtn = document.getElementById('miniPlayBtn');
const miniSkipBtn = document.getElementById('miniSkipBtn');
const miniProgressBar = document.getElementById('miniProgressBar');

// Search Tab
const searchInput = document.getElementById('searchInput');
const searchClearBtn = document.getElementById('searchClearBtn');
const modeKaraokeBtn = document.getElementById('modeKaraokeBtn');
const modeMvBtn = document.getElementById('modeMvBtn');
const quickChipsContainer = document.getElementById('quickChipsContainer');
const searchLoading = document.getElementById('searchLoading');
const searchEmpty = document.getElementById('searchEmpty');
const resultsList = document.getElementById('resultsList');
let searchMode = 'karaoke'; // 'karaoke' | 'mv'

// Queue Tab
const queueList = document.getElementById('queueList');
const queueEmpty = document.getElementById('queueEmpty');
const queueCountBadge = document.getElementById('queueCountBadge');
const navQueueBadge = document.getElementById('navQueueBadge');
const clearQueueBtn = document.getElementById('clearQueueBtn');

// Controls Tab
const ctrlPlayPauseBtn = document.getElementById('ctrlPlayPauseBtn');
const ctrlPlayIcon = document.getElementById('ctrlPlayIcon');
const ctrlPlayText = document.getElementById('ctrlPlayText');
const ctrlSkipBtn = document.getElementById('ctrlSkipBtn');
const ctrlRestartBtn = document.getElementById('ctrlRestartBtn');
const volumeSlider = document.getElementById('volumeSlider');
const volumeVal = document.getElementById('volumeVal');
const sfxVolumeSlider = document.getElementById('sfxVolumeSlider');
const sfxVolumeVal = document.getElementById('sfxVolumeVal');

// Key & Speed Elements
const keyMinusBtn = document.getElementById('keyMinusBtn');
const keyPlusBtn = document.getElementById('keyPlusBtn');
const keyResetBtn = document.getElementById('keyResetBtn');
const keyDisplayVal = document.getElementById('keyDisplayVal');
const keyDescText = document.getElementById('keyDescText');
const speedBtns = document.querySelectorAll('.speed-btn');

// Vocal Buttons
const vocalSwapBtn = document.getElementById('vocalSwapBtn');
const vocalCutBtn = document.getElementById('vocalCutBtn');
const vocalCutTitle = document.getElementById('vocalCutTitle');
const vocalCutDesc = document.getElementById('vocalCutDesc');
const toggleCcBtn = document.getElementById('toggleCcBtn');
const toggleCcTitle = document.getElementById('toggleCcTitle');
const toggleCcDesc = document.getElementById('toggleCcDesc');

// Reactions & Soundboard Tab
const sfxBtns = document.querySelectorAll('.sfx-btn');
const emojiBtns = document.querySelectorAll('.emoji-btn');
const msgBtns = document.querySelectorAll('.msg-btn');
const danmakuInput = document.getElementById('danmakuInput');
const sendDanmakuBtn = document.getElementById('sendDanmakuBtn');

// Navigation Tabs
const navItems = document.querySelectorAll('.nav-item');
const tabViews = document.querySelectorAll('.tab-view');
const toastEl = document.getElementById('toast');

// =============================================================================
// TAB NAVIGATION
// =============================================================================
navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(n => n.classList.remove('active'));
    tabViews.forEach(v => v.classList.remove('active'));

    item.classList.add('active');
    const targetTab = item.dataset.tab;
    const view = document.getElementById(targetTab);
    if (view) view.classList.add('active');
  });
});

// =============================================================================
// ROOM JOIN & LIFECYCLE MANAGEMENT
// =============================================================================
function showRoomJoinModal(prefilledCode = '') {
  if (roomPinInput) {
    roomPinInput.value = prefilledCode || currentRoomCode || '';
  }
  if (joinNicknameInput) {
    joinNicknameInput.value = myNickname || '';
  }
  if (roomJoinModal) {
    roomJoinModal.classList.add('active');
  }
}

function hideRoomJoinModal() {
  if (roomJoinModal) {
    roomJoinModal.classList.remove('active');
  }
}

function joinRoom(roomCode, nickname, hostRequested, createIfMissing = false) {
  if (!roomCode || !/^\d{4}$/.test(roomCode.trim())) {
    showToast('⚠️ กรุณาใส่รหัสห้องเป็นตัวเลข 4 หลัก');
    return;
  }

  const cleanNick = (nickname || myNickname).trim();
  myNickname = cleanNick;
  localStorage.setItem('ktv_nickname', myNickname);

  socket.emit('room:join', {
    roomCode: roomCode.trim(),
    nickname: cleanNick,
    isHost: Boolean(hostRequested),
    createIfMissing: Boolean(createIfMissing)
  }, (res) => {
    if (res && res.success) {
      currentRoomCode = res.roomCode;
      isHost = res.isHost;
      allowGuestControls = Boolean(res.allowGuestControls);

      localStorage.setItem('ktv_room_code', currentRoomCode);
      localStorage.setItem('ktv_is_host', isHost ? 'true' : 'false');

      // Update URL silently
      try {
        const newUrl = `${window.location.pathname}?room=${currentRoomCode}`;
        window.history.replaceState({ path: newUrl }, '', newUrl);
      } catch (_) {}

      updateRoomUI();
      hideRoomJoinModal();
      showToast(`🎉 เข้าร่วมห้อง #${currentRoomCode} เรียบร้อยแล้ว!`);
    } else {
      showToast(res ? res.message || res.error : 'ไม่สามารถเข้าร่วมห้องได้');
      showRoomJoinModal(roomCode);
    }
  });
}

function updateRoomUI() {
  if (roomCodeDisplay) {
    roomCodeDisplay.textContent = currentRoomCode ? `ห้อง: ${currentRoomCode}` : 'เลือกห้อง';
  }
  if (userAvatarIcon) {
    userAvatarIcon.textContent = isHost ? '👑' : '👤';
  }
  if (userNameDisplay) {
    userNameDisplay.textContent = `${myNickname}${isHost ? ' (หัวหน้าห้อง)' : ''}`;
  }
  if (detailsRoomCodeText) {
    detailsRoomCodeText.textContent = `#${currentRoomCode}`;
  }
  if (detailsShareUrlText) {
    detailsShareUrlText.textContent = `${window.location.origin}/remote?room=${currentRoomCode}`;
  }
  const btnOpenTvScreen = document.getElementById('btnOpenTvScreen');
  if (btnOpenTvScreen) {
    btnOpenTvScreen.href = currentRoomCode ? `/display.html?room=${currentRoomCode}` : '/display.html';
  }

  // Permissions in Controls Tab
  updateControlsPermissionUI();
}

function canControlPlayback() {
  return isHost || allowGuestControls;
}

function updateControlsPermissionUI() {
  if (guestControlNotice) {
    guestControlNotice.style.display = canControlPlayback() ? 'none' : 'flex';
  }
  if (clearQueueBtn) {
    clearQueueBtn.style.display = isHost ? 'inline-block' : 'none';
  }
  if (hostOnlySettingsBox) {
    hostOnlySettingsBox.style.display = isHost ? 'block' : 'none';
  }
  if (allowGuestControlsToggle) {
    allowGuestControlsToggle.checked = allowGuestControls;
  }
}

// Check room on launch
const urlParams = new URLSearchParams(window.location.search);
const urlRoom = urlParams.get('room');
const savedRoom = localStorage.getItem('ktv_room_code');
const savedHost = localStorage.getItem('ktv_is_host') === 'true';

if (urlRoom && /^\d{4}$/.test(urlRoom.trim())) {
  currentRoomCode = urlRoom.trim();
} else if (savedRoom && /^\d{4}$/.test(savedRoom.trim())) {
  currentRoomCode = savedRoom.trim();
}

isHost = savedHost;
updateRoomUI();

socket.on('connect', () => {
  if (currentRoomCode) {
    joinRoom(currentRoomCode, myNickname, isHost, false);
  } else {
    showRoomJoinModal();
  }
});

// Room Join Buttons
if (btnJoinRoomSubmit) {
  btnJoinRoomSubmit.addEventListener('click', () => {
    const code = roomPinInput.value.trim();
    const nick = joinNicknameInput.value.trim() || myNickname;
    const selectedRole = document.querySelector('input[name="joinRoleRadio"]:checked')?.value;
    const wantHost = selectedRole === 'host';
    joinRoom(code, nick, wantHost, false);
  });
}

if (btnCreateRoomSubmit) {
  btnCreateRoomSubmit.addEventListener('click', () => {
    const code = roomPinInput.value.trim();
    const nick = joinNicknameInput.value.trim() || myNickname;
    joinRoom(code, nick, true, true);
  });
}

// Room Details Modal Events
if (roomBadgeBtn) {
  roomBadgeBtn.addEventListener('click', () => {
    if (!currentRoomCode) {
      showRoomJoinModal();
      return;
    }
    updateRoomMembersUI();
    roomDetailsModal.classList.add('active');
  });
}

if (closeRoomDetailsBtn) {
  closeRoomDetailsBtn.addEventListener('click', () => {
    roomDetailsModal.classList.remove('active');
  });
}

if (btnCopyRoomLink) {
  btnCopyRoomLink.addEventListener('click', async () => {
    const shareUrl = `${window.location.origin}/remote?room=${currentRoomCode}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('📋 คัดลอกลิงก์ห้องแล้ว ส่งให้เพื่อนได้เลย!');
    } catch (_) {
      showToast(`คัดลอก: ${shareUrl}`);
    }
  });
}

if (btnSwitchRoom) {
  btnSwitchRoom.addEventListener('click', () => {
    roomDetailsModal.classList.remove('active');
    showRoomJoinModal();
  });
}

if (allowGuestControlsToggle) {
  allowGuestControlsToggle.addEventListener('change', (e) => {
    const allow = e.target.checked;
    socket.emit('room:toggle_guest_controls', { allow });
    allowGuestControls = allow;
    updateControlsPermissionUI();
    showToast(allow ? '🔓 อนุญาตให้เพื่อนทุกคนข้ามเพลงได้แล้ว' : '🔒 ปิดการควบคุม ให้เฉพาะหัวหน้าห้องคุมได้');
  });
}

// Nickname Modal
userBadgeBtn.addEventListener('click', () => {
  nicknameInput.value = myNickname;
  nicknameModal.classList.add('active');
});

if (cancelNicknameBtn) {
  cancelNicknameBtn.addEventListener('click', () => {
    nicknameModal.classList.remove('active');
  });
}

saveNicknameBtn.addEventListener('click', () => {
  const val = nicknameInput.value.trim();
  if (val) {
    myNickname = val;
    localStorage.setItem('ktv_nickname', myNickname);
    userNameDisplay.textContent = `${myNickname}${isHost ? ' (หัวหน้าห้อง)' : ''}`;
    // Re-join with updated nickname
    if (currentRoomCode) {
      socket.emit('room:join', {
        roomCode: currentRoomCode,
        nickname: myNickname,
        isHost
      });
    }
    showToast(`เปลี่ยนชื่อเป็น "${myNickname}" แล้ว`);
  }
  nicknameModal.classList.remove('active');
});

// Update Room Members List
function updateRoomMembersUI() {
  if (!roomMembersList) return;
  detailsMembersCount.textContent = roomUsers.length;
  roomMembersList.innerHTML = '';

  if (roomUsers.length === 0) {
    roomMembersList.innerHTML = '<div style="color:#94a3b8; font-size:0.8rem; padding:8px 0;">กำลังโหลดรายชื่อสมาชิก...</div>';
    return;
  }

  roomUsers.forEach(u => {
    const isMe = u.nickname === myNickname;
    const item = document.createElement('div');
    item.className = `member-item ${u.isHost ? 'is-host' : ''}`;
    item.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span>${u.isHost ? '👑' : '👤'}</span>
        <strong>${escapeHtml(u.nickname)}</strong>
      </div>
      <div style="display:flex; gap:4px;">
        ${u.isHost ? '<span class="member-badge host">หัวหน้าห้อง</span>' : ''}
        ${isMe ? '<span class="member-badge you">คุณ</span>' : ''}
      </div>
    `;
    roomMembersList.appendChild(item);
  });
}

// Socket State Listeners
socket.on('state:sync', (data) => {
  if (data.roomCode) {
    currentRoomCode = data.roomCode;
    isHost = Boolean(data.isHost);
    allowGuestControls = Boolean(data.allowGuestControls);
    localStorage.setItem('ktv_room_code', currentRoomCode);
    localStorage.setItem('ktv_is_host', isHost ? 'true' : 'false');
    updateRoomUI();
  }

  if (data.users) {
    roomUsers = data.users;
    updateRoomMembersUI();
  }

  currentSong = data.currentSong;
  currentQueue = data.songQueue || [];
  if (data.playerState) playerState = data.playerState;

  updateMiniPlayer();
  updateQueueUI();
  updateControlButtons();
});

socket.on('room:users_update', ({ users }) => {
  roomUsers = users || [];
  updateRoomMembersUI();
});

socket.on('room:settings_update', (settings) => {
  if (settings.allowGuestControls !== undefined) {
    allowGuestControls = settings.allowGuestControls;
    updateControlsPermissionUI();
    showToast(allowGuestControls ? '🔓 หัวหน้าห้องเปิดให้ทุกคนควบคุมเพลงได้' : '🔒 หัวหน้าห้องปิดการควบคุมเพลงร่วม');
  }
});

socket.on('room:promoted_to_host', () => {
  isHost = true;
  localStorage.setItem('ktv_is_host', 'true');
  updateRoomUI();
  showToast('👑 คุณได้รับการแต่งตั้งเป็นหัวหน้าห้องแล้ว!');
});

socket.on('queue:update', ({ songQueue, currentSong: cur }) => {
  currentQueue = songQueue || [];
  currentSong = cur;
  updateMiniPlayer();
  updateQueueUI();
});

socket.on('player:state', (state) => {
  playerState = state;
  updateMiniPlayer();
  updateControlButtons();
});

// Update Mini Player Banner
function updateMiniPlayer() {
  if (currentSong) {
    miniThumb.src = currentSong.thumbnail;
    miniTitle.textContent = currentSong.title;
    miniRequester.textContent = `ขอโดย: ${currentSong.requester || 'เพื่อนร่วมห้อง'}`;
    miniStatus.textContent = playerState.isPlaying ? 'กำลังเล่นบนจอทีวี 🎵' : 'หยุดชั่วคราว ⏸';
  } else {
    miniThumb.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Crect width='60' height='60' fill='%231e1b4b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='24' fill='%23a855f7'%3E🎤%3C/text%3E%3C/svg%3E";
    miniTitle.textContent = 'ยังไม่มีเพลงที่เล่น';
    miniRequester.textContent = 'ขอโดย: -';
    miniStatus.textContent = 'กำลังรอเพลงในคิว...';
    miniProgressBar.style.width = '0%';
  }
}

// Update Control Buttons in Tab
function updateControlButtons() {
  if (playerState.isPlaying) {
    ctrlPlayIcon.textContent = '⏸';
    ctrlPlayText.textContent = 'หยุดชั่วคราว';
    ctrlPlayPauseBtn.classList.remove('primary');
    ctrlPlayPauseBtn.classList.add('secondary');
  } else {
    ctrlPlayIcon.textContent = '▶';
    ctrlPlayText.textContent = 'เล่นต่อ';
    ctrlPlayPauseBtn.classList.remove('secondary');
    ctrlPlayPauseBtn.classList.add('primary');
  }

  volumeSlider.value = playerState.volume;
  volumeVal.textContent = `${playerState.volume}%`;
  sfxVolumeSlider.value = playerState.sfxVolume || 100;
  sfxVolumeVal.textContent = `${playerState.sfxVolume || 100}%`;

  const boostToggle = document.getElementById('boostToggle');
  if (boostToggle && playerState.isBoosted !== undefined) {
    boostToggle.checked = Boolean(playerState.isBoosted);
  }

  keyDisplayVal.textContent = playerState.keyShift > 0 ? `+${playerState.keyShift}` : playerState.keyShift;
  if (playerState.keyShift === 0) {
    keyDescText.textContent = 'คีย์ปกติ (Original)';
  } else if (playerState.keyShift > 0) {
    keyDescText.textContent = `สูงขึ้น ${playerState.keyShift} คีย์`;
  } else {
    keyDescText.textContent = `ต่ำลง ${Math.abs(playerState.keyShift)} คีย์`;
  }

  speedBtns.forEach(btn => {
    const spd = parseFloat(btn.dataset.speed);
    if (spd === (playerState.speed || 1.0)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (playerState.isVocalCut) {
    vocalCutBtn.classList.add('active');
    vocalCutTitle.textContent = 'คืนค่าเสียงร้องปกติ (Stereo)';
    vocalCutDesc.textContent = 'กำลังเปิดโหมดตัดเสียงร้องอยู่ แตะเพื่อปิด';
  } else {
    vocalCutBtn.classList.remove('active');
    vocalCutTitle.textContent = 'ตัดเสียงร้อง (Vocal Suppression)';
    vocalCutDesc.textContent = 'ลดเสียงร้องแชนเนลตรงกลาง / สเตอริโอ';
  }

  if (toggleCcBtn) {
    if (playerState.showCaptions) {
      toggleCcBtn.classList.add('active');
      if (toggleCcTitle) toggleCcTitle.textContent = 'คำบรรยาย/ซับไตเติล: เปิดอยู่';
      if (toggleCcDesc) toggleCcDesc.textContent = 'กำลังเปิดซับไตเติลอัตโนมัติ แตะเพื่อปิด';
    } else {
      toggleCcBtn.classList.remove('active');
      if (toggleCcTitle) toggleCcTitle.textContent = 'คำบรรยาย/ซับไตเติล: ปิดอยู่ (ภาพคลีน)';
      if (toggleCcDesc) toggleCcDesc.textContent = 'ปิดตัวหนังสืออัตโนมัติของ YouTube เพื่อดูภาพ MV แบบคลีนๆ';
    }
  }
}

// Queue Rendering
function updateQueueUI() {
  const count = currentQueue.length;
  queueCountBadge.textContent = `${count} เพลง`;
  navQueueBadge.textContent = count;
  navQueueBadge.style.display = count > 0 ? 'inline-block' : 'none';

  if (count === 0) {
    queueEmpty.style.display = 'block';
    queueList.innerHTML = '';
    return;
  }

  queueEmpty.style.display = 'none';
  queueList.innerHTML = '';

  currentQueue.forEach((item, index) => {
    const isMySong = item.requester === myNickname;
    const canManageThis = isHost || isMySong;

    const el = document.createElement('div');
    el.className = 'queue-item';
    el.innerHTML = `
      <div class="queue-num">${index + 1}</div>
      <img src="${item.thumbnail}" alt="Thumbnail">
      <div class="queue-item-meta">
        <div class="queue-item-title">${escapeHtml(item.title)}</div>
        <div class="queue-item-sub">👤 ${escapeHtml(item.requester)} ${isMySong ? '<span style="color:#38bdf8; font-weight:600;">(เพลงของคุณ)</span>' : ''} • ${item.duration}</div>
      </div>
      <div class="queue-actions">
        ${isHost && index > 0 ? `<button class="sm-btn" onclick="moveQueueItem('${item.id}', 'up')" title="เลื่อนขึ้น">▲</button>` : ''}
        ${isHost && index < count - 1 ? `<button class="sm-btn" onclick="moveQueueItem('${item.id}', 'down')" title="เลื่อนลง">▼</button>` : ''}
        ${canManageThis ? `<button class="sm-btn danger" onclick="removeQueueItem('${item.id}')" title="ลบเพลงนี้">✕</button>` : ''}
      </div>
    `;
    queueList.appendChild(el);
  });
}

window.moveQueueItem = function(songId, direction) {
  if (!isHost) {
    showToast('👑 เฉพาะหัวหน้าห้องเท่านั้นที่สามารถจัดลำดับคิวได้');
    return;
  }
  socket.emit('queue:move', { songId, direction });
};

window.removeQueueItem = function(songId) {
  socket.emit('queue:remove', songId);
  showToast('ลบเพลงออกจากคิวแล้ว');
};

clearQueueBtn.addEventListener('click', () => {
  if (!isHost) {
    showToast('👑 เฉพาะหัวหน้าห้องเท่านั้นที่สามารถล้างคิวทั้งหมดได้');
    return;
  }
  if (confirm('คุณต้องการล้างคิวเพลงทั้งหมดหรือไม่?')) {
    socket.emit('queue:clear');
    showToast('ล้างคิวเพลงทั้งหมดแล้ว');
  }
});

// Search Functions
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  const q = searchInput.value.trim();
  if (!q) {
    resultsList.innerHTML = '';
    searchEmpty.style.display = 'block';
    return;
  }
  searchDebounceTimer = setTimeout(() => executeSearch(q), 400);
});

searchClearBtn.addEventListener('click', () => {
  searchInput.value = '';
  resultsList.innerHTML = '';
  searchEmpty.style.display = 'block';
});

modeKaraokeBtn.addEventListener('click', () => {
  searchMode = 'karaoke';
  modeKaraokeBtn.classList.add('active');
  modeMvBtn.classList.remove('active');
  const q = searchInput.value.trim();
  if (q) executeSearch(q);
});

modeMvBtn.addEventListener('click', () => {
  searchMode = 'mv';
  modeMvBtn.classList.add('active');
  modeKaraokeBtn.classList.remove('active');
  const q = searchInput.value.trim();
  if (q) executeSearch(q);
});

quickChipsContainer.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) {
    const q = chip.dataset.query;
    searchInput.value = q;
    executeSearch(q);
  }
});

async function executeSearch(query) {
  if (!query) return;
  searchLoading.style.display = 'flex';
  searchEmpty.style.display = 'none';
  resultsList.innerHTML = '';

  try {
    const isKaraoke = searchMode === 'karaoke';
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&karaoke=${isKaraoke}`);
    const data = await res.json();
    searchLoading.style.display = 'none';

    if (data.results && data.results.length > 0) {
      renderSearchResults(data.results);
    } else {
      resultsList.innerHTML = '<div class="empty-state"><p>ไม่พบเพลงที่ค้นหา ลองพิมพ์ชื่อเพลงอื่นดูนะ</p></div>';
    }
  } catch (err) {
    searchLoading.style.display = 'none';
    showToast('เกิดข้อผิดพลาดในการค้นหา');
  }
}

function renderSearchResults(videos) {
  resultsList.innerHTML = '';
  videos.forEach(v => {
    const card = document.createElement('div');
    card.className = 'song-card';
    const safeVideo = JSON.stringify(v).replace(/'/g, "&apos;");

    card.innerHTML = `
      <img src="${v.thumbnail}" alt="Thumb" loading="lazy">
      <div class="song-card-info">
        <div class="song-card-title">${escapeHtml(v.title)}</div>
        <div class="song-card-sub">${escapeHtml(v.author)} • ${v.duration}</div>
      </div>
      <div class="song-card-actions">
        <button class="priority-btn" onclick='addSongToQueue(${safeVideo}, true)' title="แซงคิวเป็นเพลงถัดไป">⚡ ร้องเลย</button>
        <button class="add-btn" onclick='addSongToQueue(${safeVideo}, false)'>+ ต่อคิว</button>
      </div>
    `;
    resultsList.appendChild(card);
  });
}

window.addSongToQueue = function(video, priority) {
  if (!currentRoomCode) {
    showToast('⚠️ กรุณาเข้าร่วมห้องก่อนสั่งเพลง');
    showRoomJoinModal();
    return;
  }

  socket.emit('queue:add', {
    videoId: video.videoId,
    title: video.title,
    thumbnail: video.thumbnail,
    duration: video.duration,
    seconds: video.seconds,
    author: video.author,
    requester: myNickname,
    priority: priority
  });

  showToast(priority ? `⚡ แทรกคิว: "${video.title}"` : `✅ เพิ่มเข้าคิว: "${video.title}"`);
};

// Playback Controls
miniPlayBtn.addEventListener('click', togglePlayPause);
ctrlPlayPauseBtn.addEventListener('click', togglePlayPause);

function togglePlayPause() {
  if (!canControlPlayback()) {
    showToast('👑 เฉพาะหัวหน้าห้องเท่านั้นที่สามารถควบคุมการเล่นได้');
    return;
  }
  const action = playerState.isPlaying ? 'pause' : 'play';
  socket.emit('player:control', { action });
}

miniSkipBtn.addEventListener('click', skipSong);
ctrlSkipBtn.addEventListener('click', skipSong);

function skipSong() {
  if (!canControlPlayback()) {
    showToast('👑 เฉพาะหัวหน้าห้องเท่านั้นที่สามารถข้ามเพลงได้');
    return;
  }
  socket.emit('player:control', { action: 'skip' });
  showToast('⏭ ข้ามไปยังเพลงถัดไป');
}

ctrlRestartBtn.addEventListener('click', () => {
  if (!canControlPlayback()) {
    showToast('👑 เฉพาะหัวหน้าห้องเท่านั้นที่สามารถเริ่มเพลงใหม่ได้');
    return;
  }
  socket.emit('player:control', { action: 'restart' });
  showToast('⏮ เริ่มเพลงใหม่ตั้งแต่ต้น');
});

volumeSlider.addEventListener('input', (e) => {
  if (!canControlPlayback()) {
    showToast('👑 เฉพาะหัวหน้าห้องเท่านั้นที่สามารถปรับเสียงได้');
    return;
  }
  const val = e.target.value;
  volumeVal.textContent = `${val}%`;
  socket.emit('player:control', { action: 'volume', value: val });
});

sfxVolumeSlider.addEventListener('input', (e) => {
  const val = e.target.value;
  sfxVolumeVal.textContent = `${val}%`;
  socket.emit('player:control', { action: 'sfx_volume', value: val });
});

// Volume Boost
const boostToggle = document.getElementById('boostToggle');
if (boostToggle) {
  boostToggle.addEventListener('change', (e) => {
    if (!canControlPlayback()) {
      showToast('👑 เฉพาะหัวหน้าห้องเท่านั้นที่สามารถปรับ Audio Boost ได้');
      e.target.checked = !e.target.checked;
      return;
    }
    const isBoost = e.target.checked;
    socket.emit('player:control', { action: 'boost', value: isBoost });
    showToast(isBoost ? '⚡ เปิด Audio Boost (+20%)' : 'ปิด Audio Boost');
  });
}

// Key Controls
keyMinusBtn.addEventListener('click', () => {
  if (!canControlPlayback()) {
    showToast('👑 เฉพาะหัวหน้าห้องเท่านั้นที่สามารถปรับคีย์ได้');
    return;
  }
  let cur = playerState.keyShift - 1;
  if (cur < -6) cur = -6;
  socket.emit('player:control', { action: 'key', value: cur });
});

keyPlusBtn.addEventListener('click', () => {
  if (!canControlPlayback()) {
    showToast('👑 เฉพาะหัวหน้าห้องเท่านั้นที่สามารถปรับคีย์ได้');
    return;
  }
  let cur = playerState.keyShift + 1;
  if (cur > 6) cur = 6;
  socket.emit('player:control', { action: 'key', value: cur });
});

keyResetBtn.addEventListener('click', () => {
  if (!canControlPlayback()) {
    showToast('👑 เฉพาะหัวหน้าห้องเท่านั้นที่สามารถปรับคีย์ได้');
    return;
  }
  socket.emit('player:control', { action: 'key', value: 0 });
});

// Speed Controls
speedBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!canControlPlayback()) {
      showToast('👑 เฉพาะหัวหน้าห้องเท่านั้นที่สามารถปรับความเร็วได้');
      return;
    }
    const spd = parseFloat(btn.dataset.speed);
    socket.emit('player:control', { action: 'speed', value: spd });
  });
});

// Vocal Controls
vocalCutBtn.addEventListener('click', () => {
  if (!canControlPlayback()) {
    showToast('👑 เฉพาะหัวหน้าห้องเท่านั้นที่สามารถเปิดตัดเสียงร้องได้');
    return;
  }
  socket.emit('player:toggle_vocal', 'toggle');
  showToast(playerState.isVocalCut ? '🔊 คืนค่าเสียงร้องปกติ (Stereo)' : '✂️ เปิดโหมดตัดเสียงร้อง');
});

vocalSwapBtn.addEventListener('click', () => {
  if (!canControlPlayback()) {
    showToast('👑 เฉพาะหัวหน้าห้องเท่านั้นที่สามารถสลับวิดีโอได้');
    return;
  }
  if (!currentSong) {
    showToast('ไม่มีเพลงที่กำลังเล่นอยู่');
    return;
  }
  socket.emit('player:toggle_vocal', 'swap_video');
  showToast('⚡ กำลังค้นหาและสลับเป็นเวอร์ชันดนตรีคาราโอเกะ...');
});

if (toggleCcBtn) {
  toggleCcBtn.addEventListener('click', () => {
    if (!canControlPlayback()) {
      showToast('👑 เฉพาะหัวหน้าห้องเท่านั้นที่สามารถปรับแต่งได้');
      return;
    }
    const newStatus = !playerState.showCaptions;
    socket.emit('player:control', { action: 'toggle_cc', value: newStatus });
    playerState.showCaptions = newStatus;
    updateControlButtons();
    showToast(newStatus ? '💬 เปิดคำบรรยายอัตโนมัติ (CC)' : '🚫 ปิดคำบรรยายอัตโนมัติ (โหมดภาพคลีน)');
  });
}

// SFX Soundboard Buttons (Anyone in room can trigger!)
sfxBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.sfx;
    socket.emit('sfx:play', { type, sender: myNickname });
    showToast(`เล่นเสียง ${btn.querySelector('strong')?.textContent || type} 📢`);
  });
});

// Reactions / Danmaku
emojiBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = btn.dataset.emoji;
    socket.emit('danmaku:send', { emoji, text: '', sender: myNickname });
    showToast(`ส่ง ${emoji} ขึ้นจอทีวีแล้ว!`);
  });
});

msgBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const text = btn.textContent;
    socket.emit('danmaku:send', { emoji: '🎤', text, sender: myNickname });
    showToast(`ส่งข้อความขึ้นจอทีวีแล้ว!`);
  });
});

sendDanmakuBtn.addEventListener('click', sendCustomDanmaku);
danmakuInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendCustomDanmaku();
});

function sendCustomDanmaku() {
  const text = danmakuInput.value.trim();
  if (!text) return;
  socket.emit('danmaku:send', { emoji: '💬', text, sender: myNickname });
  danmakuInput.value = '';
  showToast('ส่งข้อความขึ้นจอทีวีแล้ว!');
}

// Share Remote Link
if (shareRemoteBtn) {
  shareRemoteBtn.addEventListener('click', async () => {
    const shareUrl = `${window.location.origin}/remote?room=${currentRoomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `SahaiBall Karaoke ห้อง #${currentRoomCode}`,
          text: `มาร้องเพลงกัน! เข้าห้องคาราโอเกะรหัส ${currentRoomCode} ผ่านมือถือได้เลย 🎤`,
          url: shareUrl
        });
        return;
      } catch (err) {}
    }
    // Fallback copy
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('📋 คัดลอกลิงก์ห้องเรียบร้อย ส่งให้เพื่อนได้เลย!');
    } catch (_) {
      showToast(`ลิงก์ห้อง: ${shareUrl}`);
    }
  });
}

// Toast helper
let toastTimeout;
function showToast(msg) {
  clearTimeout(toastTimeout);
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  toastTimeout = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2200);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// =============================================================================
// WebRTC Smartphone Wireless Microphone (Mobile Client Transmitter)
// =============================================================================
let micStream = null;
let micPeerConnection = null;
let isMicActive = false;
let micAudioContext = null;
let micAnalyser = null;
let vuAnimationFrameId = null;

const toggleMicBtn = document.getElementById('toggleMicBtn');
const micStatusPill = document.getElementById('micStatusPill');
const micIconGraphic = document.getElementById('micIconGraphic');
const micBtnLabel = document.getElementById('micBtnLabel');
const micBtnSub = document.getElementById('micBtnSub');
const vuMeterBox = document.getElementById('vuMeterBox');
const vuLevelVal = document.getElementById('vuLevelVal');
const vuFill = document.getElementById('vuFill');
const micVolSlider = document.getElementById('micVolSlider');
const micVolVal = document.getElementById('micVolVal');
const micEchoToggle = document.getElementById('micEchoToggle');

if (toggleMicBtn) {
  toggleMicBtn.addEventListener('click', async () => {
    if (isMicActive) {
      stopMicStreaming();
    } else {
      await startMicStreaming();
    }
  });
}

async function startMicStreaming() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('⚠️ เบราว์เซอร์ของคุณไม่รองรับการเปิดไมค์ WebRTC');
    return;
  }

  try {
    if (micStatusPill) micStatusPill.textContent = '🟡 กำลังเชื่อมต่อ...';
    if (micBtnLabel) micBtnLabel.textContent = 'กำลังเชื่อมต่อ...';

    // 1. Capture microphone audio (Optimized for singing dynamics)
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true, // Prevents feedback loop from room speakers
        noiseSuppression: false, // Keep vibrato & vocal dynamics intact
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000
      },
      video: false
    });

    // 2. Initialize RTCPeerConnection
    micPeerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    micStream.getAudioTracks().forEach(track => {
      micPeerConnection.addTrack(track, micStream);
    });

    micPeerConnection.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('webrtc:ice_candidate', {
          candidate: e.candidate,
          targetSocketId: null // Server routes to room.displaySocketId
        });
      }
    };

    micPeerConnection.onconnectionstatechange = () => {
      console.log('WebRTC Mic state:', micPeerConnection.connectionState);
      if (micPeerConnection.connectionState === 'connected') {
        if (micStatusPill) {
          micStatusPill.textContent = '🟢 ไมค์สด (ออนไลน์)';
          micStatusPill.classList.add('active');
        }
        showToast('🎙️ ไมค์เปิดแล้ว! พูดหรือร้องใส่รูก้นมือถือได้เลย');
      } else if (micPeerConnection.connectionState === 'disconnected' || micPeerConnection.connectionState === 'failed') {
        stopMicStreaming();
      }
    };

    // 3. Create Offer
    const offer = await micPeerConnection.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false
    });
    await micPeerConnection.setLocalDescription(offer);

    socket.emit('webrtc:offer', {
      offer,
      nickname: myNickname || 'นักร้อง'
    });

    // 4. Start local VU Meter
    startLocalVuMeter(micStream);

    // 5. Update UI
    isMicActive = true;
    if (toggleMicBtn) toggleMicBtn.classList.add('active');
    if (micIconGraphic) micIconGraphic.textContent = '🔴';
    if (micBtnLabel) micBtnLabel.textContent = 'แตะเพื่อปิดไมค์';
    if (micBtnSub) micBtnSub.textContent = 'กำลังส่งเสียงออกลำโพงทีวี';
    if (vuMeterBox) vuMeterBox.style.display = 'block';

  } catch (err) {
    console.error('Failed to start microphone:', err);
    stopMicStreaming();
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showToast('⚠️ กรุณากดยอมรับให้เบราว์เซอร์เข้าถึงไมโครโฟน');
    } else {
      showToast(`⚠️ ไม่สามารถเปิดไมค์ได้: ${err.message || err.name}`);
    }
  }
}

function stopMicStreaming() {
  isMicActive = false;

  if (micPeerConnection) {
    try {
      micPeerConnection.close();
    } catch (e) {}
    micPeerConnection = null;
  }

  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }

  stopLocalVuMeter();

  socket.emit('mic:stop');

  // Update UI
  if (toggleMicBtn) {
    toggleMicBtn.classList.remove('active');
    if (micIconGraphic) micIconGraphic.textContent = '🎙️';
    if (micBtnLabel) micBtnLabel.textContent = 'แตะเพื่อเปิดไมค์';
    if (micBtnSub) micBtnSub.textContent = 'ถือร้องแบบไมค์ลอยได้เลย';
  }
  if (micStatusPill) {
    micStatusPill.textContent = '⚪ ปิดไมค์อยู่';
    micStatusPill.classList.remove('active');
  }
  if (vuMeterBox) {
    vuMeterBox.style.display = 'none';
  }
}

// Receive WebRTC Answer from TV
socket.on('webrtc:answer', async ({ answer }) => {
  if (micPeerConnection && answer) {
    try {
      await micPeerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error('Failed to set remote description on mic:', err);
    }
  }
});

// Receive ICE candidate from TV
socket.on('webrtc:ice_candidate', async ({ candidate }) => {
  if (micPeerConnection && candidate) {
    try {
      await micPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {}
  }
});

// Real-time Local VU Meter via Web Audio API
function startLocalVuMeter(stream) {
  try {
    micAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = micAudioContext.createMediaStreamSource(stream);
    micAnalyser = micAudioContext.createAnalyser();
    micAnalyser.fftSize = 256;
    source.connect(micAnalyser);

    const dataArray = new Uint8Array(micAnalyser.frequencyBinCount);

    function updateVu() {
      if (!isMicActive || !micAnalyser) return;
      micAnalyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const pct = Math.min(100, Math.round((avg / 128) * 100));

      if (vuFill) vuFill.style.width = `${pct}%`;
      if (vuLevelVal) vuLevelVal.textContent = `${pct}%`;

      vuAnimationFrameId = requestAnimationFrame(updateVu);
    }
    updateVu();
  } catch (e) {
    console.warn('VU meter initialization error:', e);
  }
}

function stopLocalVuMeter() {
  if (vuAnimationFrameId) {
    cancelAnimationFrame(vuAnimationFrameId);
    vuAnimationFrameId = null;
  }
  if (micAudioContext) {
    try {
      micAudioContext.close();
    } catch (e) {}
    micAudioContext = null;
    micAnalyser = null;
  }
  if (vuFill) vuFill.style.width = '0%';
}

// Volume & Echo Controls
if (micVolSlider) {
  micVolSlider.addEventListener('input', () => {
    const vol = parseInt(micVolSlider.value, 10);
    if (micVolVal) micVolVal.textContent = `${vol}%`;
    socket.emit('mic:control', {
      volume: vol,
      echoEnabled: micEchoToggle ? micEchoToggle.checked : true
    });
  });
}

if (micEchoToggle) {
  micEchoToggle.addEventListener('change', () => {
    socket.emit('mic:control', {
      volume: micVolSlider ? parseInt(micVolSlider.value, 10) : 120,
      echoEnabled: micEchoToggle.checked
    });
    showToast(micEchoToggle.checked ? '✨ เปิดเอคโค่เสียงก้องคอนเสิร์ต' : '🔇 ปิดเอคโค่ (เสียงแห้งปกติ)');
  });
}
