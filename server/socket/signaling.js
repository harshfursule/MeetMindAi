const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Map of roomId -> Map of socketId -> { socketId, userId, userName, userRole }
 * Tracks which users are in which rooms for signaling.
 */
const rooms = new Map();

/**
 * Initialize Socket.io signaling server with JWT authentication.
 * Supports both simple-peer signaling (signal event) and raw WebRTC
 * (offer/answer/ice-candidate events).
 *
 * @param {import('socket.io').Server} io - The Socket.io server instance
 */
const initializeSignaling = (io) => {
  /**
   * Authentication middleware for Socket.io connections.
   * Verifies JWT token passed via auth.token handshake.
   */
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        return next(new Error('Authentication error: No token provided.'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Fetch user from database
      const user = await User.findById(decoded.id);

      if (!user) {
        return next(new Error('Authentication error: User not found.'));
      }

      // Attach user data to socket
      socket.userId = user._id.toString();
      socket.userName = user.name;
      socket.userEmail = user.email;
      socket.userRole = user.role;

      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return next(new Error('Authentication error: Invalid token.'));
      }
      if (error.name === 'TokenExpiredError') {
        return next(new Error('Authentication error: Token expired.'));
      }
      return next(new Error('Authentication error: ' + error.message));
    }
  });

  /**
   * Handle new socket connections.
   */
  io.on('connection', (socket) => {
    console.log(`[Socket] User connected: ${socket.userName} (${socket.userId}) - Socket: ${socket.id}`);

    /**
     * Handle joining a room.
     * Accepts both event names: 'join-room' and 'join-meeting' (frontend compatibility)
     * @event join-room / join-meeting
     * @param {Object} data - { roomId: string } or { meetingId: string }
     */
    const handleJoinRoom = (data) => {
      try {
        const roomId = data.roomId || data.meetingId;

        if (!roomId) {
          socket.emit('error', { message: 'Room ID is required.' });
          return;
        }

        // Join the Socket.io room
        socket.join(roomId);
        socket.currentRoom = roomId;

        // Track user in room
        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Map());
        }

        const room = rooms.get(roomId);
        room.set(socket.id, {
          socketId: socket.id,
          userId: socket.userId,
          userName: socket.userName,
          userRole: socket.userRole,
        });

        // Get list of existing participants in the room (excluding the new user)
        const existingParticipants = [];
        room.forEach((participant, sid) => {
          if (sid !== socket.id) {
            existingParticipants.push(participant);
          }
        });

        // Notify the joining user about existing participants
        socket.emit('room-joined', {
          roomId,
          participants: existingParticipants,
          participantCount: room.size,
        });

        // Send room-users count to all in room
        io.to(roomId).emit('room-users', { count: room.size });

        // Notify everyone else in the room about the new user
        socket.to(roomId).emit('user-joined', {
          socketId: socket.id,
          userId: socket.userId,
          userName: socket.userName,
          userRole: socket.userRole,
          participantCount: room.size,
        });

        console.log(`[Socket] ${socket.userName} joined room ${roomId} (${room.size} users)`);
      } catch (error) {
        console.error('[Socket] Error joining room:', error.message);
        socket.emit('error', { message: 'Failed to join room.' });
      }
    };

    socket.on('join-room', handleJoinRoom);
    socket.on('join-meeting', handleJoinRoom);

    /**
     * Handle leaving a room.
     * Accepts both event names: 'leave-room' and 'leave-meeting'
     * @event leave-room / leave-meeting
     * @param {Object} data - { roomId: string } or { meetingId: string }
     */
    const handleLeaveRoomEvent = (data) => {
      try {
        const roomId = data.roomId || data.meetingId;

        if (!roomId) {
          socket.emit('error', { message: 'Room ID is required.' });
          return;
        }

        handleLeaveRoom(socket, roomId, io);
      } catch (error) {
        console.error('[Socket] Error leaving room:', error.message);
        socket.emit('error', { message: 'Failed to leave room.' });
      }
    };

    socket.on('leave-room', handleLeaveRoomEvent);
    socket.on('leave-meeting', handleLeaveRoomEvent);

    /**
     * Handle simple-peer signal relay.
     * This is the primary signaling mechanism used by the frontend (simple-peer).
     * Broadcasts the signal data to all other peers in the room.
     * @event signal
     * @param {Object} data - { meetingId: string, signal: object }
     */
    socket.on('signal', (data) => {
      try {
        const roomId = data.roomId || data.meetingId;
        const { signal } = data;

        if (!roomId || !signal) {
          socket.emit('error', { message: 'Room ID and signal data are required.' });
          return;
        }

        // Broadcast signal to all other users in the room
        socket.to(roomId).emit('signal', {
          signal,
          userId: socket.userId,
          userName: socket.userName,
          socketId: socket.id,
        });
      } catch (error) {
        console.error('[Socket] Error handling signal:', error.message);
        socket.emit('error', { message: 'Failed to relay signal.' });
      }
    });

    /**
     * Handle WebRTC offer (raw signaling, alternative to simple-peer).
     * Forwards the SDP offer to the target peer in the room.
     * @event offer
     * @param {Object} data - { roomId: string, targetSocketId: string, sdp: RTCSessionDescription }
     */
    socket.on('offer', (data) => {
      try {
        const { roomId, targetSocketId, sdp } = data;

        if (!roomId || !targetSocketId || !sdp) {
          socket.emit('error', { message: 'Room ID, target socket ID, and SDP are required for offer.' });
          return;
        }

        // Forward offer to the specific target peer
        io.to(targetSocketId).emit('offer', {
          roomId,
          sdp,
          senderSocketId: socket.id,
          senderUserId: socket.userId,
          senderUserName: socket.userName,
        });

        console.log(`[Socket] Offer from ${socket.userName} (${socket.id}) to ${targetSocketId} in room ${roomId}`);
      } catch (error) {
        console.error('[Socket] Error handling offer:', error.message);
        socket.emit('error', { message: 'Failed to send offer.' });
      }
    });

    /**
     * Handle WebRTC answer (raw signaling, alternative to simple-peer).
     * Forwards the SDP answer to the target peer.
     * @event answer
     * @param {Object} data - { roomId: string, targetSocketId: string, sdp: RTCSessionDescription }
     */
    socket.on('answer', (data) => {
      try {
        const { roomId, targetSocketId, sdp } = data;

        if (!roomId || !targetSocketId || !sdp) {
          socket.emit('error', { message: 'Room ID, target socket ID, and SDP are required for answer.' });
          return;
        }

        // Forward answer to the specific target peer
        io.to(targetSocketId).emit('answer', {
          roomId,
          sdp,
          senderSocketId: socket.id,
          senderUserId: socket.userId,
          senderUserName: socket.userName,
        });

        console.log(`[Socket] Answer from ${socket.userName} (${socket.id}) to ${targetSocketId} in room ${roomId}`);
      } catch (error) {
        console.error('[Socket] Error handling answer:', error.message);
        socket.emit('error', { message: 'Failed to send answer.' });
      }
    });

    /**
     * Handle ICE candidate exchange (raw signaling, alternative to simple-peer).
     * Forwards ICE candidates to the target peer.
     * @event ice-candidate
     * @param {Object} data - { roomId: string, targetSocketId: string, candidate: RTCIceCandidate }
     */
    socket.on('ice-candidate', (data) => {
      try {
        const { roomId, targetSocketId, candidate } = data;

        if (!roomId || !targetSocketId || !candidate) {
          socket.emit('error', { message: 'Room ID, target socket ID, and candidate are required.' });
          return;
        }

        // Forward ICE candidate to the specific target peer
        io.to(targetSocketId).emit('ice-candidate', {
          roomId,
          candidate,
          senderSocketId: socket.id,
          senderUserId: socket.userId,
        });
      } catch (error) {
        console.error('[Socket] Error handling ICE candidate:', error.message);
        socket.emit('error', { message: 'Failed to send ICE candidate.' });
      }
    });

    /**
     * Handle disconnection.
     * Clean up user from all rooms they were in.
     */
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] User disconnected: ${socket.userName} (${socket.userId}) - Reason: ${reason}`);

      // Clean up from all rooms
      if (socket.currentRoom) {
        handleLeaveRoom(socket, socket.currentRoom, io);
      }

      // Fallback: Check all rooms for this socket
      rooms.forEach((room, roomId) => {
        if (room.has(socket.id)) {
          handleLeaveRoom(socket, roomId, io);
        }
      });
    });

    /**
     * Handle generic errors.
     */
    socket.on('error', (error) => {
      console.error(`[Socket] Socket error for ${socket.userName}:`, error);
    });
  });

  console.log('[Socket] Signaling server initialized.');
};

/**
 * Handle a user leaving a room. Cleans up tracking data and notifies other participants.
 *
 * @param {import('socket.io').Socket} socket - The socket instance
 * @param {string} roomId - The room to leave
 * @param {import('socket.io').Server} io - The Socket.io server instance
 */
function handleLeaveRoom(socket, roomId, io) {
  socket.leave(roomId);

  const room = rooms.get(roomId);
  if (room) {
    room.delete(socket.id);

    // Notify remaining participants
    socket.to(roomId).emit('user-left', {
      socketId: socket.id,
      userId: socket.userId,
      userName: socket.userName,
      participantCount: room.size,
    });

    // Send updated room-users count
    io.to(roomId).emit('room-users', { count: room.size });

    console.log(`[Socket] ${socket.userName} left room ${roomId} (${room.size} users remaining)`);

    // Clean up empty rooms
    if (room.size === 0) {
      rooms.delete(roomId);
      console.log(`[Socket] Room ${roomId} is now empty and has been removed.`);
    }
  }

  if (socket.currentRoom === roomId) {
    socket.currentRoom = null;
  }
}

module.exports = { initializeSignaling, rooms };
