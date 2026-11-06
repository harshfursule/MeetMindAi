import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  FileText,
  CheckCircle2,
  Circle,
  Copy,
  Check,
  Download,
  Share2,
  Printer,
  RefreshCw,
  Search,
  Calendar,
  Clock,
  User,
  ExternalLink,
  MessageSquare,
  Lock,
  Globe,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar.jsx';
import api from '../services/api.js';

const MeetingDetails = () => {
  const { meetingId } = useParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'transcript'
  const [meeting, setMeeting] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summarizing, setSummarizing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingLoading, setSharingLoading] = useState(false);
  const [shareData, setShareData] = useState({ isShared: false, shareToken: '', shareUrl: '' });

  // Load meeting, transcript, and summary
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [meetingRes, transcriptRes, summaryRes] = await Promise.allSettled([
          api.get(`/meetings/${meetingId}`),
          api.get(`/meetings/${meetingId}/transcript`),
          api.get(`/meetings/${meetingId}/summary`),
        ]);

        if (meetingRes.status === 'fulfilled') {
          setMeeting(meetingRes.value.data.data?.meeting || meetingRes.value.data.meeting);
        }

        if (transcriptRes.status === 'fulfilled') {
          setTranscript(transcriptRes.value.data.data);
        }

        if (summaryRes.status === 'fulfilled' && summaryRes.value.data.data?.summary) {
          const sum = summaryRes.value.data.data.summary;
          setSummary(sum);
          setShareData({
            isShared: sum.isShared || false,
            shareToken: sum.shareToken || '',
            shareUrl: `${window.location.origin}/shared-summary/${sum.shareToken}`,
          });
        }
      } catch (err) {
        console.error('Failed to load meeting details:', err);
        toast.error('Failed to load meeting records.');
      } finally {
        setLoading(false);
      }
    };

    if (meetingId) {
      fetchData();
    }
  }, [meetingId]);

  // Generate / Regenerate AI Summary
  const handleGenerateSummary = async () => {
    setSummarizing(true);
    try {
      const { data } = await api.post(`/meetings/${meetingId}/summarize`);
      const sum = data.data?.summary;
      setSummary(sum);
      setShareData({
        isShared: sum.isShared || false,
        shareToken: sum.shareToken || '',
        shareUrl: `${window.location.origin}/shared-summary/${sum.shareToken}`,
      });
      toast.success('AI Meeting Summary generated!');
    } catch (err) {
      console.error('Failed to generate summary:', err);
      toast.error('Could not generate summary.');
    } finally {
      setSummarizing(false);
    }
  };

  // Toggle Action Item Status (pending <-> completed)
  const handleToggleActionItem = async (index) => {
    if (!summary || !summary.actionItems) return;

    const updatedItems = summary.actionItems.map((item, idx) => {
      if (idx === index) {
        return {
          ...item,
          status: item.status === 'completed' ? 'pending' : 'completed',
        };
      }
      return item;
    });

    // Optimistic UI update
    setSummary((prev) => ({ ...prev, actionItems: updatedItems }));

    try {
      await api.put(`/meetings/${meetingId}/summary`, {
        actionItems: updatedItems,
      });
      toast.success(
        updatedItems[index].status === 'completed'
          ? 'Task marked as completed! 🎉'
          : 'Task marked as pending.'
      );
    } catch (err) {
      console.error('Failed to update action item:', err);
      toast.error('Failed to update action item.');
      // Revert on error
      setSummary((prev) => ({ ...prev, actionItems: summary.actionItems }));
    }
  };

  // Toggle Public Sharing
  const handleToggleShare = async () => {
    setSharingLoading(true);
    try {
      const { data } = await api.post(`/meetings/${meetingId}/summary/share`, {
        isShared: !shareData.isShared,
      });

      setShareData({
        isShared: data.data.isShared,
        shareToken: data.data.shareToken,
        shareUrl: `${window.location.origin}/shared-summary/${data.data.shareToken}`,
      });

      setSummary((prev) => (prev ? { ...prev, isShared: data.data.isShared } : prev));
      toast.success(
        data.data.isShared
          ? 'Public share link enabled! Anyone with the link can view notes.'
          : 'Public sharing disabled.'
      );
    } catch (err) {
      console.error('Share configuration failed:', err);
      toast.error('Could not configure sharing.');
    } finally {
      setSharingLoading(false);
    }
  };

  // Export to Markdown (.md)
  const handleExportMarkdown = () => {
    const title = meeting?.title || 'Meeting';
    const dateStr = meeting?.createdAt
      ? new Date(meeting.createdAt).toLocaleString()
      : new Date().toLocaleString();

    let md = `# ${title}\n`;
    md += `**Date:** ${dateStr}\n`;
    md += `**Meeting ID:** ${meetingId}\n\n`;

    if (summary) {
      md += `## 📋 Executive Summary\n${summary.overview}\n\n`;

      if (summary.keyPoints?.length > 0) {
        md += `## 💡 Key Discussion Points\n`;
        summary.keyPoints.forEach((point) => {
          md += `- ${point}\n`;
        });
        md += `\n`;
      }

      if (summary.actionItems?.length > 0) {
        md += `## ✅ Action Items\n`;
        summary.actionItems.forEach((item) => {
          const check = item.status === 'completed' ? '[x]' : '[ ]';
          md += `- ${check} **${item.task}** (Assignee: ${item.assignee || 'Unassigned'})\n`;
        });
        md += `\n`;
      }
    }

    if (transcript?.entries?.length > 0) {
      md += `## 🎙️ Spoken Transcript\n`;
      transcript.entries.forEach((e) => {
        const time = new Date(e.timestamp).toLocaleTimeString();
        md += `[${time}] **${e.speakerName}**: ${e.text}\n`;
      });
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}-notes.md`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded Markdown notes!');
  };

  // Export to Plain Text (.txt)
  const handleExportText = () => {
    const title = meeting?.title || 'Meeting';
    const dateStr = meeting?.createdAt
      ? new Date(meeting.createdAt).toLocaleString()
      : new Date().toLocaleString();

    let txt = `=========================================\n`;
    txt += `MEETMIND AI - MEETING NOTES & SUMMARY\n`;
    txt += `Title: ${title}\n`;
    txt += `Date: ${dateStr}\n`;
    txt += `=========================================\n\n`;

    if (summary) {
      txt += `[EXECUTIVE SUMMARY]\n${summary.overview}\n\n`;

      if (summary.keyPoints?.length > 0) {
        txt += `[KEY DISCUSSION POINTS]\n`;
        summary.keyPoints.forEach((pt, i) => {
          txt += `${i + 1}. ${pt}\n`;
        });
        txt += `\n`;
      }

      if (summary.actionItems?.length > 0) {
        txt += `[ACTION ITEMS]\n`;
        summary.actionItems.forEach((ai) => {
          const mark = ai.status === 'completed' ? '[DONE]' : '[TODO]';
          txt += `${mark} ${ai.task} -> Assignee: ${ai.assignee}\n`;
        });
        txt += `\n`;
      }
    }

    if (transcript?.entries?.length > 0) {
      txt += `[FULL TRANSCRIPT]\n`;
      transcript.entries.forEach((e) => {
        const time = new Date(e.timestamp).toLocaleTimeString();
        txt += `(${time}) ${e.speakerName}: ${e.text}\n`;
      });
    }

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}-notes.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded Text report!');
  };

  // Copy Summary to Clipboard
  const handleCopySummary = () => {
    if (!summary) return;
    let text = `${meeting?.title || 'Meeting'} - AI Summary\n\n${summary.overview}\n\n`;
    if (summary.keyPoints?.length > 0) {
      text += `Key Points:\n` + summary.keyPoints.map((p) => `• ${p}`).join('\n') + `\n\n`;
    }
    if (summary.actionItems?.length > 0) {
      text +=
        `Action Items:\n` +
        summary.actionItems
          .map((a) => `• [${a.status === 'completed' ? 'X' : ' '}] ${a.task} (${a.assignee})`)
          .join('\n');
    }

    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    toast.success('Summary copied to clipboard!');
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  // Filtered transcript entries
  const filteredEntries = (transcript?.entries || []).filter((entry) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      entry.speakerName.toLowerCase().includes(query) ||
      entry.text.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-indigo-950 to-purple-950 text-white flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Breadcrumb & Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-indigo-300 hover:text-white transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>

          {/* Export & Sharing Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopySummary}
              disabled={!summary}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/20 text-xs font-semibold text-indigo-200 transition-all cursor-pointer disabled:opacity-40"
              title="Copy Summary"
            >
              {copiedSummary ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSummary ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={handleExportMarkdown}
              disabled={!summary && !transcript?.entries?.length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/20 text-xs font-semibold text-indigo-200 transition-all cursor-pointer disabled:opacity-40"
              title="Download Markdown (.md)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Markdown</span>
            </button>

            <button
              onClick={handleExportText}
              disabled={!summary && !transcript?.entries?.length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/20 text-xs font-semibold text-indigo-200 transition-all cursor-pointer disabled:opacity-40"
              title="Download Plaintext (.txt)"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Text</span>
            </button>

            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/20 text-xs font-semibold text-indigo-200 transition-all cursor-pointer"
              title="Print / Save PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>

            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-xs font-semibold text-white shadow-md transition-all cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share Notes</span>
            </button>
          </div>
        </div>

        {/* Meeting Header Card */}
        <div className="glass rounded-2xl p-6 mb-8 border border-indigo-500/20">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {meeting?.title || 'Meeting Details & Summary'}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                  {meeting?.status || 'Completed'}
                </span>
              </div>
              {meeting?.description && (
                <p className="text-sm text-indigo-200/70 max-w-2xl mb-3">
                  {meeting.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-4 text-xs text-indigo-300/60 font-mono">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    {meeting?.createdAt
                      ? new Date(meeting.createdAt).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'Recently'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    {meeting?.createdAt
                      ? new Date(meeting.createdAt).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Room ID: {meeting?.roomId || meetingId}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to={`/meeting/${meetingId}`}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400/30 text-indigo-200 text-sm font-semibold transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                Rejoin Room
              </Link>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-3 border-b border-indigo-500/20 pb-3 mb-6">
          <button
            onClick={() => setActiveTab('summary')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'summary'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-indigo-300 hover:text-white hover:bg-indigo-900/30'
            }`}
          >
            <Sparkles className="w-4 h-4 text-yellow-300" />
            <span>AI Meeting Summary</span>
            {summary && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('transcript')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'transcript'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-indigo-300 hover:text-white hover:bg-indigo-900/30'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-indigo-400" />
            <span>Full Transcript</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-500/20">
              {transcript?.entries?.length || 0}
            </span>
          </button>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin mb-3" />
            <p className="text-sm text-indigo-300/60 font-medium">Loading meeting records...</p>
          </div>
        ) : (
          <>
            {/* ======================================================== */}
            {/* TAB 1: AI SUMMARY & ACTION ITEMS */}
            {/* ======================================================== */}
            {activeTab === 'summary' && (
              <div className="space-y-6">
                {/* Summary Toolbar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
                      Engine: {summary?.generatedBy || 'MeetMind AI'}
                    </span>
                    {summary?.sentiment && (
                      <span className="text-xs capitalize font-medium px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-200 border border-purple-400/30">
                        Tone: {summary.sentiment}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={handleGenerateSummary}
                    disabled={summarizing}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400/30 text-indigo-200 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${summarizing ? 'animate-spin' : ''}`} />
                    <span>{summarizing ? 'Generating...' : summary ? 'Regenerate' : 'Generate Summary'}</span>
                  </button>
                </div>

                {!summary ? (
                  <div className="glass rounded-2xl p-12 text-center">
                    <Sparkles className="w-12 h-12 text-indigo-400 mx-auto mb-4 animate-pulse" />
                    <h3 className="text-lg font-semibold text-white mb-2">No summary generated yet</h3>
                    <p className="text-sm text-indigo-300/60 max-w-md mx-auto mb-6">
                      Click below to let MeetMind AI process the spoken transcript and generate executive notes, key points, and action items.
                    </p>
                    <button
                      onClick={handleGenerateSummary}
                      disabled={summarizing}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{summarizing ? 'Analyzing Transcript...' : 'Generate AI Summary'}</span>
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Executive Overview */}
                    <div className="glass rounded-2xl p-6 border border-indigo-500/20">
                      <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-indigo-400" />
                        Executive Overview
                      </h2>
                      <p className="text-gray-200 leading-relaxed text-sm sm:text-base">
                        {summary.overview}
                      </p>

                      {summary.topics?.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-indigo-500/10 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-indigo-400 font-medium">Topics:</span>
                          {summary.topics.map((t, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-0.5 rounded-lg text-xs bg-indigo-950/60 text-indigo-300 border border-indigo-500/20 font-medium"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Key Discussion Points */}
                    {summary.keyPoints?.length > 0 && (
                      <div className="glass rounded-2xl p-6 border border-indigo-500/20">
                        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-yellow-400" />
                          Key Discussion Points & Decisions
                        </h2>
                        <ul className="space-y-3">
                          {summary.keyPoints.map((point, index) => (
                            <li
                              key={index}
                              className="flex items-start gap-3 p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/10"
                            >
                              <div className="w-5 h-5 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center justify-center text-xs font-bold mt-0.5 shrink-0">
                                {index + 1}
                              </div>
                              <p className="text-sm text-gray-200 leading-relaxed">{point}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Interactive Action Items Checklist */}
                    <div className="glass rounded-2xl p-6 border border-indigo-500/20">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          Action Items & Assigned Tasks
                        </h2>
                        <span className="text-xs text-indigo-300/60 font-medium">
                          {summary.actionItems?.filter((a) => a.status === 'completed').length || 0} of{' '}
                          {summary.actionItems?.length || 0} completed
                        </span>
                      </div>

                      {!summary.actionItems?.length ? (
                        <p className="text-sm text-indigo-300/50 italic py-2">
                          No specific action items detected from the transcript.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {summary.actionItems.map((item, index) => {
                            const isDone = item.status === 'completed';
                            return (
                              <div
                                key={index}
                                onClick={() => handleToggleActionItem(index)}
                                className={`flex items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
                                  isDone
                                    ? 'bg-emerald-950/20 border-emerald-500/30 text-gray-300'
                                    : 'bg-indigo-950/40 border-indigo-500/15 hover:border-indigo-500/40 text-white'
                                }`}
                              >
                                <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                                  <button
                                    type="button"
                                    className="mt-0.5 sm:mt-0 text-emerald-400 transition-transform active:scale-90"
                                  >
                                    {isDone ? (
                                      <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-500/20" />
                                    ) : (
                                      <Circle className="w-5 h-5 text-gray-500 hover:text-indigo-400" />
                                    )}
                                  </button>
                                  <span
                                    className={`text-sm font-medium leading-snug break-words ${
                                      isDone ? 'line-through text-gray-400' : ''
                                    }`}
                                  >
                                    {item.task}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="px-2 py-0.5 rounded-lg text-xs bg-indigo-900/40 text-indigo-300 border border-indigo-500/20 flex items-center gap-1">
                                    <User className="w-3 h-3 text-indigo-400" />
                                    <span className="truncate max-w-[100px]">{item.assignee || 'Unassigned'}</span>
                                  </span>
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                      isDone
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                        : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                                    }`}
                                  >
                                    {item.status || 'pending'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ======================================================== */}
            {/* TAB 2: FULL TRANSCRIPT */}
            {/* ======================================================== */}
            {activeTab === 'transcript' && (
              <div className="space-y-4">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400/50" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search spoken dialogue or speaker name..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-indigo-950/50 border border-indigo-500/20 text-white placeholder-indigo-400/30 text-sm focus:outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/30"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-white"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {filteredEntries.length === 0 ? (
                  <div className="glass rounded-2xl p-12 text-center">
                    <MessageSquare className="w-12 h-12 text-indigo-400/40 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-white mb-1">
                      {searchQuery ? 'No matching dialogue found' : 'No transcript recorded yet'}
                    </h3>
                    <p className="text-xs text-indigo-300/60 max-w-sm mx-auto">
                      {searchQuery
                        ? 'Try searching with a different keyword or speaker name.'
                        : 'Live captions turn on during the meeting and automatically save spoken dialogue.'}
                    </p>
                  </div>
                ) : (
                  <div className="glass rounded-2xl p-5 border border-indigo-500/20 space-y-3.5">
                    {filteredEntries.map((entry, idx) => {
                      const timeStr = entry.timestamp
                        ? new Date(entry.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : '';

                      return (
                        <div
                          key={entry._id || idx}
                          className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/[0.03] transition-colors group"
                        >
                          {/* Avatar */}
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-md">
                            {entry.speakerName ? entry.speakerName.charAt(0).toUpperCase() : 'U'}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-indigo-300">
                                {entry.speakerName}
                              </span>
                              <span className="text-[11px] text-gray-400 font-mono">
                                {timeStr}
                              </span>
                            </div>
                            <p className="text-sm text-gray-200 leading-relaxed break-words">
                              {entry.text}
                            </p>
                          </div>

                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`[${timeStr}] ${entry.speakerName}: ${entry.text}`);
                              toast.success('Snippet copied');
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                            title="Copy line"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Shareable Link Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="glass rounded-2xl p-6 w-full max-w-md border border-indigo-500/30 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Share2 className="w-5 h-5 text-indigo-400" />
              Share Meeting Notes
            </h3>
            <p className="text-xs text-indigo-300/70 mb-5">
              Enable public access to share this summary and transcript with team members or external clients.
            </p>

            {/* Toggle Switch */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-indigo-950/60 border border-indigo-500/20 mb-4">
              <div className="flex items-center gap-2.5">
                {shareData.isShared ? (
                  <Globe className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Lock className="w-5 h-5 text-gray-400" />
                )}
                <div>
                  <div className="text-sm font-semibold text-white">
                    {shareData.isShared ? 'Public Link Enabled' : 'Private (Only You)'}
                  </div>
                  <div className="text-[11px] text-indigo-300/60">
                    {shareData.isShared
                      ? 'Anyone with the link can view'
                      : 'Only authenticated participants'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleShare}
                disabled={sharingLoading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  shareData.isShared ? 'bg-indigo-600' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    shareData.isShared ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Share Link Field */}
            {shareData.isShared && (
              <div className="mb-5 animate-in fade-in duration-150">
                <label className="block text-xs font-medium text-indigo-300 mb-1.5">
                  Shareable Public URL:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareData.shareUrl}
                    className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-indigo-500/20 text-xs text-indigo-200 font-mono focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(shareData.shareUrl);
                      toast.success('Share link copied!');
                    }}
                    className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 rounded-xl bg-indigo-950 text-indigo-300 hover:text-white border border-indigo-500/20 text-sm font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetingDetails;
