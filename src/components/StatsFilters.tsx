import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Plus, ChevronDown } from 'lucide-react';

export interface StatsFiltersProps {
  // All multi-select chip filters
  leagueDivisions?: string[];
  onLeagueDivisionChange?: (vals: string[]) => void;
  years?: string[];
  onYearChange?: (vals: string[]) => void;
  tournamentIds?: string[];
  onTournamentChange?: (vals: string[]) => void;
  teamIds?: string[];
  onTeamChange?: (vals: string[]) => void;
  
  // Game state dropdowns
  bludgerControlMode?: 'all' | 'separate';
  onBludgerControlModeChange?: (val: 'all' | 'separate') => void;
  flagFilter?: 'all' | 'on' | 'off';
  onFlagFilterChange?: (val: 'all' | 'on' | 'off') => void;

  // Quadball specific
  positionFilter?: 'all' | 'chaser' | 'keeper';
  onPositionFilterChange?: (val: 'all' | 'chaser' | 'keeper') => void;

  // Numeric and String
  search?: string;
  onSearchChange?: (val: string) => void;
  minGames: number;
  onMinGamesChange: (val: number) => void;

  // Options Data
  leagues?: { id: string; name: string; divisions?: string[] }[];
  tournaments?: { id: string; name: string; leagueId?: string; year?: string; division?: string }[];
  availableYears: string[];
  teams: { id: string; name: string; division?: string }[];
  
  // View identifier to customize options if needed
  viewType: 'quadball' | 'beaters' | 'seekers';
}

const selectBase = 'appearance-none pl-3 pr-7 py-1.5 rounded-lg text-xs font-medium outline-none cursor-pointer transition-all duration-150 bg-white text-gray-700 border border-gray-200 hover:border-gray-300 focus:ring-1 focus:ring-red-500/50 focus:border-red-500/50';

const inputBase = 'rounded-lg text-xs font-medium outline-none transition-all duration-150 bg-white text-gray-700 border border-gray-200 hover:border-gray-300 focus:ring-1 focus:ring-red-500/50 focus:border-red-500/50';

// ─── Multi-Select Chip Filter ────────────────────────────────────
function ChipFilter({ 
  label, 
  selectedValues, 
  options, 
  onChange,
  chipColor = 'bg-red-50 text-red-700 border-red-200',
}: { 
  label: string;
  selectedValues: string[];
  options: { value: string; label: string }[];
  onChange: (vals: string[]) => void;
  chipColor?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableOptions = options.filter(o => !selectedValues.includes(o.value));
  const hasSelections = selectedValues.length > 0;

  return (
    <div ref={containerRef} className="relative flex items-center gap-1">
      {/* Selected Chips */}
      {selectedValues.map(val => {
        const opt = options.find(o => o.value === val);
        return (
          <span 
            key={val} 
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all ${chipColor}`}
          >
            {opt?.label || val}
            <button 
              onClick={(e) => { e.stopPropagation(); onChange(selectedValues.filter(v => v !== val)); }}
              className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 transition-colors"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        );
      })}

      {/* Add Button / Label */}
      {availableOptions.length > 0 && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${
            hasSelections
              ? 'border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          {!hasSelections && <span>{label}</span>}
          <Plus className="w-3 h-3" />
        </button>
      )}

      {/* Dropdown */}
      {isOpen && availableOptions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl min-w-[180px] max-h-[240px] overflow-y-auto custom-scrollbar">
          <div className="py-1">
            {availableOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => {
                  onChange([...selectedValues, opt.value]);
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors truncate"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StatsFilters({
  leagueDivisions = [], onLeagueDivisionChange,
  years = [], onYearChange,
  tournamentIds = [], onTournamentChange,
  teamIds = [], onTeamChange,
  bludgerControlMode, onBludgerControlModeChange,
  flagFilter, onFlagFilterChange,
  positionFilter, onPositionFilterChange,
  search, onSearchChange,
  minGames, onMinGamesChange,
  leagues = [], tournaments = [], availableYears, teams,
  viewType
}: StatsFiltersProps) {
  const svgArrow = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`;
  const arrowStyle = { backgroundImage: svgArrow, backgroundRepeat: 'no-repeat' as const, backgroundPosition: 'right 0.5rem center' };

  // Build option lists for multi-select filters
  const leagueOptions: { value: string; label: string }[] = [];
  leagues.forEach(l => {
    if (l.divisions && l.divisions.length > 0) {
      l.divisions.forEach(d => {
        leagueOptions.push({ value: `${l.id}|${d}`, label: `${l.name} (${d})` });
      });
    } else {
      leagueOptions.push({ value: `${l.id}|`, label: l.name });
    }
  });

  const teamOptions = teams.map(t => ({ value: t.id, label: t.name }));
  const yearOptions = availableYears.map(y => ({ value: y, label: y }));
  
  // Tournament label: "<division>? <name> <year>"
  const tournamentOptions = tournaments
    .filter(t => {
      if (leagueDivisions.length > 0) {
        if (!t.leagueId) return false;
        const combo = `${t.leagueId}|${t.division || ''}`;
        if (!leagueDivisions.includes(combo)) return false;
      }
      if (years.length > 0 && t.year && !years.includes(t.year)) return false;
      return true;
    })
    .map(t => {
      const parts: string[] = [];
      if (t.division) parts.push(t.division);
      parts.push(t.name);
      if (t.year) parts.push(t.year);
      return { value: t.id, label: parts.join(' ') };
    });

  return (
    <div className="flex flex-col gap-2">
      {/* Main filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* League — multi-select chips */}
        <ChipFilter
          label="League"
          selectedValues={leagueDivisions}
          options={leagueOptions}
          onChange={vals => onLeagueDivisionChange?.(vals)}
          chipColor="bg-rose-50 text-rose-700 border-rose-200"
        />

        {/* Year — multi-select chips */}
        <ChipFilter
          label="Year"
          selectedValues={years}
          options={yearOptions}
          onChange={vals => onYearChange?.(vals)}
          chipColor="bg-amber-50 text-amber-700 border-amber-200"
        />

        {/* Tournament — multi-select chips */}
        {tournamentOptions.length > 0 && (
          <ChipFilter
            label="Event"
            selectedValues={tournamentIds}
            options={tournamentOptions}
            onChange={vals => onTournamentChange?.(vals)}
            chipColor="bg-emerald-50 text-emerald-700 border-emerald-200"
          />
        )}

        {/* Separator */}
        <div className="h-5 w-px bg-gray-200 mx-0.5" />

        {/* Team — multi-select chips */}
        <ChipFilter
          label="Team"
          selectedValues={teamIds}
          options={teamOptions}
          onChange={vals => onTeamChange?.(vals)}
          chipColor="bg-sky-50 text-sky-700 border-sky-200"
        />

        {/* Separator */}
        <div className="h-5 w-px bg-gray-200 mx-0.5" />

        {/* Mode toggles — stay as simple selects */}
        {viewType === 'quadball' && onPositionFilterChange && (
          <div className="relative">
            <select value={positionFilter} onChange={e => onPositionFilterChange(e.target.value as any)}
              className={selectBase} style={arrowStyle}>
              <option value="all">All Positions</option>
              <option value="chaser">Chaser Only</option>
              <option value="keeper">Keeper Only</option>
            </select>
          </div>
        )}

        {onBludgerControlModeChange && (
          <div className="relative">
            <select value={bludgerControlMode} onChange={e => onBludgerControlModeChange(e.target.value as any)}
              className={selectBase} style={arrowStyle}>
              <option value="all">All Bludger Control</option>
              <option value="separate">Separate Control</option>
            </select>
          </div>
        )}

        {onFlagFilterChange && (
          <div className="relative">
            <select value={flagFilter} onChange={e => onFlagFilterChange(e.target.value as any)}
              className={selectBase} style={arrowStyle}>
              <option value="all">Any Flag State</option>
              <option value="off">Off Pitch</option>
              <option value="on">On Pitch</option>
            </select>
          </div>
        )}

        <div className="flex items-center gap-1 rounded-lg px-3 py-1.5 bg-white border border-gray-200">
          <span className="text-xs text-gray-400 font-medium">Min GP:</span>
          <input type="number" min="0" value={minGames || ''} onChange={e => onMinGamesChange(parseInt(e.target.value) || 0)}
            className={`w-12 p-0.5 bg-transparent border-none text-xs text-gray-700 outline-none`} />
        </div>

        <div className="relative flex-1 min-w-[120px] max-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
          <input type="text" placeholder="Search..." value={search || ''} onChange={e => onSearchChange?.(e.target.value)}
            className={`w-full pl-7 pr-3 py-1.5 ${inputBase}`} />
        </div>
      </div>
    </div>
  );
}
