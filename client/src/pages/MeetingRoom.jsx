import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SimplePeer from 'simple-peer';
import toast from 'react-hot-toast';
import {
  Users,
  Copy,
  Check,
  Shield,
  ShieldCheck,
  ScreenShare,
  ScreenShareOff,
  WifiOff,
  RotateCcw,
  Sparkles,
  FileText,
} from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer.jsx';
import ControlBar from '../components/ControlBar.jsx';
import MeetingSidebar from '../components/MeetingSidebar.jsx';
import DeviceSettingsModal from '../components/DeviceSettingsModal.jsx';
import LiveCaptionsOverlay from '../components/LiveCaptionsOverlay.jsx';
import SpeechToTextService from '../services/speechRecognition.js';
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
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [currentCaption, setCurrentCaption] = useState(null);

  // Device Selection
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentAudioDeviceId, setCurrentAudioDeviceId] = useState('');
  const [currentVideoDeviceId, setCurrentVideoDeviceId] = useState('');
  const [currentAudioOutputId, setCurrentAudioOutputId] = useState('');

  // Connection & Reconnection state
  const [connectionStatus, setConnectionStatus] = useState('connected'); // 'connected' | 'reconnecting' | 'disconnected'
  const [reconnectCount, setReconnectCount] = useState(0);

  // Screen sharing & Presenter state
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activePresenter, setActivePresenter] = useState(null); // { presenterSocketId, presenterName, presenterUserId } | null
  const [localScreenStream, setLocalScreenStream] = useState(null);

  // Room & participants
  const [meetingData, setMeetingData] = useState(null);
  const [participantsList, setParticipantsList] = useState([]);
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
  const screenStreamRef = useRef(null);
  const speechServiceRef = useRef(null);
  const iceServersRef = useRef([
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ]);

  // Check if current user is the meeting host
  const isHost =
    meetingData?.hostId?._id === user?._id ||
    meetingData?.hostId?.id === user?._id ||
    meetingData?.hostId === user?._id ||
    user?.role === 'admin';

  // Load dynamic STUN/TURN ICE server configuration
  useEffect(() => {
    const fetchIceServers = async () => {
      try {
        const { data } = await api.get('/webrtc/ice-servers');
        if (data.data?.iceServers && Array.isArray(data.data.iceServers)) {
          iceServersRef.current = data.data.iceServers;
          console.log('[WebRTC] STUN & TURN servers loaded for restrictive networks:', data.data.iceServers);
        }
      } catch (err) {
        console.warn('[WebRTC] Using fallback STUN/TURN servers:', err.message);
      }
    };
    fetchIceServers();
  }, []);

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
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

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
      socketRef.current.off('connect');
      socketRef.current.off('disconnect');
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
      socketRef.current.off('presenter-changed');
      socketRef.current.off('presenter-stopped');
      socketRef.current.off('caption-received');
    }

    if (speechServiceRef.current) {
      speechServiceRef.current.destroy();
      speechServiceRef.current = null;
    }

    setLocalStream(null);
    setLocalScreenStream(null);
    setIsScreenSharing(false);
    setActivePresenter(null);
  }, [meetingId]);

  // Stop Screen Share helper
  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

    const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
    if (cameraTrack) {
      Object.values(peersRef.current).forEach(({ peer }) => {
        try {
          const currentTrack = peer.streams?.[0]?.getVideoTracks()?.[0];
          if (currentTrack) {
            peer.replaceTrack(currentTrack, cameraTrack, localStreamRef.current);
          }
        } catch (err) {
          console.error('[ScreenShare] Revert track error:', err);
        }
      });
    }

    setLocalScreenStream(null);
    setIsScreenSharing(false);
    socketRef.current?.emit('stop-screen-share', { meetingId });
    toast.success('Screen sharing stopped');
  }, [meetingId]);

  // Start Screen Share helper
  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: true,
      });

      const screenVideoTrack = screenStream.getVideoTracks()[0];
      const cameraVideoTrack = localStreamRef.current?.getVideoTracks()[0];

      screenVideoTrack.onended = () => {
        stopScreenShare();
      };

      if (cameraVideoTrack) {
        Object.values(peersRef.current).forEach(({ peer }) => {
          try {
            peer.replaceTrack(cameraVideoTrack, screenVideoTrack, localStreamRef.current);
          } catch (err) {
            console.error('[ScreenShare] replaceTrack error:', err);
          }
        });
      }

      screenStreamRef.current = screenStream;
      setLocalScreenStream(screenStream);
      setIsScreenSharing(true);

      socketRef.current?.emit('start-screen-share', { meetingId });
      toast.success('You are now sharing your screen');
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('[ScreenShare] Error starting screen share:', err);
        toast.error('Could not share screen');
      }
    }
  }, [meetingId, stopScreenShare]);

  // Toggle Screen Share
  const handleToggleScreenShare = () => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      startScreenShare();
    }
  };

  // Device Switching: Camera, Microphone, and Audio Output
  const handleDeviceChange = async ({ audioDeviceId, videoDeviceId, audioOutputId }) => {
    try {
      // 1. Switch Video Camera Track if changed
      if (videoDeviceId && videoDeviceId !== currentVideoDeviceId) {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: videoDeviceId } },
        });
        const newVideoTrack = newStream.getVideoTracks()[0];
        const oldVideoTrack = localStreamRef.current?.getVideoTracks()[0];

        newVideoTrack.enabled = videoEnabled; // preserve camera on/off state

        // Replace track across all mesh peers
        if (oldVideoTrack) {
          Object.values(peersRef.current).forEach(({ peer }) => {
            try {
              peer.replaceTrack(oldVideoTrack, newVideoTrack, localStreamRef.current);
            } catch (err) {
              console.error('[DeviceSwitch] replaceTrack video error:', err);
            }
          });
          oldVideoTrack.stop();
          localStreamRef.current.removeTrack(oldVideoTrack);
        }

        localStreamRef.current.addTrack(newVideoTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        setCurrentVideoDeviceId(videoDeviceId);
        toast.success('Camera updated');
      }

      // 2. Switch Microphone Track if changed
      if (audioDeviceId && audioDeviceId !== currentAudioDeviceId) {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: audioDeviceId } },
        });
        const newAudioTrack = newStream.getAudioTracks()[0];
        const oldAudioTrack = localStreamRef.current?.getAudioTracks()[0];

        newAudioTrack.enabled = audioEnabled; // preserve mute state

        // Replace track across all mesh peers
        if (oldAudioTrack) {
          Object.values(peersRef.current).forEach(({ peer }) => {
            try {
              peer.replaceTrack(oldAudioTrack, newAudioTrack, localStreamRef.current);
            } catch (err) {
              console.error('[DeviceSwitch] replaceTrack audio error:', err);
            }
          });
          oldAudioTrack.stop();
          localStreamRef.current.removeTrack(oldAudioTrack);
        }

        localStreamRef.current.addTrack(newAudioTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        setCurrentAudioDeviceId(audioDeviceId);
        toast.success('Microphone updated');
      }

      // 3. Switch Speaker / Output Sink
      if (audioOutputId && audioOutputId !== currentAudioOutputId) {
        const videoElements = document.querySelectorAll('video');
        videoElements.forEach((video) => {
          if (typeof video.setSinkId === 'function') {
            video.setSinkId(audioOutputId).catch(console.warn);
          }
        });
        setCurrentAudioOutputId(audioOutputId);
        toast.success('Audio output device updated');
      }
    } catch (err) {
      console.error('[DeviceSwitch] Error switching devices:', err);
      toast.error('Could not switch to selected device');
    }
  };

  // Create SimplePeer instance
  const createPeer = useCallback(
    (targetSocketId, initiator, stream, targetUserName) => {
      const peer = new SimplePeer({
        initiator,
        trickle: false,
        stream,
        config: {
          iceServers: iceServersRef.current,
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
        console.warn(`[Peer ${targetSocketId}] Error:`, err);
      });

      peer.on('close', () => {
        removePeer(targetSocketId);
      });

      return peer;
    },
    [meetingId, removePeer]
  );

  // Manual Reconnect Action
  const handleManualReconnect = useCallback(() => {
    setConnectionStatus('reconnecting');
    toast.loading('Reconnecting to meeting...', { id: 'reconnect-toast' });

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current.connect();
    }

    setTimeout(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit('join-meeting', {
          meetingId,
          userId: user?._id || user?.id,
          userName: user?.name || 'Guest',
          audioEnabled,
          videoEnabled,
        });
        setConnectionStatus('connected');
        toast.success('Reconnected successfully!', { id: 'reconnect-toast' });
      } else {
        toast.error('Reconnection failed. Please check network.', { id: 'reconnect-toast' });
      }
    }, 1500);
  }, [meetingId, user, audioEnabled, videoEnabled]);

  // Real-Time Speech Recognition & Live Caption Broadcasting
  useEffect(() => {
    if (!speechServiceRef.current) {
      const stt = new SpeechToTextService();
      stt.onCaption((captionData) => {
        // Send caption chunk to everyone in the room over Socket
        socketRef.current?.emit('send-caption', {
          roomId: meetingId,
          text: captionData.text,
          isFinal: captionData.isFinal,
          confidence: captionData.confidence,
          timestamp: captionData.timestamp,
        });

        // Display locally immediately (< 100ms)
        setCurrentCaption({
          speakerName: user?.name || 'You',
          ...captionData,
        });
      });

      speechServiceRef.current = stt;
    }

    if (captionsEnabled && audioEnabled) {
      speechServiceRef.current.start();
    } else {
      speechServiceRef.current.stop();
    }
  }, [captionsEnabled, audioEnabled, meetingId, user]);

  // Main lifecycle: media, socket, chat, participant controls, reconnection
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // 1. Get initial media devices
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

        // Store active device IDs
        const vTrack = stream.getVideoTracks()[0];
        const aTrack = stream.getAudioTracks()[0];
        if (vTrack?.getSettings()?.deviceId) {
          setCurrentVideoDeviceId(vTrack.getSettings().deviceId);
        }
        if (aTrack?.getSettings()?.deviceId) {
          setCurrentAudioDeviceId(aTrack.getSettings().deviceId);
        }

        // 2. Connect socket
        const socket = getSocket();
        socketRef.current = socket;

        // Connection & Reconnection listeners
        socket.on('connect', () => {
          setConnectionStatus('connected');
          setReconnectCount(0);
        });

        socket.on('disconnect', (reason) => {
          console.warn('[Socket] Disconnected:', reason);
          setConnectionStatus('reconnecting');
          setReconnectCount((c) => c + 1);
        });

        // 3. Join meeting room
        socket.emit('join-meeting', {
          meetingId,
          userId: user?._id || user?.id,
          userName: user?.name || 'Guest',
          audioEnabled: true,
          videoEnabled: true,
        });

        // 4. Handle room-joined
        socket.on(
          'room-joined',
          ({
            participants,
            participantCount: count,
            messages: history,
            currentPresenter,
            iceServers: dynamicIceServers,
          }) => {
            if (count) setParticipantCount(count);
            if (history && Array.isArray(history)) setMessages(history);
            if (currentPresenter) setActivePresenter(currentPresenter);
            if (dynamicIceServers && Array.isArray(dynamicIceServers) && dynamicIceServers.length > 0) {
              iceServersRef.current = dynamicIceServers;
              console.log('[WebRTC] Updated ICE configuration from room signaling:', dynamicIceServers);
            }

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

            participants.forEach((p) => {
              const peer = createPeer(p.socketId, true, stream, p.userName);
              peersRef.current[p.socketId] = {
                peer,
                userName: p.userName || 'Participant',
              };
            });
          }
        );

        // 5. New user joined
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

        // 6. Signal Relay
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

        // 7. User left
        socket.on('user-left', ({ socketId, userName, participantCount: count }) => {
          toast(`${userName || 'Someone'} left the meeting`, { icon: '👋' });
          removePeer(socketId);
          if (count) setParticipantCount(count);
        });

        // 8. Room count updates
        socket.on('room-users', ({ count }) => {
          setParticipantCount(count);
        });

        // 9. Live chat messages
        socket.on('new-message', (msg) => {
          setMessages((prev) => [...prev, msg]);
          setActiveSidebar((currentSidebar) => {
            if (currentSidebar !== 'chat') {
              setUnreadCount((c) => c + 1);
            }
            return currentSidebar;
          });
        });

        // 10. Floating reactions
        socket.on('reaction-received', (reaction) => {
          const randomX = Math.floor(Math.random() * 60) + 20;
          const newReaction = { ...reaction, x: randomX };
          setFloatingReactions((prev) => [...prev, newReaction]);

          setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((r) => r.id !== reaction.id));
          }, 3000);
        });

        // 11. Raise hand
        socket.on('user-hand-toggled', ({ socketId, userName, isRaised }) => {
          if (socketId === socket.id) setHandRaised(isRaised);

          setPeers((prev) =>
            prev.map((p) => (p.peerId === socketId ? { ...p, handRaised: isRaised } : p))
          );

          setParticipantsList((prev) =>
            prev.map((p) => (p.socketId === socketId ? { ...p, handRaised: isRaised } : p))
          );

          if (isRaised) {
            toast(`${userName || 'Someone'} raised their hand ✋`, { icon: '✋' });
          }
        });

        // 12. Force lower hand
        socket.on('force-lower-hand', () => {
          setHandRaised(false);
          toast('Your hand was lowered by the host.', { icon: 'ℹ️' });
        });

        // 13. Media state changed
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

        // 14. Force mute
        socket.on('force-mute', ({ mutedBy }) => {
          if (localStreamRef.current) {
            const track = localStreamRef.current.getAudioTracks()[0];
            if (track) track.enabled = false;
          }
          setAudioEnabled(false);
          socket.emit('media-state-change', {
            meetingId,
            audioEnabled: false,
          });
          toast.error(`You were muted by ${mutedBy || 'the host'}.`);
        });

        // 15. Kicked
        socket.on('kicked-from-meeting', ({ reason }) => {
          toast.error(reason || 'You have been removed from the meeting by the host.');
          cleanup();
          navigate('/dashboard');
        });

        // 16. Presenter changed
        socket.on('presenter-changed', (presenterInfo) => {
          setActivePresenter(presenterInfo);

          if (
            screenStreamRef.current &&
            presenterInfo.presenterSocketId !== socket.id
          ) {
            screenStreamRef.current.getTracks().forEach((track) => track.stop());
            screenStreamRef.current = null;
            setLocalScreenStream(null);
            setIsScreenSharing(false);

            const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
            if (cameraTrack) {
              Object.values(peersRef.current).forEach(({ peer }) => {
                try {
                  const currentTrack = peer.streams?.[0]?.getVideoTracks()?.[0];
                  if (currentTrack) {
                    peer.replaceTrack(currentTrack, cameraTrack, localStreamRef.current);
                  }
                } catch (e) {
                  console.error(e);
                }
              });
            }

            toast(`${presenterInfo.presenterName} took over screen sharing`, { icon: '🖥️' });
          } else if (presenterInfo.presenterSocketId !== socket.id) {
            toast(`${presenterInfo.presenterName} is sharing their screen`, { icon: '🖥️' });
          }
        });

        // 17. Presenter stopped
        socket.on('presenter-stopped', () => {
          setActivePresenter(null);
        });

        // 18. Live Speech-to-Text Caption Received
        socket.on('caption-received', (captionData) => {
          setCurrentCaption(captionData);
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

        toast(newState ? 'Microphone unmuted' : 'Microphone muted', {
          icon: newState ? '🎙️' : '🔇',
        });
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

        toast(newState ? 'Camera turned on' : 'Camera turned off', {
          icon: newState ? '📹' : '🚫',
        });
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

  // Toggle sidebar panel
  const handleToggleSidebar = (tab) => {
    if (activeSidebar === tab) {
      setActiveSidebar(null);
    } else {
      setActiveSidebar(tab);
      if (tab === 'chat') {
        setUnreadCount(0);
      }
    }
  };

  // Keyboard Shortcuts: M (Mute), V (Video), H (Hand), C (Chat), P (Participants)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        return;
      }

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleToggleAudio();
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        handleToggleVideo();
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        handleToggleHand();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleToggleSidebar('chat');
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleToggleSidebar('participants');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [audioEnabled, videoEnabled, handRaised, activeSidebar]);

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
    socketRef.current?.emit('mute-participant', { targetSocketId });
    toast.success('Mute command sent');
  };

  // Host: Mute all
  const handleMuteAll = () => {
    socketRef.current?.emit('mute-all', { meetingId });
    toast.success('Muted all participants');
  };

  // Host: Kick participant
  const handleKickParticipant = (targetSocketId) => {
    socketRef.current?.emit('kick-participant', { meetingId, targetSocketId });
    toast.success('Participant removed');
  };

  // Host: Lower participant hand
  const handleLowerHand = (targetSocketId) => {
    socketRef.current?.emit('lower-hand', { meetingId, targetSocketId });
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
    toast.success('Meeting ended. Viewing summary & notes.');
    navigate(`/meeting/${meetingId}/details`);
  };

  // Presenter stream lookup
  const isLocalPresenter =
    isScreenSharing ||
    (activePresenter && activePresenter.presenterSocketId === socketRef.current?.id);

  const presenterPeer = activePresenter
    ? peers.find((p) => p.peerId === activePresenter.presenterSocketId)
    : null;

  const presenterStream = isLocalPresenter
    ? localScreenStream || localStream
    : presenterPeer?.stream;

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

      {/* Top Network Reconnection Banner (if connection issue) */}
      {connectionStatus !== 'connected' && (
        <div className="bg-yellow-600/90 text-white px-4 py-2 flex items-center justify-between text-xs font-medium z-30 shadow-md">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 animate-bounce" />
            <span>
              Connection lost. Attempting to reconnect (Attempt {reconnectCount})...
            </span>
          </div>
          <button
            onClick={handleManualReconnect}
            className="flex items-center gap-1 px-3 py-1 bg-black/40 hover:bg-black/60 rounded-lg text-white font-semibold transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reconnect Now</span>
          </button>
        </div>
      )}

      {/* Top Navigation Bar */}
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
          <span
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium cursor-help"
            title="STUN and TURN Relay servers active. Encrypted UDP/TCP & TLS 443 fallback enabled for restrictive networks and firewalls."
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>TURN Relay Ready</span>
          </span>

          {activePresenter && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold animate-pulse">
              <ScreenShare className="w-3.5 h-3.5" />
              <span>
                {isLocalPresenter
                  ? 'You are presenting'
                  : `${activePresenter.presenterName} is presenting`}
              </span>
            </div>
          )}

          <button
            onClick={() => window.open(`/meeting/${meetingId}/details`, '_blank')}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-indigo-600/30 to-purple-600/30 hover:from-indigo-600/50 hover:to-purple-600/50 border border-indigo-400/30 text-xs font-semibold text-indigo-200 transition-all cursor-pointer shadow-sm"
            title="Open Live Transcript & AI Summary in new tab"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>AI Notes</span>
          </button>

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
        </div>
      </header>

      {/* Main Stage (Screen Share Hero Spotlight View OR Responsive Grid) */}
      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 p-3 md:p-5 overflow-y-auto flex flex-col justify-center">
          {activePresenter && presenterStream ? (
            /* Screen Sharing Hero View with Filmstrip */
            <div className="h-full flex flex-col gap-3">
              <div className="flex-1 relative rounded-2xl overflow-hidden bg-black/90 border border-blue-500/30 shadow-2xl flex items-center justify-center group min-h-[350px]">
                <video
                  autoPlay
                  playsInline
                  muted={isLocalPresenter}
                  ref={(videoEl) => {
                    if (videoEl && presenterStream) {
                      videoEl.srcObject = presenterStream;
                    }
                  }}
                  className="w-full h-full object-contain"
                />

                <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-950/80 backdrop-blur-md border border-white/10 text-xs font-medium text-white shadow-lg">
                  <ScreenShare className="w-4 h-4 text-blue-400" />
                  <span>
                    {isLocalPresenter ? 'Your Screen' : `${activePresenter.presenterName}'s Screen`}
                  </span>
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse ml-1" />
                </div>

                {isLocalPresenter && (
                  <button
                    onClick={stopScreenShare}
                    className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600/90 hover:bg-red-600 text-white text-xs font-semibold backdrop-blur-md shadow-lg transition-all cursor-pointer"
                  >
                    <ScreenShareOff className="w-4 h-4" />
                    <span>Stop Sharing</span>
                  </button>
                )}
              </div>

              {/* Attendee Filmstrip */}
              <div className="h-32 flex items-center gap-3 overflow-x-auto pb-1 shrink-0">
                <div className="w-48 h-full shrink-0">
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

                {peers.map((peer) => (
                  <div key={peer.peerId} className="w-48 h-full shrink-0">
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
            </div>
          ) : (
            /* Standard Responsive Grid View */
            <div className={`w-full grid gap-4 ${getGridClass()}`}>
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
          )}
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

      {/* Live Speech-to-Text Captions Overlay */}
      <LiveCaptionsOverlay
        caption={currentCaption}
        isEnabled={captionsEnabled}
        onClose={() => setCaptionsEnabled(false)}
      />

      {/* Floating Bottom Control Bar */}
      <footer className="glass border-t border-indigo-500/10 z-10">
        <ControlBar
          audioEnabled={audioEnabled}
          videoEnabled={videoEnabled}
          handRaised={handRaised}
          captionsEnabled={captionsEnabled}
          isScreenSharing={isScreenSharing}
          activePresenter={activePresenter}
          unreadCount={unreadCount}
          participantCount={participantCount}
          activeSidebar={activeSidebar}
          onToggleAudio={handleToggleAudio}
          onToggleVideo={handleToggleVideo}
          onToggleHand={handleToggleHand}
          onToggleCaptions={() => setCaptionsEnabled((prev) => !prev)}
          onToggleScreenShare={handleToggleScreenShare}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onSendReaction={handleSendReaction}
          onToggleSidebar={handleToggleSidebar}
          onLeave={handleLeave}
        />
      </footer>

      {/* Device Settings Modal */}
      <DeviceSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentAudioDeviceId={currentAudioDeviceId}
        currentVideoDeviceId={currentVideoDeviceId}
        currentAudioOutputId={currentAudioOutputId}
        onDeviceChange={handleDeviceChange}
      />
    </div>
  );
};

export default MeetingRoom;
