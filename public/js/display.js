const socket = io();

// Ensure YouTube persistent localStorage sticky-caption is forced to FALSE (clean display without auto speech-to-text)
try {
  localStorage.setItem("yt-player-sticky-caption", JSON.stringify({
    data: "false",
    expiration: Date.now() + 315360000000,
    creation: Date.now()
  }));
} catch (e) {}

let player = null;
let isPlayerReady = false;
let currentVideoId = null;
let progressTimer = null;
let isVocalCut = false;
let captionsDisabled = true; // Auto-captions disabled by default for clean MV and karaoke display
let currentActiveSong = null;
let scoreTimeout = null;
let scoreInterval = null;
let sfxVolume = 1.0;
let overlayHideTimer = null;

function showTopOverlay(durationMs = 10000) {
  topOverlay.classList.remove('overlay-hidden');
  clearTimeout(overlayHideTimer);

  if (currentVideoId && !idleScreen.classList.contains('active')) {
    overlayHideTimer = setTimeout(() => {
      topOverlay.classList.add('overlay-hidden');
    }, durationMs);
  }
}

// User interaction wakes up the top banner for 10 seconds
document.addEventListener('mousemove', () => {
  if (currentVideoId && !idleScreen.classList.contains('active')) {
    showTopOverlay(10000);
  }
});

document.addEventListener('click', () => {
  if (currentVideoId && !idleScreen.classList.contains('active')) {
    showTopOverlay(10000);
  }
});

document.addEventListener('touchstart', () => {
  if (currentVideoId && !idleScreen.classList.contains('active')) {
    showTopOverlay(10000);
  }
});

// Audio Context for KTV Soundboard & Jingles
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// DOM Elements
const idleScreen = document.getElementById('idleScreen');
const idleQrImage = document.getElementById('idleQrImage');
const idleQrUrl = document.getElementById('idleQrUrl');
const cornerQr = document.getElementById('cornerQr');
const cornerQrImg = document.getElementById('cornerQrImg');

const tvPlayOverlay = document.getElementById('tvPlayOverlay');
const tvPlayBtn = document.getElementById('tvPlayBtn');
const tvErrorNotice = document.getElementById('tvErrorNotice');
const tvErrorText = document.getElementById('tvErrorText');

const nextSingerAlert = document.getElementById('nextSingerAlert');
const alertNextSongTitle = document.getElementById('alertNextSongTitle');
const alertNextSinger = document.getElementById('alertNextSinger');
const boostBadge = document.getElementById('boostBadge');

const topOverlay = document.getElementById('topOverlay');
const nowPlayingTitle = document.getElementById('nowPlayingTitle');
const requesterBadge = document.getElementById('requesterBadge');
const vocalModeBadge = document.getElementById('vocalModeBadge');
const keyBadge = document.getElementById('keyBadge');
const speedBadge = document.getElementById('speedBadge');

const upNextCard = document.getElementById('upNextCard');
const upNextTitle = document.getElementById('upNextTitle');

const progressBar = document.getElementById('progressBar');
const timeCurrent = document.getElementById('timeCurrent');
const timeDuration = document.getElementById('timeDuration');
const danmakuContainer = document.getElementById('danmakuContainer');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const liveMicsHud = document.getElementById('liveMicsHud');

// Score Elements
const scoreScreen = document.getElementById('scoreScreen');
const scoreGrade = document.getElementById('scoreGrade');
const scoreNumber = document.getElementById('scoreNumber');
const scoreSongTitle = document.getElementById('scoreSongTitle');
const scoreSinger = document.getElementById('scoreSinger');
const scoreComment = document.getElementById('scoreComment');
const scoreCountdownFill = document.getElementById('scoreCountdownFill');
const scoreTimerNum = document.getElementById('scoreTimerNum');

// Multi-Room HUD Elements
const hudRoomCode = document.getElementById('hudRoomCode');
const hudUsersCount = document.getElementById('hudUsersCount');
const idleRoomCodeDigits = document.getElementById('idleRoomCodeDigits');
const topRoomCode = document.getElementById('topRoomCode');
const cornerRoomCode = document.getElementById('cornerRoomCode');

const urlParams = new URLSearchParams(window.location.search);
let currentRoomCode = urlParams.get('room') || localStorage.getItem('ktv_display_room') || '8999';

function updateRoomDisplay(code) {
  if (!code) return;
  currentRoomCode = code;
  localStorage.setItem('ktv_display_room', code);

  if (hudRoomCode) hudRoomCode.textContent = code;
  if (idleRoomCodeDigits) idleRoomCodeDigits.textContent = code;
  if (topRoomCode) topRoomCode.textContent = code;
  if (cornerRoomCode) cornerRoomCode.textContent = code;

  const currentOrigin = window.location.origin;
  const currentRemoteUrl = `${currentOrigin}/remote?room=${code}`;
  if (idleQrImage) idleQrImage.src = `/api/qr?url=${encodeURIComponent(currentRemoteUrl)}`;
  if (cornerQrImg) cornerQrImg.src = `/api/qr?url=${encodeURIComponent(currentRemoteUrl)}`;
  if (idleQrUrl) idleQrUrl.textContent = currentRemoteUrl;
  const hudRemoteSwitchBtn = document.getElementById('hudRemoteSwitchBtn');
  if (hudRemoteSwitchBtn) hudRemoteSwitchBtn.href = currentRemoteUrl;
}

// Click to change room code manually (e.g. set to 8999)
const changeRoomHandler = () => {
  const newCode = prompt('🔢 ใส่รหัสห้อง 4 หลักที่ต้องการ (เช่น 8999):', currentRoomCode || '8999');
  if (newCode && /^\d{4}$/.test(newCode.trim())) {
    const clean = newCode.trim();
    localStorage.setItem('ktv_display_room', clean);
    window.location.search = `?room=${clean}`;
  } else if (newCode) {
    alert('รหัสห้องต้องเป็นตัวเลข 4 หลักเท่านั้นครับ');
  }
};

const hudRoomBadgeEl = document.getElementById('hudRoomBadge');
if (hudRoomBadgeEl) {
  hudRoomBadgeEl.style.cursor = 'pointer';
  hudRoomBadgeEl.title = 'แตะเพื่อเปลี่ยนรหัสห้อง (เช่น 8999)';
  hudRoomBadgeEl.addEventListener('click', changeRoomHandler);
}

const idleBannerEl = document.querySelector('.idle-room-banner');
if (idleBannerEl) {
  idleBannerEl.style.cursor = 'pointer';
  idleBannerEl.title = 'แตะเพื่อเปลี่ยนรหัสห้อง (เช่น 8999)';
  idleBannerEl.addEventListener('click', changeRoomHandler);
}

function updateUsersDisplay(users) {
  if (!hudUsersCount) return;
  const count = Array.isArray(users) ? users.length : 0;
  hudUsersCount.textContent = `${count} คน`;
}

function showTvPlayOverlay() {
  if (tvPlayOverlay) tvPlayOverlay.classList.add('active');
}

function hideTvPlayOverlay() {
  if (tvPlayOverlay) tvPlayOverlay.classList.remove('active');
}

function showTvErrorNotice(text) {
  if (tvErrorText) tvErrorText.textContent = text;
  if (tvErrorNotice) tvErrorNotice.classList.add('active');
}

function hideTvErrorNotice() {
  if (tvErrorNotice) tvErrorNotice.classList.remove('active');
}

if (tvPlayBtn) {
  tvPlayBtn.addEventListener('click', () => {
    if (player) {
      if (player.unMute) player.unMute();
      if (player.playVideo) player.playVideo();
    }
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    hideTvPlayOverlay();
  });
}

// Subtitles & Auto-Captions Controller (Clean view without YouTube speech-to-text captions)
function disableCaptions() {
  if (!captionsDisabled) return;
  // 1. Direct YouTube Player API methods
  try {
    if (player) {
      if (typeof player.unloadModule === 'function') {
        player.unloadModule('captions');
        player.unloadModule('cc');
      }
      if (typeof player.setOption === 'function') {
        player.setOption('captions', 'track', {});
        player.setOption('cc', 'track', {});
        player.setOption('captions', 'reload', false);
        player.setOption('captions', 'fontSize', 0);
      }
    }
  } catch (e) {}

  // 2. PostMessage commands directly to YouTube iframe window
  try {
    const iframe = document.getElementById('ytPlayer');
    if (iframe && iframe.contentWindow) {
      const cmds = [
        ['unloadModule', ['captions']],
        ['unloadModule', ['cc']],
        ['setOption', ['captions', 'track', {}]],
        ['setOption', ['cc', 'track', {}]],
        ['setOption', ['captions', 'fontSize', 0]],
        ['setOption', ['captions', 'reload', false]]
      ];
      cmds.forEach(([func, args]) => {
        iframe.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: func,
          args: args
        }), '*');
      });
    }
  } catch (e) {}
}

function enableCaptions() {
  captionsDisabled = false;
  try {
    if (player) {
      if (typeof player.loadModule === 'function') {
        player.loadModule('captions');
      }
      if (typeof player.setOption === 'function') {
        player.setOption('captions', 'track', { languageCode: 'th' });
        player.setOption('captions', 'reload', true);
      }
    }
  } catch (e) {}
}

function onPlayerApiChange(event) {
  if (captionsDisabled) {
    disableCaptions();
  }
}

// YouTube IFrame API Ready Callback
function onYouTubeIframeAPIReady() {
  player = new YT.Player('ytPlayer', {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
      iv_load_policy: 3,
      cc_load_policy: 0,
      cc_lang_pref: 'none',
      hl: 'th',
      modestbranding: 1,
      rel: 0,
      enablejsapi: 1,
      playsinline: 1
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
      onApiChange: onPlayerApiChange,
      onError: onPlayerError
    }
  });
}

function onPlayerReady(event) {
  isPlayerReady = true;
  console.log('✅ YouTube TV Player Ready');
  disableCaptions();
  socket.emit('request:sync');
}

let autoplayCheckTimer = null;

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    console.log('Song ended, showing performance score...');
    clearTimeout(autoplayCheckTimer);
    hideTvPlayOverlay();
    showPerformanceScore();
  } else if (event.data === YT.PlayerState.PLAYING) {
    clearTimeout(autoplayCheckTimer);
    hideTvPlayOverlay();
    hideTvErrorNotice();
    startProgressTracker();
    showTopOverlay(10000);

    // Turn off YouTube automated speech captions across multiple timing phases
    if (captionsDisabled) {
      disableCaptions();
      setTimeout(disableCaptions, 250);
      setTimeout(disableCaptions, 600);
      setTimeout(disableCaptions, 1200);
      setTimeout(disableCaptions, 2500);
      setTimeout(disableCaptions, 4500);
    }

    socket.emit('tv:state_update', {
      isPlaying: true,
      currentTime: player.getCurrentTime(),
      duration: player.getDuration()
    });
  } else if (event.data === YT.PlayerState.PAUSED) {
    stopProgressTracker();
    socket.emit('tv:state_update', {
      isPlaying: false,
      currentTime: player.getCurrentTime(),
      duration: player.getDuration()
    });
  } else if (event.data === YT.PlayerState.BUFFERING) {
    console.log('Video buffering...');
    hideTvPlayOverlay();
    hideTvErrorNotice();
    if (captionsDisabled) disableCaptions();
  } else if (event.data === YT.PlayerState.CUED) {
    console.log('Video cued, attempting auto-play...');
    if (captionsDisabled) disableCaptions();
    if (player && player.playVideo) player.playVideo();
  }
}

function onPlayerError(e) {
  console.warn('YouTube Player Error:', e.data);
  let msg = 'เกิดข้อผิดพลาดในการโหลดวิดีโอ';
  if (e.data === 150 || e.data === 101) {
    msg = '⚠️ คลิปนี้ติดลิขสิทธิ์ไม่อนุญาตให้เล่นนอก YouTube กำลังข้ามไปเพลงถัดไป...';
  } else if (e.data === 100) {
    msg = '⚠️ ไม่พบคลิปนี้ หรือคลิปถูกลบ กำลังข้ามไปเพลงถัดไป...';
  } else if (e.data === 2) {
    msg = '⚠️ รหัสวิดีโอไม่ถูกต้อง กำลังข้าม...';
  }
  showTvErrorNotice(msg);
  setTimeout(() => {
    hideTvErrorNotice();
    socket.emit('tv:song_ended');
  }, 4000);
}

let currentQueue = [];
let hasTriggeredNextAlert = false;
let nextAlertTimer = null;

function showNextSingerAlert(nextSong) {
  if (!nextSingerAlert || !nextSong) return;
  alertNextSongTitle.textContent = nextSong.title;
  alertNextSinger.textContent = `👤 ร้องโดย: ${nextSong.requester || 'เพื่อนร่วมห้อง'}`;
  nextSingerAlert.classList.add('active');
  playKtvSFX('whistle');
  if (nextAlertTimer) clearTimeout(nextAlertTimer);
  nextAlertTimer = setTimeout(hideNextSingerAlert, 12000);
}

function hideNextSingerAlert() {
  if (nextSingerAlert) nextSingerAlert.classList.remove('active');
  if (nextAlertTimer) clearTimeout(nextAlertTimer);
}

function startProgressTracker() {
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (!player || !player.getCurrentTime) return;
    const cur = player.getCurrentTime() || 0;
    const dur = player.getDuration() || 0;

    // Suppress late-loading automated YouTube subtitles during early playback
    if (captionsDisabled && cur < 8) {
      disableCaptions();
    }

    if (dur > 0) {
      const pct = (cur / dur) * 100;
      progressBar.style.width = `${pct}%`;
      timeCurrent.textContent = formatTime(cur);
      timeDuration.textContent = formatTime(dur);

      // Trigger Next Singer Alert when 25s remain
      const remaining = dur - cur;
      if (remaining <= 25 && remaining > 5 && !hasTriggeredNextAlert && currentQueue && currentQueue.length > 0) {
        hasTriggeredNextAlert = true;
        showNextSingerAlert(currentQueue[0]);
      }

      socket.emit('tv:state_update', {
        isPlaying: true,
        currentTime: cur,
        duration: dur
      });
    }
  }, 500);
}

function stopProgressTracker() {
  if (progressTimer) clearInterval(progressTimer);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Socket Connection & Room Lifecycle
socket.on('connect', () => {
  console.log('📡 Connected to server, initializing display for room:', currentRoomCode || '(auto-generate)');
  socket.emit('display:init', { requestedRoom: currentRoomCode });
});

// Socket Events
socket.on('state:sync', (data) => {
  if (data.roomCode) {
    updateRoomDisplay(data.roomCode);
  }
  if (data.users) {
    updateUsersDisplay(data.users);
  }

  currentActiveSong = data.currentSong;
  updateQueueDisplay(data.songQueue, data.currentSong);

  if (data.playerState) {
    if (data.playerState.sfxVolume !== undefined) {
      sfxVolume = data.playerState.sfxVolume / 100;
    }
    updateSpeedBadge(data.playerState.speed || 1.0);
    updateKeyBadge(data.playerState.keyShift || 0);
    if (data.playerState.isBoosted !== undefined) {
      updateBoostBadge(data.playerState.isBoosted);
    }
  }

  if (data.currentSong && isPlayerReady) {
    if (currentVideoId !== data.currentSong.videoId) {
      loadVideo(data.currentSong.videoId);
    }
  } else if (!data.currentSong) {
    showIdleScreen();
  }
});

socket.on('room:users_update', ({ users }) => {
  updateUsersDisplay(users);
});

socket.on('queue:update', ({ songQueue, currentSong }) => {
  currentActiveSong = currentSong;
  updateQueueDisplay(songQueue, currentSong);
  if (currentVideoId) showTopOverlay(10000);
});

socket.on('tv:command', (cmd) => {
  if (!player) return;
  if (cmd.action !== 'idle') showTopOverlay(10000);

  switch (cmd.action) {
    case 'load_video':
      hideScoreScreen();
      hideTvPlayOverlay();
      hideTvErrorNotice();
      loadVideo(cmd.videoId);
      break;
    case 'play':
      hideScoreScreen();
      hideTvPlayOverlay();
      if (player) {
        if (player.isMuted && player.isMuted()) {
          if (player.unMute) player.unMute();
          if (player.setVolume) player.setVolume(100);
        }
        if (player.playVideo) player.playVideo();
      }
      break;
    case 'pause':
      if (player.pauseVideo) player.pauseVideo();
      break;
    case 'restart':
      hideScoreScreen();
      if (player.seekTo) player.seekTo(0);
      break;
    case 'volume':
      if (player.setVolume) player.setVolume(cmd.value);
      break;
    case 'sfx_volume':
      sfxVolume = cmd.value / 100;
      break;
    case 'boost':
      updateBoostBadge(cmd.value);
      break;
    case 'speed':
      if (player.setPlaybackRate) {
        player.setPlaybackRate(cmd.value);
      }
      updateSpeedBadge(cmd.value);
      break;
    case 'key':
      updateKeyBadge(cmd.value);
      break;
    case 'seek':
      if (player.seekTo) player.seekTo(cmd.value);
      break;
    case 'toggle_vocal':
      isVocalCut = cmd.isVocalCut;
      updateVocalBadge(isVocalCut);
      break;
    case 'toggle_cc':
      captionsDisabled = !cmd.value;
      if (captionsDisabled) {
        disableCaptions();
      } else {
        enableCaptions();
      }
      break;
    case 'dismiss_score':
      hideScoreScreen();
      break;
    case 'idle':
      hideScoreScreen();
      showIdleScreen();
      break;
  }
});

function loadVideo(videoId) {
  currentVideoId = videoId;
  hasTriggeredNextAlert = false;
  hideNextSingerAlert();
  hideTvPlayOverlay();
  hideTvErrorNotice();
  idleScreen.classList.remove('active');
  stopIdleCanvas();
  cornerQr.style.display = 'flex';
  topOverlay.style.display = 'flex';
  showTopOverlay(10000);

  if (player && player.loadVideoById) {
    if (player.unMute) player.unMute();
    if (player.setVolume) player.setVolume(100);

    player.loadVideoById({
      videoId: videoId,
      suggestedQuality: 'hd720'
    });
    if (captionsDisabled) {
      disableCaptions();
    }
    if (player.playVideo) {
      player.playVideo();
    }
  }

  // Graceful autoplay watchdog: allow up to 6s for buffering before attempting fallback
  clearTimeout(autoplayCheckTimer);
  autoplayCheckTimer = setTimeout(() => {
    if (player && player.getPlayerState) {
      const state = player.getPlayerState();
      if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) {
        console.warn('Playback did not start automatically after 6s. Retrying play...');
        if (player.playVideo) player.playVideo();
        setTimeout(() => {
          const s2 = player.getPlayerState();
          if (s2 !== YT.PlayerState.PLAYING && s2 !== YT.PlayerState.BUFFERING) {
            console.warn('Attempting muted fallback to unblock autoplay...');
            if (player.mute) player.mute();
            if (player.playVideo) player.playVideo();
            showTvPlayOverlay();
          }
        }, 2000);
      }
    }
  }, 6000);
}

function showIdleScreen() {
  clearTimeout(autoplayCheckTimer);
  currentVideoId = null;
  hasTriggeredNextAlert = false;
  hideNextSingerAlert();
  hideTvPlayOverlay();
  hideTvErrorNotice();
  idleScreen.classList.add('active');
  startIdleCanvas();
  cornerQr.style.display = 'none';
  topOverlay.style.display = 'none';
  topOverlay.classList.remove('overlay-hidden');
  clearTimeout(overlayHideTimer);
  stopProgressTracker();
  progressBar.style.width = '0%';
  timeCurrent.textContent = '00:00';
  timeDuration.textContent = '00:00';

  if (player && player.stopVideo) {
    player.stopVideo();
  }
}

function updateQueueDisplay(songQueue, currentSong) {
  currentQueue = songQueue || [];
  if (currentSong) {
    nowPlayingTitle.textContent = currentSong.title;
    requesterBadge.innerHTML = `<span>👤 ขอโดย: ${currentSong.requester || 'มือถือ'}</span>`;
  } else {
    nowPlayingTitle.textContent = 'กำลังรอเพลง...';
  }
  if (currentSong) {
    nowPlayingTitle.textContent = currentSong.title;
    requesterBadge.innerHTML = `<span>👤 ขอโดย: ${currentSong.requester || 'มือถือ'}</span>`;
  } else {
    nowPlayingTitle.textContent = 'กำลังรอเพลง...';
  }

  if (songQueue && songQueue.length > 0) {
    const nextSong = songQueue[0];
    upNextTitle.textContent = `${nextSong.title} (${nextSong.requester || 'มือถือ'})`;
    upNextCard.style.opacity = '1';
  } else {
    upNextTitle.textContent = 'ยังไม่มีเพลงในคิว';
    upNextCard.style.opacity = '0.5';
  }
}

function updateVocalBadge(isCut) {
  if (isCut) {
    vocalModeBadge.classList.add('vocal-cut');
    vocalModeBadge.innerHTML = '<span>🎙️ ตัดเสียงร้อง / คาราโอเกะ</span>';
  } else {
    vocalModeBadge.classList.remove('vocal-cut');
    vocalModeBadge.innerHTML = '<span>🔊 สเตอริโอปกติ</span>';
  }
}

function updateSpeedBadge(speed) {
  if (speed !== 1.0) {
    speedBadge.style.display = 'inline-block';
    speedBadge.innerHTML = `<span>⚡ ความเร็ว: ${speed}x</span>`;
  } else {
    speedBadge.style.display = 'none';
  }
}

function updateKeyBadge(keyShift) {
  if (keyShift !== 0) {
    keyBadge.style.display = 'inline-block';
    const sign = keyShift > 0 ? `+${keyShift}` : keyShift;
    keyBadge.innerHTML = `<span>🎼 คีย์: ${sign}</span>`;
  } else {
    keyBadge.style.display = 'none';
  }
}

// Virtual Score System
function showPerformanceScore() {
  stopProgressTracker();

  // Generate realistic fun score
  const score = Math.floor(Math.random() * 11) + 89; // 89 to 99
  let grade = 'S';
  let comment = 'เสียงดีระดับเดอะวอยซ์! ไพเราะจับใจคนทั้งห้อง!';

  if (score >= 96) {
    grade = 'SS';
    comment = 'สุดยอดเสียงทองคำ! ลูกคอ 9 ชั้น นักร้องอาชีพชัดๆ! 🏆';
  } else if (score >= 92) {
    grade = 'S';
    comment = 'ร้องเพราะมากกกก! อินเนอร์มาเต็มจนขนลุก! 🌟';
  } else {
    grade = 'A';
    comment = 'จังหวะเป๊ะ เสียงร้องมีเสน่ห์ ปรบมือรัวๆ! 👏';
  }

  scoreSongTitle.textContent = currentActiveSong ? currentActiveSong.title : 'เพลงที่ร้อง';
  scoreSinger.textContent = `👤 นักร้อง: ${currentActiveSong ? currentActiveSong.requester : 'คุณ'}`;
  scoreGrade.textContent = grade;
  scoreComment.textContent = `"${comment}"`;

  // Animated Count Up
  scoreNumber.textContent = '0';
  scoreScreen.classList.add('active');

  // Play fanfare and applause SFX
  playKtvSFX('fanfare');
  setTimeout(() => playKtvSFX('applause'), 700);

  let curScore = 0;
  const countStep = Math.ceil(score / 25);
  const countTimer = setInterval(() => {
    curScore += countStep;
    if (curScore >= score) {
      curScore = score;
      clearInterval(countTimer);
    }
    scoreNumber.textContent = curScore;
  }, 40);

  // 6-second countdown bar
  let countdownSec = 6;
  scoreTimerNum.textContent = countdownSec;
  scoreCountdownFill.style.width = '100%';

  clearInterval(scoreInterval);
  clearTimeout(scoreTimeout);

  scoreInterval = setInterval(() => {
    countdownSec--;
    if (countdownSec >= 0) {
      scoreTimerNum.textContent = countdownSec;
      scoreCountdownFill.style.width = `${(countdownSec / 6) * 100}%`;
    }
  }, 1000);

  scoreTimeout = setTimeout(() => {
    hideScoreScreen();
    socket.emit('tv:song_ended');
  }, 6500);
}

function hideScoreScreen() {
  scoreScreen.classList.remove('active');
  clearInterval(scoreInterval);
  clearTimeout(scoreTimeout);
}

// Real Audio SFX File Mapping & Web Audio Buffers
const sfxAudioMap = {
  applause: '/sfx/applause.mp3',
  cheering: '/sfx/cheering.mp3',
  horn: '/sfx/horn.mp3',
  drumroll: '/sfx/drumroll.mp3',
  rimshot: '/sfx/rimshot.mp3',
  laugh: '/sfx/laugh.mp3',
  fanfare: '/sfx/fanfare.mp3',
  whistle: '/sfx/whistle.mp3'
};
const sfxBuffers = {};

async function preloadSFX() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    for (const [name, url] of Object.entries(sfxAudioMap)) {
      if (sfxBuffers[name]) continue;
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const ab = await resp.arrayBuffer();
          sfxBuffers[name] = await ctx.decodeAudioData(ab);
          console.log(`✅ Loaded SFX: ${name}`);
        }
      } catch (e) {
        // Continue loading others
      }
    }
  } catch (err) {
    console.warn('Preload SFX error:', err);
  }
}

// Preload on first click or touch on TV screen
['click', 'touchstart', 'keydown'].forEach(evt => {
  window.addEventListener(evt, () => preloadSFX(), { once: true });
});

// Socket listener for party sound effects
socket.on('tv:sfx', (data) => {
  playKtvSFX(data.type);
});

function playKtvSFX(type) {
  // 1. Try playing pre-decoded Web Audio buffer (0ms latency, polyphonic overlap)
  try {
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      if (sfxBuffers[type]) {
        const source = ctx.createBufferSource();
        source.buffer = sfxBuffers[type];
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(sfxVolume, ctx.currentTime);
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        source.start(0);
        return;
      }
    }
  } catch (err) {
    console.warn('Web Audio buffer playback error:', err);
  }

  // 2. Fallback to HTML5 Audio element
  if (sfxAudioMap[type]) {
    try {
      const audio = new Audio(sfxAudioMap[type]);
      audio.volume = Math.max(0, Math.min(1, sfxVolume));
      const p = audio.play();
      if (p) {
        p.catch(() => playSynthSFX(type));
      }
      return;
    } catch (err) {
      console.warn('HTML5 Audio playback error:', err);
    }
  }

  // 3. Fallback to Procedural Synthesis
  playSynthSFX(type);
}

function playSynthSFX(type) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(sfxVolume, now);
    masterGain.connect(ctx.destination);

    if (type === 'applause' || type === 'cheering') {
      // Pink Noise Crowd Clapping
      const bufferSize = ctx.sampleRate * 2.5;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.8, now + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 2.4);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      noise.start(now);

    } else if (type === 'horn') {
      // Reggae / DJ Airhorn: 3 rapid stutter beeps then long blast
      const pitches = [587, 554, 523, 587];
      pitches.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.14);

        gain.gain.setValueAtTime(0.6, now + idx * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.14 + 0.22);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now + idx * 0.14);
        osc.stop(now + idx * 0.14 + 0.25);
      });

    } else if (type === 'drumroll') {
      // Snare Drumroll to Cymbal Crash
      for (let i = 0; i < 20; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180 + Math.random() * 30, now + i * 0.06);
        gain.gain.setValueAtTime(0.3 + (i / 20) * 0.4, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.06 + 0.05);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.05);
      }
      setTimeout(() => {
        playCymbalCrash(ctx, masterGain);
      }, 1200);

    } else if (type === 'rimshot') {
      // Ba-Dum-Tss!
      playSnareHit(ctx, masterGain, now, 180);
      playSnareHit(ctx, masterGain, now + 0.15, 220);
      setTimeout(() => {
        playCymbalCrash(ctx, masterGain);
      }, 250);

    } else if (type === 'fanfare') {
      // Victory Brass Fanfare (C5, E5, G5, C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + i * 0.12);
        gain.gain.setValueAtTime(0.4, now + i * 0.12);
        const duration = (i === notes.length - 1) ? 0.8 : 0.18;
        gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.12 + duration);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + duration);
      });

    } else if (type === 'laugh') {
      // Comedic Wobble
      const freqs = [350, 420, 310, 450, 280];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.12);
        gain.gain.setValueAtTime(0.5, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.12 + 0.15);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.16);
      });
    } else if (type === 'whistle') {
      // High pitch slide
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(2400, now + 0.3);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  } catch (err) {
    console.warn('SFX Synth error:', err);
  }
}

function playSnareHit(ctx, dest, time, freq) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, time);
  gain.gain.setValueAtTime(0.8, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.08);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + 0.08);
}

function playCymbalCrash(ctx, dest) {
  const now = ctx.currentTime;
  const bufferSize = ctx.sampleRate * 0.8;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(6000, now);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.7, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  noise.start(now);
}

// Danmaku / Live Reactions Floating
socket.on('tv:danmaku', (item) => {
  const el = document.createElement('div');
  el.className = 'danmaku-item';
  el.innerHTML = `<span class="emoji">${item.emoji}</span><span>${item.text || ''} <small style="opacity:0.7">(${item.sender})</small></span>`;
  
  const topPos = Math.floor(Math.random() * 65) + 10;
  el.style.top = `${topPos}%`;

  danmakuContainer.appendChild(el);

  setTimeout(() => {
    el.remove();
  }, 8500);
});

// Fullscreen toggle
fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => console.log(err));
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
});

// Audio Boost Badge
function updateBoostBadge(isBoosted) {
  if (boostBadge) {
    boostBadge.style.display = isBoosted ? 'inline-block' : 'none';
  }
  if (player && player.setVolume) {
    player.setVolume(isBoosted ? 100 : 80);
  }
}

// Cyber Clock
function initCyberClock() {
  const clockEl = document.getElementById('cyberClock');
  if (!clockEl) return;
  function update() {
    const d = new Date();
    clockEl.textContent = d.toTimeString().split(' ')[0];
  }
  update();
  setInterval(update, 1000);
}
initCyberClock();

// Lightweight Idle Wave Canvas (Stops during video playback to save 100% GPU)
let idleAnimationFrameId = null;
let isIdleCanvasRunning = false;
let idleCanvasCtx = null;
let idleCanvasPhase = 0;
let idleCanvasElement = null;

function resizeIdleCanvas() {
  if (!idleCanvasElement) return;
  idleCanvasElement.width = window.innerWidth;
  idleCanvasElement.height = window.innerHeight;
}

function startIdleCanvas() {
  if (isIdleCanvasRunning || !idleCanvasElement) return;
  isIdleCanvasRunning = true;
  drawIdleCanvas();
}

function stopIdleCanvas() {
  isIdleCanvasRunning = false;
  if (idleAnimationFrameId) {
    cancelAnimationFrame(idleAnimationFrameId);
    idleAnimationFrameId = null;
  }
  if (idleCanvasCtx && idleCanvasElement) {
    idleCanvasCtx.clearRect(0, 0, idleCanvasElement.width, idleCanvasElement.height);
  }
}

function drawIdleCanvas() {
  if (!isIdleCanvasRunning || !idleScreen || !idleScreen.classList.contains('active')) {
    isIdleCanvasRunning = false;
    return;
  }
  if (!idleCanvasCtx || !idleCanvasElement) return;

  idleCanvasCtx.clearRect(0, 0, idleCanvasElement.width, idleCanvasElement.height);
  idleCanvasPhase += 0.02;

  const centerY = idleCanvasElement.height * 0.72;
  const waves = [
    { color: 'rgba(0, 240, 255, 0.28)', freq: 0.003, amp: 45, speed: 1.0 },
    { color: 'rgba(168, 85, 247, 0.25)', freq: 0.004, amp: 35, speed: 0.7 },
    { color: 'rgba(244, 63, 94, 0.20)', freq: 0.002, amp: 55, speed: -0.5 }
  ];

  waves.forEach(w => {
    idleCanvasCtx.beginPath();
    idleCanvasCtx.strokeStyle = w.color;
    idleCanvasCtx.lineWidth = 2.5;
    for (let x = 0; x < idleCanvasElement.width; x += 16) {
      const y = centerY + Math.sin(x * w.freq + idleCanvasPhase * w.speed) * w.amp + Math.cos((x * 0.002) + idleCanvasPhase) * 15;
      if (x === 0) idleCanvasCtx.moveTo(x, y);
      else idleCanvasCtx.lineTo(x, y);
    }
    idleCanvasCtx.stroke();
  });

  idleAnimationFrameId = requestAnimationFrame(drawIdleCanvas);
}

function initIdleCanvas() {
  idleCanvasElement = document.getElementById('idleVisualizerCanvas');
  if (!idleCanvasElement) return;
  idleCanvasCtx = idleCanvasElement.getContext('2d');
  resizeIdleCanvas();
  window.addEventListener('resize', resizeIdleCanvas);
  startIdleCanvas();
}
initIdleCanvas();

// TV Remote Key Handler (DPAD_CENTER, ENTER, SPACE, MEDIA_PLAY_PAUSE)
document.addEventListener('keydown', (e) => {
  const code = e.keyCode || e.which;
  if (code === 13 || code === 23 || code === 32 || code === 179 || code === 85 || code === 66) {
    if (player) {
      if (player.isMuted && player.isMuted()) {
        if (player.unMute) player.unMute();
        if (player.setVolume) player.setVolume(100);
      }
      if (player.playVideo) player.playVideo();
    }
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    hideTvPlayOverlay();
  }
});

// =============================================================================
// WebRTC Wireless Smartphone Microphones Pipeline (TV Receiver)
// =============================================================================
const activeMics = new Map(); // senderSocketId -> { pc, stream, sourceNode, gainNode, wetGain, dryGain, nickname }

function renderLiveMicsHud() {
  if (!liveMicsHud) return;
  liveMicsHud.innerHTML = '';
  if (activeMics.size === 0) return;

  let micIndex = 1;
  activeMics.forEach((micData, socketId) => {
    const pill = document.createElement('div');
    pill.className = 'live-mic-pill';
    pill.innerHTML = `
      <div class="live-mic-info">
        <span class="mic-icon">🎙️</span>
        <span>ไมค์ ${micIndex}: <strong>${escapeHtml(micData.nickname)}</strong></span>
        <span class="live-tag">LIVE</span>
      </div>
      <div class="mic-wave-bars">
        <span></span><span></span><span></span><span></span>
      </div>
    `;
    liveMicsHud.appendChild(pill);
    micIndex++;
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

socket.on('webrtc:offer', async ({ offer, senderSocketId, nickname }) => {
  console.log(`🎙️ Incoming WebRTC Mic offer from ${nickname} (${senderSocketId})`);
  
  // Cleanup any old peer connection from this sender
  if (activeMics.has(senderSocketId)) {
    closeMicSession(senderSocketId);
  }

  // Allow up to 2 simultaneous mics (Solo or Duet)
  if (activeMics.size >= 2) {
    console.warn('Max 2 simultaneous microphones reached.');
    return;
  }

  try {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    const micEntry = {
      pc,
      stream: null,
      sourceNode: null,
      gainNode: null,
      wetGain: null,
      dryGain: null,
      nickname: nickname || 'นักร้อง'
    };

    activeMics.set(senderSocketId, micEntry);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('webrtc:ice_candidate', {
          candidate: e.candidate,
          targetSocketId: senderSocketId
        });
      }
    };

    pc.ontrack = (e) => {
      console.log(`🎙️ Audio track received from ${nickname}!`);
      const stream = e.streams[0];
      micEntry.stream = stream;

      // WebRTC audio pipeline activation for WebKit (Safari) & Chromium:
      // An attached HTMLAudioElement ensures the browser's RTP decoder starts feeding PCM data
      try {
        const audioWakeEl = document.createElement('audio');
        audioWakeEl.autoplay = true;
        audioWakeEl.playsInline = true;
        audioWakeEl.muted = true;
        audioWakeEl.srcObject = stream;
        audioWakeEl.play().catch(() => {});
        micEntry.audioWakeEl = audioWakeEl;
      } catch (wakeErr) {
        console.warn('Audio wake element fallback notice:', wakeErr);
      }

      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(1.2, ctx.currentTime);

      // Studio Slapback Reverb & Echo
      const delay = ctx.createDelay();
      delay.delayTime.setValueAtTime(0.16, ctx.currentTime); // 160ms
      const feedback = ctx.createGain();
      feedback.gain.setValueAtTime(0.26, ctx.currentTime); // 26% decay
      delay.connect(feedback);
      feedback.connect(delay);

      const dryGain = ctx.createGain();
      dryGain.gain.setValueAtTime(0.85, ctx.currentTime);
      const wetGain = ctx.createGain();
      wetGain.gain.setValueAtTime(0.35, ctx.currentTime);

      source.connect(dryGain);
      source.connect(delay);
      delay.connect(wetGain);

      dryGain.connect(gainNode);
      wetGain.connect(gainNode);

      // Output directly to TV Speakers / Soundbar
      gainNode.connect(ctx.destination);

      micEntry.sourceNode = source;
      micEntry.gainNode = gainNode;
      micEntry.wetGain = wetGain;
      micEntry.dryGain = dryGain;

      renderLiveMicsHud();
      playKtvSFX('cheering');
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('webrtc:answer', {
      answer,
      targetSocketId: senderSocketId
    });

    renderLiveMicsHud();
  } catch (err) {
    console.error('Failed to handle incoming WebRTC offer:', err);
    closeMicSession(senderSocketId);
  }
});

socket.on('webrtc:ice_candidate', async ({ candidate, senderSocketId }) => {
  const micEntry = activeMics.get(senderSocketId);
  if (micEntry && micEntry.pc && candidate) {
    try {
      await micEntry.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('Error adding ICE candidate:', e);
    }
  }
});

socket.on('mic:stop', ({ senderSocketId }) => {
  console.log(`🎙️ Mic stopped by sender: ${senderSocketId}`);
  closeMicSession(senderSocketId);
});

socket.on('mic:control', ({ senderSocketId, volume, echoEnabled }) => {
  const micEntry = activeMics.get(senderSocketId);
  if (!micEntry) return;

  const ctx = getAudioContext();
  if (volume !== undefined && micEntry.gainNode) {
    const volFloat = Math.max(0, Math.min(2.0, volume / 100));
    micEntry.gainNode.gain.setValueAtTime(volFloat, ctx.currentTime);
  }
  if (echoEnabled !== undefined && micEntry.wetGain) {
    micEntry.wetGain.gain.setValueAtTime(echoEnabled ? 0.35 : 0.0, ctx.currentTime);
  }
});

function closeMicSession(senderSocketId) {
  const micEntry = activeMics.get(senderSocketId);
  if (micEntry) {
    try {
      if (micEntry.audioWakeEl) {
        micEntry.audioWakeEl.srcObject = null;
        micEntry.audioWakeEl.remove();
      }
      if (micEntry.pc) micEntry.pc.close();
      if (micEntry.sourceNode) micEntry.sourceNode.disconnect();
      if (micEntry.gainNode) micEntry.gainNode.disconnect();
    } catch (e) {}
    activeMics.delete(senderSocketId);
    renderLiveMicsHud();
  }
}
