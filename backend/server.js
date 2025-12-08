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

const users = new Map();
const rooms = new Map();

// Create default user
(async () => {
  const defaultUsername = 'demo';
  const defaultPassword = 'demo123';
  
  if (!users.has(defaultUsername)) {
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    users.set(defaultUsername, { 
      password: hashedPassword,
      createdAt: Date.now()
    });
    console.log('✅ Default user created: demo/demo123');
  }
})();

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
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    if (users.has(username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    users.set(username, { password: hashedPassword });
    
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

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

app.post('/api/create-room', authenticateToken, (req, res) => {
  const roomId = uuidv4().substring(0, 6).toUpperCase();
  rooms.set(roomId, {
    host: req.user.username,
    guest: null,
    createdAt: Date.now(),
    hostSocket: null,
    guestSocket: null
  });
  res.json({ roomId, host: req.user.username });
});

app.get('/api/check-room/:roomId', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
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

// Socket.IO
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
    
    // Check authorization
    if (room.host !== socket.user.username && room.guest !== socket.user.username) {
      socket.emit('room-error', 'Not authorized for this room');
      return;
    }
    
    // Store socket in room
    if (room.host === socket.user.username) {
      room.hostSocket = socket.id;
    } else if (room.guest === socket.user.username) {
      room.guestSocket = socket.id;
    }
    
    socket.join(roomId);
    socket.roomId = roomId;
    
    // Send room info
    socket.emit('room-info', {
      roomId,
      host: room.host,
      guest: room.guest,
      yourRole: room.host === socket.user.username ? 'host' : 'guest'
    });
    
    // Notify other user
    if (room.hostSocket && room.guestSocket) {
      io.to(room.hostSocket).emit('user-joined', {
        username: room.guest,
        socketId: room.guestSocket
      });
      io.to(room.guestSocket).emit('user-joined', {
        username: room.host,
        socketId: room.hostSocket
      });
    }
    
    // WebRTC Signaling - FIXED
    socket.on('signal', ({ to, signal }) => {
      io.to(to).emit('signal', { from: socket.id, signal });
    });
    
    socket.on('offer', ({ to, offer }) => {
      console.log('📤 Offer from', socket.id, 'to', to);
      io.to(to).emit('offer', { from: socket.id, offer });
    });
    
    socket.on('answer', ({ to, answer }) => {
      console.log('📤 Answer from', socket.id, 'to', to);
      io.to(to).emit('answer', { from: socket.id, answer });
    });
    
    socket.on('ice-candidate', ({ to, candidate }) => {
      io.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });
    
    socket.on('disconnect', () => {
      const room = rooms.get(roomId);
      if (room) {
        if (socket.user.username === room.host) {
          room.hostSocket = null;
          if (room.guestSocket) {
            io.to(room.guestSocket).emit('host-disconnected');
          }
          // Only delete room if guest also left
          if (!room.guestSocket) {
            rooms.delete(roomId);
          }
        } else if (socket.user.username === room.guest) {
          room.guestSocket = null;
          room.guest = null;
          if (room.hostSocket) {
            io.to(room.hostSocket).emit('guest-disconnected');
          }
        }
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Web app: http://localhost:${PORT}`);
});