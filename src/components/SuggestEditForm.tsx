import React, { useEffect, useState } from 'react';
import { X, MessageSquarePlus, Ban, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { EventType, GameEvent, PositionType } from '../App';
import { SuggestablePatch, TYPE_LABELS, POSITION_LABELS, DeleteReason, DELETE_REASON_LABELS } from '../lib/suggestions';

interface TeamLike { id: string; name: string; nickname?: string; }
interface PlayerLike { id: string; firstName: string; lastName: string; }

interface SuggestEditFormProps {
  mode: 'edit' | 'delete' | 'add';
  targetEvent?: GameEvent;
  /** Exactly the two teams in this game — a suggestion can't attribute an event to anyone else. */
  homeTeam: TeamLike | null;
  awayTeam: TeamLike | null;
  /** Each team's roster for this game's season/tournament — same scoping the recording panel uses. */
  homePlayers: PlayerLike[];
  awayPlayers: PlayerLike[];
  initialVideoTime?: number;
  onSubmitEdit?: (patch: SuggestablePatch) => void;
  onSubmitDelete?: (reason: DeleteReason) => void;
  onSubmitAdd?: (patch: SuggestablePatch & { videoTime: number }) => void;
  onCancel: () => void;
}

const EVENT_TYPES = Object.keys(TYPE_LABELS) as EventType[];
const POSITIONS = Object.keys(POSITION_LABELS) as PositionType[];
const DELETE_REASONS = Object.keys(DELETE_REASON_LABELS) as DeleteReason[];

const inputClass = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500";
const labelClass = "text-[10px] uppercase font-bold text-gray-400";

export default function SuggestEditForm({ mode, targetEvent, homeTeam, awayTeam, homePlayers, awayPlayers, initialVideoTime, onSubmitEdit, onSubmitDelete, onSubmitAdd, onCancel }: SuggestEditFormProps) {
  const teams = [homeTeam, awayTeam].filter((t): t is TeamLike => !!t);

  const [type, setType] = useState<EventType | ''>(targetEvent?.type || '');
  const [teamId, setTeamId] = useState(targetEvent?.teamId || '');
  const [playerId, setPlayerId] = useState(targetEvent?.playerId || '');
  const [position, setPosition] = useState<PositionType | ''>(targetEvent?.position || '');
  const [color, setColor] = useState(targetEvent?.color || '');
  // Whole seconds only — the video scrubber doesn't offer sub-second precision, so a suggested
  // time shouldn't imply it either. Non-digit characters are stripped as they're typed rather
  // than validated after the fact, so a decimal point never becomes enterable.
  const [videoTime, setVideoTime] = useState(String(Math.round(targetEvent?.videoTime ?? initialVideoTime ?? 0)));
  // No free text anywhere in this form. A delete picks one of a fixed set of reasons; an edit
  // or an add needs no reason field at all — the patch itself is the explanation.
  const [deleteReason, setDeleteReason] = useState<DeleteReason | ''>('');

  // Eligible players are scoped to the selected team's roster; with no team chosen yet, both
  // rosters combined — still limited to people actually in this game, never the full player
  // database.
  const eligiblePlayers: PlayerLike[] =
    teamId === homeTeam?.id ? homePlayers :
    teamId === awayTeam?.id ? awayPlayers :
    [...homePlayers, ...awayPlayers];

  // If switching teams leaves the selected player off the new roster, drop the stale pick
  // instead of silently submitting a player who isn't on the chosen team.
  useEffect(() => {
    if (playerId && !eligiblePlayers.some(p => p.id === playerId)) setPlayerId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const showColor = type === 'card';
  const showPosition = type === 'sub_in' || type === 'sub_out';
  const title = mode === 'delete' ? 'Suggest removal' : mode === 'add' ? 'Suggest a missing event' : 'Suggest a fix';
  const Icon = mode === 'delete' ? Ban : mode === 'add' ? Plus : MessageSquarePlus;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'delete') {
      if (!deleteReason) return;
      onSubmitDelete?.(deleteReason);
      return;
    }

    const patch: SuggestablePatch = {};
    if (type) patch.type = type;
    patch.videoTime = Math.round(Number(videoTime)) || 0;
    patch.teamId = teamId || null;
    patch.playerId = playerId || null;
    patch.position = showPosition ? (position || null) : null;
    patch.color = showColor ? (color || null) : null;

    if (mode === 'add') {
      if (!type) return;
      onSubmitAdd?.(patch as SuggestablePatch & { videoTime: number });
    } else {
      onSubmitEdit?.(patch);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl border border-amber-200 w-full max-w-md p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          </div>
          <button type="button" onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {mode === 'delete' ? (
          <>
            <p className="text-sm text-gray-500">
              This removes the event entirely if a moderator accepts it. Pick the closest reason.
            </p>
            <div className="space-y-1.5">
              <label className={labelClass}>Reason (required)</label>
              {DELETE_REASONS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDeleteReason(r)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg text-sm font-medium border transition-all',
                    deleteReason === r ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:border-gray-400',
                  )}
                >
                  {DELETE_REASON_LABELS[r]}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={labelClass}>Type</label>
                <select value={type} onChange={e => setType(e.target.value as EventType)} required className={inputClass}>
                  <option value="" disabled>Select type</option>
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Time (seconds)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={videoTime}
                  onChange={e => setVideoTime(e.target.value.replace(/[^0-9]/g, ''))}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className={labelClass}>Team</label>
                <select value={teamId} onChange={e => setTeamId(e.target.value)} className={inputClass}>
                  <option value="">—</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.nickname || t.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>Player</label>
                <select value={playerId} onChange={e => setPlayerId(e.target.value)} className={inputClass}>
                  <option value="">—</option>
                  {eligiblePlayers.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                </select>
              </div>
            </div>

            {showPosition && (
              <div className="space-y-1">
                <label className={labelClass}>Position</label>
                <select value={position} onChange={e => setPosition(e.target.value as PositionType)} className={inputClass}>
                  <option value="">—</option>
                  {POSITIONS.map(p => <option key={p} value={p}>{POSITION_LABELS[p]}</option>)}
                </select>
              </div>
            )}

            {showColor && (
              <div className="space-y-1">
                <label className={labelClass}>Card Color</label>
                <div className="flex gap-2">
                  {['blue', 'yellow', 'red'].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg text-xs font-bold capitalize border transition-all',
                        color === c ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400',
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onCancel} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="submit" className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition-colors">
            Submit suggestion
          </button>
        </div>
      </form>
    </div>
  );
}
