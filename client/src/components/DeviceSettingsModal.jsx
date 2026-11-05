import { useState, useEffect, useRef } from 'react';
import {
  X,
  Mic,
  Video,
  Volume2,
  Check,
  RefreshCw,
  Sliders,
  Settings,
} from 'lucide-react';

const DeviceSettingsModal = ({
  isOpen,
  onClose,
  currentAudioDeviceId,
  currentVideoDeviceId,
  currentAudioOutputId,
  onDeviceChange, // ({ audioDeviceId, videoDeviceId, audioOutputId })
}) => {
  const [devices, setDevices] = useState({
    audioInputs: [],
    videoInputs: [],
    audioOutputs: [],
  });

  const [selectedMic, setSelectedMic] = useState(currentAudioDeviceId || '');
  const [selectedCamera, setSelectedCamera] = useState(currentVideoDeviceId || '');
  const [selectedSpeaker, setSelectedSpeaker] = useState(currentAudioOutputId || '');

  // Live test preview states
  const [micLevel, setMicLevel] = useState(0);
  const [previewStream, setPreviewStream] = useState(null);
  const [isPlayingTestSound, setIsPlayingTestSound] = useState(false);

  const previewVideoRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Enumerate devices on open
  useEffect(() => {
    if (!isOpen) return;

    const getDevices = async () => {
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = allDevices.filter((d) => d.kind === 'audioinput');
        const videoInputs = allDevices.filter((d) => d.kind === 'videoinput');
        const audioOutputs = allDevices.filter((d) => d.kind === 'audiooutput');

        setDevices({ audioInputs, videoInputs, audioOutputs });

        if (!selectedMic && audioInputs.length > 0) {
          setSelectedMic(audioInputs[0].deviceId);
        }
        if (!selectedCamera && videoInputs.length > 0) {
          setSelectedCamera(videoInputs[0].deviceId);
        }
        if (!selectedSpeaker && audioOutputs.length > 0) {
          setSelectedSpeaker(audioOutputs[0].deviceId);
        }
      } catch (err) {
        console.error('[DeviceSettings] Error enumerating devices:', err);
      }
    };

    getDevices();
  }, [isOpen]);

  // Handle Live Camera Preview & Microphone Volume Meter
  useEffect(() => {
    if (!isOpen) return;

    let activeStream = null;

    const setupPreview = async () => {
      try {
        const constraints = {
          video: selectedCamera ? { deviceId: { exact: selectedCamera } } : true,
          audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = stream;
        setPreviewStream(stream);

        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream;
        }

        // Setup AudioContext for Live Mic Level
        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (AudioContext) {
            const audioCtx = new AudioContext();
            audioContextRef.current = audioCtx;
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const updateMeter = () => {
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const avg = sum / dataArray.length;
              setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
              animationFrameRef.current = requestAnimationFrame(updateMeter);
            };

            updateMeter();
          }
        } catch (audioErr) {
          console.warn('[DeviceSettings] Audio meter error:', audioErr);
        }
      } catch (err) {
        console.warn('[DeviceSettings] Preview error:', err);
      }
    };

    setupPreview();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isOpen, selectedCamera, selectedMic]);

  // Test Speaker Sound
  const playTestSound = () => {
    try {
      setIsPlayingTestSound(true);
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();

      // Play pleasant chime (chord)
      [440, 554.37, 659.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8 + i * 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.08);
        osc.stop(ctx.currentTime + 1.2);
      });

      setTimeout(() => {
        setIsPlayingTestSound(false);
        ctx.close();
      }, 1200);
    } catch (err) {
      console.error(err);
      setIsPlayingTestSound(false);
    }
  };

  const handleApply = () => {
    onDeviceChange({
      audioDeviceId: selectedMic,
      videoDeviceId: selectedCamera,
      audioOutputId: selectedSpeaker,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-3xl bg-gray-950/95 border border-indigo-500/20 shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-indigo-500/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Audio & Video Settings</h2>
              <p className="text-xs text-indigo-300/60">Switch your camera, microphone, or output device</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-indigo-300/60 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Camera Selection & Live Preview */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-indigo-200 uppercase tracking-wider">
              <Video className="w-4 h-4 text-indigo-400" />
              <span>Camera</span>
            </label>

            <select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-white text-sm focus:outline-none focus:border-indigo-400"
            >
              {devices.videoInputs.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId} className="bg-gray-900 text-white">
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>

            {/* Camera Preview Thumbnail */}
            <div className="relative rounded-2xl overflow-hidden bg-gray-900 border border-indigo-500/10 aspect-video shadow-inner flex items-center justify-center">
              <video
                ref={previewVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
              <span className="absolute bottom-2 left-2 px-2.5 py-1 rounded-lg bg-black/60 text-[11px] text-white/80 backdrop-blur-sm">
                Camera Preview
              </span>
            </div>
          </div>

          {/* Microphone Selection & Live Level Meter */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-indigo-200 uppercase tracking-wider">
              <Mic className="w-4 h-4 text-indigo-400" />
              <span>Microphone</span>
            </label>

            <select
              value={selectedMic}
              onChange={(e) => setSelectedMic(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-white text-sm focus:outline-none focus:border-indigo-400"
            >
              {devices.audioInputs.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId} className="bg-gray-900 text-white">
                  {d.label || `Microphone ${i + 1}`}
                </option>
              ))}
            </select>

            {/* Live Mic Volume Level Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-indigo-300/70">
                <span>Input Level</span>
                <span>{micLevel}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-indigo-950/80 overflow-hidden border border-indigo-500/10">
                <div
                  style={{ width: `${micLevel}%` }}
                  className={`h-full transition-all duration-75 rounded-full ${
                    micLevel > 70
                      ? 'bg-red-500'
                      : micLevel > 40
                      ? 'bg-yellow-400'
                      : 'bg-green-500'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Speaker / Audio Output Selection */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-semibold text-indigo-200 uppercase tracking-wider">
                <Volume2 className="w-4 h-4 text-indigo-400" />
                <span>Speakers / Audio Output</span>
              </label>

              <button
                type="button"
                onClick={playTestSound}
                disabled={isPlayingTestSound}
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-all cursor-pointer"
              >
                <span>{isPlayingTestSound ? 'Playing...' : 'Test Sound'}</span>
              </button>
            </div>

            <select
              value={selectedSpeaker}
              onChange={(e) => setSelectedSpeaker(e.target.value)}
              disabled={devices.audioOutputs.length === 0}
              className="w-full px-3.5 py-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-white text-sm focus:outline-none focus:border-indigo-400 disabled:opacity-50"
            >
              {devices.audioOutputs.length > 0 ? (
                devices.audioOutputs.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId} className="bg-gray-900 text-white">
                    {d.label || `Speaker ${i + 1}`}
                  </option>
                ))
              ) : (
                <option value="">Default System Output</option>
              )}
            </select>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-indigo-950/30 border-t border-indigo-500/10">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-indigo-500/20 text-indigo-300 hover:bg-white/5 text-sm font-medium transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Apply Devices</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeviceSettingsModal;
