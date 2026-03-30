import { getDocs, query, collection, updateDoc, arrayRemove, arrayUnion, doc } from 'firebase/firestore';
import { db } from './lib/firebase';

async function runPatch() {
  console.log('Fetching seasons...');
  const snap = await getDocs(query(collection(db, 'seasons')));
  const aggregatedSnap = await getDocs(query(collection(db, 'aggregated')));
  const aggregatedSeasonsDoc = aggregatedSnap.docs.find(d => d.id === 'seasons');
  const allAgg = aggregatedSeasonsDoc?.data()?.data || [];

  for (const docSnap of snap.docs) {
    const s = { id: docSnap.id, ...docSnap.data() } as any;
    
    // Fix USQ 2026 to 2025
    if (s.name.includes('USQ 2026')) {
      const newName = s.name.replace('2026', '2025');
      const newYear = '2025';
      console.log(`Updating ${s.name} -> ${newName}`);
      await updateDoc(doc(db, 'seasons', s.id), { name: newName, year: newYear });
      
      const oldAggItem = allAgg.find((a: any) => a.id === s.id);
      if (oldAggItem) {
        await updateDoc(doc(db, 'aggregated', 'seasons'), { data: arrayRemove(oldAggItem) });
        await updateDoc(doc(db, 'aggregated', 'seasons'), { data: arrayUnion({ ...oldAggItem, name: newName, year: newYear }) });
      }
    }
    
    // Fix MLQ 2021 Description to "Benepe Cup 1"
    if (s.name.includes('MLQ 2021')) {
      const newDesc = "Benepe Cup 1";
      console.log(`Updating ${s.name} description -> ${newDesc}`);
      await updateDoc(doc(db, 'seasons', s.id), { description: newDesc });
      
      const oldAggItem = allAgg.find((a: any) => a.id === s.id);
      if (oldAggItem) {
        await updateDoc(doc(db, 'aggregated', 'seasons'), { data: arrayRemove(oldAggItem) });
        await updateDoc(doc(db, 'aggregated', 'seasons'), { data: arrayUnion({ ...oldAggItem, description: newDesc }) });
      }
    }
  }
  
  console.log('Done!');
}

runPatch().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
