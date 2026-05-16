with open('src/lib/statsComputations.ts', 'r') as f:
    content = f.read()

content = content.replace(
    "  offPlusMinusRatio: number;",
    "  offPlus: number;\n  offMinus: number;\n  offPlusMinus: number;\n  onOffDt: number;\n  offPlusMinusRatio: number;"
)

with open('src/lib/statsComputations.ts', 'w') as f:
    f.write(content)

