import { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  MessageSquare,
  Users,
  Mic,
  MicOff,
  Video,
  VideoOff,
  UserX,
  VolumeX,
  Crown,
  Hand,
  Lock,
} from 'lucide-react';

const MeetingSidebar = ({
  activeTab, // 'chat' | 'participants'
  onClose,
  currentUser,
  isHost,
  participants, // Array of { socketId, userId, userName, userRole, audioEnabled, videoEnabled, handRaised, isLocal }
  messages, // Array of message objects
  onSendMessage,
  onMuteParticipant,
  onMuteAll,
  onKickParticipant,
  onLowerHand,
}) => {
  const [internalTab, setInternalTab] = useState(null);
  const tab = internalTab || activeTab || 'chat';
  const [inputText, setInputText] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState('everyone'); // 'everyone' | socketId
  const messagesEndRef = useRef(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (tab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, tab]);

  const handleSend = (e) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    const isPrivate = selectedRecipient !== 'everyone';
    const targetPeer = isPrivate
      ? participants.find((p) => p.socketId === selectedRecipient)
      : null;

    onSendMessage({
      text: inputText.trim(),
      isPrivate,
      targetSocketId: isPrivate ? selectedRecipient : null,
      targetUserId: targetPeer ? targetPeer.userId : null,
      targetUserName: targetPeer ? targetPeer.userName : null,
    });

    setInputText('');
  };

  const handleQuickEmoji = (emoji) => {
    setInputText((prev) => prev + emoji);
  };

  const formatTime = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <aside className="w-80 sm:w-96 h-full flex flex-col bg-gray-950/95 backdrop-blur-xl border-l border-indigo-500/10 shadow-2xl z-20">
      {/* Header Tabs */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-indigo-500/10">
        <div className="flex gap-2 p-1 rounded-xl bg-indigo-950/40 border border-indigo-500/20">
          <button
            onClick={() => setInternalTab('chat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              tab === 'chat'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-indigo-300/70 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>
          <button
            onClick={() => setInternalTab('participants')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              tab === 'participants'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-indigo-300/70 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>People ({participants.length})</span>
          </button>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-indigo-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
          title="Close panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content Area */}
      {tab === 'chat' ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Recipient Selector */}
          <div className="px-4 py-2 bg-indigo-950/30 border-b border-indigo-500/10 flex items-center justify-between text-xs">
            <span className="text-indigo-400/80 font-medium">Send to:</span>
            <select
              value={selectedRecipient}
              onChange={(e) => setSelectedRecipient(e.target.value)}
              className="bg-indigo-900/40 border border-indigo-500/20 rounded-lg px-2.5 py-1 text-white text-xs focus:outline-none focus:border-indigo-400"
            >
              <option value="everyone" className="bg-gray-900 text-white">Everyone</option>
              {participants
                .filter((p) => !p.isLocal)
                .map((p) => (
                  <option key={p.socketId} value={p.socketId} className="bg-gray-900 text-white">
                    🔒 {p.userName} (Direct)
                  </option>
                ))}
            </select>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-indigo-300/40">
                <MessageSquare className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm font-medium">No messages yet</p>
                <p className="text-xs">Say hello or ask a question!</p>
              </div>
            ) : (
              messages.map((msg, index) => {
                const isOwn =
                  msg.senderId?.toString() === currentUser?._id?.toString() ||
                  msg.senderId?.toString() === currentUser?.id?.toString() ||
                  msg.senderSocketId === currentUser?.socketId;

                return (
                  <div
                    key={msg._id || index}
                    className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className="text-[11px] font-semibold text-indigo-300">
                        {isOwn ? 'You' : msg.senderName}
                      </span>
                      {msg.isPrivate && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-purple-500/20 border border-purple-400/30 text-purple-300 text-[10px]">
                          <Lock className="w-2.5 h-2.5" />
                          {isOwn ? `to ${msg.targetUserName || 'User'}` : 'Direct'}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>

                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm break-words shadow-sm ${
                        isOwn
                          ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-br-xs'
                          : msg.isPrivate
                          ? 'bg-purple-900/40 border border-purple-500/30 text-purple-100 rounded-bl-xs'
                          : 'bg-indigo-950/60 border border-indigo-500/15 text-indigo-100 rounded-bl-xs'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick emoji row */}
          <div className="px-3 pt-2 pb-1 border-t border-indigo-500/10 flex items-center gap-1 overflow-x-auto">
            {['👍', '👏', '❤️', '😂', '🎉', '🔥', '💡'].map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => handleQuickEmoji(em)}
                className="p-1 hover:bg-white/10 rounded-lg text-sm transition-all cursor-pointer"
              >
                {em}
              </button>
            ))}
          </div>

          {/* Message input */}
          <form onSubmit={handleSend} className="p-3 border-t border-indigo-500/10 flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                selectedRecipient === 'everyone'
                  ? 'Message everyone...'
                  : 'Send direct message...'
              }
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-indigo-950/50 border border-indigo-500/20 text-white placeholder-indigo-400/30 text-sm focus:outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/30"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-all cursor-pointer"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      ) : (
        /* Participants Panel */
        <div className="flex-1 flex flex-col min-h-0">
          {/* Host Mute All Bar */}
          {isHost && participants.length > 1 && (
            <div className="p-3 bg-indigo-950/40 border-b border-indigo-500/10 flex items-center justify-between">
              <span className="text-xs text-indigo-300/80">Host Controls</span>
              <button
                onClick={onMuteAll}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-medium transition-all cursor-pointer"
              >
                <VolumeX className="w-3.5 h-3.5" />
                Mute All
              </button>
            </div>
          )}

          {/* Participant items list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {participants.map((p) => (
              <div
                key={p.socketId || p.userId}
                className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-500/10 hover:border-indigo-500/30 transition-all group"
              >
                {/* User info */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white text-xs font-bold uppercase shrink-0">
                    {p.userName ? p.userName.charAt(0) : '?'}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-white truncate">
                        {p.userName}
                      </span>
                      {p.isLocal && (
                        <span className="text-[10px] text-indigo-400 font-semibold">(You)</span>
                      )}
                      {(p.isHost || p.userRole === 'host') && (
                        <Crown className="w-3 h-3 text-yellow-400 shrink-0" title="Meeting Host" />
                      )}
                    </div>

                    {p.handRaised && (
                      <span className="flex items-center gap-1 text-[11px] text-yellow-400 font-medium animate-pulse">
                        <Hand className="w-3 h-3" />
                        Hand raised
                      </span>
                    )}
                  </div>
                </div>

                {/* State Indicators & Host Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Media status indicators */}
                  <div className="p-1 text-gray-400">
                    {p.audioEnabled ? (
                      <Mic className="w-4 h-4 text-green-400" />
                    ) : (
                      <MicOff className="w-4 h-4 text-red-400" />
                    )}
                  </div>

                  <div className="p-1 text-gray-400">
                    {p.videoEnabled ? (
                      <Video className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <VideoOff className="w-4 h-4 text-gray-500" />
                    )}
                  </div>

                  {/* Host action buttons for remote peers */}
                  {isHost && !p.isLocal && (
                    <div className="flex items-center gap-1 ml-1 border-l border-white/10 pl-1.5">
                      {p.handRaised && (
                        <button
                          onClick={() => onLowerHand(p.socketId)}
                          className="p-1.5 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-xs transition-all cursor-pointer"
                          title="Lower hand"
                        >
                          <Hand className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {p.audioEnabled && (
                        <button
                          onClick={() => onMuteParticipant(p.socketId)}
                          className="p-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 transition-all cursor-pointer"
                          title="Mute participant"
                        >
                          <MicOff className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => {
                          if (window.confirm(`Remove ${p.userName} from this meeting?`)) {
                            onKickParticipant(p.socketId);
                          }
                        }}
                        className="p-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-400 transition-all cursor-pointer"
                        title="Remove from meeting"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
};

export default MeetingSidebar;
