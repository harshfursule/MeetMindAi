import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SimplePeer from 'simple-peer';
import toast from 'react-hot-toast';
import { Users } from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer.jsx';
import ControlBar from '../components/ControlBar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getSocket, disconnectSocket } from '../services/socket.js';

const MeetingRoom = () => {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [peerConnected, setPeerConnected] = useState(false);
  const [participantCount, setParticipantCount] = useState(1);

  const peerRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.emit('leave-meeting', { meetingId });
      socketRef.current.off('user-joined');
      socketRef.current.off('user-left');
      socketRef.current.off('signal');
      socketRef.current.off('room-users');
    }
    setLocalStream(null);
    setRemoteStream(null);
    setPeerConnected(false);
  }, [meetingId]);

  // Create a peer connection
  const createPeer = useCallback(
    (initiator, stream) => {
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

      peer.on('signal', (signalData) => {
        socketRef.current?.emit('signal', {
          meetingId,
          signal: signalData,
        });
      });

      peer.on('stream', (stream) => {
        setRemoteStream(stream);
        setPeerConnected(true);
      });

      peer.on('error', (err) => {
        console.error('[Peer] Error:', err);
        toast.error('Connection error. Try rejoining.');
      });

      peer.on('close', () => {
        console.log('[Peer] Connection closed');
        setRemoteStream(null);
        setPeerConnected(false);
      });

      return peer;
    },
    [meetingId]
  );

  // Initialize media and socket connection
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Get user media
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

        // Connect socket
        const socket = getSocket();
        socketRef.current = socket;

        // Join the meeting room
        socket.emit('join-meeting', {
          meetingId,
          userId: user?._id || user?.id,
          userName: user?.name,
        });

        // When another user joins — we become the initiator
        socket.on('user-joined', ({ userId, userName }) => {
          console.log(`[Socket] User joined: ${userName || userId}`);
          toast.success(`${userName || 'Someone'} joined the meeting`);

          // Destroy existing peer if any
          if (peerRef.current) {
            peerRef.current.destroy();
          }

          const peer = createPeer(true, localStreamRef.current);
          peerRef.current = peer;
        });

        // Receive signal data from the other peer
        socket.on('signal', ({ signal, userId }) => {
          console.log('[Socket] Received signal from:', userId);

          if (peerRef.current) {
            // If we already have a peer, just signal it
            peerRef.current.signal(signal);
          } else {
            // We are the non-initiator — create a peer and signal it
            const peer = createPeer(false, localStreamRef.current);
            peerRef.current = peer;
            peer.signal(signal);
          }
        });

        // When a user leaves
        socket.on('user-left', ({ userId, userName }) => {
          console.log(`[Socket] User left: ${userName || userId}`);
          toast(`${userName || 'Someone'} left the meeting`, { icon: '👋' });
          if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
          }
          setRemoteStream(null);
          setPeerConnected(false);
        });

        // Room user count updates
        socket.on('room-users', ({ count }) => {
          setParticipantCount(count);
        });
      } catch (err) {
        console.error('[MeetingRoom] Init error:', err);
        if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
          toast.error('Camera/microphone access denied. Please check permissions.');
        } else {
          toast.error('Failed to join meeting');
        }
      }
    };

    init();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [meetingId, user, createPeer, cleanup]);

  // Toggle audio
  const handleToggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
      }
    }
  };

  // Toggle video
  const handleToggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
      }
    }
  };

  // Leave meeting
  const handleLeave = () => {
    cleanup();
    toast.success('You left the meeting');
    navigate('/dashboard');
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-950 via-indigo-950 to-purple-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 glass">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-white truncate">
            Meeting
          </h1>
          <span className="text-xs text-indigo-400/50 font-mono hidden sm:inline">
            {meetingId}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-indigo-300">
          <Users className="w-4 h-4" />
          <span>{participantCount}</span>
          {peerConnected && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs">
              Connected
            </span>
          )}
        </div>
      </div>

      {/* Video grid */}
      <div className="flex-1 p-4 overflow-hidden">
        <div
          className={`h-full grid gap-4 ${
            remoteStream
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 max-w-3xl mx-auto'
          }`}
        >
          {/* Local video */}
          <VideoPlayer
            stream={localStream}
            muted={true}
            label={user?.name || 'You'}
            isLocal={true}
            videoEnabled={videoEnabled}
          />

          {/* Remote video */}
          {remoteStream && (
            <VideoPlayer
              stream={remoteStream}
              muted={false}
              label="Remote User"
              isLocal={false}
              videoEnabled={true}
            />
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="glass">
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
