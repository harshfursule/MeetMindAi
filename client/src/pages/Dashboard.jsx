import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Link as LinkIcon, RefreshCw, VideoIcon, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar.jsx';
import MeetingCard from '../components/MeetingCard.jsx';
import api from '../services/api.js';

const Dashboard = () => {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMeeting, setNewMeeting] = useState({ title: '', description: '' });

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/meetings');
      setMeetings(data.data?.meetings || data.meetings || data || []);
    } catch (err) {
      console.error('Failed to fetch meetings:', err);
      toast.error('Failed to load meetings');
    } finally {
      setLoading(false);
    }
  };

  // Fetch meetings on mount
  useEffect(() => {
    fetchMeetings();
  }, []);

  const handleCreateMeeting = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data } = await api.post('/meetings', {
        title: newMeeting.title || 'New Meeting',
        description: newMeeting.description,
      });
      const meeting = data.data?.meeting || data.meeting || data;
      toast.success('Meeting created!');
      setShowCreateModal(false);
      setNewMeeting({ title: '', description: '' });
      navigate(`/meeting/${meeting._id}`);
    } catch (err) {
      console.error('Failed to create meeting:', err);
      toast.error(err.response?.data?.message || 'Failed to create meeting');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinMeeting = (e) => {
    e.preventDefault();
    const id = joinId.trim();
    if (!id) {
      toast.error('Please enter a meeting ID');
      return;
    }
    navigate(`/meeting/${id}`);
  };

  const handleJoinFromCard = (meetingId) => {
    navigate(`/meeting/${meetingId}`);
  };

  const handleDeleteMeeting = async (meetingId) => {
    try {
      await api.delete(`/meetings/${meetingId}`);
      setMeetings((prev) => prev.filter((m) => m._id !== meetingId));
      toast.success('Meeting deleted');
    } catch (err) {
      console.error('Failed to delete meeting:', err);
      toast.error('Failed to delete meeting');
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-indigo-300/60 mt-1">Manage and join your video meetings</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium transition-all cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            New Meeting
          </button>
        </div>

        {/* Join by ID */}
        <div className="glass rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <LinkIcon className="w-5 h-5 text-indigo-400" />
            Join a Meeting
          </h2>
          <form onSubmit={handleJoinMeeting} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400/50" />
              <input
                type="text"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                placeholder="Enter meeting ID to join..."
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-indigo-950/50 border border-indigo-500/20 text-white placeholder-indigo-400/30 focus:outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/30"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 rounded-xl bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600/50 font-medium transition-all cursor-pointer"
            >
              Join
            </button>
          </form>
        </div>

        {/* Meetings List */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <VideoIcon className="w-5 h-5 text-indigo-400" />
            Your Meetings
          </h2>
          <button
            onClick={fetchMeetings}
            className="p-2 rounded-lg text-indigo-400 hover:bg-indigo-500/20 transition-all cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
          </div>
        ) : meetings.length === 0 ? (
          <div className="glass rounded-xl p-12 text-center">
            <VideoIcon className="w-16 h-16 text-indigo-500/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-indigo-300/60 mb-2">No meetings yet</h3>
            <p className="text-indigo-400/40 mb-6">Create your first meeting to get started</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium transition-all cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              Create Meeting
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {meetings.map((meeting) => (
              <MeetingCard
                key={meeting._id}
                meeting={meeting}
                onJoin={handleJoinFromCard}
                onDelete={handleDeleteMeeting}
              />
            ))}
          </div>
        )}
      </main>

      {/* Create Meeting Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-8 w-full max-w-md">
            <h2 className="text-2xl font-bold text-white mb-6">Create New Meeting</h2>
            <form onSubmit={handleCreateMeeting} className="space-y-5">
              <div>
                <label htmlFor="meetingTitle" className="block text-sm font-medium text-indigo-300 mb-2">
                  Meeting Title
                </label>
                <input
                  id="meetingTitle"
                  type="text"
                  value={newMeeting.title}
                  onChange={(e) => setNewMeeting((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Team standup, project review..."
                  className="w-full px-4 py-3 rounded-xl bg-indigo-950/50 border border-indigo-500/20 text-white placeholder-indigo-400/30 focus:outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/30"
                />
              </div>

              <div>
                <label htmlFor="meetingDesc" className="block text-sm font-medium text-indigo-300 mb-2">
                  Description (optional)
                </label>
                <textarea
                  id="meetingDesc"
                  value={newMeeting.description}
                  onChange={(e) => setNewMeeting((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="What's this meeting about?"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl bg-indigo-950/50 border border-indigo-500/20 text-white placeholder-indigo-400/30 focus:outline-none focus:border-indigo-400/50 focus:ring-1 focus:ring-indigo-400/30 resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewMeeting({ title: '', description: '' });
                  }}
                  className="flex-1 py-3 rounded-xl border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/10 font-medium transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold transition-all disabled:opacity-50 cursor-pointer"
                >
                  {creating ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      Create
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
