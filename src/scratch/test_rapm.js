// Mock data
const possessions = [];
for (let i = 0; i < 1000; i++) {
  const isGoodA = Math.random() < 0.5;
  const isGoodB = Math.random() < 0.5;
  const A = isGoodA ? ['good1', 'avg1'] : ['bad1', 'avg2'];
  const B = isGoodB ? ['good2', 'avg3'] : ['bad2', 'avg4'];
  
  // good players add 20% to score chance
  let prob = 0.4 + (isGoodA ? 0.2 : -0.2) - (isGoodB ? 0.2 : -0.2);
  const pts = Math.random() < prob ? 100 : 0;
  possessions.push({ offense: A, defense: B, pts });
}

let intercept = 40;
const rapm = {};
const init = (p) => { if (rapm[p] === undefined) rapm[p] = 0; };

const lr = 0.001;
const lambda = 0.01;

for (let epoch = 0; epoch < 100; epoch++) {
  for (const poss of possessions) {
    poss.offense.forEach(init);
    poss.defense.forEach(init);
    
    let pred = intercept;
    for (const p of poss.offense) pred += rapm[p];
    for (const p of poss.defense) pred -= rapm[p];
    
    const err = pred - poss.pts;
    intercept -= lr * err;
    
    for (const p of poss.offense) {
      rapm[p] -= lr * (err + lambda * rapm[p]);
    }
    for (const p of poss.defense) {
      rapm[p] -= lr * (-err + lambda * rapm[p]);
    }
  }
}

console.log('Intercept:', intercept);
console.log('RAPM:', rapm);
