import React from 'react';
import { Lock } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * The frosted barrier that closes off a Leaders Only table.
 *
 * It sits under the last published row and stands in for everyone below the
 * cut, so the table reads as trimmed rather than as the whole league. The rows
 * behind the frost are placeholder bars, never real stat lines — the hidden
 * players' numbers are cut upstream and never reach the DOM.
 */
export default function LeadersOnlyVeil({
  hiddenCount,
  noun = 'players',
  onShowInfo,
  rows = 5,
  className,
}: {
  hiddenCount: number;
  noun?: string;
  onShowInfo?: () => void;
  rows?: number;
  className?: string;
}) {
  if (hiddenCount <= 0) return null;

  const label = `${hiddenCount.toLocaleString()} more ${hiddenCount === 1 ? noun.replace(/s$/, '') : noun} hidden`;

  return (
    <div className={cn('relative overflow-hidden select-none', className)}>
      {/* Placeholder rows — shape only, no data. */}
      <div aria-hidden="true" className="pointer-events-none">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-2 py-2 border-b border-gray-100"
            // Rows fade as they go down, so the list reads as continuing past the frost.
            style={{ opacity: 1 - i / (rows + 1) }}
          >
            <span className="w-3 h-2 rounded-full bg-gray-300 shrink-0" />
            {/* Deterministic pseudo-random widths so the bars don't look like a grid. */}
            <span className="h-2.5 rounded-full bg-gray-300" style={{ width: `${88 + ((i * 37) % 56)}px` }} />
            <span className="flex-1" />
            {Array.from({ length: 6 }).map((__, j) => (
              <span key={j} className="h-2.5 rounded-full bg-gray-200" style={{ width: `${18 + ((i * 13 + j * 7) % 14)}px` }} />
            ))}
          </div>
        ))}
      </div>

      {/* Frost. Opaque by the bottom so the list reads as fading out, not cropped. */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/25 via-white/75 to-white backdrop-blur-[2.5px]" />

      <div className="absolute inset-0 flex items-center justify-center px-3">
        {onShowInfo ? (
          <button
            type="button"
            onClick={onShowInfo}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 border border-gray-200 shadow-sm text-[11px] font-semibold text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors"
          >
            <Lock className="w-3 h-3" />
            {label} — see Info: Leaders Only
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 border border-gray-200 shadow-sm text-[11px] font-semibold text-gray-500">
            <Lock className="w-3 h-3" />
            {label} — Leaders Only
          </span>
        )}
      </div>
    </div>
  );
}
