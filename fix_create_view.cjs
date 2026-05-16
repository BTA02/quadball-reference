const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

code = code.replace(
  `{(['rosters', 'teams'] as const).map(tab => (`,
  `{(['rosters', 'teams', 'players'] as const).map(tab => (`
);

const playersTabUI = `
      ) : activeTab === 'players' ? (
        <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl overflow-hidden flex flex-col max-h-[800px]">
                <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex flex-col gap-3 shrink-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold capitalize">Existing Players</h3>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 font-medium">{players.length} items</span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      placeholder="Search existing players..." 
                      value={playerSearchText}
                      onChange={e => setPlayerSearchText(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 pl-11 focus:border-red-500 outline-none text-sm shadow-sm"
                    />
                    <Search className="w-5 h-5 text-gray-400 absolute left-4 top-3" />
                  </div>
                </div>
                <div className="overflow-y-auto custom-scrollbar flex-1 divide-y divide-gray-100 bg-white">
                  {players
                    .filter((p: any) => !playerSearchText || \`\${p.firstName} \${p.lastName}\`.toLowerCase().includes(playerSearchText.toLowerCase()))
                    .map((p: any) => (
                      <PlayerEditRow
                        key={p.id}
                        player={p}
                        allRosterPlayers={allRosterPlayers}
                        rosters={rosters}
                        teams={teams}
                        seasons={seasons}
                        onEditPlayer={onEditPlayer}
                        onDeletePlayer={onDeletePlayer}
                      />
                    ))
                  }
                  {players.filter((p: any) => !playerSearchText || \`\${p.firstName} \${p.lastName}\`.toLowerCase().includes(playerSearchText.toLowerCase())).length === 0 && (
                    <div className="p-12 text-center text-gray-400 flex flex-col items-center">
                      <User className="w-8 h-8 mb-2 opacity-50" />
                      <p>No matching players found.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 sticky top-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-red-500" />
                  Add New Player
                </h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  const data = new FormData(e.target as HTMLFormElement);
                  const fName = data.get('firstName')?.toString().trim();
                  const lName = data.get('lastName')?.toString().trim();
                  const pName = data.get('preferredName')?.toString().trim();
                  const nName = data.get('nickname')?.toString().trim();
                  if (fName && lName) {
                    await onAddPlayer(fName, lName, pName, nName);
                    (e.target as HTMLFormElement).reset();
                  }
                }} className="space-y-4">
                  <input
                    name="firstName"
                    type="text"
                    placeholder="First Name (Legal/Roster)... *"
                    required
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                  />
                  <input
                    name="lastName"
                    type="text"
                    placeholder="Last Name... *"
                    required
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                  />
                  <div className="pt-2 pb-1 text-xs font-bold text-gray-400 uppercase tracking-wider">Optional Identity Fields</div>
                  <input
                    name="preferredName"
                    type="text"
                    placeholder="Preferred First Name"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                  />
                  <input
                    name="nickname"
                    type="text"
                    placeholder="Nickname"
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-500"
                  />
                  <button
                    type="submit"
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-all shadow-sm hover:shadow-md"
                  >
                    Create Player
                  </button>
                </form>
              </div>
            </div>
        </div>
      ) : null}
`;

code = code.replace(
  `        </div>
      ) : null}`,
  playersTabUI
);

fs.writeFileSync('src/App.tsx', code);
