const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const ioClient = require('socket.io-client');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const connectDB = require('../config/db');
const User = require('../models/User');
const Meeting = require('../models/Meeting');
const Transcript = require('../models/Transcript');
const Summary = require('../models/Summary');
const authRoutes = require('../routes/auth');
const meetingRoutes = require('../routes/meetings');
const summaryRoutes = require('../routes/summaries');
const { router: webrtcRoutes } = require('../routes/webrtc');
const { initializeSignaling } = require('../socket/signaling');

let testServer;
let io;
let serverPort;
let hostToken;
let hostUser;
let participantToken;
let participantUser;
let testMeeting;

// Helper function for HTTP requests
const request = (method, urlPath, options = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, `http://127.0.0.1:${serverPort}`);
    const reqOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...(options.token && { Authorization: `Bearer ${options.token}` }),
        ...options.headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
};

before(async () => {
  await connectDB();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/meetings', meetingRoutes);
  app.use('/api/summaries', summaryRoutes);
  app.use('/api/webrtc', webrtcRoutes);

  testServer = http.createServer(app);
  io = new Server(testServer, { cors: { origin: '*' } });
  initializeSignaling(io);

  await new Promise((resolve) => {
    testServer.listen(0, () => {
      serverPort = testServer.address().port;
      resolve();
    });
  });

  const timestamp = Date.now();

  // Create Host User
  const hostRes = await request('POST', '/api/auth/register', {
    body: {
      name: 'Dr. Sarah Connor',
      email: `sarah_${timestamp}@test.com`,
      password: 'Password123!',
      role: 'host',
    },
  });
  hostUser = hostRes.data.data.user;
  hostToken = hostRes.data.data.token;

  // Create Participant User
  const partRes = await request('POST', '/api/auth/register', {
    body: {
      name: 'John Connor',
      email: `john_${timestamp}@test.com`,
      password: 'Password123!',
      role: 'participant',
    },
  });
  participantUser = partRes.data.data.user;
  participantToken = partRes.data.data.token;

  // Create Test Meeting
  const meetRes = await request('POST', '/api/meetings', {
    token: hostToken,
    body: {
      title: 'Q4 Product Roadmap & Architecture Sync',
      description: 'Discuss quarterly deliverables, deployment schedule, and STT features.',
    },
  });
  testMeeting = meetRes.data.data.meeting;
});

describe('7. AI Transcription & Live Captions API Suite', () => {
  test('POST /api/meetings/:id/transcript appends speaker-labelled entries', async () => {
    const res = await request('POST', `/api/meetings/${testMeeting._id}/transcript`, {
      token: hostToken,
      body: {
        entries: [
          {
            speakerId: hostUser._id || hostUser.id,
            speakerName: 'Dr. Sarah Connor',
            text: 'Welcome team. We need to finalize the deployment strategy today.',
            isFinal: true,
          },
          {
            speakerId: participantUser._id || participantUser.id,
            speakerName: 'John Connor',
            text: 'I will prepare the production Docker containers by Friday afternoon.',
            isFinal: true,
          },
          {
            speakerId: hostUser._id || hostUser.id,
            speakerName: 'Dr. Sarah Connor',
            text: 'We decided on adopting Web Speech API for real-time captions with zero latency.',
            isFinal: true,
          },
        ],
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.totalEntries, 3);
  });

  test('GET /api/meetings/:id/transcript returns all recorded entries with timestamps', async () => {
    const res = await request('GET', `/api/meetings/${testMeeting._id}/transcript`, {
      token: hostToken,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.entries.length, 3);
    assert.equal(res.data.data.entries[1].speakerName, 'John Connor');
    assert.match(res.data.data.entries[1].text, /Docker containers/);
  });
});

describe('8. AI Meeting Summarization Engine Tests', () => {
  test('POST /api/meetings/:id/summarize generates overview, key points & action items with assignees', async () => {
    const res = await request('POST', `/api/meetings/${testMeeting._id}/summarize`, {
      token: hostToken,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    const summary = res.data.data.summary;
    assert.ok(summary.overview.length > 20, 'Overview should be informative');
    assert.ok(Array.isArray(summary.keyPoints) && summary.keyPoints.length > 0, 'Key points should be present');
    assert.ok(Array.isArray(summary.actionItems) && summary.actionItems.length > 0, 'Action items should be extracted');

    // Check action item assignee heuristic: John Connor said "I will prepare the production Docker containers..."
    const dockerItem = summary.actionItems.find((item) => /Docker/i.test(item.task));
    assert.ok(dockerItem, 'Docker action item was extracted');
    assert.equal(dockerItem.assignee, 'John Connor');
    assert.equal(dockerItem.status, 'pending');
  });

  test('GET /api/meetings/:id/summary retrieves saved summary', async () => {
    const res = await request('GET', `/api/meetings/${testMeeting._id}/summary`, {
      token: participantToken,
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.data.summary);
    assert.equal(res.data.data.summary.meetingId.toString(), testMeeting._id.toString());
  });

  test('PUT /api/meetings/:id/summary updates action item status to completed', async () => {
    // First get current summary
    const getRes = await request('GET', `/api/meetings/${testMeeting._id}/summary`, {
      token: hostToken,
    });
    const currentSummary = getRes.data.data.summary;
    const items = currentSummary.actionItems.map((item, idx) =>
      idx === 0 ? { ...item, status: 'completed' } : item
    );

    const updateRes = await request('PUT', `/api/meetings/${testMeeting._id}/summary`, {
      token: hostToken,
      body: {
        actionItems: items,
      },
    });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.data.success, true);
    assert.equal(updateRes.data.data.summary.actionItems[0].status, 'completed');
  });

  test('POST /api/meetings/:id/summary/share enables public sharing link', async () => {
    const shareRes = await request('POST', `/api/meetings/${testMeeting._id}/summary/share`, {
      token: hostToken,
      body: { isShared: true },
    });

    assert.equal(shareRes.status, 200);
    assert.equal(shareRes.data.success, true);
    assert.equal(shareRes.data.data.isShared, true);
    const token = shareRes.data.data.shareToken;
    assert.ok(token);

    // Test public unauthenticated access
    const publicRes = await request('GET', `/api/summaries/public/${token}`);
    assert.equal(publicRes.status, 200);
    assert.equal(publicRes.data.success, true);
    assert.equal(publicRes.data.data.summary.isShared, true);
  });
});

describe('9. Real-Time Speech-to-Text Live Captions over Socket.io', () => {
  let senderSocket;
  let receiverSocket;

  after(() => {
    if (senderSocket) senderSocket.disconnect();
    if (receiverSocket) receiverSocket.disconnect();
  });

  test('Live caption emission is received in real-time by room participants and persisted to DB', async () => {
    senderSocket = ioClient(`http://127.0.0.1:${serverPort}`, {
      auth: { token: hostToken },
      transports: ['websocket'],
    });

    receiverSocket = ioClient(`http://127.0.0.1:${serverPort}`, {
      auth: { token: participantToken },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise((res) => senderSocket.on('connect', res)),
      new Promise((res) => receiverSocket.on('connect', res)),
    ]);

    senderSocket.emit('join-meeting', {
      meetingId: testMeeting._id,
      roomId: testMeeting.roomId,
    });

    receiverSocket.emit('join-meeting', {
      meetingId: testMeeting._id,
      roomId: testMeeting.roomId,
    });

    await new Promise((res) => setTimeout(res, 300));

    // Listen for live caption on receiver
    const captionPromise = new Promise((resolve) => {
      receiverSocket.on('caption-received', (data) => {
        resolve(data);
      });
    });

    const captionText = 'Live captions are syncing flawlessly over WebSocket mesh.';
    senderSocket.emit('send-caption', {
      roomId: testMeeting.roomId,
      text: captionText,
      isFinal: true,
    });

    const receivedCaption = await captionPromise;
    assert.equal(receivedCaption.speakerName, 'Dr. Sarah Connor');
    assert.equal(receivedCaption.text, captionText);
    assert.equal(receivedCaption.isFinal, true);

    // Wait brief moment for async MongoDB save
    await new Promise((res) => setTimeout(res, 300));

    // Verify persisted transcript in DB
    const transcriptInDb = await Transcript.findOne({
      $or: [{ meetingId: testMeeting._id }, { roomId: testMeeting.roomId }],
    });
    assert.ok(transcriptInDb);
    const persistedEntry = transcriptInDb.entries.find((e) => e.text === captionText);
    assert.ok(persistedEntry, 'Caption was persisted into MongoDB Transcript');
  });
});

after(async () => {
  if (testMeeting) {
    await Meeting.findByIdAndDelete(testMeeting._id);
    await Transcript.deleteMany({ meetingId: testMeeting._id });
    await Summary.deleteMany({ meetingId: testMeeting._id });
  }
  if (hostUser) await User.findByIdAndDelete(hostUser._id || hostUser.id);
  if (participantUser) await User.findByIdAndDelete(participantUser._id || participantUser.id);
  if (io) io.close();
  if (testServer) {
    await new Promise((resolve) => testServer.close(resolve));
  }
});
