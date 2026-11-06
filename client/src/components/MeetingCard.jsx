import { Link } from 'react-router-dom';
import { Calendar, Users, ExternalLink, Trash2, Sparkles } from 'lucide-react';

const MeetingCard = ({ meeting, onJoin, onDelete }) => {
  const formattedDate = meeting.createdAt
    ? new Date(meeting.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'N/A';

  return (
    <div className="glass rounded-xl p-5 hover:border-indigo-400/30 transition-all group">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors truncate pr-2">
          {meeting.title || 'Untitled Meeting'}
        </h3>
        {onDelete && (
          <button
            onClick={() => onDelete(meeting._id)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
            title="Delete meeting"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {meeting.description && (
        <p className="text-sm text-indigo-300/70 mb-3 line-clamp-2">
          {meeting.description}
        </p>
      )}

      <div className="flex items-center gap-4 text-xs text-indigo-400/60 mb-4">
        <div className="flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          <span>{formattedDate}</span>
        </div>
        {meeting.participants && (
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            <span>{meeting.participants.length} participant(s)</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onJoin(meeting._id)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-md"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Join
        </button>

        <Link
          to={`/meeting/${meeting._id}/details`}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/20 text-indigo-300 hover:text-white text-xs font-semibold transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
          Notes & AI
        </Link>
      </div>

      <div className="mt-3 pt-3 border-t border-indigo-500/10">
        <p className="text-xs text-indigo-400/40 font-mono truncate" title={meeting._id}>
          ID: {meeting._id}
        </p>
      </div>
    </div>
  );
};

export default MeetingCard;
