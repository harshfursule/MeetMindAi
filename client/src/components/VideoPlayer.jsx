import { useEffect, useRef } from 'react';
import { UserCircle } from 'lucide-react';

const VideoPlayer = ({ stream, muted = false, label = '', isLocal = false, videoEnabled = true }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative rounded-xl overflow-hidden bg-gray-900/80 border border-indigo-500/10 aspect-video group">
      {stream && videoEnabled ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-900 to-indigo-950">
          <UserCircle className="w-20 h-20 text-indigo-500/40" />
        </div>
      )}

      {/* Label overlay */}
      {label && (
        <div className="absolute bottom-2 left-2 px-3 py-1 rounded-lg glass text-xs font-medium text-indigo-200">
          {label}
          {isLocal && ' (You)'}
        </div>
      )}

      {/* Connection indicator */}
      {stream && (
        <div className="absolute top-2 right-2">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
