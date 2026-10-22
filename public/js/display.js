const socket = io();

let player = null;
let isPlayerReady = false;
let currentVideoId = null;
let progressTimer = null;
let isVocalCut = false;
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

// Score Elements
const scoreScreen = document.getElementById('scoreScreen');
const scoreGrade = document.getElementById('scoreGrade');
const scoreNumber = document.getElementById('scoreNumber');
const scoreSongTitle = document.getElementById('scoreSongTitle');
const scoreSinger = document.getElementById('scoreSinger');
const scoreComment = document.getElementById('scoreComment');
const scoreCountdownFill = document.getElementById('scoreCountdownFill');
const scoreTimerNum = document.getElementById('scoreTimerNum');

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
      modestbranding: 1,
      rel: 0,
      origin: window.location.origin
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError: onPlayerError
    }
  });
}

function onPlayerReady(event) {
  isPlayerReady = true;
  console.log('✅ YouTube TV Player Ready');
  socket.emit('request:sync');
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    console.log('Song ended, showing performance score...');
    showPerformanceScore();
  } else if (event.data === YT.PlayerState.PLAYING) {
    startProgressTracker();
    showTopOverlay(10000);
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
  }
}

function onPlayerError(e) {
  console.warn('YouTube Player Error:', e.data);
  setTimeout(() => {
    socket.emit('tv:song_ended');
  }, 2000);
}

function startProgressTracker() {
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (!player || !player.getCurrentTime) return;
    const cur = player.getCurrentTime() || 0;
    const dur = player.getDuration() || 0;
    if (dur > 0) {
      const pct = (cur / dur) * 100;
      progressBar.style.width = `${pct}%`;
      timeCurrent.textContent = formatTime(cur);
      timeDuration.textContent = formatTime(dur);

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

// Socket Events
socket.on('state:sync', (data) => {
  if (data.qrCode) {
    idleQrImage.src = data.qrCode;
    cornerQrImg.src = data.qrCode;
  }
  if (data.remoteUrl) {
    idleQrUrl.textContent = data.remoteUrl;
  }

  currentActiveSong = data.currentSong;
  updateQueueDisplay(data.songQueue, data.currentSong);

  if (data.playerState) {
    if (data.playerState.sfxVolume !== undefined) {
      sfxVolume = data.playerState.sfxVolume / 100;
    }
    updateSpeedBadge(data.playerState.speed || 1.0);
    updateKeyBadge(data.playerState.keyShift || 0);
  }

  if (data.currentSong && isPlayerReady) {
    if (currentVideoId !== data.currentSong.videoId) {
      loadVideo(data.currentSong.videoId);
    }
  } else if (!data.currentSong) {
    showIdleScreen();
  }
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
      loadVideo(cmd.videoId);
      break;
    case 'play':
      hideScoreScreen();
      if (player.playVideo) player.playVideo();
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
  idleScreen.classList.remove('active');
  cornerQr.style.display = 'flex';
  topOverlay.style.display = 'flex';
  showTopOverlay(10000);

  if (player && player.loadVideoById) {
    player.loadVideoById({
      videoId: videoId,
      suggestedQuality: 'hd1080'
    });
  }
}

function showIdleScreen() {
  currentVideoId = null;
  idleScreen.classList.add('active');
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

// Web Audio API KTV Synthesizer (Sound Effects / Jingles)
socket.on('tv:sfx', (data) => {
  playKtvSFX(data.type);
});

function playKtvSFX(type) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(sfxVolume, now);
    masterGain.connect(ctx.destination);

    if (type === 'applause') {
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
      // Crash at end
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
