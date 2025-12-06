class SecureScreenShare {
    constructor() {
        this.socket = null;
        this.peerConnections = {};
        this.localStream = null;
        this.roomId = null;
        this.username = null;
        this.token = null;
        this.userRole = null;
        this.otherUser = null;
        this.isSharing = false;
        this.connectionStartTime = null;
        this.statsInterval = null;
        this.bitrateHistory = [];
        this.sessionTimer = null;
        
        this.init();
    }

    async init() {
        this.bindEvents();
        
        // Check for saved token
        const savedToken = localStorage.getItem('screenShareToken');
        const savedUsername = localStorage.getItem('screenShareUsername');
        
        if (savedToken && savedUsername) {
            this.token = savedToken;
            this.username = savedUsername;
            this.showApp();
            this.updateUserInfo();
            this.startSessionTimer();
        } else {
            this.showAuthModal();
        }
    }

    bindEvents() {
        // Auto-fill demo credentials on focus
        const loginUsername = document.getElementById('loginUsername');
        const loginPassword = document.getElementById('loginPassword');
        
        loginUsername.addEventListener('focus', () => {
            if (!loginUsername.value) {
                loginUsername.value = 'demo';
            }
        });
        
        loginPassword.addEventListener('focus', () => {
            if (!loginPassword.value) {
                loginPassword.value = 'demo123';
            }
        });
        
        // Enter key for login
        loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });
        
        // Enter key for register
        const confirmPassword = document.getElementById('confirmPassword');
        if (confirmPassword) {
            confirmPassword.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.register();
            });
        }
        
        // Enter key for join room
        const joinRoomInput = document.getElementById('joinRoomInput');
        if (joinRoomInput) {
            joinRoomInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.joinRoomFromModal();
            });
        }
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isSharing) {
                this.showBottomLeftNotification('Tab is hidden - sharing paused');
            }
        });
    }

    showAuthModal() {
        document.getElementById('authModal').style.display = 'flex';
        document.getElementById('appWrapper').style.display = 'none';
        this.showLoginForm();
    }

    hideAuthModal() {
        document.getElementById('authModal').style.display = 'none';
    }

    showApp() {
        document.getElementById('authModal').style.display = 'none';
        document.getElementById('appWrapper').style.display = 'flex';
    }

    showLoginForm() {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
        
        // Auto-focus username field
        setTimeout(() => {
            const usernameInput = document.getElementById('loginUsername');
            if (usernameInput) usernameInput.focus();
        }, 100);
    }

    showRegisterForm() {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
        
        // Auto-focus username field
        setTimeout(() => {
            const usernameInput = document.getElementById('registerUsername');
            if (usernameInput) usernameInput.focus();
        }, 100);
    }

    async validateToken(token) {
        try {
            const response = await fetch('/api/validate-token', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    quickLogin() {
        document.getElementById('loginUsername').value = 'demo';
        document.getElementById('loginPassword').value = 'demo123';
        this.login();
    }

    async login() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        // Clear any previous errors
        this.clearAuthErrors();
        
        if (!username) {
            this.showAuthError('loginUsername', 'Username is required');
            return;
        }
        
        if (!password) {
            this.showAuthError('loginPassword', 'Password is required');
            return;
        }
        
        // Show loading state
        const loginBtn = document.querySelector('#loginForm .btn');
        const originalText = loginBtn.innerHTML;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
        loginBtn.disabled = true;
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Login failed. Use demo/demo123');
            }
            
            // Save credentials
            this.token = data.token;
            this.username = data.username;
            
            localStorage.setItem('screenShareToken', data.token);
            localStorage.setItem('screenShareUsername', data.username);
            
            // Update UI
            this.hideAuthModal();
            this.showApp();
            this.updateUserInfo();
            this.startSessionTimer();
            
            // Show welcome message
            this.showBottomLeftNotification(`Welcome, ${data.username}!`, 3000);
            this.showNotification(
                'Login Successful',
                'You can now create or join a private room',
                'success',
                3000
            );
            
            // Clear form
            document.getElementById('loginUsername').value = '';
            document.getElementById('loginPassword').value = '';
            
        } catch (error) {
            this.showNotification('Login Failed', error.message, 'error');
            
            // If it's the demo account failing, offer to create it
            if (username === 'demo' && error.message.includes('Invalid credentials')) {
                this.showNotification(
                    'Creating Demo Account',
                    'Setting up demo account for you...',
                    'info',
                    2000
                );
                
                // Try to register the demo account
                setTimeout(async () => {
                    try {
                        await fetch('/api/register', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                username: 'demo', 
                                password: 'demo123' 
                            })
                        });
                        
                        // Now try login again
                        setTimeout(() => {
                            this.showNotification(
                                'Demo Account Ready',
                                'Trying to login...',
                                'info',
                                2000
                            );
                            setTimeout(() => this.quickLogin(), 500);
                        }, 1000);
                    } catch (regError) {
                        this.showNotification(
                            'Setup Failed',
                            'Please create your own account',
                            'error',
                            3000
                        );
                    }
                }, 500);
            }
        } finally {
            // Restore button state
            loginBtn.innerHTML = originalText;
            loginBtn.disabled = false;
        }
    }

    async register() {
        const username = document.getElementById('registerUsername').value.trim();
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        // Clear any previous errors
        this.clearAuthErrors();
        
        // Validation
        if (!username) {
            this.showAuthError('registerUsername', 'Username is required');
            return;
        }
        
        if (username.length < 3) {
            this.showAuthError('registerUsername', 'Username must be at least 3 characters');
            return;
        }
        
        if (username.length > 20) {
            this.showAuthError('registerUsername', 'Username must be less than 20 characters');
            return;
        }
        
        if (!/^[a-zA-Z0-9]+$/.test(username)) {
            this.showAuthError('registerUsername', 'Username can only contain letters and numbers');
            return;
        }
        
        if (!password) {
            this.showAuthError('registerPassword', 'Password is required');
            return;
        }
        
        if (password.length < 6) {
            this.showAuthError('registerPassword', 'Password must be at least 6 characters');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showAuthError('confirmPassword', 'Passwords do not match');
            return;
        }
        
        // Show loading state
        const registerBtn = document.querySelector('#registerForm .btn-success');
        const originalText = registerBtn.innerHTML;
        registerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
        registerBtn.disabled = true;
        
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Registration failed');
            }
            
            this.showNotification('Success', 'Account created successfully!', 'success');
            
            // Auto-login after registration
            document.getElementById('loginUsername').value = username;
            document.getElementById('loginPassword').value = password;
            
            // Switch to login form and auto-login
            this.showLoginForm();
            setTimeout(() => this.login(), 500);
            
        } catch (error) {
            this.showNotification('Registration Failed', error.message, 'error');
        } finally {
            // Restore button state
            registerBtn.innerHTML = originalText;
            registerBtn.disabled = false;
        }
    }

    showAuthError(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (!field) return;
        
        const formGroup = field.closest('.form-group');
        if (formGroup) {
            formGroup.classList.add('error');
            
            // Remove any existing error message
            const existingError = formGroup.querySelector('.auth-error');
            if (existingError) {
                existingError.remove();
            }
            
            // Add error message
            const errorElement = document.createElement('div');
            errorElement.className = 'auth-error';
            errorElement.textContent = message;
            formGroup.appendChild(errorElement);
            
            // Focus the field
            field.focus();
        }
    }

    clearAuthErrors() {
        const errors = document.querySelectorAll('.auth-error');
        errors.forEach(error => error.remove());
        
        const errorFields = document.querySelectorAll('.form-group.error');
        errorFields.forEach(field => field.classList.remove('error'));
    }

    logout() {
        if (confirm('Are you sure you want to logout?')) {
            if (this.roomId) {
                this.leaveRoom();
            }
            
            if (this.socket) {
                this.socket.disconnect();
            }
            
            // Clear credentials
            this.token = null;
            this.username = null;
            localStorage.removeItem('screenShareToken');
            localStorage.removeItem('screenShareUsername');
            
            // Stop session timer
            this.stopSessionTimer();
            
            // Reset UI
            this.showAuthModal();
            this.showLoginForm();
            
            this.showNotification('Logged Out', 'You have been logged out', 'info');
        }
    }

    updateUserInfo() {
        if (this.username) {
            document.getElementById('currentUsername').textContent = this.username;
            document.getElementById('displayUsername').textContent = this.username;
            document.getElementById('authStatus').textContent = 'Logged in';
            document.getElementById('authStatus').style.color = 'rgba(16, 185, 129, 0.9)';
            
            // Enable controls that require authentication
            document.getElementById('btnShare').disabled = false;
            const quickShareBtn = document.getElementById('quickShareBtn');
            if (quickShareBtn) {
                quickShareBtn.disabled = false;
                quickShareBtn.style.opacity = '1';
                quickShareBtn.style.pointerEvents = 'auto';
            }
        }
    }

    startSessionTimer() {
        this.stopSessionTimer();
        this.sessionTimer = setInterval(() => {
            this.updateSessionTime();
        }, 1000);
    }

    stopSessionTimer() {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
            this.sessionTimer = null;
        }
    }

    updateSessionTime() {
        const sessionTimeEl = document.getElementById('sessionTime');
        if (sessionTimeEl) {
            if (this.connectionStartTime) {
                const elapsed = Math.floor((Date.now() - this.connectionStartTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                sessionTimeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            } else {
                sessionTimeEl.textContent = '0:00';
            }
        }
    }

    showJoinRoomModal() {
        document.getElementById('joinRoomModal').style.display = 'flex';
        setTimeout(() => {
            const input = document.getElementById('joinRoomInput');
            if (input) input.focus();
        }, 100);
    }

    hideJoinRoomModal() {
        document.getElementById('joinRoomModal').style.display = 'none';
        const input = document.getElementById('joinRoomInput');
        if (input) input.value = '';
    }

    async connectSignaling() {
        try {
            this.updateStatus('Connecting to server...', 'connecting');
            this.updateRoomStatus('Connecting...');
            
            this.socket = io(window.location.origin, {
                auth: { token: this.token },
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5
            });
            
            this.socket.on('connect', () => {
                console.log('✅ Connected to signaling server as', this.username);
                this.updateStatus('Connected to server', 'connected');
                this.updateRoomStatus('Connected');
                this.updateConnectionStatus('Server connected');
            });
            
            this.socket.on('connect_error', (error) => {
                console.error('❌ Connection error:', error);
                this.updateStatus('Connection failed', 'error');
                this.updateRoomStatus('Connection failed');
                
                if (error.message.includes('Authentication')) {
                    this.showNotification('Auth Error', 'Session expired. Please login again.', 'error');
                    setTimeout(() => this.logout(), 2000);
                }
            });
            
            this.setupSocketListeners();
            
        } catch (error) {
            console.error('❌ Error connecting to signaling server:', error);
            this.updateStatus('Connection error', 'error');
        }
    }

    setupSocketListeners() {
        this.socket.on('room-info', (data) => {
            console.log('📋 Room info:', data);
            this.userRole = data.yourRole;
            this.updateRoleDisplay();
            this.updateConnectionStatus(`Joined as ${data.yourRole}`);
        });
        
        this.socket.on('user-joined', (data) => {
            console.log('👤 User joined:', data.username);
            this.otherUser = data.username;
            
            // Show remote preview
            document.getElementById('remotePreview').style.display = 'block';
            document.getElementById('remoteUserLabel').textContent = data.username;
            
            // Show notification in bottom left
            this.showBottomLeftNotification(`${data.username} joined`, 3000);
            
            // If I'm sharing, send my stream to them
            if (this.isSharing && this.localStream) {
                setTimeout(() => {
                    this.createPeerConnection(data.username, true);
                }, 500);
            }
        });
        
        this.socket.on('guest-disconnected', (data) => {
            console.log('👤 Guest left:', data.username);
            this.otherUser = null;
            
            // Hide remote preview
            document.getElementById('remotePreview').style.display = 'none';
            document.getElementById('remotePreviewOverlay').style.display = 'flex';
            
            this.showBottomLeftNotification(`${data.username} left`, 3000);
        });
        
        this.socket.on('host-disconnected', (message) => {
            console.log('👑 Host disconnected');
            this.showNotification('Room Closed', 'Host left the room', 'warning');
            this.leaveRoom();
        });
        
        this.socket.on('room-error', (error) => {
            this.showNotification('Room Error', error, 'error');
            this.leaveRoom();
        });
        
        // WebRTC Signaling
        this.socket.on('offer', async ({ from, offer }) => {
            console.log('📨 Received offer from:', from);
            if (!this.peerConnections[from]) {
                this.createPeerConnection(from, false);
            }
            
            const pc = this.peerConnections[from];
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                
                this.socket.emit('answer', { to: from, answer });
            } catch (error) {
                console.error('❌ Error handling offer:', error);
            }
        });
        
        this.socket.on('answer', async ({ from, answer }) => {
            console.log('📨 Received answer from:', from);
            const pc = this.peerConnections[from];
            if (pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(answer));
                } catch (error) {
                    console.error('❌ Error handling answer:', error);
                }
            }
        });
        
        this.socket.on('ice-candidate', async ({ from, candidate }) => {
            console.log('❄️ Received ICE candidate from:', from);
            const pc = this.peerConnections[from];
            if (pc && candidate) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (error) {
                    console.error('❌ Error adding ICE candidate:', error);
                }
            }
        });
    }

    updateRoleDisplay() {
        const roleBadge = document.getElementById('roleBadge');
        const roleText = document.getElementById('roleText');
        const roleStat = document.getElementById('roleStat');
        
        if (this.userRole === 'host') {
            roleBadge.className = 'role-badge host';
            roleText.textContent = 'Host';
            roleStat.textContent = 'Host';
            roleStat.className = 'stat-value role host';
        } else if (this.userRole === 'guest') {
            roleBadge.className = 'role-badge guest';
            roleText.textContent = 'Guest';
            roleStat.textContent = 'Guest';
            roleStat.className = 'stat-value role guest';
        }
    }

    updateStatus(message, type = 'info') {
        const statusEl = document.getElementById('statusText');
        const dotEl = document.getElementById('statusDot');
        
        if (statusEl) statusEl.textContent = message;
        if (dotEl) {
            dotEl.className = 'status-dot';
            switch(type) {
                case 'connected':
                    dotEl.classList.add('connected');
                    break;
                case 'connecting':
                    dotEl.classList.add('connecting');
                    break;
            }
        }
    }

    updateRoomStatus(message, type = 'info') {
        const textEl = document.getElementById('roomStatusText');
        const dotEl = document.getElementById('roomStatusDot');
        
        if (textEl) textEl.textContent = message;
        if (dotEl) {
            dotEl.className = 'status-dot-small';
            switch(type) {
                case 'connected':
                    dotEl.classList.add('connected');
                    break;
                case 'connecting':
                    dotEl.classList.add('connecting');
                    break;
            }
        }
    }

    updateConnectionStatus(message) {
        // This would update any connection status text if needed
        console.log('Connection status:', message);
    }

    async createRoom() {
        if (!this.token) {
            this.showNotification('Authentication Required', 'Please login first', 'error');
            return;
        }
        
        try {
            this.updateStatus('Creating private room...', 'connecting');
            this.updateRoomStatus('Creating room...');
            
            const response = await fetch('/api/create-room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to create room');
            }
            
            this.roomId = data.roomId;
            this.userRole = 'host';
            
            await this.joinRoom(this.roomId);
            
        } catch (error) {
            console.error('❌ Error creating room:', error);
            this.showNotification('Create Room Failed', error.message, 'error');
            this.updateStatus('Error', 'error');
            this.updateRoomStatus('Error');
        }
    }

    async joinRoomFromModal() {
        const roomId = document.getElementById('joinRoomInput').value.trim().toUpperCase();
        if (!roomId) {
            this.showNotification('Error', 'Please enter a room ID', 'error');
            return;
        }
        
        await this.joinRoom(roomId);
        this.hideJoinRoomModal();
    }

    async joinRoom(roomId) {
        if (!this.token) {
            this.showNotification('Authentication Required', 'Please login first', 'error');
            return;
        }
        
        try {
            this.updateStatus('Joining private room...', 'connecting');
            this.updateRoomStatus('Joining room...');
            
            // First check if room exists
            const checkResponse = await fetch(`/api/check-room/${roomId}`);
            const checkData = await checkResponse.json();
            
            if (!checkData.exists) {
                throw new Error('Room not found');
            }
            
            if (checkData.isFull) {
                throw new Error('Room is full (max 2 users)');
            }
            
            // Join the room via API
            const joinResponse = await fetch(`/api/join-room/${roomId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            const joinData = await joinResponse.json();
            
            if (!joinResponse.ok) {
                throw new Error(joinData.error || 'Failed to join room');
            }
            
            this.roomId = roomId;
            this.userRole = 'guest';
            this.otherUser = joinData.host;
            
            // Connect to signaling server if not already
            if (!this.socket || !this.socket.connected) {
                await this.connectSignaling();
            }
            
            // Join the room via socket
            this.socket.emit('join-room', this.roomId);
            
            // Update UI
            this.updateStatus(`In room: ${roomId}`, 'connected');
            this.updateRoomStatus('In room', 'connected');
            this.updateRoomIdDisplay(roomId);
            this.enableControls(true);
            this.updateRoleDisplay();
            
            // Hide empty state
            document.getElementById('emptyState').style.display = 'none';
            
            // Show remote preview
            document.getElementById('remotePreview').style.display = 'block';
            document.getElementById('remoteUserLabel').textContent = this.otherUser;
            
            // Show notification in bottom left
            this.showBottomLeftNotification(`Joined room as ${this.userRole}`, 3000);
            
            // Start connection timer
            this.connectionStartTime = Date.now();
            
        } catch (error) {
            console.error('❌ Error joining room:', error);
            this.showNotification('Join Failed', error.message, 'error');
            this.updateStatus('Join failed', 'error');
            this.updateRoomStatus('Join failed');
        }
    }

    leaveRoom() {
        if (this.socket && this.roomId) {
            this.socket.emit('leave-room', this.roomId);
        }
        
        // Close all peer connections
        Object.keys(this.peerConnections).forEach(userId => {
            this.closePeerConnection(userId);
        });
        
        // Stop local stream
        if (this.localStream) {
            this.stopScreenShare();
        }
        
        // Reset state
        this.roomId = null;
        this.otherUser = null;
        this.userRole = null;
        this.isSharing = false;
        
        // Update UI
        this.enableControls(false);
        this.updateRoomIdDisplay('----');
        this.updateStatus('Disconnected', 'error');
        this.updateRoomStatus('Disconnected');
        
        // Clear video elements
        document.getElementById('mainVideo').srcObject = null;
        document.getElementById('remoteVideo').srcObject = null;
        
        // Show empty state
        document.getElementById('emptyState').style.display = 'block';
        
        // Hide remote preview
        document.getElementById('remotePreview').style.display = 'none';
        
        this.showBottomLeftNotification('Left room', 3000);
    }

    async startScreenShare() {
        try {
            this.updateStatus('Starting screen share...', 'connecting');
            
            // Check if room is full and we're not host
            if (this.userRole === 'guest' && this.otherUser && this.isSharing) {
                this.showNotification('Cannot Share', 'Only host can share screen', 'warning');
                return;
            }
            
            const constraints = {
                video: {
                    displaySurface: 'monitor',
                    logicalSurface: true,
                    cursor: 'always',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 30 }
                },
                audio: false
            };
            
            // Get screen stream
            if (navigator.mediaDevices.getDisplayMedia) {
                this.localStream = await navigator.mediaDevices.getDisplayMedia(constraints);
            } else {
                throw new Error('Screen sharing not supported on this browser');
            }
            
            // Display on main video
            const mainVideo = document.getElementById('mainVideo');
            mainVideo.srcObject = this.localStream;
            
            // Update UI
            this.isSharing = true;
            document.getElementById('btnShare').disabled = true;
            document.getElementById('btnStop').disabled = false;
            const quickShareBtn = document.getElementById('quickShareBtn');
            if (quickShareBtn) {
                quickShareBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
                quickShareBtn.setAttribute('onclick', 'app.stopScreenShare()');
                quickShareBtn.title = 'Stop Sharing';
            }
            
            document.getElementById('emptyState').style.display = 'none';
            document.getElementById('screenTitle').textContent = 'Your Screen (Live)';
            
            this.updateStatus('Screen sharing active', 'connected');
            
            // Show notification in bottom left
            this.showBottomLeftNotification('Screen sharing started', 3000);
            
            // Share with other user if they exist
            if (this.otherUser) {
                this.createPeerConnection(this.otherUser, true);
            }
            
            // Handle when user stops sharing via browser UI
            this.localStream.getVideoTracks()[0].onended = () => {
                console.log('Screen sharing ended by browser');
                this.stopScreenShare();
            };
            
            // Start stats monitoring
            this.startStreamQualityMonitoring();
            
        } catch (error) {
            console.error('❌ Error starting screen share:', error);
            
            if (error.name === 'NotAllowedError') {
                this.showNotification('Permission Denied', 'Please allow screen sharing in your browser.', 'error');
            } else if (error.name === 'NotFoundError') {
                this.showNotification('No Screen Selected', 'Please select a screen or window to share.', 'error');
            } else {
                this.showNotification('Screen Share Failed', error.message, 'error');
            }
            
            this.updateStatus('Ready', 'connected');
        }
    }

    stopScreenShare() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        // Update UI
        this.isSharing = false;
        document.getElementById('btnShare').disabled = false;
        document.getElementById('btnStop').disabled = true;
        const quickShareBtn = document.getElementById('quickShareBtn');
        if (quickShareBtn) {
            quickShareBtn.innerHTML = '<i class="fas fa-share-square"></i>';
            quickShareBtn.setAttribute('onclick', 'app.startScreenShare()');
            quickShareBtn.title = 'Share Screen';
        }
        
        document.getElementById('screenTitle').textContent = 'Your Screen';
        document.getElementById('mainVideo').srcObject = null;
        
        this.updateStatus('Screen sharing stopped', 'connected');
        
        // Show notification in bottom left
        this.showBottomLeftNotification('Screen sharing stopped', 3000);
        
        // Stop sharing with all peers
        Object.values(this.peerConnections).forEach(pc => {
            const senders = pc.getSenders();
            senders.forEach(sender => {
                if (sender.track) {
                    pc.removeTrack(sender);
                }
            });
        });
        
        // Show empty state if no remote stream
        if (!this.otherUser || !document.getElementById('remoteVideo').srcObject) {
            document.getElementById('emptyState').style.display = 'block';
        }
    }

    createPeerConnection(targetUserId, isInitiator) {
        if (this.peerConnections[targetUserId]) {
            console.log('Peer connection already exists for:', targetUserId);
            return;
        }
        
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };
        
        const pc = new RTCPeerConnection(configuration);
        this.peerConnections[targetUserId] = pc;
        
        // Add local stream tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }
        
        // ICE candidate handling
        pc.onicecandidate = (event) => {
            if (event.candidate && this.socket) {
                this.socket.emit('ice-candidate', {
                    to: targetUserId,
                    candidate: event.candidate
                });
            }
        };
        
        // Remote stream handling
        pc.ontrack = (event) => {
            console.log('📹 Received remote stream from:', targetUserId);
            const remoteVideo = document.getElementById('remoteVideo');
            
            if (remoteVideo.srcObject !== event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                document.getElementById('remotePreviewOverlay').style.display = 'none';
            }
        };
        
        // Create offer if initiator
        if (isInitiator) {
            setTimeout(() => this.createOffer(targetUserId, pc), 100);
        }
    }

    async createOffer(targetUserId, pc) {
        try {
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            await pc.setLocalDescription(offer);
            
            this.socket.emit('offer', {
                to: targetUserId,
                offer: offer
            });
            
        } catch (error) {
            console.error('❌ Error creating offer:', error);
        }
    }

    closePeerConnection(userId) {
        const pc = this.peerConnections[userId];
        if (pc) {
            pc.close();
            delete this.peerConnections[userId];
        }
        
        // Reset remote video
        document.getElementById('remoteVideo').srcObject = null;
        document.getElementById('remotePreviewOverlay').style.display = 'flex';
    }

    enableControls(enabled) {
        document.getElementById('btnLeave').disabled = !enabled;
        document.getElementById('btnShare').disabled = !enabled;
        document.getElementById('btnStop').disabled = true;
        const quickShareBtn = document.getElementById('quickShareBtn');
        if (quickShareBtn) {
            quickShareBtn.disabled = !enabled;
            quickShareBtn.style.opacity = enabled ? '1' : '0.5';
        }
    }

    toggleAudio() {
        if (this.localStream) {
            const audioTracks = this.localStream.getAudioTracks();
            if (audioTracks.length > 0) {
                const isEnabled = audioTracks[0].enabled;
                audioTracks[0].enabled = !isEnabled;
                
                const btn = document.getElementById('btnAudio');
                btn.innerHTML = isEnabled ? 
                    '<i class="fas fa-volume-mute"></i><span>Unmute Audio</span>' : 
                    '<i class="fas fa-volume-up"></i><span>Mute Audio</span>';
            }
        }
    }

    toggleFullscreen() {
        const elem = document.querySelector('.main-content');
        
        if (!document.fullscreenElement) {
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }

    updateRoomIdDisplay(roomId) {
        document.getElementById('roomIdDisplay').textContent = roomId;
        const currentRoomId = document.getElementById('currentRoomId');
        if (currentRoomId) currentRoomId.textContent = roomId;
    }

    showBottomLeftNotification(message, duration = 3000) {
        const overlay = document.getElementById('sharingStatusOverlay');
        const text = document.getElementById('sharingStatusText');
        
        if (overlay && text) {
            text.textContent = message;
            overlay.style.display = 'flex';
            
            // Auto-hide after duration
            if (duration > 0) {
                setTimeout(() => {
                    overlay.style.display = 'none';
                }, duration);
            }
        }
    }

    showNotification(title, message, type = 'info', duration = 3000) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'bottom-left-overlay';
        notification.style.bottom = '80px';
        notification.style.zIndex = '1000';
        
        let icon = 'fa-info-circle';
        let borderColor = 'rgba(99, 102, 241, 0.3)';
        
        switch(type) {
            case 'success':
                icon = 'fa-check-circle';
                borderColor = 'rgba(16, 185, 129, 0.3)';
                break;
            case 'error':
                icon = 'fa-exclamation-circle';
                borderColor = 'rgba(239, 68, 68, 0.3)';
                break;
            case 'warning':
                icon = 'fa-exclamation-triangle';
                borderColor = 'rgba(245, 158, 11, 0.3)';
                break;
        }
        
        notification.style.borderColor = borderColor;
        notification.innerHTML = `
            <i class="fas ${icon}"></i>
            <div>
                <div style="font-weight: 600; font-size: 0.9em;">${title}</div>
                <div style="font-size: 0.8em; opacity: 0.8;">${message}</div>
            </div>
        `;
        
        // Add to overlay container
        const overlays = document.querySelector('.video-overlays');
        if (overlays) {
            overlays.appendChild(notification);
            
            // Auto-remove after duration
            if (duration > 0) {
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, duration);
            }
        }
    }

    copyRoomId() {
        const roomId = document.getElementById('roomIdDisplay').textContent;
        if (roomId && roomId !== '----') {
            navigator.clipboard.writeText(roomId).then(() => {
                this.showBottomLeftNotification('Room ID copied', 2000);
            });
        }
    }

    showInviteModal() {
        if (!this.roomId) {
            this.showNotification('No Room', 'Please join or create a room first', 'error');
            return;
        }
        document.getElementById('inviteCode').textContent = this.roomId;
        document.getElementById('inviteModal').style.display = 'flex';
    }

    hideInviteModal() {
        document.getElementById('inviteModal').style.display = 'none';
    }

    copyInviteCode() {
        const roomId = document.getElementById('inviteCode').textContent;
        navigator.clipboard.writeText(roomId).then(() => {
            this.showBottomLeftNotification('Room ID copied!', 2000);
            this.hideInviteModal();
        });
    }

    startStreamQualityMonitoring() {
        if (!this.localStream) return;
        
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (!videoTrack) return;
        
        setInterval(async () => {
            const stats = await videoTrack.getStats();
            let bitrate = 0;
            
            stats.forEach(stat => {
                if (stat.type === 'outbound-rtp' && stat.bytesSent) {
                    const bytes = stat.bytesSent;
                    const now = performance.now();
                    
                    if (this.lastBytes && this.lastTime) {
                        const bits = (bytes - this.lastBytes) * 8;
                        const timeDiff = (now - this.lastTime) / 1000;
                        bitrate = Math.round(bits / timeDiff / 1000); // kbps
                    }
                    
                    this.lastBytes = bytes;
                    this.lastTime = now;
                }
            });
            
            if (bitrate > 0) {
                this.bitrateHistory.push(bitrate);
                if (this.bitrateHistory.length > 10) {
                    this.bitrateHistory.shift();
                }
                
                const avgBitrate = Math.round(
                    this.bitrateHistory.reduce((a, b) => a + b, 0) / this.bitrateHistory.length
                );
                
                document.getElementById('bitrateStat').textContent = `${avgBitrate} kbps`;
                
                // Update time
                if (this.connectionStartTime) {
                    const elapsed = Math.floor((Date.now() - this.connectionStartTime) / 1000);
                    const minutes = Math.floor(elapsed / 60);
                    const seconds = elapsed % 60;
                    document.getElementById('timeStat').textContent = 
                        `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
            }
        }, 2000);
    }
}

// Initialize app
let app;

window.onload = () => {
    app = new SecureScreenShare();
};

// Global functions
window.quickLogin = () => app.quickLogin();
window.login = () => app.login();
window.register = () => app.register();
window.showRegisterForm = () => app.showRegisterForm();
window.showLoginForm = () => app.showLoginForm();
window.logout = () => app.logout();
window.createRoom = () => app.createRoom();
window.joinRoomFromModal = () => app.joinRoomFromModal();
window.showJoinRoomModal = () => app.showJoinRoomModal();
window.hideJoinRoomModal = () => app.hideJoinRoomModal();
window.leaveRoom = () => app.leaveRoom();
window.startScreenShare = () => app.startScreenShare();
window.stopScreenShare = () => app.stopScreenShare();
window.toggleAudio = () => app.toggleAudio();
window.toggleFullscreen = () => app.toggleFullscreen();
window.copyRoomId = () => app.copyRoomId();
window.copyInviteCode = () => app.copyInviteCode();
window.showInviteModal = () => app.showInviteModal();
window.hideInviteModal = () => app.hideInviteModal();