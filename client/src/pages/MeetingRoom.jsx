import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SimplePeer from 'simple-peer';
import toast from 'react-hot-toast';
import { Users, Copy, Check } from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer.jsx';
import ControlBar from '../components/ControlBar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getSocket } from '../services/socket.js';

const MeetingRoom = () => {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState([]); // [{ peerId, userName, stream }]
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [participantCount, setParticipantCount] = useState(1);
  const [copied, setCopied] = useState(false);

  // Map of socketId -> { peer: SimplePeer, userName: string }
  const peersRef = useRef({});
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);

  // Helper to remove a peer
  const removePeer = useCallback((socketId) => {
    if (peersRef.current[socketId]) {
      try {
        peersRef.current[socketId].peer.destroy();
      } catch (err) {
        console.error('[MeetingRoom] Peer destruction error:', err);
      }
      delete peersRef.current[socketId];
    }
    setPeers((prev) => prev.filter((p) => p.peerId !== socketId));
  }, []);

  // Cleanup all connections on leaving or unmounting
  const cleanup = useCallback(() => {
    // Destroy all peer connections
    Object.keys(peersRef.current).forEach((socketId) => {
      try {
        peersRef.current[socketId].peer.destroy();
      } catch (err) {
        console.error('[MeetingRoom] Destroy peer err:', err);
      }
    });
    peersRef.current = {};
    setPeers([]);

    // Stop local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Leave socket room and unbind listeners
    if (socketRef.current) {
      socketRef.current.emit('leave-meeting', { meetingId });
      socketRef.current.off('room-joined');
      socketRef.current.off('user-joined');
      socketRef.current.off('user-left');
      socketRef.current.off('signal');
      socketRef.current.off('room-users');
    }

    setLocalStream(null);
  }, [meetingId]);

  // Factory to create a SimplePeer instance
  const createPeer = useCallback(
    (targetSocketId, initiator, stream, targetUserName) => {
      const peer = new SimplePeer({
        initiator,
        trickle: false,
        stream,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        },
      });

      // Relay signal to the specific target socket
      peer.on('signal', (signalData) => {
        socketRef.current?.emit('signal', {
          meetingId,
          targetSocketId,
          signal: signalData,
        });
      });

      // Handle receiving the remote stream
      peer.on('stream', (remoteStream) => {
        setPeers((prev) => {
          const exists = prev.some((p) => p.peerId === targetSocketId);
          if (exists) {
            return prev.map((p) =>
              p.peerId === targetSocketId ? { ...p, stream: remoteStream } : p
            );
          }
          return [
            ...prev,
            {
              peerId: targetSocketId,
              userName: targetUserName || 'Participant',
              stream: remoteStream,
            },
          ];
        });
      });

      peer.on('error', (err) => {
        console.error(`[Peer ${targetSocketId}] Error:`, err);
      });

      peer.on('close', () => {
        console.log(`[Peer ${targetSocketId}] Closed`);
        removePeer(targetSocketId);
      });

      return peer;
    },
    [meetingId, removePeer]
  );

  // Initialize camera/mic and setup Socket.io mesh signaling
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // 1. Get user media
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);

        // 2. Connect socket
        const socket = getSocket();
        socketRef.current = socket;

        // 3. Join the meeting room
        socket.emit('join-meeting', {
          meetingId,
          userId: user?._id || user?.id,
          userName: user?.name || 'Guest',
        });

        // 4. Existing participants in the room when we join -> We initiate calls to each
        socket.on('room-joined', ({ participants, participantCount: count }) => {
          console.log('[Socket] Joined room. Existing participants:', participants);
          if (count) setParticipantCount(count);

          participants.forEach((p) => {
            const peer = createPeer(p.socketId, true, stream, p.userName);
            peersRef.current[p.socketId] = {
              peer,
              userName: p.userName || 'Participant',
            };
          });
        });

        // 5. When a new user joins later
        socket.on('user-joined', ({ userName, participantCount: count }) => {
          toast.success(`${userName || 'Someone'} joined the meeting`);
          if (count) setParticipantCount(count);
        });

        // 6. Handle incoming signal (offer or answer)
        socket.on('signal', ({ signal, senderSocketId, userName, socketId }) => {
          const peerId = senderSocketId || socketId;
          if (!peerId) return;

          console.log(`[Socket] Received signal from peer ${peerId}`);

          if (peersRef.current[peerId]) {
            // Existing peer receiving an answer or renegotiation
            peersRef.current[peerId].peer.signal(signal);
          } else {
            // New incoming call from a newly joined peer -> We answer (initiator: false)
            const peer = createPeer(peerId, false, stream, userName);
            peersRef.current[peerId] = {
              peer,
              userName: userName || 'Participant',
            };
            peer.signal(signal);
          }
        });

        // 7. When a participant leaves
        socket.on('user-left', ({ socketId, userName, participantCount: count }) => {
          toast(`${userName || 'Someone'} left the meeting`, { icon: '👋' });
          removePeer(socketId);
          if (count) setParticipantCount(count);
        });

        // 8. Room count updates
        socket.on('room-users', ({ count }) => {
          setParticipantCount(count);
        });
      } catch (err) {
        console.error('[MeetingRoom] Init error:', err);
        if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
          toast.error('Camera/microphone access denied. Please check device permissions.');
        } else {
          toast.error('Failed to connect to the meeting room.');
        }
      }
    };

    init();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [meetingId, user, createPeer, removePeer, cleanup]);

  // Toggle audio track
  const handleToggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
      }
    }
  };

  // Toggle video track
  const handleToggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
      }
    }
  };

  // Copy Meeting ID or link
  const handleCopyMeetingId = () => {
    navigator.clipboard.writeText(meetingId);
    setCopied(true);
    toast.success('Meeting ID copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Leave meeting
  const handleLeave = () => {
    cleanup();
    toast.success('You left the meeting');
    navigate('/dashboard');
  };

  // Determine grid columns dynamically based on participant count
  const totalStreams = peers.length + 1;
  const getGridClass = () => {
    if (totalStreams === 1) return 'grid-cols-1 max-w-4xl mx-auto';
    if (totalStreams === 2) return 'grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto';
    if (totalStreams <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl mx-auto';
    if (totalStreams <= 6) return 'grid-cols-2 md:grid-cols-3 max-w-7xl mx-auto';
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-w-7xl mx-auto';
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-950 via-indigo-950 to-purple-950">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-3 glass z-10 border-b border-indigo-500/10">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-white tracking-wide">
            MeetMind AI
          </h1>
          <button
            onClick={handleCopyMeetingId}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-900/40 hover:bg-indigo-800/50 border border-indigo-500/20 text-xs font-mono text-indigo-300 transition-all cursor-pointer"
            title="Click to copy Room ID"
          >
            <span>{meetingId}</span>
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-indigo-400" />}
          </button>
        </div>

        <div className="flex items-center gap-3 text-sm text-indigo-300">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-900/30 border border-indigo-500/20">
            <Users className="w-4 h-4 text-indigo-400" />
            <span className="font-medium text-white">{participantCount}</span>
            <span className="text-xs text-indigo-400 hidden sm:inline">
              {participantCount === 1 ? 'participant' : 'participants'}
            </span>
          </div>
          {peers.length > 0 && (
            <span className="hidden md:inline-flex px-2.5 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium border border-green-500/30 animate-pulse">
              Live Mesh Connected ({peers.length} remote)
            </span>
          )}
        </div>
      </div>

      {/* Responsive Multi-Participant Video Grid */}
      <div className="flex-1 p-4 md:p-6 overflow-y-auto flex items-center justify-center">
        <div className={`w-full grid gap-4 ${getGridClass()}`}>
          {/* Local participant video */}
          <div className="w-full">
            <VideoPlayer
              stream={localStream}
              muted={true}
              label={user?.name || 'You'}
              isLocal={true}
              videoEnabled={videoEnabled}
            />
          </div>

          {/* Remote participants video feeds */}
          {peers.map((peer) => (
            <div key={peer.peerId} className="w-full">
              <VideoPlayer
                stream={peer.stream}
                muted={false}
                label={peer.userName}
                isLocal={false}
                videoEnabled={true}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Floating Control Bar */}
      <div className="glass border-t border-indigo-500/10">
        <ControlBar
          audioEnabled={audioEnabled}
          videoEnabled={videoEnabled}
          onToggleAudio={handleToggleAudio}
          onToggleVideo={handleToggleVideo}
          onLeave={handleLeave}
        />
      </div>
    </div>
  );
};

export default MeetingRoom;
