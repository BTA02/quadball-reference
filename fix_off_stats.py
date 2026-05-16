import re

with open('src/lib/statsComputations.ts', 'r') as f:
    content = f.read()

# Add to interfaces
content = content.replace("  offPlusMinus: number;", "  offPlus: number;\n  offMinus: number;\n  offPlusMinus: number;")

# For aggregatePlayerStats, around line 964
#       offPlusMinusRatio: ...
#       offPlusMinus,
# Add offPlus, offMinus,
content = content.replace("      offPlusMinusRatio: offMinus > 0", "      offPlus,\n      offMinus,\n      offPlusMinusRatio: offMinus > 0")

# For computeExtendedStats, mapping a to the final object:
#       offPlusMinusRatio: a.offPlusMinusRatio,
#       offPlusMinus: a.offPlusMinus,
# Add offPlus: a.offPlus, offMinus: a.offMinus,
content = content.replace("      offPlusMinusRatio: a.offPlusMinusRatio,", "      offPlus: a.offPlus,\n      offMinus: a.offMinus,\n      offPlusMinusRatio: a.offPlusMinusRatio,")

# For getPlayerLineups / computeLineupStats
#       offPlusMinusRatio,
#       offPlusMinus,
# Replace offPlusMinusRatio, with offPlus,\n      offMinus,\n      offPlusMinusRatio,
content = content.replace("      offPlusMinusRatio,\n      offPlusMinus,", "      offPlus,\n      offMinus,\n      offPlusMinusRatio,\n      offPlusMinus,")


with open('src/lib/statsComputations.ts', 'w') as f:
    f.write(content)
