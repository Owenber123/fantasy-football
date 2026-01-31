import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// Members/Draft Order for 2024
const members = [
  'Noah', 'Plourde', 'Elia', 'Tanner', 'Chuck', 'Bloq',
  'Day', 'Bruno', 'Jub', 'Simmons', 'BYung', 'Finnboi'
];

// Draft orders by year
const draftOrders: Record<string, string[]> = {
  '2024': ['Noah', 'Plourde', 'Elia', 'Tanner', 'Chuck', 'Bloq', 'Day', 'Bruno', 'Jub', 'Simmons', 'BYung', 'Finnboi'],
  '2025': [], // To be determined
};

// Punishments - active (available for voting/selection)
const activePunishments = [
  { title: 'Fun Run', description: 'Run an officially timed marathon in less than 6 hrs', year: '2025' },
  { title: '2468', description: 'Miles Run, Pizza Slices, Donuts, Beers, 90min limit', year: '2025' },
  { title: 'Sped on a Ped', description: 'Moped from New York to Boston.', year: '2025' },
  { title: 'SAT', description: 'Take the SAT at official testing center and score a minimum of 1600 - (Games Won * 100)', year: '2025' },
  { title: 'Greyhound', description: 'Winner Picks location within 8hr bus ride radius for loser to go spend the night. Must return on bus as well.', year: '2025' },
  { title: 'McDicks Challenge', description: 'https://x.com/joedeleone/status/1801717931887497609', year: '2025' },
  { title: 'Glizzy Gobbler', description: '70 hotdogs in 7 days. Record each dog consumption with a timestamp.', year: '2025' },
  { title: 'Kennedy', description: 'Get Circumcised', year: '2025' },
  { title: 'Tatted', description: 'Get this tattoo (At least 2.5 inches in diameter) anywhere on your body.', year: '2025' },
];

// Completed punishments from past years
const completedPunishments = [
  { title: 'Delivery Boy', description: 'Food delivery driver until you make 200$ and then put that 200$ on any 50/50 or higher risk bet.', year: '2024', assignedToName: 'Noah', completed: true },
  { title: 'Fuck Off', description: 'Leave the Friend Group and never hang with us again.', year: '2023', assignedToName: 'Slye', completed: true },
  { title: 'Hitched', description: 'Get Married', year: '2022', assignedToName: 'Day', completed: true },
];

// League info
const leagueInfo = {
  name: 'Washed Up Fantasy Football',
  season: '2025',
  draftDate: 'September 3rd',
  draftTime: '8:00 PM',
};

export async function seedDatabase() {
  console.log('Starting database seed...');

  try {
    // 1. Add league info
    console.log('Adding league info...');
    await setDoc(doc(db, 'league', 'info'), leagueInfo);

    // 2. Add draft order for 2024
    console.log('Adding 2024 draft order...');
    for (let i = 0; i < draftOrders['2024'].length; i++) {
      const memberName = draftOrders['2024'][i];
      const pickId = `pick-2024-${i + 1}`;
      await setDoc(doc(db, 'draftOrder', pickId), {
        id: pickId,
        position: i + 1,
        memberId: memberName.toLowerCase(), // placeholder ID
        memberName: memberName,
        year: '2024'
      });
    }

    // 3. Add active punishments for 2025
    console.log('Adding active punishments...');
    for (const punishment of activePunishments) {
      const punishmentRef = doc(collection(db, 'punishments'));
      await setDoc(punishmentRef, {
        ...punishment,
        completed: false,
      });
    }

    // 4. Add completed punishments
    console.log('Adding completed punishments...');
    for (const punishment of completedPunishments) {
      const punishmentRef = doc(collection(db, 'punishments'));
      await setDoc(punishmentRef, punishment);
    }

    console.log('Database seeded successfully!');
    return true;
  } catch (error) {
    console.error('Error seeding database:', error);
    return false;
  }
}

// Export for use
export { members, draftOrders, leagueInfo };
