import React from 'react';
import { CheckCircle2, XCircle, ShieldCheck, ShieldX, Trash2, X, PlayCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { userLabel } from '../lib/userLabel';
import { EventSuggestion, SuggestablePatch, describeFieldValue, fieldLabel, DELETE_REASON_LABELS } from '../lib/suggestions';

interface SuggestionCardProps {
  suggestion: EventSuggestion;
  voterId: string;
  canModerate: boolean;
  playerName: (id: string) => string | undefined;
  teamName: (id: string) => string | undefined;
  onVote: (isUp: boolean) => void;
  onAccept?: () => void;
  onReject?: () => void;
  onRemove?: () => void;
  onSeek?: () => void;
  /** Compact mode drops the diff rows and footer chrome, for a review-queue row. */
  compact?: boolean;
}

const STATUS_LABEL: Record<EventSuggestion['status'], string> = {
  open: 'Open',
  accepted: 'Accepted',
  rejected: 'Rejected',
  superseded: 'Superseded',
};

const KIND_LABEL: Record<EventSuggestion['kind'], string> = {
  edit: 'Suggested fix',
  delete: 'Suggested removal',
  add: 'Suggested missing event',
};

export default function SuggestionCard({
  suggestion, voterId, canModerate, playerName, teamName, onVote, onAccept, onReject, onRemove, onSeek, compact,
}: SuggestionCardProps) {
  const ctx = { playerName, teamName };
  const isOpen = suggestion.status === 'open';
  const isOwn = suggestion.authorId === voterId;
  const patchKeys = Object.keys(suggestion.patch) as (keyof SuggestablePatch)[];

  return (
    <div className={cn(
      'rounded-lg border p-3 space-y-2',
      isOpen ? 'bg-amber-50/60 border-amber-200' : 'bg-gray-50 border-gray-200 opacity-80',
    )}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
            suggestion.kind === 'delete' ? 'bg-red-100 text-red-700' : suggestion.kind === 'add' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700',
          )}>
            {KIND_LABEL[suggestion.kind]}
          </span>
          {!isOpen && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{STATUS_LABEL[suggestion.status]}</span>
          )}
        </div>
        {onSeek && (
          <button onClick={onSeek} className="text-[10px] font-mono bg-gray-100 hover:bg-red-600 hover:text-white px-2 py-1 rounded transition-colors">
            <PlayCircle className="w-3 h-3 inline -mt-0.5 mr-1" />Seek
          </button>
        )}
      </div>

      {!compact && suggestion.kind !== 'delete' && patchKeys.length > 0 && (
        <div className="space-y-1">
          {patchKeys.map(key => (
            <div key={key} className="text-xs flex items-center gap-1.5 flex-wrap">
              <span className="text-gray-400 font-medium w-16 shrink-0">{fieldLabel(key)}</span>
              {suggestion.kind !== 'add' && (
                <>
                  <span className="line-through text-gray-400">{describeFieldValue(key, suggestion.baseline[key], ctx)}</span>
                  <span className="text-gray-300">→</span>
                </>
              )}
              <span className="font-bold text-gray-900">{describeFieldValue(key, suggestion.patch[key], ctx)}</span>
            </div>
          ))}
        </div>
      )}

      {suggestion.reason && (
        <p className="text-xs text-gray-600 bg-white/60 rounded px-2 py-1.5 border border-gray-100">
          Reason: <span className="font-bold">{DELETE_REASON_LABELS[suggestion.reason]}</span>
        </p>
      )}

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <span>{userLabel(suggestion.authorId)}</span>
          <span>·</span>
          <span className={cn('font-bold', suggestion.score > 0 ? 'text-green-600' : suggestion.score < 0 ? 'text-red-500' : 'text-gray-400')}>
            {suggestion.score > 0 ? `+${suggestion.score}` : suggestion.score}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onVote(true)}
            className={cn('p-1 rounded transition-all', suggestion.upvoterIds.includes(voterId) ? 'bg-green-500/20 text-green-600' : 'hover:bg-green-500/20 text-gray-400 hover:text-green-500')}
            title="This fix looks right"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onVote(false)}
            className={cn('p-1 rounded transition-all', suggestion.downvoterIds.includes(voterId) ? 'bg-red-500/20 text-red-600' : 'hover:bg-red-500/20 text-gray-400 hover:text-red-500')}
            title="This fix looks wrong"
          >
            <XCircle className="w-3.5 h-3.5" />
          </button>

          {isOpen && isOwn && !canModerate && onRemove && (
            <button onClick={onRemove} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Withdraw">
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {isOpen && canModerate && onAccept && onReject && (
            <>
              <div className="h-3 w-px bg-gray-200 mx-1" />
              <button onClick={onAccept} className="p-1 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors" title="Accept">
                <ShieldCheck className="w-3.5 h-3.5" />
              </button>
              <button onClick={onReject} className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Reject">
                <ShieldX className="w-3.5 h-3.5" />
              </button>
              {onRemove && (
                <button onClick={onRemove} className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete suggestion (e.g. abusive note)">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
