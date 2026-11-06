import { useEffect, useRef } from 'react';
import { MicOff, Crown } from 'lucide-react';

const VideoPlayer = ({
  stream,
  muted = false,
  label = '',
  isLocal = false,
  videoEnabled = true,
  audioEnabled = true,
  handRaised = false,
  isHost = false,
}) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={`relative rounded-2xl overflow-hidden bg-gray-900/90 border transition-all duration-300 aspect-video group shadow-lg ${
      handRaised
        ? 'border-yellow-400/60 ring-2 ring-yellow-400/30'
        : 'border-indigo-500/20 hover:border-indigo-500/40'
    }`}>
      {stream && videoEnabled ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950 p-4">
          <div className="w-20 h-20 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mb-2 shadow-inner">
            <span className="text-2xl font-bold text-indigo-300 uppercase">
              {label ? label.charAt(0) : '?'}
            </span>
          </div>
          <p className="text-xs text-indigo-300/50">Camera is off</p>
        </div>
      )}

      {/* Hand Raised Banner */}
      {handRaised && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/90 backdrop-blur-md text-gray-950 text-xs font-bold shadow-lg animate-bounce">
          <span>✋</span>
          <span>Hand Raised</span>
        </div>
      )}

      {/* Top right badges */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {isHost && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/30 border border-purple-400/40 text-purple-300 text-xs font-semibold backdrop-blur-md">
            <Crown className="w-3 h-3 text-yellow-400" />
            Host
          </span>
        )}
        {stream && (
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 ring-4 ring-green-500/20 animate-pulse" title="Connected" />
        )}
      </div>

      {/* Bottom bar overlay */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        <div className="px-3 py-1.5 rounded-xl bg-gray-950/70 backdrop-blur-md border border-white/10 text-xs font-medium text-white shadow-md flex items-center gap-1.5">
          <span>{label}</span>
          {isLocal && <span className="text-indigo-400 text-[10px] font-semibold">(You)</span>}
        </div>

        {/* Audio Muted Indicator */}
        {!audioEnabled && (
          <div className="p-1.5 rounded-xl bg-red-600/80 backdrop-blur-md text-white shadow-md" title="Microphone muted">
            <MicOff className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPlayer;
