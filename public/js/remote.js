const socket = io();

// State
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

// DOM Elements
const userNameDisplay = document.getElementById('userNameDisplay');
const userBadgeBtn = document.getElementById('userBadgeBtn');
const nicknameModal = document.getElementById('nicknameModal');
const nicknameInput = document.getElementById('nicknameInput');
const saveNicknameBtn = document.getElementById('saveNicknameBtn');

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

// Reactions & Soundboard Tab
const sfxBtns = document.querySelectorAll('.sfx-btn');
const emojiBtns = document.querySelectorAll('.emoji-btn');
const msgBtns = document.querySelectorAll('.msg-btn');
const danmakuInput = document.getElementById('danmakuInput');
const sendDanmakuBtn = document.getElementById('sendDanmakuBtn');

// Tabs
const navItems = document.querySelectorAll('.nav-item');
const tabViews = document.querySelectorAll('.tab-view');
const toastEl = document.getElementById('toast');

// Initialize User
userNameDisplay.textContent = myNickname;

// Tab Navigation
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

// Nickname Modal
userBadgeBtn.addEventListener('click', () => {
  nicknameInput.value = myNickname;
  nicknameModal.classList.add('active');
});

saveNicknameBtn.addEventListener('click', () => {
  const val = nicknameInput.value.trim();
  if (val) {
    myNickname = val;
    localStorage.setItem('ktv_nickname', myNickname);
    userNameDisplay.textContent = myNickname;
    showToast(`เปลี่ยนชื่อเป็น "${myNickname}" แล้ว`);
  }
  nicknameModal.classList.remove('active');
});

// Socket State Listeners
socket.on('state:sync', (data) => {
  currentSong = data.currentSong;
  currentQueue = data.songQueue;
  if (data.playerState) playerState = data.playerState;

  updateMiniPlayer();
  updateQueueUI();
  updateControlButtons();
});

socket.on('queue:update', ({ songQueue, currentSong: cur }) => {
  currentQueue = songQueue;
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
    miniRequester.textContent = `ขอโดย: ${currentSong.requester || 'มือถือ'}`;
    miniStatus.textContent = playerState.isPlaying ? 'กำลังเล่นบนจอทีวี 🎵' : 'หยุดชั่วคราว ⏸';
  } else {
    miniThumb.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Crect width='60' height='60' fill='%231e1b4b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='24' fill='%23a855f7'%3E🎤%3C/text%3E%3C/svg%3E";
    miniTitle.textContent = 'ยังไม่มีเพลงที่เล่น';
    miniRequester.textContent = 'ขอโดย: -';
    miniStatus.textContent = 'กำลังรอเพลงในคิว...';
    miniProgressBar.style.width = '0%';
  }

  // Progress Bar
  if (playerState.duration > 0) {
    const pct = (playerState.currentTime / playerState.duration) * 100;
    miniProgressBar.style.width = `${pct}%`;
  }

  miniPlayBtn.textContent = playerState.isPlaying ? '⏸' : '▶';
}

function updateControlButtons() {
  if (playerState.isPlaying) {
    ctrlPlayIcon.textContent = '⏸';
    ctrlPlayText.textContent = 'หยุดชั่วคราว';
  } else {
    ctrlPlayIcon.textContent = '▶';
    ctrlPlayText.textContent = 'เล่นต่อ';
  }

  // Volumes
  volumeSlider.value = playerState.volume;
  volumeVal.textContent = `${playerState.volume}%`;

  if (sfxVolumeSlider) {
    sfxVolumeSlider.value = playerState.sfxVolume || 100;
    sfxVolumeVal.textContent = `${playerState.sfxVolume || 100}%`;
  }

  // Key Control Display
  const key = playerState.keyShift || 0;
  keyDisplayVal.textContent = key > 0 ? `+${key}` : key;
  if (key === 0) {
    keyDescText.textContent = 'คีย์ปกติ (Original)';
    keyDisplayVal.style.color = '#38bdf8';
  } else if (key > 0) {
    keyDescText.textContent = 'คีย์สูงขึ้น (เหมาะสำหรับผู้หญิง)';
    keyDisplayVal.style.color = '#ec4899';
  } else {
    keyDescText.textContent = 'คีย์ต่ำลง (เหมาะสำหรับผู้ชาย)';
    keyDisplayVal.style.color = '#38bdf8';
  }

  // Speed Control Display
  const curSpeed = playerState.speed || 1.0;
  speedBtns.forEach(b => {
    if (parseFloat(b.dataset.speed) === curSpeed) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  // Vocal Cut Button Display
  if (playerState.isVocalCut) {
    vocalCutBtn.classList.add('active');
    vocalCutTitle.textContent = '✅ ตัดเสียงร้องอยู่ (เปิดเสียงร้อง)';
    vocalCutDesc.textContent = 'คลิกเพื่อสลับกลับเป็นเสียงร้องปกติ (Stereo)';
  } else {
    vocalCutBtn.classList.remove('active');
    vocalCutTitle.textContent = '✂️ ตัดเสียงร้อง (Vocal Suppression)';
    vocalCutDesc.textContent = 'ลดเสียงร้องแชนเนลตรงกลาง / สเตอริโอ';
  }

  // Boost Toggle Display
  const boostToggleEl = document.getElementById('boostToggle');
  if (boostToggleEl && playerState.isBoosted !== undefined) {
    boostToggleEl.checked = Boolean(playerState.isBoosted);
  }
}

// Key Control Handlers (-4 to +4)
keyMinusBtn.addEventListener('click', () => {
  let cur = playerState.keyShift || 0;
  if (cur > -4) {
    cur--;
    socket.emit('player:control', { action: 'key', value: cur });
    showToast(`ลดคีย์เพลงเป็น ${cur}`);
  }
});

keyPlusBtn.addEventListener('click', () => {
  let cur = playerState.keyShift || 0;
  if (cur < 4) {
    cur++;
    socket.emit('player:control', { action: 'key', value: cur });
    showToast(`เพิ่มคีย์เพลงเป็น +${cur}`);
  }
});

keyResetBtn.addEventListener('click', () => {
  socket.emit('player:control', { action: 'key', value: 0 });
  showToast('รีเซ็ตคีย์เพลงกลับเป็นปกติ (Key 0)');
});

// Speed Control Handlers
speedBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const spd = parseFloat(btn.dataset.speed);
    socket.emit('player:control', { action: 'speed', value: spd });
    showToast(`ปรับความเร็วเพลงเป็น ${spd}x`);
  });
});

// Soundboard / Party Jingles
sfxBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.sfx;
    socket.emit('sfx:play', { type, sender: myNickname });
    const name = btn.querySelector('strong').textContent;
    showToast(`🔊 ส่งเสียง "${name}" ออกลำโพงทีวีแล้ว!`);
  });
});

// Independent SFX Volume
if (sfxVolumeSlider) {
  sfxVolumeSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    sfxVolumeVal.textContent = `${val}%`;
    socket.emit('player:control', { action: 'sfx_volume', value: val });
  });
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
    const el = document.createElement('div');
    el.className = 'queue-item';
    el.innerHTML = `
      <div class="queue-num">${index + 1}</div>
      <img src="${item.thumbnail}" alt="Thumbnail">
      <div class="queue-item-meta">
        <div class="queue-item-title">${escapeHtml(item.title)}</div>
        <div class="queue-item-sub">👤 ${escapeHtml(item.requester)} • ${item.duration}</div>
      </div>
      <div class="queue-actions">
        ${index > 0 ? `<button class="sm-btn" onclick="moveQueueItem('${item.id}', 'up')" title="เลื่อนขึ้น">▲</button>` : ''}
        ${index < count - 1 ? `<button class="sm-btn" onclick="moveQueueItem('${item.id}', 'down')" title="เลื่อนลง">▼</button>` : ''}
        <button class="sm-btn danger" onclick="removeQueueItem('${item.id}')" title="ลบออกจากคิว">✕</button>
      </div>
    `;
    queueList.appendChild(el);
  });
}

window.moveQueueItem = function(songId, direction) {
  socket.emit('queue:move', { songId, direction });
};

window.removeQueueItem = function(songId) {
  socket.emit('queue:remove', songId);
  showToast('ลบเพลงออกจากคิวแล้ว');
};

clearQueueBtn.addEventListener('click', () => {
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

// Share Remote Link
const shareRemoteBtn = document.getElementById('shareRemoteBtn');
if (shareRemoteBtn) {
  shareRemoteBtn.addEventListener('click', async () => {
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SahaiBall Karaoke Remote',
          text: 'มาร้องเพลงกัน! เปิดรีโมตสั่งเพลงคาราโอเกะผ่านมือถือได้เลย 🎤',
          url: shareUrl
        });
        return;
      } catch (err) {}
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
      showToast('📋 คัดลอกลิงก์รีโมตแล้ว! นำไปส่งใน LINE ให้เพื่อนได้เลย 🚀');
    } else {
      prompt('คัดลอกลิงก์รีโมตนี้ไปส่งให้เพื่อน:', shareUrl);
    }
  });
}

// Lucky Song Catalog & Lucky Draw Button
const luckySongCatalog = [
  'คุกเข่า COCKTAIL', 'คิดแต่ไม่ถึง Tilly Birds', 'วัดปะหล่ะ 4EVE', 'ซ่อนกลิ่น Palmy',
  'น้ำลาย Silly Fools', 'แสงสุดท้าย Bodyslam', 'โต๊ะริม NONT TANONT', 'ทรงอย่างแบด Paper Planes',
  'สลักจิต ป๊อบ ปองกูล', 'สองรัก Zeal', 'ขี้หึง Silly Fools', 'ฤดูร้อน Paradox',
  'ไกลแค่ไหนคือใกล้ Getsunova', 'เสแสร้ง Paper Planes', 'นะหน้าทอง โจอี้ ภูวศิษฐ์',
  'วาดไว้ BOWKYLION', 'เชือกวิเศษ LABANOON', 'ใจสั่งมา เสก โลโซ', 'แฟนเก่าคนโปรด Slapkiss',
  'Bohemian Rhapsody Queen', 'Until I Found You Stephen Sanchez', 'Perfect Ed Sheeran'
];

const luckyDrawBtn = document.getElementById('luckyDrawBtn');
if (luckyDrawBtn) {
  luckyDrawBtn.addEventListener('click', () => {
    luckyDrawBtn.style.transform = 'scale(0.96)';
    setTimeout(() => luckyDrawBtn.style.transform = '', 150);

    const randomIndex = Math.floor(Math.random() * luckySongCatalog.length);
    const chosenSong = luckySongCatalog[randomIndex];

    searchInput.value = chosenSong;
    showToast(`🎲 สุ่มได้เพลง "${chosenSong}"! ✨`);
    executeSearch(chosenSong);
  });
}

// Favorites Storage System
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem('ktv_favorites') || '[]');
  } catch (e) {
    return [];
  }
}

function saveFavorites(favs) {
  localStorage.setItem('ktv_favorites', JSON.stringify(favs));
  updateFavCount();
}

function updateFavCount() {
  const badge = document.getElementById('favCountBadge');
  if (badge) {
    badge.textContent = getFavorites().length;
  }
}
updateFavCount();

window.toggleFavorite = function(video) {
  let favs = getFavorites();
  const existsIndex = favs.findIndex(f => f.videoId === video.videoId);
  if (existsIndex >= 0) {
    favs.splice(existsIndex, 1);
    saveFavorites(favs);
    showToast(`💔 นำออกจากเพลงโปรดแล้ว`);
  } else {
    favs.unshift(video);
    saveFavorites(favs);
    showToast(`❤️ บันทึก "${video.title}" ในเพลงโปรดแล้ว!`);
  }
  updateFavCount();
  if (currentGenre === 'fav') {
    renderFavoritesList();
  } else {
    const btn = document.querySelector(`.fav-btn[data-id="${video.videoId}"]`);
    if (btn) btn.classList.toggle('active', existsIndex < 0);
  }
};

function renderFavoritesList() {
  const favs = getFavorites();
  resultsList.innerHTML = '';
  searchLoading.style.display = 'none';

  if (favs.length === 0) {
    searchEmpty.style.display = 'block';
    searchEmpty.querySelector('h3').textContent = 'ยังไม่มีเพลงโปรด';
    searchEmpty.querySelector('p').textContent = 'กดไอคอน ❤️ บนเพลงที่ชอบ เพื่อเก็บไว้ร้องคราวหน้าได้สะดวกรวดเร็ว';
    return;
  }

  searchEmpty.style.display = 'none';
  renderSearchResults(favs, true);
}

// Genre Categories Data
const genreChipsData = {
  all: [
    { label: '🔥 เพลงฮิต', query: 'คาราโอเกะ ฮิต' },
    { label: 'COCKTAIL', query: 'COCKTAIL คาราโอเกะ' },
    { label: 'Tilly Birds', query: 'Tilly Birds คาราโอเกะ' },
    { label: 'Bodyslam', query: 'Bodyslam คาราโอเกะ' },
    { label: 'Three Man Down', query: 'Three Man Down คาราโอเกะ' },
    { label: 'ลูกทุ่งฮิต', query: 'ลูกทุ่ง คาราโอเกะ' }
  ],
  rock: [
    { label: '🎸 Bodyslam', query: 'Bodyslam คาราโอเกะ' },
    { label: '🎸 Silly Fools', query: 'Silly Fools คาราโอเกะ' },
    { label: '🎸 Paradox', query: 'Paradox คาราโอเกะ' },
    { label: '🎸 LABANOON', query: 'LABANOON คาราโอเกะ' },
    { label: '🎸 Retrospect', query: 'Retrospect คาราโอเกะ' }
  ],
  sad: [
    { label: '💔 เพลงอกหักโดนๆ', query: 'เพลงอกหัก คาราโอเกะ' },
    { label: '💔 Slapkiss', query: 'Slapkiss คาราโอเกะ' },
    { label: '💔 BOWKYLION', query: 'BOWKYLION คาราโอเกะ' },
    { label: '💔 Three Man Down', query: 'Three Man Down คาราโอเกะ' },
    { label: '💔 Tilly Birds', query: 'Tilly Birds คาราโอเกะ' }
  ],
  '90s': [
    { label: '📼 ฮิตยุค 90s', query: 'เพลงยุค 90 คาราโอเกะ' },
    { label: '📼 เสก โลโซ', query: 'เสก โลโซ คาราโอเกะ' },
    { label: '📼 โมเดิร์นด็อก', query: 'Moderndog คาราโอเกะ' },
    { label: '📼 พลพล', query: 'พลพล คาราโอเกะ' },
    { label: '📼 อัสนี วสันต์', query: 'อัสนี วสันต์ คาราโอเกะ' }
  ],
  country: [
    { label: '🌾 ลูกทุ่งฮิตติดลม', query: 'ลูกทุ่งฮิต คาราโอเกะ' },
    { label: '🌾 โจอี้ ภูวศิษฐ์', query: 'โจอี้ ภูวศิษฐ์ คาราโอเกะ' },
    { label: '🌾 ไผ่ พงศธร', query: 'ไผ่ พงศธร คาราโอเกะ' },
    { label: '🌾 มนต์แคน แก่นคูน', query: 'มนต์แคน แก่นคูน คาราโอเกะ' },
    { label: '🌾 ลำไย ไหทองคำ', query: 'ลำไย ไหทองคำ คาราโอเกะ' }
  ],
  inter: [
    { label: '🌍 Billboard Hits', query: 'Top Billboard Hits Karaoke' },
    { label: '🌍 Ed Sheeran', query: 'Ed Sheeran Karaoke' },
    { label: '🌍 Bruno Mars', query: 'Bruno Mars Karaoke' },
    { label: '🌍 Maroon 5', query: 'Maroon 5 Karaoke' },
    { label: '🌍 Taylor Swift', query: 'Taylor Swift Karaoke' }
  ],
  dance: [
    { label: '💃 แดนซ์สายตื๊ด', query: 'เพลงแดนซ์ คาราโอเกะ' },
    { label: '💃 4EVE', query: '4EVE คาราโอเกะ' },
    { label: '💃 PROXIE', query: 'PROXIE คาราโอเกะ' },
    { label: '💃 สามช่าโจ๊ะๆ', query: 'สามช่า คาราโอเกะ' }
  ]
};

let currentGenre = 'all';
const genreCategoryBar = document.getElementById('genreCategoryBar');
if (genreCategoryBar) {
  genreCategoryBar.querySelectorAll('.genre-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      genreCategoryBar.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentGenre = pill.dataset.genre;

      if (currentGenre === 'fav') {
        renderFavoritesList();
      } else {
        renderGenreChips(currentGenre);
      }
    });
  });
}

function renderGenreChips(genre) {
  if (!quickChipsContainer) return;
  if (genre === 'all') {
    renderQuickChips(searchMode);
    return;
  }
  const chips = genreChipsData[genre] || [];
  quickChipsContainer.innerHTML = chips.map(item => `
    <button class="chip" data-query="${escapeHtml(item.query)}">${escapeHtml(item.label)}</button>
  `).join('');

  quickChipsContainer.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.query;
      searchInput.value = q;
      executeSearch(q);
    });
  });
}

// Audio Boost Toggle Switch in Controls
const boostToggle = document.getElementById('boostToggle');
if (boostToggle) {
  boostToggle.addEventListener('change', (e) => {
    const isBoost = e.target.checked;
    socket.emit('player:control', { action: 'boost', value: isBoost });
    showToast(isBoost ? '⚡ เปิด Audio Boost (+20%) แล้ว!' : 'ปิด Audio Boost');
  });
}

searchClearBtn.addEventListener('click', () => {
  searchInput.value = '';
  resultsList.innerHTML = '';
  searchEmpty.style.display = 'block';
  searchInput.focus();
});

const karaokeChips = [
  { label: '🔥 คาราโอเกะฮิต', query: 'คาราโอเกะ ฮิต' },
  { label: 'COCKTAIL', query: 'COCKTAIL คาราโอเกะ' },
  { label: 'Tilly Birds', query: 'Tilly Birds คาราโอเกะ' },
  { label: 'Bodyslam', query: 'Bodyslam คาราโอเกะ' },
  { label: 'Three Man Down', query: 'Three Man Down คาราโอเกะ' },
  { label: 'ลูกทุ่งฮิต', query: 'ลูกทุ่ง คาราโอเกะ' }
];

const mvChips = [
  { label: '🔥 เพลงฮิตติดชาร์ต', query: 'เพลงไทยฮิตติดชาร์ต' },
  { label: '🎬 Official MV', query: 'Official MV เพลงฮิต' },
  { label: 'COCKTAIL MV', query: 'COCKTAIL Official MV' },
  { label: 'Tilly Birds MV', query: 'Tilly Birds Official MV' },
  { label: 'Bodyslam MV', query: 'Bodyslam Official MV' },
  { label: 'เพลงสากลฮิต', query: 'Top Billboard Hits' }
];

function renderQuickChips(mode) {
  if (!quickChipsContainer) return;
  const list = mode === 'mv' ? mvChips : karaokeChips;
  quickChipsContainer.innerHTML = list.map(item => `
    <button class="chip" data-query="${escapeHtml(item.query)}">${escapeHtml(item.label)}</button>
  `).join('');

  quickChipsContainer.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.query;
      searchInput.value = q;
      executeSearch(q);
    });
  });
}

function setSearchMode(mode) {
  searchMode = mode;
  if (mode === 'karaoke') {
    if (modeKaraokeBtn) modeKaraokeBtn.classList.add('active');
    if (modeMvBtn) modeMvBtn.classList.remove('active', 'mv-mode');
    searchInput.placeholder = 'พิมพ์ชื่อเพลง หรือ ศิลปิน (ตัดเสียงร้อง)...';
    renderQuickChips('karaoke');
  } else {
    if (modeMvBtn) modeMvBtn.classList.add('active', 'mv-mode');
    if (modeKaraokeBtn) modeKaraokeBtn.classList.remove('active');
    searchInput.placeholder = 'พิมพ์ชื่อเพลง MV ต้นฉบับ (มีเสียงร้อง)...';
    renderQuickChips('mv');
  }
  const q = searchInput.value.trim();
  if (q) executeSearch(q);
}

if (modeKaraokeBtn) modeKaraokeBtn.addEventListener('click', () => setSearchMode('karaoke'));
if (modeMvBtn) modeMvBtn.addEventListener('click', () => setSearchMode('mv'));
renderQuickChips('karaoke');

async function executeSearch(query) {
  if (!query) return;

  searchLoading.style.display = 'flex';
  searchEmpty.style.display = 'none';
  resultsList.innerHTML = '';

  const isKaraoke = searchMode === 'karaoke';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&karaoke=${isKaraoke}`);
    const data = await res.json();

    searchLoading.style.display = 'none';

    if (!data.results || data.results.length === 0) {
      searchEmpty.style.display = 'block';
      searchEmpty.querySelector('h3').textContent = 'ไม่พบเพลงที่ค้นหา';
      searchEmpty.querySelector('p').textContent = 'ลองเปลี่ยนคำค้นหา หรือค้นหาด้วยชื่อศิลปินแทน';
      return;
    }

    renderSearchResults(data.results);
  } catch (err) {
    searchLoading.style.display = 'none';
    searchEmpty.style.display = 'block';
    searchEmpty.querySelector('h3').textContent = 'เกิดข้อผิดพลาด';
    searchEmpty.querySelector('p').textContent = 'ไม่สามารถเชื่อมต่อการค้นหาได้ในขณะนี้';
  }
}

function renderSearchResults(videos, isFavView = false) {
  resultsList.innerHTML = '';
  const isMv = searchMode === 'mv';
  const favIds = new Set(getFavorites().map(f => f.videoId));

  videos.forEach(v => {
    const isFav = favIds.has(v.videoId);
    const card = document.createElement('div');
    card.className = 'song-card';
    const tagBadge = isMv 
      ? '<span style="display:inline-block; font-size:0.75rem; background:rgba(37,99,235,0.25); color:#60a5fa; border:1px solid rgba(59,130,246,0.3); padding:2px 8px; border-radius:12px; margin-bottom:4px; font-weight:600;">🎬 MV มีเสียงร้อง</span>'
      : '<span style="display:inline-block; font-size:0.75rem; background:rgba(168,85,247,0.25); color:#c084fc; border:1px solid rgba(168,85,247,0.3); padding:2px 8px; border-radius:12px; margin-bottom:4px; font-weight:600;">🎤 คาราโอเกะ</span>';

    const safeVideo = JSON.stringify(v).replace(/'/g, "&apos;");

    card.innerHTML = `
      <img src="${v.thumbnail}" alt="Thumb" loading="lazy">
      <div class="song-card-info">
        ${tagBadge}
        <div class="song-card-title">${escapeHtml(v.title)}</div>
        <div class="song-card-author">${escapeHtml(v.author)}</div>
        <div class="song-card-duration">⏱️ ${v.duration}</div>
      </div>
      <div class="song-card-actions">
        <div style="display:flex; gap:6px; justify-content: flex-end;">
          <button class="fav-btn ${isFav ? 'active' : ''}" data-id="${v.videoId}" onclick='toggleFavorite(${safeVideo})' title="บันทึกเพลงโปรด">❤️</button>
          <button class="priority-btn" onclick='addSongToQueue(${safeVideo}, true)' title="แซงคิวเป็นเพลงถัดไป">⚡ ร้องเลย</button>
        </div>
        <button class="add-btn" onclick='addSongToQueue(${safeVideo}, false)'>+ ต่อคิว</button>
      </div>
    `;
    resultsList.appendChild(card);
  });
}

window.addSongToQueue = function(video, priority) {
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
  const action = playerState.isPlaying ? 'pause' : 'play';
  socket.emit('player:control', { action });
}

miniSkipBtn.addEventListener('click', skipSong);
ctrlSkipBtn.addEventListener('click', skipSong);

function skipSong() {
  socket.emit('player:control', { action: 'skip' });
  showToast('⏭ ข้ามไปยังเพลงถัดไป');
}

ctrlRestartBtn.addEventListener('click', () => {
  socket.emit('player:control', { action: 'restart' });
  showToast('⏮ เริ่มเพลงใหม่ตั้งแต่ต้น');
});

volumeSlider.addEventListener('input', (e) => {
  const val = e.target.value;
  volumeVal.textContent = `${val}%`;
  socket.emit('player:control', { action: 'volume', value: val });
});

// Vocal Controls
vocalCutBtn.addEventListener('click', () => {
  socket.emit('player:toggle_vocal', 'toggle');
  showToast(playerState.isVocalCut ? '🔊 คืนค่าเสียงร้องปกติ (Stereo)' : '✂️ เปิดโหมดตัดเสียงร้อง');
});

vocalSwapBtn.addEventListener('click', () => {
  if (!currentSong) {
    showToast('ไม่มีเพลงที่กำลังเล่นอยู่');
    return;
  }
  socket.emit('player:toggle_vocal', 'swap_video');
  showToast('⚡ กำลังค้นหาและสลับเป็นเวอร์ชันดนตรีคาราโอเกะ...');
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
