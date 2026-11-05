import { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  MessageSquare,
  Users,
  Hand,
  Smile,
  ScreenShare,
  ScreenShareOff,
  Settings,
} from 'lucide-react';

const EMOJI_OPTIONS = ['👍', '👏', '❤️', '😂', '🎉', '🔥', '💡', '😮'];

const ControlBar = ({
  audioEnabled,
  videoEnabled,
  handRaised,
  isScreenSharing = false,
  activePresenter = null,
  unreadCount = 0,
  participantCount = 1,
  activeSidebar, // 'chat' | 'participants' | null
  onToggleAudio,
  onToggleVideo,
  onToggleHand,
  onToggleScreenShare,
  onOpenSettings,
  onSendReaction,
  onToggleSidebar,
  onLeave,
}) => {
  const [showReactions, setShowReactions] = useState(false);
  const reactionsRef = useRef(null);

  // Close reaction picker on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (reactionsRef.current && !reactionsRef.current.contains(e.target)) {
        setShowReactions(false);
      }
    };
    if (showReactions) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showReactions]);

  return (
    <div className="relative flex items-center justify-between px-6 py-3.5 max-w-5xl mx-auto">
      {/* Left section: Meeting status / hand indicator */}
      <div className="hidden sm:flex items-center gap-2">
        {handRaised && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 text-xs font-semibold animate-pulse">
            <Hand className="w-3.5 h-3.5" />
            <span>Your hand is raised</span>
          </div>
        )}
        {activePresenter && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-medium">
            <ScreenShare className="w-3.5 h-3.5 text-indigo-400" />
            <span className="truncate max-w-[150px]">
              {isScreenSharing ? 'You are presenting' : `${activePresenter.presenterName} is presenting`}
            </span>
          </div>
        )}
      </div>

      {/* Center section: Core A/V & Action Controls */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 mx-auto">
        {/* Mute / Unmute Audio */}
        <button
          onClick={onToggleAudio}
          className={`p-3.5 sm:p-4 rounded-2xl transition-all cursor-pointer shadow-md ${
            audioEnabled
              ? 'bg-indigo-600/30 text-indigo-200 hover:bg-indigo-600/50 hover:text-white border border-indigo-500/20'
              : 'bg-red-600/80 text-white hover:bg-red-600 border border-red-500/40 shadow-red-500/20'
          }`}
          title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
        >
          {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>

        {/* Camera On / Off */}
        <button
          onClick={onToggleVideo}
          className={`p-3.5 sm:p-4 rounded-2xl transition-all cursor-pointer shadow-md ${
            videoEnabled
              ? 'bg-indigo-600/30 text-indigo-200 hover:bg-indigo-600/50 hover:text-white border border-indigo-500/20'
              : 'bg-red-600/80 text-white hover:bg-red-600 border border-red-500/40 shadow-red-500/20'
          }`}
          title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>

        {/* Screen Sharing / Presenter Switching */}
        <button
          onClick={onToggleScreenShare}
          className={`p-3.5 sm:p-4 rounded-2xl transition-all cursor-pointer shadow-md ${
            isScreenSharing
              ? 'bg-blue-600 text-white ring-2 ring-blue-400/50 shadow-blue-500/30 scale-105'
              : activePresenter
              ? 'bg-indigo-900/60 text-indigo-200 hover:bg-blue-600/40 border border-indigo-500/30'
              : 'bg-indigo-950/60 text-indigo-300 hover:bg-indigo-900/60 hover:text-white border border-indigo-500/20'
          }`}
          title={
            isScreenSharing
              ? 'Stop sharing screen'
              : activePresenter
              ? `Take over presentation (${activePresenter.presenterName} is currently sharing)`
              : 'Share entire screen, window, or tab'
          }
        >
          {isScreenSharing ? (
            <ScreenShareOff className="w-5 h-5 text-white" />
          ) : (
            <ScreenShare className="w-5 h-5" />
          )}
        </button>

        {/* Raise Hand */}
        <button
          onClick={onToggleHand}
          className={`p-3.5 sm:p-4 rounded-2xl transition-all cursor-pointer shadow-md ${
            handRaised
              ? 'bg-yellow-500 text-gray-950 font-bold ring-2 ring-yellow-400/50 scale-105'
              : 'bg-indigo-950/60 text-indigo-300 hover:bg-indigo-900/60 hover:text-white border border-indigo-500/20'
          }`}
          title={handRaised ? 'Lower your hand' : 'Raise hand'}
        >
          <Hand className="w-5 h-5" />
        </button>

        {/* Reactions Picker */}
        <div className="relative" ref={reactionsRef}>
          <button
            onClick={() => setShowReactions((prev) => !prev)}
            className={`p-3.5 sm:p-4 rounded-2xl transition-all cursor-pointer shadow-md ${
              showReactions
                ? 'bg-indigo-600 text-white'
                : 'bg-indigo-950/60 text-indigo-300 hover:bg-indigo-900/60 hover:text-white border border-indigo-500/20'
            }`}
            title="Send reaction"
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* Emoji Floating Popover */}
          {showReactions && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-2 rounded-2xl bg-gray-950/95 backdrop-blur-xl border border-indigo-500/30 shadow-2xl z-30 animate-in fade-in zoom-in-95 duration-150">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onSendReaction(emoji);
                    setShowReactions(false);
                  }}
                  className="w-9 h-9 flex items-center justify-center text-lg hover:bg-white/10 rounded-xl transition-all hover:scale-125 cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Device Settings Button */}
        <button
          onClick={onOpenSettings}
          className="p-3.5 sm:p-4 rounded-2xl bg-indigo-950/60 text-indigo-300 hover:bg-indigo-900/60 hover:text-white border border-indigo-500/20 transition-all cursor-pointer shadow-md"
          title="Audio & Video Device Settings"
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* Leave Meeting Button */}
        <button
          onClick={onLeave}
          className="p-3.5 sm:p-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white transition-all cursor-pointer shadow-lg shadow-red-600/30 hover:scale-105"
          title="Leave meeting"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>

      {/* Right section: Sidebar Toggles (Chat & People) */}
      <div className="flex items-center gap-2">
        {/* Toggle Chat */}
        <button
          onClick={() => onToggleSidebar('chat')}
          className={`relative p-3 rounded-2xl transition-all cursor-pointer border ${
            activeSidebar === 'chat'
              ? 'bg-indigo-600 text-white border-indigo-400 shadow-indigo-500/30 shadow-md'
              : 'bg-indigo-950/50 text-indigo-300 hover:bg-indigo-900/50 hover:text-white border-indigo-500/20'
          }`}
          title="In-meeting chat"
        >
          <MessageSquare className="w-5 h-5" />
          {unreadCount > 0 && activeSidebar !== 'chat' && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-gray-950 animate-bounce">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Toggle Participants */}
        <button
          onClick={() => onToggleSidebar('participants')}
          className={`relative p-3 rounded-2xl transition-all cursor-pointer border ${
            activeSidebar === 'participants'
              ? 'bg-indigo-600 text-white border-indigo-400 shadow-indigo-500/30 shadow-md'
              : 'bg-indigo-950/50 text-indigo-300 hover:bg-indigo-900/50 hover:text-white border-indigo-500/20'
          }`}
          title="Participant list & controls"
        >
          <Users className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 min-w-4 px-1 h-4 rounded-full bg-indigo-900 text-indigo-200 border border-indigo-500/40 text-[10px] font-semibold flex items-center justify-center">
            {participantCount}
          </span>
        </button>
      </div>
    </div>
  );
};

export default ControlBar;
