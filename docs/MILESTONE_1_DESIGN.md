# MeetMind AI — Milestone 1: System Design & Core Prototype

## 1. Project Objectives & Workflows

### 1.1 Objectives
MeetMind AI is an AI-powered video conferencing platform built on the MERN stack, WebRTC, and Socket.io. Milestone 1 establishes the complete foundation:
- Secure JWT-based authentication with role-based access control (Admin, Host, Co-host, Participant).
- Meeting room lifecycle management (Create, Schedule, Join, Leave, End).
- Real-time signaling server with Socket.io.
- Peer-to-peer 1-to-1 WebRTC audio/video call prototype.
- Responsive, dark-themed React dashboard and meeting room UI.

### 1.2 Meeting Lifecycle Workflow
```
[User Authenticated]
       │
       ▼
[Create Meeting] ──► Generates unique roomId (UUID) & MongoDB record
       │
       ▼
[Join Meeting Room]
  ├── Host enters -> room initialized
  ├── Participant enters -> joined via roomId
  ├── Socket.io Handshake with JWT token
  └── Join Event ('join-meeting' / 'join-room')
       │
       ▼
[WebRTC Signaling Phase]
  ├── Peer 1 detects new participant ('user-joined')
  ├── Peer 1 generates SDP Offer / simple-peer signal
  ├── Signal sent through Socket.io ('signal')
  ├── Peer 2 receives signal, creates Peer with stream
  ├── Peer 2 returns SDP Answer signal
  └── ICE candidate trickle & STUN resolution
       │
       ▼
[P2P Media Stream Established]
  ├── Audio/Video tracks rendered in local & remote viewports
  ├── Media controls (Mute / Unmute, Camera On / Off)
  └── Presence and participant count tracking
       │
       ▼
[Leave / End Meeting]
  ├── Participant leaves -> tracks closed, 'user-left' broadcasted
  └── Host leaves -> meeting status updated to 'ended'
```

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────┐
│                   MeetMind AI Client                   │
│                     (React + Vite)                     │
│  ┌──────────────┐ ┌───────────────┐ ┌───────────────┐  │
│  │ Auth Context │ │   Dashboard   │ │ Meeting Room  │  │
│  │(JWT Storage) │ │ (List/Create) │ │  (WebRTC P2P) │  │
│  └──────┬───────┘ └───────┬───────┘ └───────┬───────┘  │
└─────────┼─────────────────┼─────────────────┼──────────┘
          │ HTTP / REST     │ HTTP / REST     │ WebSockets
          ▼                 ▼                 ▼
┌────────────────────────────────────────────────────────┐
│             MeetMind AI Backend (Express.js)           │
│  ┌────────────────────┐     ┌────────────────────────┐ │
│  │    REST Router     │     │   Socket.io Signaling  │ │
│  │  /api/auth/*       │     │   - JWT Auth Handshake │ │
│  │  /api/meetings/*   │     │   - Room Management    │ │
│  │  /api/health       │     │   - SDP/ICE Relaying   │ │
│  └─────────┬──────────┘     └───────────┬────────────┘ │
└────────────┼────────────────────────────┼──────────────┘
             │ Mongoose                   │
             ▼                            ▼
┌─────────────────────────┐   ┌──────────────────────────┐
│     MongoDB Database    │   │ STUN / TURN Infrastructure│
│ - users                 │   │ stun.l.google.com:19302  │
│ - meetings              │   │ (NAT traversal)          │
└─────────────────────────┘   └──────────────────────────┘
```

---

## 3. Database Schema Design (MongoDB / Mongoose)

### 3.1 User Schema (`models/User.js`)
| Field | Type | Attributes | Description |
|---|---|---|---|
| `_id` | ObjectId | Primary Key, Auto | Unique user identifier |
| `name` | String | Required, Trimmed | Full display name |
| `email` | String | Required, Unique, Lowercase | User email address |
| `password` | String | Required, Min: 6 chars, Excluded by default | Bcrypt hashed password (12 rounds) |
| `role` | String | Enum: `admin`, `host`, `participant` (Default: `host`) | User system role |
| `avatar` | String | Optional | URL or avatar identifier |
| `createdAt` | Date | Auto | Account registration timestamp |
| `updatedAt` | Date | Auto | Last update timestamp |

### 3.2 Meeting Schema (`models/Meeting.js`)
| Field | Type | Attributes | Description |
|---|---|---|---|
| `_id` | ObjectId | Primary Key, Auto | Unique meeting document ID |
| `title` | String | Required, Trimmed | Meeting title |
| `description` | String | Optional | Meeting agenda / details |
| `roomId` | String | Unique, Indexed, UUID v4 | Unique alphanumeric room code |
| `hostId` | ObjectId | Ref: `User`, Required | Creator / host of the meeting |
| `status` | String | Enum: `scheduled`, `active`, `ended`, `cancelled` | Meeting lifecycle state |
| `scheduledAt` | Date | Optional | Scheduled time for meeting |
| `maxParticipants`| Number | Min: 2, Max: 100, Default: 50 | Capacity limit |
| `participants` | Array | Subdocuments | Array of `{ userId, role, joinedAt, leftAt }` |
| `createdAt` | Date | Auto | Creation timestamp |

---

## 4. UI Wireframes & Layout Planning

### 4.1 Authentication View (`/login`, `/register`)
- Clean, dark glassmorphism card centered on viewport.
- Gradient background (indigo/purple to deep gray).
- Inputs: Name (register only), Email, Password, Confirm Password.
- Immediate client validation with toast alerts.

### 4.2 Dashboard View (`/dashboard`)
- **Top Bar**: MeetMind AI branding, current user info badge, logout button.
- **Header Action**: "New Meeting" primary CTA button with modal popup.
- **Join by ID**: Fast input box to paste a meeting ID / room code and jump directly in.
- **Meeting Grid**: Cards showing Title, Room ID, host badge, creation time, status badge, "Join Meeting" button, and delete control (for host).

### 4.3 Meeting Room View (`/meeting/:meetingId`)
- **Header**: Room code display, live participant counter, connection status pill.
- **Video Stage**:
  - 1 user: Centered local video stream (mirrored).
  - 2 users: Responsive 2-column grid showing local and remote feeds side-by-side with name labels.
- **Bottom Control Bar**:
  - Microphone Toggle (Mute / Unmute) with visual state (red/indigo).
  - Video Toggle (Camera On / Off) with placeholder avatar when disabled.
  - Leave Meeting button (disconnects WebRTC, leaves socket room, navigates to dashboard).

---

## 5. WebRTC Signaling Protocol Specification

The signaling server coordinates peer-to-peer connection establishment between browsers:

1. **Authentication**: Client connects to Socket.io sending JWT token in handshake auth:
   `io({ auth: { token: "<JWT>" } })`
2. **Room Admission**:
   - Client sends: `join-meeting` / `join-room` with `{ meetingId }`.
   - Server registers socket in room and responds with `room-joined` and updates `room-users`.
   - Other clients receive `user-joined` with peer metadata.
3. **P2P Negotiation**:
   - The joined client triggers simple-peer initiator mode.
   - Signaling payload (SDP offer/answer or ICE candidate) is sent via `signal` event:
     `socket.emit('signal', { meetingId, signal })`
   - Server forwards signal to room peers:
     `socket.to(roomId).emit('signal', { signal, userId, userName, socketId })`
   - Remote peer consumes the signal via `peer.signal(signal)`.
4. **Disconnection**:
   - Peer leaves via `leave-meeting` or browser close (`disconnect`).
   - Server broadcasts `user-left` to remaining peers and closes inactive rooms.
