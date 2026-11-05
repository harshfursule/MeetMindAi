const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Message = require('../models/Message');

/**
 * Map of roomId -> Map of socketId -> { socketId, userId, userName, userRole, audioEnabled, videoEnabled, handRaised }
 * Tracks which users are in which rooms for signaling and controls.
 */
const rooms = new Map();

/**
 * Initialize Socket.io signaling server with JWT authentication.
 * Supports:
 * - Simple-peer signaling (targeted 1-to-1 mesh)
 * - Raw WebRTC (offer/answer/ice-candidate)
 * - Real-time in-meeting chat (group & private)
 * - Participant controls (mute, mute-all, kick, hand raise, reactions)
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
     * Accepts both event names: 'join-room' and 'join-meeting'
     * @event join-room / join-meeting
     * @param {Object} data - { roomId: string, audioEnabled?: boolean, videoEnabled?: boolean }
     */
    const handleJoinRoom = async (data) => {
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
        const participantData = {
          socketId: socket.id,
          userId: socket.userId,
          userName: socket.userName,
          userRole: socket.userRole,
          audioEnabled: data.audioEnabled !== false,
          videoEnabled: data.videoEnabled !== false,
          handRaised: false,
        };
        room.set(socket.id, participantData);

        // Get list of existing participants in the room (excluding the new user)
        const existingParticipants = [];
        room.forEach((participant, sid) => {
          if (sid !== socket.id) {
            existingParticipants.push(participant);
          }
        });

        // Fetch recent messages for this room
        let recentMessages = [];
        try {
          const query = mongoose.Types.ObjectId.isValid(roomId)
            ? { $or: [{ meetingId: roomId }, { roomId }] }
            : { roomId };
          recentMessages = await Message.find(query).sort({ createdAt: 1 }).limit(100);
        } catch (dbErr) {
          console.warn('[Socket] Could not load message history:', dbErr.message);
        }

        // Notify the joining user about existing participants and message history
        socket.emit('room-joined', {
          roomId,
          participants: existingParticipants,
          participantCount: room.size,
          messages: recentMessages,
        });

        // Send room-users count to all in room
        io.to(roomId).emit('room-users', { count: room.size });

        // Notify everyone else in the room about the new user
        socket.to(roomId).emit('user-joined', {
          ...participantData,
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
     * @event leave-room / leave-meeting
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
     * Supports both directed 1-to-1 targeting (targetSocketId) for multi-participant mesh,
     * and room-wide broadcast fallback.
     * @event signal
     */
    socket.on('signal', (data) => {
      try {
        const roomId = data.roomId || data.meetingId;
        const { signal, targetSocketId } = data;

        if (!roomId || !signal) {
          socket.emit('error', { message: 'Room ID and signal data are required.' });
          return;
        }

        if (targetSocketId) {
          // Point-to-point signal targeted to a specific peer in the room
          io.to(targetSocketId).emit('signal', {
            signal,
            senderSocketId: socket.id,
            userId: socket.userId,
            userName: socket.userName,
            socketId: socket.id,
          });
        } else {
          // Broadcast fallback
          socket.to(roomId).emit('signal', {
            signal,
            senderSocketId: socket.id,
            userId: socket.userId,
            userName: socket.userName,
            socketId: socket.id,
          });
        }
      } catch (error) {
        console.error('[Socket] Error handling signal:', error.message);
        socket.emit('error', { message: 'Failed to relay signal.' });
      }
    });

    /**
     * Handle live in-meeting chat messages (group & private).
     * @event send-message
     */
    socket.on('send-message', async (data) => {
      try {
        const roomId = data.roomId || data.meetingId;
        const { text, isPrivate, targetSocketId, targetUserId, targetUserName } = data;

        if (!roomId || !text || !text.trim()) {
          return;
        }

        const cleanText = text.trim();
        const messagePayload = {
          _id: new mongoose.Types.ObjectId().toString(),
          roomId,
          senderId: socket.userId,
          senderName: socket.userName,
          senderSocketId: socket.id,
          text: cleanText,
          isPrivate: !!isPrivate,
          targetSocketId: targetSocketId || null,
          targetUserId: targetUserId || null,
          targetUserName: targetUserName || null,
          createdAt: new Date().toISOString(),
        };

        // Persist to MongoDB
        try {
          const meetingIdVal = mongoose.Types.ObjectId.isValid(roomId) ? roomId : null;
          await Message.create({
            meetingId: meetingIdVal,
            roomId,
            senderId: socket.userId,
            senderName: socket.userName,
            text: cleanText,
            isPrivate: !!isPrivate,
            targetUserId: targetUserId || null,
            targetUserName: targetUserName || null,
          });
        } catch (dbErr) {
          console.warn('[Socket] Could not persist message:', dbErr.message);
        }

        if (isPrivate && targetSocketId) {
          // Private message: deliver to target peer and back to sender
          io.to(targetSocketId).emit('new-message', messagePayload);
          socket.emit('new-message', messagePayload);
        } else {
          // Group message: broadcast to all participants in room
          io.to(roomId).emit('new-message', messagePayload);
        }
      } catch (error) {
        console.error('[Socket] Error in send-message:', error);
      }
    });

    /**
     * Handle emoji reactions.
     * @event send-reaction
     */
    socket.on('send-reaction', (data) => {
      try {
        const roomId = data.roomId || data.meetingId;
        const { emoji } = data;
        if (!roomId || !emoji) return;

        io.to(roomId).emit('reaction-received', {
          id: `${socket.id}-${Date.now()}-${Math.random()}`,
          emoji,
          senderId: socket.userId,
          senderName: socket.userName,
          socketId: socket.id,
          createdAt: Date.now(),
        });
      } catch (error) {
        console.error('[Socket] Error in send-reaction:', error);
      }
    });

    /**
     * Handle raise / lower hand toggle.
     * @event toggle-raise-hand
     */
    socket.on('toggle-raise-hand', (data) => {
      try {
        const roomId = data.roomId || data.meetingId;
        const isRaised = Boolean(data.isRaised);

        const room = rooms.get(roomId);
        if (room && room.has(socket.id)) {
          room.get(socket.id).handRaised = isRaised;
        }

        io.to(roomId).emit('user-hand-toggled', {
          socketId: socket.id,
          userId: socket.userId,
          userName: socket.userName,
          isRaised,
        });
      } catch (error) {
        console.error('[Socket] Error in toggle-raise-hand:', error);
      }
    });

    /**
     * Host lowers a participant's hand.
     * @event lower-hand
     */
    socket.on('lower-hand', (data) => {
      try {
        const roomId = data.roomId || data.meetingId;
        const { targetSocketId } = data;
        if (!roomId || !targetSocketId) return;

        const room = rooms.get(roomId);
        if (room && room.has(targetSocketId)) {
          room.get(targetSocketId).handRaised = false;
        }

        io.to(roomId).emit('user-hand-toggled', {
          socketId: targetSocketId,
          isRaised: false,
        });

        io.to(targetSocketId).emit('force-lower-hand');
      } catch (error) {
        console.error('[Socket] Error in lower-hand:', error);
      }
    });

    /**
     * Handle participant audio/video state changes.
     * @event media-state-change
     */
    socket.on('media-state-change', (data) => {
      try {
        const roomId = data.roomId || data.meetingId;
        const { audioEnabled, videoEnabled } = data;

        const room = rooms.get(roomId);
        if (room && room.has(socket.id)) {
          const participant = room.get(socket.id);
          if (audioEnabled !== undefined) participant.audioEnabled = audioEnabled;
          if (videoEnabled !== undefined) participant.videoEnabled = videoEnabled;
        }

        socket.to(roomId).emit('user-media-state-changed', {
          socketId: socket.id,
          userId: socket.userId,
          audioEnabled,
          videoEnabled,
        });
      } catch (error) {
        console.error('[Socket] Error in media-state-change:', error);
      }
    });

    /**
     * Host mutes a specific participant.
     * @event mute-participant
     */
    socket.on('mute-participant', (data) => {
      try {
        const { targetSocketId } = data;
        if (!targetSocketId) return;

        io.to(targetSocketId).emit('force-mute', {
          mutedBy: socket.userName,
        });
      } catch (error) {
        console.error('[Socket] Error in mute-participant:', error);
      }
    });

    /**
     * Host mutes all participants.
     * @event mute-all
     */
    socket.on('mute-all', (data) => {
      try {
        const roomId = data.roomId || data.meetingId;
        if (!roomId) return;

        socket.to(roomId).emit('force-mute', {
          mutedBy: socket.userName,
        });
      } catch (error) {
        console.error('[Socket] Error in mute-all:', error);
      }
    });

    /**
     * Host removes / kicks a participant from the meeting.
     * @event kick-participant
     */
    socket.on('kick-participant', (data) => {
      try {
        const roomId = data.roomId || data.meetingId;
        const { targetSocketId } = data;
        if (!roomId || !targetSocketId) return;

        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.emit('kicked-from-meeting', {
            kickedBy: socket.userName,
            reason: 'You have been removed from the meeting by the host.',
          });
          handleLeaveRoom(targetSocket, roomId, io);
        }
      } catch (error) {
        console.error('[Socket] Error in kick-participant:', error);
      }
    });

    /**
     * Handle WebRTC offer (raw fallback)
     */
    socket.on('offer', (data) => {
      try {
        const { roomId, targetSocketId, sdp } = data;
        if (!roomId || !targetSocketId || !sdp) return;

        io.to(targetSocketId).emit('offer', {
          roomId,
          sdp,
          senderSocketId: socket.id,
          senderUserId: socket.userId,
          senderUserName: socket.userName,
        });
      } catch (error) {
        console.error('[Socket] Error handling offer:', error.message);
      }
    });

    /**
     * Handle WebRTC answer (raw fallback)
     */
    socket.on('answer', (data) => {
      try {
        const { roomId, targetSocketId, sdp } = data;
        if (!roomId || !targetSocketId || !sdp) return;

        io.to(targetSocketId).emit('answer', {
          roomId,
          sdp,
          senderSocketId: socket.id,
          senderUserId: socket.userId,
          senderUserName: socket.userName,
        });
      } catch (error) {
        console.error('[Socket] Error handling answer:', error.message);
      }
    });

    /**
     * Handle ICE candidate
     */
    socket.on('ice-candidate', (data) => {
      try {
        const { roomId, targetSocketId, candidate } = data;
        if (!roomId || !targetSocketId || !candidate) return;

        io.to(targetSocketId).emit('ice-candidate', {
          roomId,
          candidate,
          senderSocketId: socket.id,
          senderUserId: socket.userId,
        });
      } catch (error) {
        console.error('[Socket] Error handling ICE candidate:', error.message);
      }
    });

    /**
     * Handle disconnection.
     */
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] User disconnected: ${socket.userName} (${socket.userId}) - Reason: ${reason}`);

      if (socket.currentRoom) {
        handleLeaveRoom(socket, socket.currentRoom, io);
      }

      rooms.forEach((room, roomId) => {
        if (room.has(socket.id)) {
          handleLeaveRoom(socket, roomId, io);
        }
      });
    });

    socket.on('error', (error) => {
      console.error(`[Socket] Socket error for ${socket.userName}:`, error);
    });
  });

  console.log('[Socket] Signaling server initialized with chat & participant controls.');
};

/**
 * Handle a user leaving a room. Cleans up tracking data and notifies other participants.
 */
function handleLeaveRoom(socket, roomId, io) {
  socket.leave(roomId);

  const room = rooms.get(roomId);
  if (room) {
    room.delete(socket.id);

    socket.to(roomId).emit('user-left', {
      socketId: socket.id,
      userId: socket.userId,
      userName: socket.userName,
      participantCount: room.size,
    });

    io.to(roomId).emit('room-users', { count: room.size });

    console.log(`[Socket] ${socket.userName} left room ${roomId} (${room.size} users remaining)`);

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
