require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secure-screen-share-secret-key';

// Store active rooms with authentication
const rooms = new Map();
// Simple in-memory user store
const users = new Map();

// Create default user
const createDefaultUser = async () => {
    const defaultUsername = 'demo';
    const defaultPassword = 'demo123';
    
    if (!users.has(defaultUsername)) {
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        users.set(defaultUsername, { password: hashedPassword });
        console.log('✅ Default user created: demo/demo123');
    }
};

createDefaultUser();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('../frontend'));

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access token required' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// API Routes

// User Registration
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    if (users.has(username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }
    
    if (!/^[a-zA-Z0-9]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters and numbers' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    users.set(username, { password: hashedPassword });
    
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// User Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const user = users.get(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
    
    res.json({ token, username });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Token validation
app.post('/api/validate-token', authenticateToken, (req, res) => {
  res.json({ valid: true, username: req.user.username });
});

// Create room (requires authentication)
app.post('/api/create-room', authenticateToken, (req, res) => {
  const roomId = uuidv4().substring(0, 6).toUpperCase();
  rooms.set(roomId, {
    host: req.user.username,
    guest: null,
    createdAt: Date.now(),
    maxParticipants: 2
  });
  res.json({ roomId, host: req.user.username });
});

// Check room (no authentication required)
app.get('/api/check-room/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.json({ exists: false });
  }
  
  res.json({ 
    exists: true,
    host: room.host,
    hasGuest: !!room.guest,
    isFull: !!room.guest
  });
});

// Join room (requires authentication)
app.post('/api/join-room/:roomId', authenticateToken, (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  if (room.guest) {
    return res.status(400).json({ error: 'Room is full' });
  }
  
  if (room.host === req.user.username) {
    return res.status(400).json({ error: 'Cannot join your own room' });
  }
  
  room.guest = req.user.username;
  res.json({ 
    roomId, 
    host: room.host,
    guest: room.guest 
  });
});

// Auto-generate room
app.get('/api/auto-room', authenticateToken, (req, res) => {
  const roomId = uuidv4().substring(0, 6).toUpperCase();
  rooms.set(roomId, {
    host: req.user.username,
    guest: null,
    createdAt: Date.now(),
    maxParticipants: 2
  });
  res.json({ roomId, host: req.user.username, autoGenerated: true });
});

// Socket.IO with authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error('Authentication error'));
    }
    socket.user = decoded;
    next();
  });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.user.username);
  
  socket.on('join-room', (roomId) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('room-error', 'Room not found');
      return;
    }
    
    // Check if user is allowed in this room
    if (room.host !== socket.user.username && room.guest !== socket.user.username) {
      socket.emit('room-error', 'Not authorized for this room');
      return;
    }
    
    socket.join(roomId);
    socket.roomId = roomId;
    
    // Notify room about user joining
    socket.to(roomId).emit('user-joined', {
      username: socket.user.username,
      isHost: room.host === socket.user.username
    });
    
    // Send room info to joining user
    socket.emit('room-info', {
      roomId,
      host: room.host,
      guest: room.guest,
      yourRole: room.host === socket.user.username ? 'host' : 'guest'
    });
    
    socket.on('disconnect', () => {
      const room = rooms.get(roomId);
      if (room) {
        if (socket.user.username === room.host) {
          // Host disconnected - delete room
          rooms.delete(roomId);
          socket.to(roomId).emit('host-disconnected', 'Host left the room');
        } else if (socket.user.username === room.guest) {
          // Guest disconnected
          room.guest = null;
          socket.to(roomId).emit('guest-disconnected', {
            username: socket.user.username
          });
        }
      }
      socket.leave(roomId);
    });
    
    // WebRTC Signaling
    socket.on('signal', ({ to, signal }) => {
      io.to(to).emit('signal', { from: socket.id, signal });
    });
    
    socket.on('offer', ({ to, offer }) => {
      io.to(to).emit('offer', { from: socket.id, offer });
    });
    
    socket.on('answer', ({ to, answer }) => {
      io.to(to).emit('answer', { from: socket.id, answer });
    });
    
    socket.on('ice-candidate', ({ to, candidate }) => {
      io.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });
    
    socket.on('screen-sharing', (isSharing) => {
      socket.to(roomId).emit('screen-sharing', { 
        username: socket.user.username, 
        isSharing 
      });
    });
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Web app: http://localhost:${PORT}`);
  console.log(`🔐 Demo credentials: demo / demo123`);
});