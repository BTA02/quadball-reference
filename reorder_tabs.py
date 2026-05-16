with open('src/App.tsx', 'r') as f:
    content = f.read()

panel_start_marker = '<div className={cn("flex-1 overflow-hidden relative", isExpandedLayout ? "grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-gray-200" : "")}>'
panel_start_idx = content.find(panel_start_marker)
if panel_start_idx == -1:
    print("Could not find panel container")
    exit(1)

panel_end_marker = '<div className="px-3 py-2 bg-white border-t border-gray-200 shrink-0">'
panel_end_idx = content.find(panel_end_marker, panel_start_idx)
panel_end_idx = content.rfind('</div>', panel_start_idx, panel_end_idx)

panel_content = content[panel_start_idx + len(panel_start_marker):panel_end_idx]

# Find indices
record_start = panel_content.find('<div className={cn(isExpandedLayout ? "flex flex-col h-full relative" : "absolute inset-0", (rightPanelTab === \'record\'')
if record_start == -1:
    # Try finding the comment
    record_start = panel_content.find('{/* RECORD TAB */}')

rosters_start = panel_content.find('<div className={cn(isExpandedLayout ? "flex flex-col h-full relative" : "absolute inset-0", (rightPanelTab === \'rosters\'')
events_start = panel_content.find('<div className={cn(isExpandedLayout ? "flex flex-col h-full relative" : "absolute inset-0", (rightPanelTab === \'live_events\'')
momentum_start = panel_content.find('<div className={cn(isExpandedLayout ? "flex flex-col h-full relative" : "absolute inset-0", (rightPanelTab === \'momentum\'')

if -1 in [record_start, rosters_start, events_start, momentum_start]:
    print(f"Could not find all panels: {record_start}, {rosters_start}, {events_start}, {momentum_start}")
    exit(1)

indices = sorted([(record_start, 'record'), (rosters_start, 'rosters'), (events_start, 'events'), (momentum_start, 'momentum')])

blocks = {}
for i, (start_idx, name) in enumerate(indices):
    end_idx = indices[i+1][0] if i + 1 < len(indices) else len(panel_content)
    blocks[name] = panel_content[start_idx:end_idx]

new_panel_content = "\n\n" + blocks['events'] + blocks['record'] + blocks['rosters'] + blocks['momentum']
new_content = content[:panel_start_idx + len(panel_start_marker)] + new_panel_content + content[panel_end_idx:]

with open('src/App.tsx', 'w') as f:
    f.write(new_content)
print("Success")
