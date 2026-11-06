const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectDB = require('../config/db');
const authRoutes = require('../routes/auth');
const meetingRoutes = require('../routes/meetings');
const { router: webrtcRoutes } = require('../routes/webrtc');
const User = require('../models/User');
const Meeting = require('../models/Meeting');
const Message = require('../models/Message');

let server;
let port;
let baseUrl;
let authToken;
let createdUserId;
let createdMeetingId;

const testUser = {
  name: 'QA Tester',
  email: `qa.test.${Date.now()}@meetmind.ai`,
  password: 'Password123!',
};

before(async () => {
  await connectDB();

  const app = express();
  app.use(express.json());
  app.get('/api/health', (req, res) => res.json({ success: true, message: 'API running' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/meetings', meetingRoutes);
  app.use('/api/webrtc', webrtcRoutes);

  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, () => {
      port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  // Cleanup test user and meeting from database
  if (createdUserId) {
    await User.findByIdAndDelete(createdUserId).catch(() => {});
  }
  if (createdMeetingId) {
    await Meeting.findByIdAndDelete(createdMeetingId).catch(() => {});
    await Message.deleteMany({ meetingId: createdMeetingId }).catch(() => {});
  }

  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.close();
});

describe('1. Health Check Smoke Test', () => {
  test('GET /api/health returns 200 and healthy message', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
  });
});

describe('2. Authentication & User Management Tests', () => {
  test('POST /api/auth/register registers new user and issues JWT', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser),
    });

    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.token, 'Token should be returned');
    assert.equal(json.data.user.email, testUser.email.toLowerCase());

    authToken = json.data.token;
    createdUserId = json.data.user._id;
  });

  test('POST /api/auth/register rejects duplicate email with 409', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser),
    });

    assert.equal(res.status, 409);
    const json = await res.json();
    assert.equal(json.success, false);
  });

  test('POST /api/auth/login authenticates registered user', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
      }),
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.token);
  });

  test('POST /api/auth/login rejects incorrect password with 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: 'WrongPassword123',
      }),
    });

    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.success, false);
  });

  test('GET /api/auth/me returns current user profile with valid Bearer token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.user.email, testUser.email.toLowerCase());
  });
});

describe('3. Meeting Lifecycle Tests', () => {
  test('POST /api/meetings creates new meeting room with host assignment', async () => {
    const res = await fetch(`${baseUrl}/api/meetings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        title: 'QA Sprint Review',
        description: 'Testing core functionality',
      }),
    });

    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.meeting._id);
    assert.ok(json.data.meeting.roomId, 'Should generate a UUID roomId');
    assert.equal(json.data.meeting.title, 'QA Sprint Review');

    createdMeetingId = json.data.meeting._id;
  });

  test('GET /api/meetings lists all user meetings', async () => {
    const res = await fetch(`${baseUrl}/api/meetings`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(Array.isArray(json.data.meetings));
    assert.ok(json.data.meetings.length >= 1);
  });

  test('GET /api/meetings/:id retrieves meeting details', async () => {
    const res = await fetch(`${baseUrl}/api/meetings/${createdMeetingId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.meeting._id, createdMeetingId);
  });

  test('GET /api/meetings/:id/messages returns meeting chat history', async () => {
    const res = await fetch(`${baseUrl}/api/meetings/${createdMeetingId}/messages`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(Array.isArray(json.data.messages));
  });
});

describe('4. WebRTC STUN/TURN Server Configuration Tests', () => {
  test('GET /api/webrtc/ice-servers returns STUN and multi-transport TURN servers', async () => {
    const res = await fetch(`${baseUrl}/api/webrtc/ice-servers`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data.iceServers));

    // Verify STUN presence
    const stunEntry = json.data.iceServers.find((s) =>
      Array.isArray(s.urls)
        ? s.urls.some((u) => u.startsWith('stun:'))
        : s.urls?.startsWith('stun:')
    );
    assert.ok(stunEntry, 'Must include STUN servers');

    // Verify TURN presence
    assert.equal(json.data.hasTurn, true, 'Must indicate TURN relay availability');
  });
});
