import React from 'react';
import { Search } from 'lucide-react';

export interface StatsFiltersProps {
  // Common Dropdowns
  seasonId?: string;
  onSeasonChange?: (val: string) => void;
  teamId?: string;
  onTeamChange?: (val: string) => void;
  
  // Game state dropdowns
  bludgerControlMode?: 'all' | 'separate';
  onBludgerControlModeChange?: (val: 'all' | 'separate') => void;
  flagFilter?: 'all' | 'on' | 'off';
  onFlagFilterChange?: (val: 'all' | 'on' | 'off') => void;

  // Quadball specific
  positionFilter?: 'all' | 'chaser' | 'keeper';
  onPositionFilterChange?: (val: 'all' | 'chaser' | 'keeper') => void;
  outlierFilter?: 'include' | 'exclude';
  onOutlierFilterChange?: (val: 'include' | 'exclude') => void;

  // Numeric and String
  search?: string;
  onSearchChange?: (val: string) => void;
  minGames: number;
  onMinGamesChange: (val: number) => void;

  // Options Data
  seasons: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  
  // View identifier to customize options if needed
  viewType: 'quadball' | 'beaters' | 'seekers';
}

const selectBase = 'appearance-none pl-3 pr-7 py-1.5 rounded-lg text-xs font-medium outline-none cursor-pointer transition-all duration-150 bg-white text-gray-700 border border-gray-200 hover:border-gray-300 focus:ring-1 focus:ring-red-500/50 focus:border-red-500/50';

const inputBase = 'rounded-lg text-xs font-medium outline-none transition-all duration-150 bg-white text-gray-700 border border-gray-200 hover:border-gray-300 focus:ring-1 focus:ring-red-500/50 focus:border-red-500/50';

export default function StatsFilters({
  seasonId, onSeasonChange,
  teamId, onTeamChange,
  bludgerControlMode, onBludgerControlModeChange,
  flagFilter, onFlagFilterChange,
  positionFilter, onPositionFilterChange,
  outlierFilter, onOutlierFilterChange,
  search, onSearchChange,
  minGames, onMinGamesChange,
  seasons, teams,
  viewType
}: StatsFiltersProps) {

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative">
        <select value={seasonId} onChange={e => onSeasonChange?.(e.target.value)}
          className={selectBase}
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center' }}>
          <option value="">All Seasons</option>
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      
      <div className="relative">
        <select value={teamId} onChange={e => onTeamChange?.(e.target.value)}
          className={selectBase}
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center' }}>
          <option value="">All Teams</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {viewType === 'quadball' && onPositionFilterChange && (
        <div className="relative">
          <select value={positionFilter} onChange={e => onPositionFilterChange(e.target.value as any)}
            className={selectBase}
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center' }}>
            <option value="all">All Positions</option>
            <option value="chaser">Chaser Only</option>
            <option value="keeper">Keeper Only</option>
          </select>
        </div>
      )}

      {onBludgerControlModeChange && (
        <div className="relative">
          <select value={bludgerControlMode} onChange={e => onBludgerControlModeChange(e.target.value as any)}
            className={selectBase}
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center' }}>
            <option value="all">All Bludger Control</option>
            <option value="separate">Separate Control</option>
          </select>
        </div>
      )}

      {onFlagFilterChange && (
        <div className="relative">
          <select value={flagFilter} onChange={e => onFlagFilterChange(e.target.value as any)}
            className={selectBase}
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center' }}>
            <option value="all">Any Flag State</option>
            <option value="off">Off Pitch</option>
            <option value="on">On Pitch</option>
          </select>
        </div>
      )}

      {onOutlierFilterChange && (
        <div className="relative">
          <select value={outlierFilter} onChange={e => onOutlierFilterChange(e.target.value as any)}
            className={selectBase}
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2394a3b8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center' }}>
            <option value="include">Include Outliers</option>
            <option value="exclude">Exclude Outliers</option>
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
  );
}
