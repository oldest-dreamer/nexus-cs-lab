/**
 * Local mirror of public.ctf_challenges (supabase_schema.sql).
 * Only SHA-256 hashes of flags live here, so flags aren't greppable from the
 * catalog — they're produced by solving the lab.
 */
export interface Challenge {
  id: string;
  title: string;
  points: number;
  flagHash: string;
}

export const CHALLENGES: Challenge[] = [
  {
    id: 'crackme-l1',
    title: 'Strings Analysis',
    points: 100,
    flagHash: '524ccd9060f82521e9c775eb122eb0f727e83c1bf7d19eb3325ff07b30f2e67b',
  },
  {
    id: 'crackme-l2',
    title: 'Keygen Logic Reversal',
    points: 150,
    flagHash: '5b131d315ae970ae60e16540bebd4b114dcef17070d5404e3bd72ec454c4bbf9',
  },
  {
    id: 'crackme-l3',
    title: 'Binary Patching',
    points: 200,
    flagHash: '6f81a0e24b460f68dd4dae288d0da2f632c40c80d98162f6ebcaed086aeff586',
  },
  // Day 2 — Prompt Security Lab (Red-Team Arena)
  {
    id: 'promptsec-l1',
    title: 'Prompt Injection: Naive Bot',
    points: 100,
    flagHash: '8b94ee2224b7828467a1e7b1b5b96edd787bf9db895fe82a3bf033a6cc697a24',
  },
  {
    id: 'promptsec-l2',
    title: 'Prompt Injection: Keyword Filter Bypass',
    points: 150,
    flagHash: '04c5af3a6b8dac2e2445d5ac364a2188243d2f7cf16dc0d909e42b5bd099904e',
  },
  {
    id: 'promptsec-l3',
    title: 'Prompt Injection: Output Scanner Evasion',
    points: 200,
    flagHash: 'c09843440f61d45125d205330bc0d7ae55b900089208a324f42bfd9775a1536f',
  },
  {
    id: 'promptsec-l4',
    title: 'Prompt Injection: Indirect (RAG) Injection',
    points: 250,
    flagHash: 'bbaad8ce2cbf7e343d127f67af673193158a020632075ef54dfb569634ca51bd',
  },
];

export const challengeById = (id: string) => CHALLENGES.find((c) => c.id === id);
