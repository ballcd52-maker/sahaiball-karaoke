const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const yts = require('yt-search');
const qrcode = require('qrcode');
const os = require('os');
const path = require('path');
const cors = require('cors');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Helper to get local IPv4 address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIP();
const REMOTE_URL = `http://${LOCAL_IP}:${PORT}/remote`;

// State Management
let currentSong = null;
let songQueue = [];
let songHistory = [];
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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Friendly URL Routes
app.get('/remote', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'remote.html'));
});

app.get('/display', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

// Generate QR Code for Mobile Connection
let qrCodeDataURL = '';
qrcode.toDataURL(REMOTE_URL, { margin: 1, width: 250 }, (err, url) => {
  if (!err) qrCodeDataURL = url;
});

function getBaseUrl(req) {
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  }
  if (req) {
    const host = req.get('host');
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    return `${proto}://${host}`;
  }
  return `http://${LOCAL_IP}:${PORT}`;
}

// API: Direct QR Code Generator Image
app.get('/api/qr', async (req, res) => {
  try {
    const targetUrl = req.query.url || `${getBaseUrl(req)}/remote`;
    const qrBuffer = await qrcode.toBuffer(targetUrl, { margin: 1, width: 260 });
    res.type('png').send(qrBuffer);
  } catch (err) {
    res.status(500).send('QR Error');
  }
});

// API: System Information (Dynamically adapts to local IP or Cloud URL)
app.get('/api/info', async (req, res) => {
  try {
    const baseUrl = getBaseUrl(req);
    const dynamicRemoteUrl = `${baseUrl}/remote`;
    const dynamicQr = await qrcode.toDataURL(dynamicRemoteUrl, { margin: 1, width: 250 });

    res.json({
      localIp: LOCAL_IP,
      port: PORT,
      remoteUrl: dynamicRemoteUrl,
      qrCode: dynamicQr,
      currentSong,
      songQueue,
      playerState
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate info' });
  }
});

// API: YouTube Search
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    const isKaraokeOnly = req.query.karaoke === 'true';
    if (!query) return res.status(400).json({ error: 'Query is required' });

    let searchTerm = query.trim();
    if (isKaraokeOnly && !searchTerm.toLowerCase().includes('karaoke') && !searchTerm.includes('คาราโอเกะ')) {
      searchTerm += ' คาราโอเกะ';
    }

    const results = await yts(searchTerm);
    const videos = (results.videos || []).slice(0, 20).map(v => ({
      videoId: v.videoId,
      title: v.title,
      thumbnail: v.thumbnail || v.image,
      duration: v.timestamp || `${Math.floor(v.seconds / 60)}:${v.seconds % 60}`,
      seconds: v.seconds,
      author: v.author ? v.author.name : '',
      views: v.views
    }));

    res.json({ results: videos, searchTerm });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Failed to search YouTube' });
  }
});

// WebSocket Events
io.on('connection', (socket) => {
  // Send initial state to newly connected client
  socket.emit('state:sync', {
    currentSong,
    songQueue,
    playerState,
    remoteUrl: REMOTE_URL,
    qrCode: qrCodeDataURL
  });

  // Client requests initial sync
  socket.on('request:sync', () => {
    socket.emit('state:sync', {
      currentSong,
      songQueue,
      playerState,
      remoteUrl: REMOTE_URL,
      qrCode: qrCodeDataURL
    });
  });

  // Add song to queue
  socket.on('queue:add', (songData) => {
    const item = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      videoId: songData.videoId,
      title: songData.title,
      thumbnail: songData.thumbnail,
      duration: songData.duration,
      seconds: songData.seconds,
      author: songData.author,
      requester: songData.requester || 'มือถือ',
      addedAt: new Date().toLocaleTimeString('th-TH')
    };

    if (songData.priority) {
      // Insert right after current song or at index 0
      songQueue.unshift(item);
    } else {
      songQueue.push(item);
    }

    // If nothing is playing, play immediately
    if (!currentSong) {
      playNextSong();
    } else {
      io.emit('queue:update', { songQueue, currentSong });
    }
  });

  // Remove song from queue
  socket.on('queue:remove', (songId) => {
    songQueue = songQueue.filter(s => s.id !== songId);
    io.emit('queue:update', { songQueue, currentSong });
  });

  // Move song in queue (up/down)
  socket.on('queue:move', ({ songId, direction }) => {
    const index = songQueue.findIndex(s => s.id === songId);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      const temp = songQueue[index];
      songQueue[index] = songQueue[index - 1];
      songQueue[index - 1] = temp;
    } else if (direction === 'down' && index < songQueue.length - 1) {
      const temp = songQueue[index];
      songQueue[index] = songQueue[index + 1];
      songQueue[index + 1] = temp;
    }
    io.emit('queue:update', { songQueue, currentSong });
  });

  // Clear entire queue
  socket.on('queue:clear', () => {
    songQueue = [];
    io.emit('queue:update', { songQueue, currentSong });
  });

  // Playback Controls (Play, Pause, Skip, Restart, Seek, Volume)
  socket.on('player:control', (data) => {
    const { action, value } = data;
    if (action === 'skip') {
      playNextSong();
    } else if (action === 'restart') {
      io.emit('tv:command', { action: 'restart' });
    } else if (action === 'pause') {
      playerState.isPlaying = false;
      io.emit('tv:command', { action: 'pause' });
      io.emit('player:state', playerState);
    } else if (action === 'play') {
      playerState.isPlaying = true;
      io.emit('tv:command', { action: 'play' });
      io.emit('player:state', playerState);
    } else if (action === 'volume') {
      playerState.volume = Number(value);
      io.emit('tv:command', { action: 'volume', value: playerState.volume });
      io.emit('player:state', playerState);
    } else if (action === 'sfx_volume') {
      playerState.sfxVolume = Number(value);
      io.emit('tv:command', { action: 'sfx_volume', value: playerState.sfxVolume });
      io.emit('player:state', playerState);
    } else if (action === 'speed') {
      playerState.speed = Number(value);
      io.emit('tv:command', { action: 'speed', value: playerState.speed });
      io.emit('player:state', playerState);
    } else if (action === 'key') {
      playerState.keyShift = Number(value);
      io.emit('tv:command', { action: 'key', value: playerState.keyShift });
      io.emit('player:state', playerState);
    } else if (action === 'seek') {
      io.emit('tv:command', { action: 'seek', value });
    }
  });

  // Sound Effects & Jingles (Applause, Drumroll, Airhorn, Laugh, Rimshot, etc.)
  socket.on('sfx:play', (data) => {
    // data: { type: 'applause' | 'horn' | 'drumroll' | 'laugh' | 'rimshot' | 'fanfare' | 'cheer', sender }
    io.emit('tv:sfx', {
      type: data.type,
      sender: data.sender || 'เพื่อนในห้อง'
    });
  });

  // Skip / Dismiss Score screen early
  socket.on('score:dismiss', () => {
    io.emit('tv:command', { action: 'dismiss_score' });
    playNextSong();
  });

  // Toggle Vocal Cut / Vocal Switch
  socket.on('player:toggle_vocal', async (mode) => {
    // mode: 'toggle' or 'channel_l' or 'stereo' or 'swap_video'
    if (mode === 'swap_video' && currentSong) {
      // Smart search for karaoke / backing track version
      try {
        let cleanTitle = currentSong.title
          .replace(/คาราโอเกะ|karaoke|official mv|official audio|lyrics|เนื้อเพลง/gi, '')
          .trim();
        const searchQ = `${cleanTitle} คาราโอเกะ ดนตรี`;
        const res = await yts(searchQ);
        if (res.videos && res.videos.length > 0) {
          const altSong = res.videos[0];
          currentSong.originalVideoId = currentSong.originalVideoId || currentSong.videoId;
          currentSong.videoId = altSong.videoId;
          currentSong.isSwappedToKaraoke = !currentSong.isSwappedToKaraoke;
          io.emit('tv:command', { action: 'load_video', videoId: currentSong.videoId });
          io.emit('queue:update', { songQueue, currentSong });
        }
      } catch (e) {
        console.error('Failed to swap video:', e);
      }
    } else {
      playerState.isVocalCut = !playerState.isVocalCut;
      io.emit('tv:command', { action: 'toggle_vocal', isVocalCut: playerState.isVocalCut });
      io.emit('player:state', playerState);
    }
  });

  // TV Player state reporting
  socket.on('tv:state_update', (state) => {
    playerState.isPlaying = state.isPlaying;
    playerState.currentTime = state.currentTime;
    playerState.duration = state.duration;
    io.emit('player:state', playerState);
  });

  // TV reports that current video finished playing
  socket.on('tv:song_ended', () => {
    playNextSong();
  });

  // Send Danmaku / Live Reaction to TV
  socket.on('danmaku:send', (data) => {
    // data: { text, emoji, sender }
    io.emit('tv:danmaku', {
      text: data.text || '',
      emoji: data.emoji || '🎤',
      sender: data.sender || 'เพื่อนในห้อง',
      timestamp: Date.now()
    });
  });
});

function playNextSong() {
  if (currentSong) {
    songHistory.unshift(currentSong);
    if (songHistory.length > 50) songHistory.pop();
  }

  if (songQueue.length > 0) {
    currentSong = songQueue.shift();
    playerState.isPlaying = true;
    playerState.currentTime = 0;
    playerState.keyShift = 0;
    playerState.speed = 1.0;
    io.emit('tv:command', { action: 'load_video', videoId: currentSong.videoId });
    io.emit('queue:update', { songQueue, currentSong });
    io.emit('player:state', playerState);
  } else {
    currentSong = null;
    playerState.isPlaying = false;
    io.emit('tv:command', { action: 'idle' });
    io.emit('queue:update', { songQueue, currentSong: null });
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🎤 SahaiBall Karaoke System Online!`);
  console.log(`📺 TV Screen URL:     http://localhost:${PORT}/display.html`);
  console.log(`📱 Mobile Remote URL: ${REMOTE_URL}`);
  console.log(`🌐 Local Network IP:  ${LOCAL_IP}:${PORT}`);
  console.log(`=======================================================`);
});
