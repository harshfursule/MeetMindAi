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
let hostUser;
let participantUser;
let bystanderUser;
let hostToken;
let participantToken;
let bystanderToken;
let hostSocket;
let participantSocket;
let bystanderSocket;
const testRoom = `collab-test-${Date.now()}`;

before(async () => {
  await connectDB();

  hostUser = await User.create({
    name: 'Charlie Host',
    email: `charlie.host.${Date.now()}@meetmind.ai`,
    password: 'Password123!',
    role: 'host',
  });
  hostToken = hostUser.generateAuthToken();

  participantUser = await User.create({
    name: 'Dana Participant',
    email: `dana.${Date.now()}@meetmind.ai`,
    password: 'Password123!',
    role: 'participant',
  });
  participantToken = participantUser.generateAuthToken();

  bystanderUser = await User.create({
    name: 'Evan Bystander',
    email: `evan.${Date.now()}@meetmind.ai`,
    password: 'Password123!',
    role: 'participant',
  });
  bystanderToken = bystanderUser.generateAuthToken();

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

  // Connect Host
  hostSocket = Client(`http://127.0.0.1:${port}`, {
    auth: { token: hostToken },
    transports: ['websocket'],
  });
  await new Promise((resolve) => hostSocket.on('connect', resolve));
  hostSocket.emit('join-meeting', { meetingId: testRoom });
  await new Promise((resolve) => hostSocket.on('room-joined', resolve));

  // Connect Participant
  participantSocket = Client(`http://127.0.0.1:${port}`, {
    auth: { token: participantToken },
    transports: ['websocket'],
  });
  await new Promise((resolve) => participantSocket.on('connect', resolve));
  participantSocket.emit('join-meeting', { meetingId: testRoom });
  await new Promise((resolve) => participantSocket.on('room-joined', resolve));

  // Connect Bystander
  bystanderSocket = Client(`http://127.0.0.1:${port}`, {
    auth: { token: bystanderToken },
    transports: ['websocket'],
  });
  await new Promise((resolve) => bystanderSocket.on('connect', resolve));
  bystanderSocket.emit('join-meeting', { meetingId: testRoom });
  await new Promise((resolve) => bystanderSocket.on('room-joined', resolve));
});

after(async () => {
  if (hostSocket?.connected) hostSocket.disconnect();
  if (participantSocket?.connected) participantSocket.disconnect();
  if (bystanderSocket?.connected) bystanderSocket.disconnect();

  if (hostUser?._id) await User.findByIdAndDelete(hostUser._id).catch(() => {});
  if (participantUser?._id) await User.findByIdAndDelete(participantUser._id).catch(() => {});
  if (bystanderUser?._id) await User.findByIdAndDelete(bystanderUser._id).catch(() => {});

  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.close();
});

describe('6. Advanced Collaboration & Host Privileges Tests', () => {
  test('Private Chat Isolation: Bystander does NOT receive 1-on-1 private message', async () => {
    let bystanderReceivedPrivate = false;
    bystanderSocket.on('new-message', (msg) => {
      if (msg.text === 'Secret between Host and Dana') {
        bystanderReceivedPrivate = true;
      }
    });

    const participantReceivedPromise = new Promise((resolve) => {
      participantSocket.on('new-message', (msg) => {
        if (msg.text === 'Secret between Host and Dana') {
          resolve(msg);
        }
      });
    });

    hostSocket.emit('send-message', {
      meetingId: testRoom,
      text: 'Secret between Host and Dana',
      isPrivate: true,
      targetSocketId: participantSocket.id,
      targetUserId: participantUser._id.toString(),
      targetUserName: participantUser.name,
    });

    const msg = await participantReceivedPromise;
    assert.equal(msg.isPrivate, true);
    assert.equal(msg.senderName, 'Charlie Host');

    // Wait 200ms to verify bystander never received the private message
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(bystanderReceivedPrivate, false, 'Private message must not leak to bystander');
  });

  test('Host Mute Participant: Target receives force-mute event', async () => {
    const mutePromise = new Promise((resolve) => {
      participantSocket.on('force-mute', (data) => {
        resolve(data);
      });
    });

    hostSocket.emit('mute-participant', {
      targetSocketId: participantSocket.id,
    });

    const muteData = await mutePromise;
    assert.equal(muteData.mutedBy, 'Charlie Host');
  });

  test('Host Mute All: All room members except host receive force-mute', async () => {
    const bystanderMutePromise = new Promise((resolve) => {
      bystanderSocket.on('force-mute', (data) => {
        resolve(data);
      });
    });

    hostSocket.emit('mute-all', {
      meetingId: testRoom,
    });

    const data = await bystanderMutePromise;
    assert.equal(data.mutedBy, 'Charlie Host');
  });

  test('Host Lower Hand: Host can lower a participant hand', async () => {
    // Participant raises hand
    participantSocket.emit('toggle-raise-hand', {
      meetingId: testRoom,
      isRaised: true,
    });

    await new Promise((r) => setTimeout(r, 100));

    // Host lowers participant hand
    const lowerHandPromise = new Promise((resolve) => {
      participantSocket.on('force-lower-hand', () => {
        resolve(true);
      });
    });

    hostSocket.emit('lower-hand', {
      meetingId: testRoom,
      targetSocketId: participantSocket.id,
    });

    const wasLowered = await lowerHandPromise;
    assert.equal(wasLowered, true);
  });

  test('Host Kick Participant: Target receives kicked-from-meeting and is removed', async () => {
    const kickedPromise = new Promise((resolve) => {
      participantSocket.on('kicked-from-meeting', (data) => {
        resolve(data);
      });
    });

    const hostSawDeparture = new Promise((resolve) => {
      hostSocket.on('user-left', (data) => {
        if (data.userName === 'Dana Participant') {
          resolve(data);
        }
      });
    });

    hostSocket.emit('kick-participant', {
      meetingId: testRoom,
      targetSocketId: participantSocket.id,
    });

    const kickedData = await kickedPromise;
    assert.ok(kickedData.reason);

    const departureData = await hostSawDeparture;
    assert.equal(departureData.userName, 'Dana Participant');
  });
});
