import re

with open('src/lib/statsComputations.ts', 'r') as f:
    content = f.read()

# Replace:
#       plusMinusRatio,
#       offPlusMinusRatio,
#       relPlusMinusRatio,
#       offPlusMinus,
# With:
#       offPlus,
#       offMinus,
#       plusMinusRatio,
#       offPlusMinusRatio,
#       relPlusMinusRatio,
#       offPlusMinus,
content = re.sub(
    r'(\s+)(plusMinusRatio,\n\s+offPlusMinusRatio,\n\s+relPlusMinusRatio,\n\s+offPlusMinus,)',
    r'\1offPlus,\n\1offMinus,\n\1\2',
    content
)

with open('src/lib/statsComputations.ts', 'w') as f:
    f.write(content)
