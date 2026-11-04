import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';

const ControlBar = ({ audioEnabled, videoEnabled, onToggleAudio, onToggleVideo, onLeave }) => {
  return (
    <div className="flex items-center justify-center gap-3 p-4">
      {/* Mute / Unmute */}
      <button
        onClick={onToggleAudio}
        className={`p-4 rounded-full transition-all cursor-pointer ${
          audioEnabled
            ? 'bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/50'
            : 'bg-red-600/30 text-red-400 hover:bg-red-600/50'
        }`}
        title={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
      >
        {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </button>

      {/* Camera On / Off */}
      <button
        onClick={onToggleVideo}
        className={`p-4 rounded-full transition-all cursor-pointer ${
          videoEnabled
            ? 'bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/50'
            : 'bg-red-600/30 text-red-400 hover:bg-red-600/50'
        }`}
        title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
      >
        {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
      </button>

      {/* Leave Meeting */}
      <button
        onClick={onLeave}
        className="p-4 rounded-full bg-red-600 text-white hover:bg-red-500 transition-all cursor-pointer"
        title="Leave meeting"
      >
        <PhoneOff className="w-5 h-5" />
      </button>
    </div>
  );
};

export default ControlBar;
