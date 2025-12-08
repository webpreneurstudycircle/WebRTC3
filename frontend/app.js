class ScreenShareApp {
    constructor() {
        this.socket = null;
        this.peerConnections = new Map();
        this.localStream = null;
        this.roomId = null;
        this.username = null;
        this.token = null;
        this.otherUser = null;
        this.isSharing = false;
        
        this.init();
    }

    async init() {
        this.bindEvents();
        
        // Check saved credentials
        const savedToken = localStorage.getItem('screenShareToken');
        const savedUsername = localStorage.getItem('screenShareUsername');
        
        if (savedToken && savedUsername) {
            this.token = savedToken;
            this.username = savedUsername;
            this.showApp();
            this.updateUserInfo();
        } else {
            this.showAuthModal();
        }
    }

    bindEvents() {
        // Login form events
        const loginUsername = document.getElementById('loginUsername');
        const loginPassword = document.getElementById('loginPassword');
        
        if (loginUsername && loginPassword) {
            loginUsername.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') loginPassword.focus();
            });
            
            loginPassword.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.login();
            });
        }
        
        // Register form
        const confirmPassword = document.getElementById('confirmPassword');
        if (confirmPassword) {
            confirmPassword.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.register();
            });
        }
        
        // Join room
        const joinRoomInput = document.getElementById('joinRoomInput');
        if (joinRoomInput) {
            joinRoomInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.joinRoomFromModal();
            });
        }
    }

    showAuthModal() {
        document.getElementById('authModal').style.display = 'flex';
        document.getElementById('appWrapper').style.display = 'none';
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
    }

    showRegisterForm() {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    }

    quickLogin() {
        document.getElementById('loginUsername').value = 'demo';
        document.getElementById('loginPassword').value = 'demo123';
        this.login();
    }

    async login() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        if (!username || !password) {
            this.showNotification('Please enter username and password');
            return;
        }
        
        const loginBtn = document.querySelector('#loginForm .btn');
        const originalText = loginBtn.innerHTML;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        loginBtn.disabled = true;
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }
            
            this.token = data.token;
            this.username = data.username;
            
            localStorage.setItem('screenShareToken', data.token);
            localStorage.setItem('screenShareUsername', data.username);
            
            this.hideAuthModal();
            this.showApp();
            this.updateUserInfo();
            
            document.getElementById('loginUsername').value = '';
            document.getElementById('loginPassword').value = '';
            
        } catch (error) {
            this.showNotification(error.message);
        } finally {
            loginBtn.innerHTML = originalText;
            loginBtn.disabled = false;
        }
    }

    async register() {
        const username = document.getElementById('registerUsername').value.trim();
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (!username || !password) {
            this.showNotification('Please enter username and password');
            return;
        }
        
        if (password !== confirmPassword) {
            this.showNotification('Passwords do not match');
            return;
        }
        
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
            
            this.showNotification('Account created! Please login.');
            this.showLoginForm();
            
        } catch (error) {
            this.showNotification(error.message);
        }
    }

    logout() {
        if (confirm('Are you sure you want to logout?')) {
            if (this.roomId) {
                this.leaveRoom();
            }
            
            if (this.socket) {
                this.socket.disconnect();
            }
            
            this.token = null;
            this.username = null;
            localStorage.removeItem('screenShareToken');
            localStorage.removeItem('screenShareUsername');
            
            this.showAuthModal();
            this.showLoginForm();
        }
    }

    updateUserInfo() {
        if (this.username) {
            document.getElementById('currentUsername').textContent = this.username;
            document.getElementById('btnShare').disabled = false;
            document.getElementById('quickShareBtn').disabled = false;
        }
    }

    updateStatus(message, isConnected = false) {
        const statusEl = document.getElementById('statusText');
        const dotEl = document.getElementById('statusDot');
        
        if (statusEl) statusEl.textContent = message;
        if (dotEl) {
            dotEl.className = 'status-dot';
            if (isConnected) dotEl.classList.add('connected');
        }
    }

    async connectSignaling() {
        try {
            this.updateStatus('Connecting...');
            
            this.socket = io(window.location.origin, {
                auth: { token: this.token }
            });
            
            this.socket.on('connect', () => {
                console.log('Connected to server');
                this.updateStatus('Connected', true);
            });
            
            this.socket.on('room-info', (data) => {
                console.log('Room info:', data);
                this.updateRoomIdDisplay(data.roomId);
                this.updateStatus('In room', true);
            });
            
            this.socket.on('user-joined', (data) => {
                console.log('User joined:', data.username);
                this.otherUser = data.username;
                
                // Show remote preview
                document.getElementById('remotePreview').style.display = 'block';
                
                // If we're sharing, send our stream
                if (this.isSharing && this.localStream) {
                    this.createPeerConnection(data.socketId, true);
                }
            });
            
            this.socket.on('host-disconnected', () => {
                this.showNotification('Host left the room');
                this.leaveRoom();
            });
            
            this.socket.on('guest-disconnected', () => {
                this.otherUser = null;
                document.getElementById('remotePreview').style.display = 'none';
                this.showNotification('Other user left');
            });
            
            this.socket.on('room-error', (error) => {
                this.showNotification(error);
                this.leaveRoom();
            });
            
            // WebRTC signaling
            this.socket.on('offer', async ({ from, offer }) => {
                console.log('Received offer from:', from);
                try {
                    if (!this.peerConnections.has(from)) {
                        await this.createPeerConnection(from, false);
                    }
                    
                    const pc = this.peerConnections.get(from);
                    await pc.setRemoteDescription(new RTCSessionDescription(offer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    
                    this.socket.emit('answer', { to: from, answer });
                } catch (error) {
                    console.error('Error handling offer:', error);
                }
            });
            
            this.socket.on('answer', async ({ from, answer }) => {
                console.log('Received answer from:', from);
                const pc = this.peerConnections.get(from);
                if (pc) {
                    try {
                        await pc.setRemoteDescription(new RTCSessionDescription(answer));
                    } catch (error) {
                        console.error('Error handling answer:', error);
                    }
                }
            });
            
            this.socket.on('ice-candidate', async ({ from, candidate }) => {
                console.log('Received ICE candidate from:', from);
                const pc = this.peerConnections.get(from);
                if (pc && candidate) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (error) {
                        console.error('Error adding ICE candidate:', error);
                    }
                }
            });
            
        } catch (error) {
            console.error('Connection error:', error);
            this.updateStatus('Connection failed');
        }
    }

    async createPeerConnection(socketId, isInitiator) {
        if (this.peerConnections.has(socketId)) {
            console.log('Peer connection already exists');
            return;
        }
        
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        const pc = new RTCPeerConnection(configuration);
        this.peerConnections.set(socketId, pc);
        
        // Add local stream if available
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }
        
        // ICE candidate handling
        pc.onicecandidate = (event) => {
            if (event.candidate && this.socket) {
                this.socket.emit('ice-candidate', {
                    to: socketId,
                    candidate: event.candidate
                });
            }
        };
        
        // Remote stream handling - FIXED
        pc.ontrack = (event) => {
            console.log('Received remote stream');
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                document.getElementById('remotePreviewOverlay').style.display = 'none';
            }
        };
        
        // Connection state
        pc.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', pc.iceConnectionState);
        };
        
        // Create offer if initiator
        if (isInitiator) {
            setTimeout(async () => {
                try {
                    const offer = await pc.createOffer({
                        offerToReceiveAudio: true,
                        offerToReceiveVideo: true
                    });
                    await pc.setLocalDescription(offer);
                    
                    this.socket.emit('offer', {
                        to: socketId,
                        offer: offer
                    });
                    
                    console.log('Sent offer to:', socketId);
                } catch (error) {
                    console.error('Error creating offer:', error);
                }
            }, 1000);
        }
        
        return pc;
    }

    closePeerConnection(socketId) {
        const pc = this.peerConnections.get(socketId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(socketId);
        }
        
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
            remoteVideo.srcObject = null;
            document.getElementById('remotePreviewOverlay').style.display = 'flex';
        }
    }

    async createRoom() {
        if (!this.token) {
            this.showNotification('Please login first');
            return;
        }
        
        try {
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
            await this.joinRoom(this.roomId);
            
        } catch (error) {
            this.showNotification(error.message);
        }
    }

    showJoinRoomModal() {
        document.getElementById('joinRoomModal').style.display = 'flex';
        setTimeout(() => {
            document.getElementById('joinRoomInput').focus();
        }, 100);
    }

    hideJoinRoomModal() {
        document.getElementById('joinRoomModal').style.display = 'none';
        document.getElementById('joinRoomInput').value = '';
    }

    async joinRoomFromModal() {
        const roomId = document.getElementById('joinRoomInput').value.trim().toUpperCase();
        if (!roomId) {
            this.showNotification('Please enter a room ID');
            return;
        }
        
        await this.joinRoom(roomId);
        this.hideJoinRoomModal();
    }

    async joinRoom(roomId) {
        if (!this.token) {
            this.showNotification('Please login first');
            return;
        }
        
        try {
            // Check room exists
            const checkResponse = await fetch(`/api/check-room/${roomId}`);
            const checkData = await checkResponse.json();
            
            if (!checkData.exists) {
                throw new Error('Room not found');
            }
            
            if (checkData.isFull) {
                throw new Error('Room is full');
            }
            
            // Join room
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
            this.otherUser = joinData.host;
            
            // Connect to signaling
            if (!this.socket || !this.socket.connected) {
                await this.connectSignaling();
            }
            
            // Join room via socket
            this.socket.emit('join-room', this.roomId);
            
            // Update UI
            this.updateRoomIdDisplay(roomId);
            document.getElementById('btnLeave').disabled = false;
            document.getElementById('emptyState').style.display = 'none';
            
            // Show remote preview
            document.getElementById('remotePreview').style.display = 'block';
            
        } catch (error) {
            this.showNotification(error.message);
        }
    }

    leaveRoom() {
        if (this.socket && this.roomId) {
            this.socket.emit('leave-room', this.roomId);
        }
        
        // Close all peer connections
        this.peerConnections.forEach((pc, socketId) => {
            pc.close();
        });
        this.peerConnections.clear();
        
        // Stop local stream
        if (this.localStream) {
            this.stopScreenShare();
        }
        
        // Reset
        this.roomId = null;
        this.otherUser = null;
        
        // Update UI
        document.getElementById('btnLeave').disabled = true;
        document.getElementById('emptyState').style.display = 'block';
        document.getElementById('remotePreview').style.display = 'none';
        this.updateRoomIdDisplay('----');
        this.updateStatus('Disconnected');
    }

    async startScreenShare() {
        try {
            if (!this.roomId) {
                this.showNotification('Please join a room first');
                return;
            }
            
            const constraints = {
                video: {
                    displaySurface: 'monitor',
                    logicalSurface: true,
                    cursor: 'always',
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 24 }
                },
                audio: false
            };
            
            // Get screen stream
            if (navigator.mediaDevices.getDisplayMedia) {
                this.localStream = await navigator.mediaDevices.getDisplayMedia(constraints);
            } else {
                throw new Error('Screen sharing not supported');
            }
            
            // Display on main video
            const mainVideo = document.getElementById('mainVideo');
            mainVideo.srcObject = this.localStream;
            
            // Update UI
            this.isSharing = true;
            document.getElementById('btnShare').disabled = true;
            document.getElementById('btnStop').disabled = false;
            document.getElementById('quickShareBtn').disabled = true;
            
            document.getElementById('emptyState').style.display = 'none';
            
            // Share with other user if exists
            if (this.otherUser) {
                // We need to get the socket ID from the other user
                // For now, we'll wait for them to connect
                console.log('Waiting for peer connection...');
            }
            
            // Handle end of sharing
            this.localStream.getVideoTracks()[0].onended = () => {
                this.stopScreenShare();
            };
            
        } catch (error) {
            console.error('Screen share error:', error);
            
            if (error.name === 'NotAllowedError') {
                this.showNotification('Please allow screen sharing');
            } else {
                this.showNotification(error.message);
            }
        }
    }

    stopScreenShare() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        this.isSharing = false;
        document.getElementById('btnShare').disabled = false;
        document.getElementById('btnStop').disabled = true;
        document.getElementById('quickShareBtn').disabled = false;
        
        const mainVideo = document.getElementById('mainVideo');
        if (mainVideo) {
            mainVideo.srcObject = null;
        }
        
        // Show empty state if no one is sharing
        if (!this.otherUser) {
            document.getElementById('emptyState').style.display = 'block';
        }
    }

    updateRoomIdDisplay(roomId) {
        document.getElementById('roomIdDisplay').textContent = roomId;
    }

    showNotification(message) {
        // Simple notification
        alert(message);
    }

    showInviteModal() {
        if (!this.roomId) {
            this.showNotification('Please create or join a room first');
            return;
        }
        document.getElementById('inviteCode').textContent = this.roomId;
        document.getElementById('inviteModal').style.display = 'flex';
    }

    hideInviteModal() {
        document.getElementById('inviteModal').style.display = 'none';
    }

    copyRoomId() {
        const roomId = document.getElementById('roomIdDisplay').textContent;
        if (roomId && roomId !== '----') {
            navigator.clipboard.writeText(roomId);
            this.showNotification('Room ID copied');
        }
    }

    copyInviteCode() {
        const roomId = document.getElementById('inviteCode').textContent;
        navigator.clipboard.writeText(roomId);
        this.showNotification('Room ID copied');
        this.hideInviteModal();
    }

    toggleFullscreen() {
        const elem = document.documentElement;
        
        if (!document.fullscreenElement) {
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }
}

// Initialize
let app = null;

window.addEventListener('DOMContentLoaded', () => {
    app = new ScreenShareApp();
});

// Global functions
window.quickLogin = () => app?.quickLogin();
window.login = () => app?.login();
window.register = () => app?.register();
window.showRegisterForm = () => app?.showRegisterForm();
window.showLoginForm = () => app?.showLoginForm();
window.logout = () => app?.logout();
window.createRoom = () => app?.createRoom();
window.joinRoomFromModal = () => app?.joinRoomFromModal();
window.showJoinRoomModal = () => app?.showJoinRoomModal();
window.hideJoinRoomModal = () => app?.hideJoinRoomModal();
window.leaveRoom = () => app?.leaveRoom();
window.startScreenShare = () => app?.startScreenShare();
window.stopScreenShare = () => app?.stopScreenShare();
window.copyRoomId = () => app?.copyRoomId();
window.copyInviteCode = () => app?.copyInviteCode();
window.showInviteModal = () => app?.showInviteModal();
window.hideInviteModal = () => app?.hideInviteModal();
window.toggleFullscreen = () => app?.toggleFullscreen();