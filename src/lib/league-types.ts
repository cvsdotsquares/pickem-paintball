export interface League {
  id: string;
  name: string;
  description: string;
  icon?: string;
  createdBy: string;
  createdAt: any;
  
  settings: {
    isPublic: boolean;
    requiresApproval: boolean;
    isSearchable: boolean;
    seasonSpecific: boolean;
    resetFrequency: 'never' | 'event' | 'season';
  };
  
  admins: string[];
  members: string[];
  memberCount: number;
  maxMembers: number;
  
  pendingRequests: string[];
  inviteCode: string;
  inviteCodeExpiry: any;
  
  isActive: boolean;
}

export interface LeagueInvite {
  id: string;
  leagueId: string;
  invitedBy: string;
  invitedUser: string;
  inviteCode: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: any;
  expiresAt: any;
}

export interface LeagueNotification {
  id: string;
  userId: string;
  type:
    | 'league_invite'
    | 'league_request'
    | 'league_approved'
    | 'league_rejected'
    | 'player_status_changed';
  leagueId?: string;
  leagueName?: string;
  fromUser?: string;
  fromUserName?: string;
  requestUserId?: string;
  message: string;
  read: boolean;
  createdAt: any;
  playerId?: string;
  playerName?: string;
  eventId?: string;
  eventName?: string;
  oldStatus?: string | null;
  newStatus?: string;
}