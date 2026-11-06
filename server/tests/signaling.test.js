const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectDB = require('../config/db');
const User = require('../models/User');
const { initializeSignaling } = require('../socket/signaling');

let server;
let io;
let port;
let testUser1;
let testUser2;
let token1;
let token2;
let clientSocket1;
let clientSocket2;
const testRoomId = `test-room-${Date.now()}`;

before(async () => {
  await connectDB();

  // Create two distinct users for multi-peer testing
  testUser1 = await User.create({
    name: 'Alice Host',
    email: `alice.${Date.now()}@meetmind.ai`,
    password: 'Password123!',
    role: 'host',
  });
  token1 = testUser1.generateAuthToken();

  testUser2 = await User.create({
    name: 'Bob Participant',
    email: `bob.${Date.now()}@meetmind.ai`,
    password: 'Password123!',
    role: 'participant',
  });
  token2 = testUser2.generateAuthToken();

  // Setup Express + HTTP + Socket.io Server
  const app = express();
  server = http.createServer(app);
  io = new Server(server, { cors: { origin: '*' } });
  initializeSignaling(io);

  await new Promise((resolve) => {
    server.listen(0, () => {
      port = server.address().port;
      resolve();
    });
  });
});

after(async () => {
  if (clientSocket1?.connected) clientSocket1.disconnect();
  if (clientSocket2?.connected) clientSocket2.disconnect();

  if (testUser1?._id) await User.findByIdAndDelete(testUser1._id).catch(() => {});
  if (testUser2?._id) await User.findByIdAndDelete(testUser2._id).catch(() => {});

  if (io) io.close();
  await new Promise((resolve) => server.close(resolve));
});

describe('5. Real-Time Socket.io Signaling & Collaboration Tests', () => {
  test('User 1 connects with JWT authentication', async () => {
    clientSocket1 = Client(`http://127.0.0.1:${port}`, {
      auth: { token: token1 },
      transports: ['websocket'],
    });

    await new Promise((resolve, reject) => {
      clientSocket1.on('connect', resolve);
      clientSocket1.on('connect_error', reject);
    });

    assert.ok(clientSocket1.id);
  });

  test('User 1 joins meeting room and receives room-joined', async () => {
    const joinedPromise = new Promise((resolve) => {
      clientSocket1.on('room-joined', (data) => {
        resolve(data);
      });
    });

    clientSocket1.emit('join-meeting', {
      meetingId: testRoomId,
      audioEnabled: true,
      videoEnabled: true,
    });

    const roomData = await joinedPromise;
    assert.equal(roomData.roomId, testRoomId);
    assert.equal(roomData.participantCount, 1);
  });

  test('User 2 connects and joins room; User 1 receives user-joined', async () => {
    clientSocket2 = Client(`http://127.0.0.1:${port}`, {
      auth: { token: token2 },
      transports: ['websocket'],
    });

    await new Promise((resolve) => clientSocket2.on('connect', resolve));

    const user1Notified = new Promise((resolve) => {
      clientSocket1.on('user-joined', (data) => {
        resolve(data);
      });
    });

    clientSocket2.emit('join-meeting', {
      meetingId: testRoomId,
      audioEnabled: true,
      videoEnabled: true,
    });

    const notifiedData = await user1Notified;
    assert.equal(notifiedData.userName, 'Bob Participant');
    assert.equal(notifiedData.participantCount, 2);
  });

  test('In-Meeting Chat: User 2 sends message and User 1 receives new-message', async () => {
    const messagePromise = new Promise((resolve) => {
      clientSocket1.on('new-message', (msg) => {
        resolve(msg);
      });
    });

    clientSocket2.emit('send-message', {
      meetingId: testRoomId,
      text: 'Hello from Bob!',
      isPrivate: false,
    });

    const msg = await messagePromise;
    assert.equal(msg.text, 'Hello from Bob!');
    assert.equal(msg.senderName, 'Bob Participant');
    assert.equal(msg.isPrivate, false);
  });

  test('Live Emoji Reactions: User 1 sends emoji and User 2 receives reaction-received', async () => {
    const reactionPromise = new Promise((resolve) => {
      clientSocket2.on('reaction-received', (reaction) => {
        resolve(reaction);
      });
    });

    clientSocket1.emit('send-reaction', {
      meetingId: testRoomId,
      emoji: '🎉',
    });

    const reaction = await reactionPromise;
    assert.equal(reaction.emoji, '🎉');
    assert.equal(reaction.senderName, 'Alice Host');
  });

  test('Raise Hand: User 2 raises hand and room is notified via user-hand-toggled', async () => {
    const handPromise = new Promise((resolve) => {
      clientSocket1.on('user-hand-toggled', (data) => {
        resolve(data);
      });
    });

    clientSocket2.emit('toggle-raise-hand', {
      meetingId: testRoomId,
      isRaised: true,
    });

    const handData = await handPromise;
    assert.equal(handData.isRaised, true);
    assert.equal(handData.userName, 'Bob Participant');
  });

  test('Screen Sharing & Presenter Switching: User 2 starts sharing and room receives presenter-changed', async () => {
    const presenterPromise = new Promise((resolve) => {
      clientSocket1.on('presenter-changed', (data) => {
        resolve(data);
      });
    });

    clientSocket2.emit('start-screen-share', {
      meetingId: testRoomId,
    });

    const presenterData = await presenterPromise;
    assert.equal(presenterData.presenterName, 'Bob Participant');
    assert.equal(presenterData.presenterSocketId, clientSocket2.id);
  });

  test('User 2 leaves meeting; User 1 receives user-left and participantCount updates to 1', async () => {
    const userLeftPromise = new Promise((resolve) => {
      clientSocket1.on('user-left', (data) => {
        resolve(data);
      });
    });

    clientSocket2.emit('leave-meeting', {
      meetingId: testRoomId,
    });

    const leftData = await userLeftPromise;
    assert.equal(leftData.userName, 'Bob Participant');
    assert.equal(leftData.participantCount, 1);
  });
});
