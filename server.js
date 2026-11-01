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

// Helper for Base URL
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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  etag: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

// Friendly URL Routes
app.get('/remote', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'remote.html'));
});

app.get('/display', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

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

// =============================================================================
// MULTI-ROOM MANAGEMENT (4-DIGIT ROOM PIN SYSTEM)
// =============================================================================
const rooms = new Map();

function generate4DigitCode() {
  let code = '';
  let attempts = 0;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
    attempts++;
  } while (rooms.has(code) && attempts < 100);
  return code;
}

function createRoom(requestedCode = null, hostSocketId = null) {
  let code = requestedCode ? requestedCode.toString().trim() : null;
  if (!code || !/^\d{4}$/.test(code)) {
    code = generate4DigitCode();
  }

  const room = {
    code,
    hostSocketId: hostSocketId || null,
    displaySocketId: null,
    allowGuestControls: false, // By default only host can skip/pause/change settings
    currentSong: null,
    songQueue: [],
    songHistory: [],
    playerState: {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 100,
      sfxVolume: 100,
      speed: 1.0,
      keyShift: 0,
      isVocalCut: false,
      isBoosted: false
    },
    users: new Map(), // socketId -> { id, nickname, isHost, joinedAt }
    createdAt: Date.now(),
    lastActivity: Date.now()
  };

  rooms.set(code, room);
  console.log(`[ROOM CREATED] Room Code: ${code}`);
  return room;
}

function getRoom(code) {
  if (!code) return null;
  return rooms.get(code.toString().trim()) || null;
}

function getRoomUsersList(room) {
  if (!room || !room.users) return [];
  const list = [];
  for (const [socketId, user] of room.users.entries()) {
    list.push({
      socketId,
      nickname: user.nickname,
      isHost: user.isHost,
      joinedAt: user.joinedAt
    });
  }
  return list;
}

function cleanInactiveRooms() {
  const now = Date.now();
  const maxIdleTime = 12 * 60 * 60 * 1000; // 12 hours
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActivity > maxIdleTime && room.users.size === 0) {
      rooms.delete(code);
      console.log(`[ROOM CLEANED] Inactive Room: ${code}`);
    }
  }
}
setInterval(cleanInactiveRooms, 30 * 60 * 1000);

// API: Room Info
app.get('/api/room/:code', (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) {
    return res.status(404).json({ exists: false });
  }
  res.json({
    exists: true,
    code: room.code,
    allowGuestControls: room.allowGuestControls,
    currentSong: room.currentSong,
    queueCount: room.songQueue.length,
    userCount: room.users.size,
    playerState: room.playerState
  });
});

// API: System Info
app.get('/api/info', async (req, res) => {
  const roomCode = req.query.room;
  const room = getRoom(roomCode);
  const baseUrl = getBaseUrl(req);
  const dynamicRemoteUrl = roomCode ? `${baseUrl}/remote?room=${roomCode}` : `${baseUrl}/remote`;
  const dynamicQr = await qrcode.toDataURL(dynamicRemoteUrl, { margin: 1, width: 250 });

  res.json({
    localIp: LOCAL_IP,
    port: PORT,
    remoteUrl: dynamicRemoteUrl,
    qrCode: dynamicQr,
    roomCode: room ? room.code : null,
    currentSong: room ? room.currentSong : null,
    songQueue: room ? room.songQueue : [],
    playerState: room ? room.playerState : null
  });
});

// =============================================================================
// WEBSOCKET EVENTS (ROOM-AWARE)
// =============================================================================
function broadcastRoomUpdate(roomCode, eventName, payload) {
  io.to(`room_${roomCode}`).emit(eventName, payload);
}

function playNextSongInRoom(room) {
  if (!room) return;
  room.lastActivity = Date.now();

  if (room.currentSong) {
    room.songHistory.unshift(room.currentSong);
    if (room.songHistory.length > 50) room.songHistory.pop();
  }

  if (room.songQueue.length > 0) {
    room.currentSong = room.songQueue.shift();
    room.playerState.isPlaying = true;
    room.playerState.currentTime = 0;
    room.playerState.keyShift = 0;
    room.playerState.speed = 1.0;
    broadcastRoomUpdate(room.code, 'tv:command', { action: 'load_video', videoId: room.currentSong.videoId });
    broadcastRoomUpdate(room.code, 'queue:update', { songQueue: room.songQueue, currentSong: room.currentSong });
    broadcastRoomUpdate(room.code, 'player:state', room.playerState);
  } else {
    room.currentSong = null;
    room.playerState.isPlaying = false;
    broadcastRoomUpdate(room.code, 'tv:command', { action: 'idle' });
    broadcastRoomUpdate(room.code, 'queue:update', { songQueue: room.songQueue, currentSong: null });
  }
}

io.on('connection', (socket) => {

  // 1. DISPLAY SCREEN INITIALIZATION (TV / Projector)
  socket.on('display:init', ({ requestedRoom } = {}) => {
    let room = null;
    const targetCode = (requestedRoom && /^\d{4}$/.test(requestedRoom.trim()))
      ? requestedRoom.trim()
      : '8999';

    room = getRoom(targetCode);
    if (!room) {
      room = createRoom(targetCode, socket.id);
    }

    room.displaySocketId = socket.id;
    if (!room.hostSocketId) room.hostSocketId = socket.id;
    room.lastActivity = Date.now();

    // Leave any prior rooms
    if (socket.data.roomCode) {
      socket.leave(`room_${socket.data.roomCode}`);
    }

    socket.join(`room_${room.code}`);
    socket.data = {
      roomCode: room.code,
      isDisplay: true,
      isHost: true,
      nickname: 'จอทีวี/โปรเจคเตอร์'
    };

    console.log(`[DISPLAY INITIALIZED] Screen socket ${socket.id} joined room_${room.code}`);

    socket.emit('state:sync', {
      roomCode: room.code,
      isHost: true,
      allowGuestControls: room.allowGuestControls,
      currentSong: room.currentSong,
      songQueue: room.songQueue,
      playerState: room.playerState,
      users: getRoomUsersList(room)
    });
  });

  // 2. USER ROOM JOINING (Mobile / Remote)
  socket.on('room:join', ({ roomCode, nickname, isHost, createIfMissing } = {}, callback) => {
    if (!roomCode) {
      if (typeof callback === 'function') callback({ success: false, error: 'รหัสห้องไม่ถูกต้อง' });
      return;
    }

    const cleanCode = roomCode.toString().trim();
    if (!/^\d{4}$/.test(cleanCode)) {
      if (typeof callback === 'function') callback({ success: false, error: 'รหัสห้องต้องเป็นตัวเลข 4 หลัก' });
      return;
    }

    let room = getRoom(cleanCode);
    if (!room) {
      if (createIfMissing || isHost) {
        room = createRoom(cleanCode, socket.id);
      } else {
        if (typeof callback === 'function') {
          callback({
            success: false,
            error: 'not_found',
            message: `ไม่พบห้องรหัส ${cleanCode} กรุณาตรวจสอบรหัส 4 หลักบนจอทีวี`
          });
        }
        return;
      }
    }

    room.lastActivity = Date.now();

    // Leave prior rooms
    if (socket.data.roomCode) {
      const oldRoom = getRoom(socket.data.roomCode);
      if (oldRoom) {
        oldRoom.users.delete(socket.id);
        broadcastRoomUpdate(oldRoom.code, 'room:users_update', { users: getRoomUsersList(oldRoom) });
      }
      socket.leave(`room_${socket.data.roomCode}`);
    }

    // Determine host status
    let userIsHost = false;
    if (isHost) {
      // If no host assigned or this socket is the designated host
      if (!room.hostSocketId || room.hostSocketId === socket.id || !room.users.has(room.hostSocketId)) {
        room.hostSocketId = socket.id;
        userIsHost = true;
      } else {
        userIsHost = true; // Allow co-hosting or verified host
      }
    } else if (!room.hostSocketId) {
      // First person to join an empty room can become host
      room.hostSocketId = socket.id;
      userIsHost = true;
    }

    const userNick = (nickname || (userIsHost ? 'หัวหน้าห้อง' : 'เพื่อนร่วมห้อง')).trim();

    socket.join(`room_${room.code}`);
    socket.data = {
      roomCode: room.code,
      isHost: userIsHost,
      nickname: userNick
    };

    room.users.set(socket.id, {
      id: socket.id,
      nickname: userNick,
      isHost: userIsHost,
      joinedAt: Date.now()
    });

    console.log(`[USER JOINED] ${userNick} (Host: ${userIsHost}) joined room_${room.code}`);

    const syncPayload = {
      roomCode: room.code,
      isHost: userIsHost,
      allowGuestControls: room.allowGuestControls,
      currentSong: room.currentSong,
      songQueue: room.songQueue,
      playerState: room.playerState,
      users: getRoomUsersList(room)
    };

    socket.emit('state:sync', syncPayload);
    broadcastRoomUpdate(room.code, 'room:users_update', { users: getRoomUsersList(room) });

    if (typeof callback === 'function') {
      callback({
        success: true,
        roomCode: room.code,
        isHost: userIsHost,
        allowGuestControls: room.allowGuestControls
      });
    }
  });

  // 3. HOST CONTROLS TOGGLE (Allow guests to skip/pause/control or keep it host-only)
  socket.on('room:toggle_guest_controls', ({ allow } = {}) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !socket.data.isHost) return;

    room.allowGuestControls = Boolean(allow);
    room.lastActivity = Date.now();
    broadcastRoomUpdate(room.code, 'room:settings_update', {
      allowGuestControls: room.allowGuestControls
    });
  });

  // 4. REQUEST SYNC
  socket.on('request:sync', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    socket.emit('state:sync', {
      roomCode: room.code,
      isHost: socket.data.isHost || false,
      allowGuestControls: room.allowGuestControls,
      currentSong: room.currentSong,
      songQueue: room.songQueue,
      playerState: room.playerState,
      users: getRoomUsersList(room)
    });
  });

  // 5. ADD SONG TO QUEUE
  socket.on('queue:add', (songData) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    room.lastActivity = Date.now();

    const requesterName = socket.data.nickname || songData.requester || 'มือถือ';
    const item = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      videoId: songData.videoId,
      title: songData.title,
      thumbnail: songData.thumbnail,
      duration: songData.duration,
      seconds: songData.seconds,
      author: songData.author,
      requester: requesterName,
      requesterSocketId: socket.id,
      addedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    };

    if (songData.priority) {
      room.songQueue.unshift(item);
    } else {
      room.songQueue.push(item);
    }

    if (!room.currentSong) {
      playNextSongInRoom(room);
    } else {
      broadcastRoomUpdate(room.code, 'queue:update', {
        songQueue: room.songQueue,
        currentSong: room.currentSong
      });
    }
  });

  // 6. REMOVE SONG FROM QUEUE
  socket.on('queue:remove', (songId) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;

    const targetSong = room.songQueue.find(s => s.id === songId);
    if (!targetSong) return;

    // Check permissions: Host can remove any song; Guests can remove their own requested songs
    if (socket.data.isHost || targetSong.requesterSocketId === socket.id || targetSong.requester === socket.data.nickname) {
      room.songQueue = room.songQueue.filter(s => s.id !== songId);
      room.lastActivity = Date.now();
      broadcastRoomUpdate(room.code, 'queue:update', {
        songQueue: room.songQueue,
        currentSong: room.currentSong
      });
    }
  });

  // 7. MOVE SONG IN QUEUE (Up/Down)
  socket.on('queue:move', ({ songId, direction }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;

    const index = room.songQueue.findIndex(s => s.id === songId);
    if (index === -1) return;

    const targetSong = room.songQueue[index];
    if (socket.data.isHost || targetSong.requesterSocketId === socket.id || targetSong.requester === socket.data.nickname) {
      if (direction === 'up' && index > 0) {
        const temp = room.songQueue[index];
        room.songQueue[index] = room.songQueue[index - 1];
        room.songQueue[index - 1] = temp;
      } else if (direction === 'down' && index < room.songQueue.length - 1) {
        const temp = room.songQueue[index];
        room.songQueue[index] = room.songQueue[index + 1];
        room.songQueue[index + 1] = temp;
      }
      room.lastActivity = Date.now();
      broadcastRoomUpdate(room.code, 'queue:update', {
        songQueue: room.songQueue,
        currentSong: room.currentSong
      });
    }
  });

  // 8. CLEAR QUEUE (Host Only)
  socket.on('queue:clear', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !socket.data.isHost) return;

    room.songQueue = [];
    room.lastActivity = Date.now();
    broadcastRoomUpdate(room.code, 'queue:update', {
      songQueue: room.songQueue,
      currentSong: room.currentSong
    });
  });

  // 9. PLAYBACK CONTROLS (Host or Guests if allowed)
  socket.on('player:control', (data) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;

    const canControl = socket.data.isHost || room.allowGuestControls;
    if (!canControl) return;

    const { action, value } = data;
    room.lastActivity = Date.now();

    if (action === 'skip') {
      playNextSongInRoom(room);
    } else if (action === 'restart') {
      broadcastRoomUpdate(room.code, 'tv:command', { action: 'restart' });
    } else if (action === 'pause') {
      room.playerState.isPlaying = false;
      broadcastRoomUpdate(room.code, 'tv:command', { action: 'pause' });
      broadcastRoomUpdate(room.code, 'player:state', room.playerState);
    } else if (action === 'play') {
      room.playerState.isPlaying = true;
      broadcastRoomUpdate(room.code, 'tv:command', { action: 'play' });
      broadcastRoomUpdate(room.code, 'player:state', room.playerState);
    } else if (action === 'volume') {
      room.playerState.volume = Number(value);
      broadcastRoomUpdate(room.code, 'tv:command', { action: 'volume', value: room.playerState.volume });
      broadcastRoomUpdate(room.code, 'player:state', room.playerState);
    } else if (action === 'sfx_volume') {
      room.playerState.sfxVolume = Number(value);
      broadcastRoomUpdate(room.code, 'tv:command', { action: 'sfx_volume', value: room.playerState.sfxVolume });
      broadcastRoomUpdate(room.code, 'player:state', room.playerState);
    } else if (action === 'speed') {
      room.playerState.speed = Number(value);
      broadcastRoomUpdate(room.code, 'tv:command', { action: 'speed', value: room.playerState.speed });
      broadcastRoomUpdate(room.code, 'player:state', room.playerState);
    } else if (action === 'key') {
      room.playerState.keyShift = Number(value);
      broadcastRoomUpdate(room.code, 'tv:command', { action: 'key', value: room.playerState.keyShift });
      broadcastRoomUpdate(room.code, 'player:state', room.playerState);
    } else if (action === 'boost') {
      room.playerState.isBoosted = Boolean(value);
      broadcastRoomUpdate(room.code, 'tv:command', { action: 'boost', value: room.playerState.isBoosted });
      broadcastRoomUpdate(room.code, 'player:state', room.playerState);
    } else if (action === 'toggle_cc') {
      room.playerState.showCaptions = Boolean(value);
      broadcastRoomUpdate(room.code, 'tv:command', { action: 'toggle_cc', value: room.playerState.showCaptions });
      broadcastRoomUpdate(room.code, 'player:state', room.playerState);
    } else if (action === 'seek') {
      broadcastRoomUpdate(room.code, 'tv:command', { action: 'seek', value });
    }
  });

  // 10. VOCAL CUT & SMART VIDEO SWAP
  socket.on('player:toggle_vocal', async (mode) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;

    const canControl = socket.data.isHost || room.allowGuestControls;
    if (!canControl) return;

    room.lastActivity = Date.now();

    if (mode === 'swap_video' && room.currentSong) {
      try {
        let cleanTitle = room.currentSong.title
          .replace(/คาราโอเกะ|karaoke|official mv|official audio|lyrics|เนื้อเพลง/gi, '')
          .trim();
        const searchQ = `${cleanTitle} คาราโอเกะ ดนตรี`;
        const res = await yts(searchQ);
        if (res.videos && res.videos.length > 0) {
          const altSong = res.videos[0];
          room.currentSong.originalVideoId = room.currentSong.originalVideoId || room.currentSong.videoId;
          room.currentSong.videoId = altSong.videoId;
          room.currentSong.isSwappedToKaraoke = !room.currentSong.isSwappedToKaraoke;
          broadcastRoomUpdate(room.code, 'tv:command', { action: 'load_video', videoId: room.currentSong.videoId });
          broadcastRoomUpdate(room.code, 'queue:update', { songQueue: room.songQueue, currentSong: room.currentSong });
        }
      } catch (e) {
        console.error('Failed to swap video:', e);
      }
    } else {
      room.playerState.isVocalCut = !room.playerState.isVocalCut;
      broadcastRoomUpdate(room.code, 'tv:command', { action: 'toggle_vocal', isVocalCut: room.playerState.isVocalCut });
      broadcastRoomUpdate(room.code, 'player:state', room.playerState);
    }
  });

  // 11. SFX & JINGLES (Anyone in room can trigger)
  socket.on('sfx:play', (data) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    broadcastRoomUpdate(room.code, 'tv:sfx', {
      type: data.type,
      sender: socket.data.nickname || data.sender || 'เพื่อนในห้อง'
    });
  });

  // 12. DANMAKU / LIVE REACTION
  socket.on('danmaku:send', (data) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    broadcastRoomUpdate(room.code, 'tv:danmaku', {
      text: data.text || '',
      emoji: data.emoji || '🎤',
      sender: socket.data.nickname || data.sender || 'เพื่อนในห้อง',
      timestamp: Date.now()
    });
  });

  // 13. TV STATE REPORTING
  socket.on('tv:state_update', (state) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    room.playerState.isPlaying = state.isPlaying;
    room.playerState.currentTime = state.currentTime;
    room.playerState.duration = state.duration;
    broadcastRoomUpdate(room.code, 'player:state', room.playerState);
  });

  // 14. TV REPORTS SONG ENDED
  socket.on('tv:song_ended', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    playNextSongInRoom(room);
  });

  // 15. WEBRTC WIRELESS MIC SIGNALING
  socket.on('webrtc:offer', ({ offer, nickname }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !room.displaySocketId) return;
    io.to(room.displaySocketId).emit('webrtc:offer', {
      offer,
      senderSocketId: socket.id,
      nickname: socket.data.nickname || nickname || 'นักร้อง'
    });
  });

  socket.on('webrtc:answer', ({ answer, targetSocketId }) => {
    io.to(targetSocketId).emit('webrtc:answer', {
      answer,
      senderSocketId: socket.id
    });
  });

  socket.on('webrtc:ice_candidate', ({ candidate, targetSocketId }) => {
    const room = getRoom(socket.data.roomCode);
    const destSocketId = targetSocketId || (room ? room.displaySocketId : null);
    if (destSocketId) {
      io.to(destSocketId).emit('webrtc:ice_candidate', {
        candidate,
        senderSocketId: socket.id
      });
    }
  });

  socket.on('mic:stop', () => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !room.displaySocketId) return;
    io.to(room.displaySocketId).emit('mic:stop', {
      senderSocketId: socket.id
    });
    broadcastRoomUpdate(room.code, 'mic:user_stopped', {
      socketId: socket.id,
      nickname: socket.data.nickname
    });
  });

  socket.on('mic:control', (data) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !room.displaySocketId) return;
    io.to(room.displaySocketId).emit('mic:control', {
      senderSocketId: socket.id,
      volume: data.volume,
      echoEnabled: data.echoEnabled
    });
  });

  // 16. DISCONNECT
  socket.on('disconnect', () => {
    if (socket.data.roomCode) {
      const room = getRoom(socket.data.roomCode);
      if (room) {
        if (room.displaySocketId) {
          io.to(room.displaySocketId).emit('mic:stop', { senderSocketId: socket.id });
        }
        room.users.delete(socket.id);
        if (room.hostSocketId === socket.id) {
          // If host disconnected, promote first remaining user to host or wait
          const firstUser = room.users.keys().next().value;
          if (firstUser) {
            room.hostSocketId = firstUser;
            const promotedUser = room.users.get(firstUser);
            if (promotedUser) promotedUser.isHost = true;
            io.to(firstUser).emit('room:promoted_to_host');
          } else {
            room.hostSocketId = null;
          }
        }
        broadcastRoomUpdate(room.code, 'room:users_update', { users: getRoomUsersList(room) });
        console.log(`[USER DISCONNECTED] ${socket.data.nickname || socket.id} left room_${room.code}`);
      }
    }
  });

});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🎤 SahaiBall Karaoke System Online! (Multi-Room 4-Digit)`);
  console.log(`📺 TV Screen URL:     http://localhost:${PORT}/display.html`);
  console.log(`📱 Mobile Remote URL: http://${LOCAL_IP}:${PORT}/remote`);
  console.log(`🌐 Local Network IP:  ${LOCAL_IP}:${PORT}`);
  console.log(`=======================================================`);
});
