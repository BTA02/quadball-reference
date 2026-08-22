import React, { useState } from 'react';
import { X, Pencil, Ban, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { EventType, GameEvent, PositionType } from '../App';
import { SuggestablePatch, TYPE_LABELS, POSITION_LABELS, NOTE_MAX_LENGTH } from '../lib/suggestions';

interface TeamLike { id: string; name: string; nickname?: string; }
interface PlayerLike { id: string; firstName: string; lastName: string; }

interface SuggestEditFormProps {
  mode: 'edit' | 'delete' | 'add';
  targetEvent?: GameEvent;
  teams: TeamLike[];
  players: PlayerLike[];
  initialVideoTime?: number;
  onSubmitEdit?: (patch: SuggestablePatch, note?: string) => void;
  onSubmitDelete?: (note: string) => void;
  onSubmitAdd?: (patch: SuggestablePatch & { videoTime: number }, note?: string) => void;
  onCancel: () => void;
}

const EVENT_TYPES = Object.keys(TYPE_LABELS) as EventType[];
const POSITIONS = Object.keys(POSITION_LABELS) as PositionType[];

const inputClass = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-500";
const labelClass = "text-[10px] uppercase font-bold text-gray-400";

export default function SuggestEditForm({ mode, targetEvent, teams, players, initialVideoTime, onSubmitEdit, onSubmitDelete, onSubmitAdd, onCancel }: SuggestEditFormProps) {
  const [type, setType] = useState<EventType | ''>(targetEvent?.type || '');
  const [teamId, setTeamId] = useState(targetEvent?.teamId || '');
  const [playerId, setPlayerId] = useState(targetEvent?.playerId || '');
  const [position, setPosition] = useState<PositionType | ''>(targetEvent?.position || '');
  const [color, setColor] = useState(targetEvent?.color || '');
  const [videoTime, setVideoTime] = useState(String(targetEvent?.videoTime ?? initialVideoTime ?? 0));
  const [note, setNote] = useState('');

  const showColor = type === 'card';
  const showPosition = type === 'sub_in' || type === 'sub_out';
  const title = mode === 'delete' ? 'Suggest removal' : mode === 'add' ? 'Suggest a missing event' : 'Suggest a fix';
  const Icon = mode === 'delete' ? Ban : mode === 'add' ? Plus : Pencil;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'delete') {
      if (!note.trim()) return;
      onSubmitDelete?.(note.trim());
      return;
    }

    const patch: SuggestablePatch = {};
    if (type) patch.type = type;
    patch.videoTime = Number(videoTime) || 0;
    patch.teamId = teamId || null;
    patch.playerId = playerId || null;
    patch.position = showPosition ? (position || null) : null;
    patch.color = showColor ? (color || null) : null;

    if (mode === 'add') {
      if (!type) return;
      onSubmitAdd?.(patch as SuggestablePatch & { videoTime: number }, note.trim() || undefined);
    } else {
      onSubmitEdit?.(patch, note.trim() || undefined);
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
              This removes the event entirely if a moderator accepts it. Say why it's wrong.
            </p>
            <div className="space-y-1">
              <label className={labelClass}>Reason (required)</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value.slice(0, NOTE_MAX_LENGTH))}
                required
                rows={3}
                className={inputClass}
                placeholder="e.g. Wrong player was credited — this was actually a different chaser."
              />
              <p className="text-[10px] text-gray-300 text-right">{note.length}/{NOTE_MAX_LENGTH}</p>
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
                <input type="number" min={0} value={videoTime} onChange={e => setVideoTime(e.target.value)} className={inputClass} />
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
                  {players.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
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

            <div className="space-y-1">
              <label className={labelClass}>Note {mode === 'edit' ? '(optional)' : ''}</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value.slice(0, NOTE_MAX_LENGTH))}
                rows={2}
                className={inputClass}
                placeholder={mode === 'add' ? "What happened, and roughly when?" : "Why is the current version wrong?"}
              />
            </div>
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
