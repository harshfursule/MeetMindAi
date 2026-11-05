import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SimplePeer from 'simple-peer';
import toast from 'react-hot-toast';
import { Users, Copy, Check, MessageSquare, Shield } from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer.jsx';
import ControlBar from '../components/ControlBar.jsx';
import MeetingSidebar from '../components/MeetingSidebar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getSocket } from '../services/socket.js';
import api from '../services/api.js';

const MeetingRoom = () => {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Media & WebRTC streams
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState([]); // [{ peerId, userName, stream, audioEnabled, videoEnabled, handRaised }]

  // Controls state
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [handRaised, setHandRaised] = useState(false);

  // Room & participants
  const [meetingData, setMeetingData] = useState(null);
  const [participantsList, setParticipantsList] = useState([]); // list of all participants for sidebar
  const [participantCount, setParticipantCount] = useState(1);
  const [copied, setCopied] = useState(false);

  // Chat & Sidebar state
  const [activeSidebar, setActiveSidebar] = useState(null); // 'chat' | 'participants' | null
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Floating reactions: [{ id, emoji, senderName, x }]
  const [floatingReactions, setFloatingReactions] = useState([]);

  // Refs
  const peersRef = useRef({}); // socketId -> { peer, userName }
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);

  // Check if current user is the meeting host
  const isHost =
    meetingData?.hostId?._id === user?._id ||
    meetingData?.hostId?.id === user?._id ||
    meetingData?.hostId === user?._id ||
    user?.role === 'admin';

  // Load meeting data from REST API
  useEffect(() => {
    const fetchMeeting = async () => {
      try {
        const { data } = await api.get(`/meetings/${meetingId}`);
        setMeetingData(data.data?.meeting || data.meeting);
      } catch (err) {
        console.warn('[MeetingRoom] Could not fetch meeting details:', err);
      }
    };
    if (meetingId) {
      fetchMeeting();
    }
  }, [meetingId]);

  // Remove a peer
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
    setParticipantsList((prev) => prev.filter((p) => p.socketId !== socketId));
  }, []);

  // Full cleanup
  const cleanup = useCallback(() => {
    Object.keys(peersRef.current).forEach((socketId) => {
      try {
        peersRef.current[socketId].peer.destroy();
      } catch (err) {
        console.error('[MeetingRoom] Destroy peer err:', err);
      }
    });
    peersRef.current = {};
    setPeers([]);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.emit('leave-meeting', { meetingId });
      socketRef.current.off('room-joined');
      socketRef.current.off('user-joined');
      socketRef.current.off('user-left');
      socketRef.current.off('signal');
      socketRef.current.off('room-users');
      socketRef.current.off('new-message');
      socketRef.current.off('reaction-received');
      socketRef.current.off('user-hand-toggled');
      socketRef.current.off('force-lower-hand');
      socketRef.current.off('user-media-state-changed');
      socketRef.current.off('force-mute');
      socketRef.current.off('kicked-from-meeting');
    }

    setLocalStream(null);
  }, [meetingId]);

  // Create SimplePeer instance
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

      peer.on('signal', (signalData) => {
        socketRef.current?.emit('signal', {
          meetingId,
          targetSocketId,
          signal: signalData,
        });
      });

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
              audioEnabled: true,
              videoEnabled: true,
              handRaised: false,
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

  // Initialize media, socket, chat, and participant controls
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

        // 3. Join meeting room
        socket.emit('join-meeting', {
          meetingId,
          userId: user?._id || user?.id,
          userName: user?.name || 'Guest',
          audioEnabled: true,
          videoEnabled: true,
        });

        // 4. Handle room-joined (existing participants + message history)
        socket.on('room-joined', ({ participants, participantCount: count, messages: history }) => {
          console.log('[Socket] Room joined. Existing participants:', participants);
          if (count) setParticipantCount(count);

          if (history && Array.isArray(history)) {
            setMessages(history);
          }

          // Build participants list (including local user)
          const localParticipant = {
            socketId: socket.id,
            userId: user?._id || user?.id,
            userName: user?.name || 'You',
            userRole: isHost ? 'host' : 'participant',
            audioEnabled: true,
            videoEnabled: true,
            handRaised: false,
            isLocal: true,
            isHost,
          };

          const remoteParticipants = (participants || []).map((p) => ({
            ...p,
            isLocal: false,
            isHost: p.userRole === 'host',
          }));

          setParticipantsList([localParticipant, ...remoteParticipants]);

          // Create peer connections to each existing participant
          participants.forEach((p) => {
            const peer = createPeer(p.socketId, true, stream, p.userName);
            peersRef.current[p.socketId] = {
              peer,
              userName: p.userName || 'Participant',
            };
          });
        });

        // 5. When a new user joins later
        socket.on('user-joined', (participant) => {
          toast.success(`${participant.userName || 'Someone'} joined the meeting`);
          if (participant.participantCount) {
            setParticipantCount(participant.participantCount);
          }

          setParticipantsList((prev) => {
            const exists = prev.some((p) => p.socketId === participant.socketId);
            if (exists) return prev;
            return [
              ...prev,
              {
                ...participant,
                isLocal: false,
                isHost: participant.userRole === 'host',
              },
            ];
          });
        });

        // 6. WebRTC Signal Relay
        socket.on('signal', ({ signal, senderSocketId, userName, socketId }) => {
          const peerId = senderSocketId || socketId;
          if (!peerId) return;

          if (peersRef.current[peerId]) {
            peersRef.current[peerId].peer.signal(signal);
          } else {
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

        // 9. Live in-meeting chat messages
        socket.on('new-message', (msg) => {
          setMessages((prev) => [...prev, msg]);

          // Increment unread badge if chat panel is not open
          setActiveSidebar((currentSidebar) => {
            if (currentSidebar !== 'chat') {
              setUnreadCount((c) => c + 1);
            }
            return currentSidebar;
          });
        });

        // 10. Floating emoji reactions
        socket.on('reaction-received', (reaction) => {
          const randomX = Math.floor(Math.random() * 60) + 20; // 20% to 80% screen width
          const newReaction = { ...reaction, x: randomX };

          setFloatingReactions((prev) => [...prev, newReaction]);

          // Auto-remove reaction after animation completes (3s)
          setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((r) => r.id !== reaction.id));
          }, 3000);
        });

        // 11. Raise / lower hand event
        socket.on('user-hand-toggled', ({ socketId, userName, isRaised }) => {
          // If it's local user
          if (socketId === socket.id) {
            setHandRaised(isRaised);
          }

          // Update in peers list
          setPeers((prev) =>
            prev.map((p) => (p.peerId === socketId ? { ...p, handRaised: isRaised } : p))
          );

          // Update in sidebar participants list
          setParticipantsList((prev) =>
            prev.map((p) => (p.socketId === socketId ? { ...p, handRaised: isRaised } : p))
          );

          if (isRaised) {
            toast(`${userName || 'Someone'} raised their hand ✋`, {
              icon: '✋',
              duration: 3000,
            });
          }
        });

        // 12. Host lowered our hand
        socket.on('force-lower-hand', () => {
          setHandRaised(false);
          toast('Your hand was lowered by the host.', { icon: 'ℹ️' });
        });

        // 13. Participant media state changes (mic/camera toggle)
        socket.on('user-media-state-changed', ({ socketId, audioEnabled: a, videoEnabled: v }) => {
          setPeers((prev) =>
            prev.map((p) => {
              if (p.peerId === socketId) {
                return {
                  ...p,
                  audioEnabled: a !== undefined ? a : p.audioEnabled,
                  videoEnabled: v !== undefined ? v : p.videoEnabled,
                };
              }
              return p;
            })
          );

          setParticipantsList((prev) =>
            prev.map((p) => {
              if (p.socketId === socketId) {
                return {
                  ...p,
                  audioEnabled: a !== undefined ? a : p.audioEnabled,
                  videoEnabled: v !== undefined ? v : p.videoEnabled,
                };
              }
              return p;
            })
          );
        });

        // 14. Host muted us
        socket.on('force-mute', ({ mutedBy }) => {
          if (localStreamRef.current) {
            const track = localStreamRef.current.getAudioTracks()[0];
            if (track) {
              track.enabled = false;
            }
          }
          setAudioEnabled(false);
          socket.emit('media-state-change', {
            meetingId,
            audioEnabled: false,
          });

          toast.error(`You were muted by ${mutedBy || 'the host'}.`);
        });

        // 15. Host kicked us from meeting
        socket.on('kicked-from-meeting', ({ kickedBy, reason }) => {
          toast.error(reason || 'You have been removed from the meeting by the host.');
          cleanup();
          navigate('/dashboard');
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
  }, [meetingId, user, isHost, createPeer, removePeer, cleanup]);

  // Audio mute/unmute
  const handleToggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const newState = audioTrack.enabled;
        setAudioEnabled(newState);

        socketRef.current?.emit('media-state-change', {
          meetingId,
          audioEnabled: newState,
        });

        setParticipantsList((prev) =>
          prev.map((p) => (p.isLocal ? { ...p, audioEnabled: newState } : p))
        );
      }
    }
  };

  // Video on/off
  const handleToggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const newState = videoTrack.enabled;
        setVideoEnabled(newState);

        socketRef.current?.emit('media-state-change', {
          meetingId,
          videoEnabled: newState,
        });

        setParticipantsList((prev) =>
          prev.map((p) => (p.isLocal ? { ...p, videoEnabled: newState } : p))
        );
      }
    }
  };

  // Raise / Lower Hand toggle
  const handleToggleHand = () => {
    const nextState = !handRaised;
    setHandRaised(nextState);

    socketRef.current?.emit('toggle-raise-hand', {
      meetingId,
      isRaised: nextState,
    });

    setParticipantsList((prev) =>
      prev.map((p) => (p.isLocal ? { ...p, handRaised: nextState } : p))
    );

    if (nextState) {
      toast.success('You raised your hand');
    }
  };

  // Send emoji reaction
  const handleSendReaction = (emoji) => {
    socketRef.current?.emit('send-reaction', {
      meetingId,
      emoji,
    });
  };

  // Send chat message
  const handleSendMessage = (messageData) => {
    socketRef.current?.emit('send-message', {
      meetingId,
      ...messageData,
    });
  };

  // Host: Mute single participant
  const handleMuteParticipant = (targetSocketId) => {
    socketRef.current?.emit('mute-participant', {
      targetSocketId,
    });
    toast.success('Mute command sent');
  };

  // Host: Mute all participants
  const handleMuteAll = () => {
    socketRef.current?.emit('mute-all', {
      meetingId,
    });
    toast.success('Muted all participants');
  };

  // Host: Kick participant
  const handleKickParticipant = (targetSocketId) => {
    socketRef.current?.emit('kick-participant', {
      meetingId,
      targetSocketId,
    });
    toast.success('Participant removed');
  };

  // Host: Lower participant hand
  const handleLowerHand = (targetSocketId) => {
    socketRef.current?.emit('lower-hand', {
      meetingId,
      targetSocketId,
    });
  };

  // Toggle sidebar panel
  const handleToggleSidebar = (tab) => {
    if (activeSidebar === tab) {
      setActiveSidebar(null);
    } else {
      setActiveSidebar(tab);
      if (tab === 'chat') {
        setUnreadCount(0); // clear unread count on opening chat
      }
    }
  };

  // Copy Meeting ID
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

  // Dynamic grid class based on total videos
  const totalStreams = peers.length + 1;
  const getGridClass = () => {
    if (totalStreams === 1) return 'grid-cols-1 max-w-4xl mx-auto';
    if (totalStreams === 2) return 'grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto';
    if (totalStreams <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl mx-auto';
    if (totalStreams <= 6) return 'grid-cols-2 md:grid-cols-3 max-w-7xl mx-auto';
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-w-7xl mx-auto';
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-gray-950 via-indigo-950 to-purple-950 overflow-hidden relative">
      {/* Floating Animated Emoji Reactions */}
      <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
        {floatingReactions.map((r) => (
          <div
            key={r.id}
            style={{ left: `${r.x}%` }}
            className="absolute bottom-20 flex flex-col items-center animate-reaction"
          >
            <span className="text-4xl drop-shadow-lg filter">{r.emoji}</span>
            <span className="text-[10px] text-white/80 bg-black/50 px-2 py-0.5 rounded-full mt-1 backdrop-blur-sm">
              {r.senderName}
            </span>
          </div>
        ))}
      </div>

      {/* Top Bar */}
      <header className="flex items-center justify-between px-6 py-3 glass z-10 border-b border-indigo-500/10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-white tracking-wide">
              {meetingData?.title || 'MeetMind AI'}
            </h1>
            {isHost && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 text-xs font-semibold">
                <Shield className="w-3 h-3 text-purple-400" />
                Host
              </span>
            )}
          </div>

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
          <button
            onClick={() => handleToggleSidebar('participants')}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-500/20 transition-all cursor-pointer"
          >
            <Users className="w-4 h-4 text-indigo-400" />
            <span className="font-medium text-white">{participantCount}</span>
            <span className="text-xs text-indigo-400 hidden sm:inline">
              {participantCount === 1 ? 'participant' : 'participants'}
            </span>
          </button>

          {peers.length > 0 && (
            <span className="hidden md:inline-flex px-2.5 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium border border-green-500/30">
              Live Mesh Connected
            </span>
          )}
        </div>
      </header>

      {/* Main Stage (Video Grid + Collapsible Sidebar) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video Grid */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto flex items-center justify-center">
          <div className={`w-full grid gap-4 ${getGridClass()}`}>
            {/* Local Video Card */}
            <div className="w-full">
              <VideoPlayer
                stream={localStream}
                muted={true}
                label={user?.name || 'You'}
                isLocal={true}
                videoEnabled={videoEnabled}
                audioEnabled={audioEnabled}
                handRaised={handRaised}
                isHost={isHost}
              />
            </div>

            {/* Remote Peer Video Cards */}
            {peers.map((peer) => (
              <div key={peer.peerId} className="w-full">
                <VideoPlayer
                  stream={peer.stream}
                  muted={false}
                  label={peer.userName}
                  isLocal={false}
                  videoEnabled={peer.videoEnabled !== false}
                  audioEnabled={peer.audioEnabled !== false}
                  handRaised={peer.handRaised}
                  isHost={false}
                />
              </div>
            ))}
          </div>
        </main>

        {/* Slide-over Sidebar: Chat & Participants */}
        {activeSidebar && (
          <MeetingSidebar
            activeTab={activeSidebar}
            onClose={() => setActiveSidebar(null)}
            currentUser={{ ...user, socketId: socketRef.current?.id }}
            isHost={isHost}
            participants={participantsList}
            messages={messages}
            onSendMessage={handleSendMessage}
            onMuteParticipant={handleMuteParticipant}
            onMuteAll={handleMuteAll}
            onKickParticipant={handleKickParticipant}
            onLowerHand={handleLowerHand}
          />
        )}
      </div>

      {/* Floating Control Bar */}
      <footer className="glass border-t border-indigo-500/10 z-10">
        <ControlBar
          audioEnabled={audioEnabled}
          videoEnabled={videoEnabled}
          handRaised={handRaised}
          unreadCount={unreadCount}
          participantCount={participantCount}
          activeSidebar={activeSidebar}
          onToggleAudio={handleToggleAudio}
          onToggleVideo={handleToggleVideo}
          onToggleHand={handleToggleHand}
          onSendReaction={handleSendReaction}
          onToggleSidebar={handleToggleSidebar}
          onLeave={handleLeave}
        />
      </footer>
    </div>
  );
};

export default MeetingRoom;
