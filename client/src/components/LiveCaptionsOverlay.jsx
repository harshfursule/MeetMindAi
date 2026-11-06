import { useState, useEffect } from 'react';
import { Volume2, Sparkles, X } from 'lucide-react';

const LiveCaptionsOverlay = ({
  caption, // { speakerName, text, isFinal, timestamp }
  isEnabled = true,
  onClose,
}) => {
  const [activeCaption, setActiveCaption] = useState(null);
  const [fadeTimeout, setFadeTimeout] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (caption && caption.text && caption.text.trim()) {
      setActiveCaption(caption);
      setVisible(true);

      // Clear existing fade timer
      if (fadeTimeout) {
        clearTimeout(fadeTimeout);
      }

      // Auto fade caption 4.5 seconds after speech pauses
      const timer = setTimeout(() => {
        setVisible(false);
      }, 4500);

      setFadeTimeout(timer);
    }

    return () => {
      if (fadeTimeout) clearTimeout(fadeTimeout);
    };
  }, [caption]);

  if (!isEnabled || !visible || !activeCaption) {
    return null;
  }

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 max-w-2xl w-[92%] sm:w-auto transition-all duration-300 pointer-events-auto">
      <div className="bg-gray-950/85 backdrop-blur-md border border-indigo-500/30 shadow-2xl rounded-2xl px-5 py-3 text-white flex items-start gap-3.5 animate-in fade-in slide-in-from-bottom-3 duration-200">
        {/* Speaker Avatar / Badge */}
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-md">
            {activeCaption.speakerName ? activeCaption.speakerName.charAt(0).toUpperCase() : 'P'}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-indigo-300">
              {activeCaption.speakerName || 'Speaker'}
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
              <Volume2 className="w-2.5 h-2.5 text-indigo-400 animate-pulse" />
              Live
            </span>
            {!activeCaption.isFinal && (
              <span className="text-[10px] text-gray-400 italic flex items-center gap-0.5">
                <Sparkles className="w-2.5 h-2.5 text-yellow-400" />
                transcribing...
              </span>
            )}
          </div>

          <p className="text-sm sm:text-base font-medium text-gray-100 leading-snug break-words">
            {activeCaption.text}
          </p>
        </div>

        {/* Close Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="Turn off captions"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default LiveCaptionsOverlay;
