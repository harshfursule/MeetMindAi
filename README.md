# MeetMind AI

> AI-Powered Video Conferencing Platform with Smart Meeting Summarization & Live Transcription

[![Milestone](https://img.shields.io/badge/Milestone%201-Completed-brightgreen)](#milestone-1-overview)
[![Stack](https://img.shields.io/badge/Stack-MERN%20%7C%20WebRTC%20%7C%20Socket.io-blue)](#tech-stack)

---

## Milestone 1 Overview

Milestone 1 implements the core project architecture, database schemas, full-stack setup, authentication with RBAC, meeting room lifecycle management, and a real-time WebRTC 1-to-1 video calling prototype.

### Milestone 1 Deliverables
- [x] **Project objectives & meeting workflows defined**: Documented in `docs/MILESTONE_1_DESIGN.md`.
- [x] **System architecture & database design**: User and Meeting schemas with Mongoose and role-based permissions.
- [x] **UI Wireframes & UI Implementation**: Modern dark-themed dashboard, responsive navigation, glassmorphism modals, and video layout.
- [x] **Frontend & Backend Environments**: React (Vite + Tailwind CSS v4) and Node.js + Express.js API server.
- [x] **Authentication & Role-Based Access Control**: JWT authentication with bcrypt password hashing and role enforcement (`admin`, `host`, `co-host`, `participant`).
- [x] **Meeting Room Creation & Joining**: Endpoints and UI for creating, listing, joining, and leaving meetings.
- [x] **Socket.io Signaling Server & WebRTC Call**: Real-time SDP/ICE signaling with JWT handshake and peer-to-peer audio/video streaming via simple-peer + Google STUN servers.

---

## Tech Stack

- **Frontend**: React 18 / 19, Vite, Tailwind CSS v4, Lucide React, Simple-Peer, React Hot Toast, Axios, Socket.io-client
- **Backend**: Node.js 22, Express.js, Socket.io, Mongoose (MongoDB), JWT, Bcryptjs, Helmet, Express-Rate-Limit, Morgan
- **Real-Time Communication**: WebRTC P2P (Google STUN: `stun.l.google.com:19302`), Socket.io signaling

---

## Directory Structure

```
meetmind-ai/
├── client/                     # React Frontend (Vite)
│   ├── src/
│   │   ├── components/         # Navbar, ControlBar, VideoPlayer, MeetingCard, ProtectedRoute
│   │   ├── context/            # AuthContext (JWT management & session)
│   │   ├── pages/              # Login, Register, Dashboard, MeetingRoom
│   │   ├── services/           # Axios API instance, Socket.io client
│   │   ├── App.jsx             # React router configuration
│   │   └── main.jsx            # Application entry
│   ├── vite.config.js          # Proxies /api & /socket.io to backend
│   └── package.json
│
├── server/                     # Express Backend & Signaling Server
│   ├── config/db.js            # MongoDB Mongoose connection
│   ├── middleware/             # auth.js, roleCheck.js
│   ├── models/                 # User.js, Meeting.js
│   ├── routes/                 # auth.js, meetings.js
│   ├── socket/signaling.js     # WebRTC signaling logic with JWT authentication
│   ├── server.js               # Main server entry with Socket.io attachment
│   ├── .env                    # Environment variables
│   └── package.json
│
└── docs/
    └── MILESTONE_1_DESIGN.md   # Architectural specifications & protocols
```

---

## Running the Application Locally

### Prerequisites
1. **Node.js** (v18+)
2. **MongoDB** instance running locally on `localhost:27017` (or MongoDB Atlas connection string in `server/.env`)

### Step 1: Start the Backend Server
```bash
cd server
npm start
# Server starts on http://localhost:5000
# API Health: http://localhost:5000/api/health
```

### Step 2: Start the Frontend Client
```bash
cd client
npm run dev
# Client runs on http://localhost:3000
```

---

## Testing Milestone 1 Prototype

1. Navigate to `http://localhost:3000/register` and register a new user account.
2. You will be redirected to the **Dashboard** (`/dashboard`).
3. Click **"New Meeting"**, provide a title, and click **"Create"**.
4. You will immediately enter the meeting room with your camera and mic preview.
5. Copy the Meeting ID from the top header or dashboard.
6. Open an **Incognito Window** (or another browser like Chrome / Edge), register a second user account, and paste the Meeting ID into the **Join a Meeting** input.
7. Both users will establish a direct peer-to-peer WebRTC video call with real-time audio and video tracks!
8. Toggle mute/unmute and camera on/off using the bottom control bar.
9. Click "Leave" to exit the meeting room.
