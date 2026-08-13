import React from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
export { cn };

export type SortDir = 'asc' | 'desc';

export function sortBy<T>(arr: T[], key: any, dir: SortDir): T[] {
  return [...arr].sort((a: any, b: any) => {
    let targetA = a;
    let targetB = b;
    let k = String(key);
    
    if (k.endsWith(':with')) {
      k = k.replace(':with', '');
      targetA = a._with || {};
      targetB = b._with || {};
    } else if (k.endsWith(':without')) {
      k = k.replace(':without', '');
      targetA = a._without || {};
      targetB = b._without || {};
    }

    const va = targetA[k] ?? 0;
    const vb = targetB[k] ?? 0;

    const aInd = va === 'N/A' || va === '∞' || va === Infinity || (typeof va === 'number' && isNaN(va)) || va === 'NaN';
    const bInd = vb === 'N/A' || vb === '∞' || vb === Infinity || (typeof vb === 'number' && isNaN(vb)) || vb === 'NaN';
    if (aInd && !bInd) return 1;
    if (!aInd && bInd) return -1;
    if (aInd && bInd) return 0;
    
    // Numeric sorting fallback if both values are numbers or successfully parse to numbers (and isn't empty string)
    if (
      (typeof va === 'number' || typeof va === 'string') &&
      (typeof vb === 'number' || typeof vb === 'string') &&
      va !== '' && vb !== '' &&
      !isNaN(Number(va)) && !isNaN(Number(vb))
    ) {
      const numA = Number(va);
      const numB = Number(vb);
      return dir === 'asc' ? numA - numB : numB - numA;
    }
    
    return dir === 'asc' 
      ? String(va).localeCompare(String(vb)) 
      : String(vb).localeCompare(String(va));
  });
}

export function SortHeader({ label, sortKey, currentSort, currentDir, onSort, tooltip, colorClass = 'text-red-600', className }: {
  label: string; sortKey: string; currentSort: string; currentDir: SortDir;
  onSort: (k: string) => void; tooltip?: string; colorClass?: string; className?: string;
}) {
  const active = currentSort === sortKey;
  return (
    <th className={cn('px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap text-center',
        active ? colorClass : 'text-slate-600 hover:text-slate-900', className)}
      onClick={() => onSort(sortKey)} title={tooltip}>
      <span className="inline-flex items-center justify-center gap-0.5 w-full">
        {label}
        {active && (currentDir === 'asc'
          ? <ChevronUp className="w-3 h-3" />
          : <ChevronDown className="w-3 h-3" />)}
      </span>
    </th>
  );
}

export function Cell({ value, highlight, bold, align = 'center', className }: { value: string | number; highlight?: 'pos' | 'neg' | 'gold'; bold?: boolean, align?: 'left'|'center'|'right', className?: string }) {
  let colorClass = 'text-slate-800';
  if (highlight === 'pos') colorClass = 'text-green-700';
  else if (highlight === 'neg') colorClass = 'text-red-700';
  else if (highlight === 'gold') colorClass = 'text-amber-600';

  return (
      <td className={cn('px-2 py-1.5 text-xs tabular-nums font-mono', colorClass,
        align === 'center' ? 'text-center' : align === 'left' ? 'text-left' : 'text-right',
        bold && 'font-bold', className
    )}>
      {typeof value === 'number' && value === Infinity ? '∞' : value}
    </td>
  );
}

export function SplitHeader({ label, sortKey, currentSort, currentDir, onSort, tooltip, colorClass = 'text-red-600', bgActiveMain = 'bg-red-50/20', bgActiveSub = 'bg-red-50/40', textActiveSub = 'text-red-700', className }: {
  label: string; sortKey: string; currentSort: string; currentDir: SortDir;
  onSort: (k: string) => void; tooltip?: string; colorClass?: string; bgActiveMain?: string; bgActiveSub?: string; textActiveSub?: string; className?: string;
}) {
  const activeMain = currentSort === sortKey;
  const activeWith = currentSort === `${sortKey}:with`;
  const activeWithout = currentSort === `${sortKey}:without`;

  return (
    <th className={cn('p-0 border-r border-gray-100 align-bottom min-w-[90px]', className)}>
      <div className={cn('px-2 py-1 text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none text-center border-b border-gray-100 transition-colors', activeMain ? `${colorClass} ${bgActiveMain}` : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50')} onClick={() => onSort(sortKey)} title={tooltip}>
        <span className="inline-flex flex-col items-center justify-center w-full">
          <span className="inline-flex items-center gap-0.5">
            {label}
            {activeMain && (currentDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
          </span>
        </span>
      </div>
      <div className="flex text-[9px] uppercase tracking-wider font-semibold cursor-pointer">
        <div className={cn('w-1/2 flex justify-center items-center py-0.5 border-r border-gray-100/50 transition-colors', activeWith ? `${textActiveSub} ${bgActiveSub}` : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50')} onClick={() => onSort(`${sortKey}:with`)}>
          With {activeWith && (currentDir === 'asc' ? '↑' : '↓')}
        </div>
        <div className={cn('w-1/2 flex justify-center items-center py-0.5 transition-colors bg-slate-50/50', activeWithout ? `${textActiveSub} ${bgActiveSub}` : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100')} onClick={() => onSort(`${sortKey}:without`)}>
          W/O {activeWithout && (currentDir === 'asc' ? '↑' : '↓')}
        </div>
      </div>
    </th>
  );
}

export function SplitCell({ valWith, valWithout, bold, className }: { valWith: string | number, valWithout: string | number, bold?: boolean, className?: string }) {
  return (
    <td className={cn('p-0 border-r border-gray-100', className)}>
      <div className="flex h-full min-h-[30px]">
        <div className="w-1/2 px-1 py-1.5 flex items-center justify-center text-xs tabular-nums font-mono text-slate-800 bg-white border-r border-gray-100/50">
          <span className={bold ? 'font-bold' : ''}>{typeof valWith === 'number' && valWith === Infinity ? '∞' : valWith}</span>
        </div>
        <div className="w-1/2 px-1 py-1.5 flex items-center justify-center text-xs tabular-nums font-mono text-slate-800 bg-slate-50">
          <span className={bold ? 'font-bold' : ''}>{typeof valWithout === 'number' && valWithout === Infinity ? '∞' : valWithout}</span>
        </div>
      </div>
    </td>
  );
}

export function StatsPaginationFooter({
  itemCount,
  itemName = 'items',
  legend,
  page,
  totalPages,
  setPage
}: {
  itemCount: number;
  itemName?: string;
  legend?: React.ReactNode;
  page: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 px-1">
      <span>{itemCount} {itemName}{legend ? <>&nbsp;&bull;&nbsp;{legend}</> : ''}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
          className="p-1 rounded disabled:opacity-30 hover:bg-gray-100"><ChevronLeft className="w-3 h-3" /></button>
        <span className="px-2 font-mono">{page}/{totalPages}</span>
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
          className="p-1 rounded disabled:opacity-30 hover:bg-gray-100"><ChevronRight className="w-3 h-3" /></button>
      </div>
    </div>
  );
}

export function StatsTabButton({
  active,
  onClick,
  label,
  activeClass = 'bg-red-600 text-white',
  inactiveClass = 'bg-white text-gray-500 hover:bg-gray-50',
  isFirst = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  activeClass?: string;
  inactiveClass?: string;
  isFirst?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1 font-medium transition-colors',
        active ? activeClass : inactiveClass,
        !isFirst && 'border-l border-gray-200'
      )}
    >
      {label}
    </button>
  );
}

export function StatsTabSelector({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex border border-gray-200 rounded-md overflow-hidden text-xs">
      {children}
    </div>
  );
}
