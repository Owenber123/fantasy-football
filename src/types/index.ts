export interface Member {
  id: string;
  name: string;
  email: string;
  isAdmin?: boolean;
}

export interface DraftPick {
  id: string;
  position: number;
  memberId: string;
  memberName: string;
  year: string;
}

export interface Punishment {
  id: string;
  title: string;
  description: string;
  assignedTo?: string;
  assignedToName?: string;
  completed: boolean;
  year: string;
}

export interface LeagueInfo {
  name: string;
  season: string;
  draftDate?: string;
  draftTime?: string;
  commissioner?: string;
}

export interface SeasonData {
  year: string;
  leagueInfo: LeagueInfo;
  draftOrder: DraftPick[];
  punishments: Punishment[];
}
