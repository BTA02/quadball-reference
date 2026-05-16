import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Rename the property names
    content = content.replace("Per100Possessions", "Per25Possessions")
    content = content.replace("per 100", "per 25")
    content = content.replace("per 100 offensive", "per 25 offensive")
    content = content.replace("per 100 defensive", "per 25 defensive")
    content = content.replace("G/100", "G/25")
    content = content.replace("A/100", "A/25")
    content = content.replace("PTS/100", "PTS/25")

    # Now for the specific math updates.
    # Player individual ratings: 
    # const oRtg = teamPoss > 0 ? Math.round((a.plus / teamPoss) * 100 * 10) / 10 : 0;
    # const dRtg = oppPoss > 0 ? Math.round((a.minus / oppPoss) * 100 * 10) / 10 : 0;
    # Team ratings:
    # oRtg: teamPoss > 0 ? Math.round((acc.goals / teamPoss) * 100 * 10) / 10 : 0,
    # dRtg: oppPoss > 0 ? Math.round((acc.goalsAgainst / oppPoss) * 100 * 10) / 10 : 0,
    
    # We can replace `teamPoss) * 100` with `teamPoss) * 25` and `oppPoss) * 100` with `oppPoss) * 25`.
    # Let's check regex for ORTG / DRTG / netRtg
    content = re.sub(r'(\(a\.plus / teamPoss\)) \* 100', r'\1 * 25', content)
    content = re.sub(r'(\(a\.minus / oppPoss\)) \* 100', r'\1 * 25', content)
    content = re.sub(r'(\(acc\.goals / teamPoss\)) \* 100', r'\1 * 25', content)
    content = re.sub(r'(\(acc\.goalsAgainst / oppPoss\)) \* 100', r'\1 * 25', content)
    
    # And for goals/assists/points per possession:
    content = re.sub(r'(\(accum\.goals / accum\.teamPossessions\)) \* 100', r'\1 * 25', content)
    content = re.sub(r'(\(accum\.assists / accum\.teamPossessions\)) \* 100', r'\1 * 25', content)
    content = re.sub(r'(\(points / accum\.teamPossessions\)) \* 100', r'\1 * 25', content)
    
    # What about expected offense eOff / eDef? That's based on 100.
    # "Expected Offense (eOff): Score per possession (100 for goals..."
    # The user didn't mention eOff, but eOff calculates expected points generated.
    # The eOff calculation uses 100 as the value of a goal (since points are multiplied by 10 for some reason? No, goals are 10 points. So 100 is probably per 100 posessions OR 1 goal = 100.
    # Let's leave eOff alone unless it's explicitly mentioned. It's a rate score, wait: "The score per possession...". We'll just leave it.

    with open(filepath, 'w') as f:
        f.write(content)

process_file("src/lib/statsComputations.ts")
process_file("src/components/QuadballStatsView.tsx")

