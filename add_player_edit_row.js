const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

const playerEditRowStr = `
function PlayerEditRow({
  player: p,
  allRosterPlayers,
  rosters,
  teams,
  seasons,
  onEditPlayer,
  onDeletePlayer
}: {
  player: any;
  allRosterPlayers: any[];
  rosters: any[];
  teams: any[];
  seasons: any[];
  onEditPlayer: (id: string, f: string, l: string) => void;
  onDeletePlayer: (id: string) => void;
}) {
  const [firstName, setFirstName] = useState(p.firstName || '');
  const [lastName, setLastName] = useState(p.lastName || '');
  const [saving, setSaving] = useState(false);

  const hasChanges = firstName !== (p.firstName || '') || lastName !== (p.lastName || '');

  const pRosters = allRosterPlayers.filter((rp: any) => rp.playerId === p.id);

  return (
    <div className="p-4 flex flex-col gap-3 hover:bg-gray-50/50 transition-colors group border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between border-b border-gray-200/50 pb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] bg-gray-100 px-2 py-1 rounded border border-gray-200 text-gray-600">ID: {p.id}</span>
          <span className="font-bold text-sm text-gray-900">{p.firstName} {p.lastName}</span>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button 
              onClick={async () => {
                setSaving(true);
                await onEditPlayer(p.id, firstName, lastName);
                setSaving(false);
              }} 
              disabled={saving} 
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-all shadow-sm flex items-center gap-1.5 text-[10px] uppercase font-bold disabled:opacity-50"
            >
              <CheckCircle2 className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
            </button>
          )}
          <button 
            onClick={() => { if (confirm(\`Delete player \${p.firstName} \${p.lastName}?\`)) onDeletePlayer(p.id); }} 
            className="px-2 py-1 bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-500 hover:bg-red-50 rounded-md transition-all shadow-sm flex items-center gap-1 text-[10px] uppercase font-bold"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400">First Name</label>
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500 font-medium", firstName !== (p.firstName || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-gray-400">Last Name</label>
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className={cn("bg-white border rounded p-1.5 text-xs outline-none focus:border-red-500 font-medium", lastName !== (p.lastName || '') ? 'border-amber-400 bg-amber-50/30' : 'border-gray-200')} />
        </div>
      </div>

      {pRosters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {pRosters.map((rp: any) => {
            const r = rosters.find((ro: any) => ro.id === rp.rosterId);
            const t = teams.find((tm: any) => tm.id === r?.teamId);
            const s = seasons.find((se: any) => se.id === r?.seasonId);
            if (!t || !s) return null;
            return (
              <span key={rp.rosterId} className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200 font-medium">
                {t.name} ({s.name})
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UnifiedRosterEditor({`;

code = code.replace("function UnifiedRosterEditor({", playerEditRowStr);
fs.writeFileSync('src/App.tsx', code);
