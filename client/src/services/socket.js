import { io } from 'socket.io-client';

let socket = null;

/**
 * Initialize and return the Socket.io client singleton.
 * Connects to the same origin (proxied to port 5000 by Vite).
 */
export const getSocket = () => {
  if (!socket) {
    const token = localStorage.getItem('token');
    socket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });
  }
  return socket;
};

/**
 * Disconnect and destroy the socket singleton.
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export default getSocket;
