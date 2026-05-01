export interface User {
  id: string;
  name: string;
  phone: string;
  language: 'en' | 'yo' | 'ha' | 'ig' | 'fr';
  created_at: string;
}

export interface Complaint {
  id: string;
  user_id: string;
  issue_type: string;
  description: string;
  video_path: string | null;
  confidence_score: number | null;
  status: 'submitted' | 'reviewing' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface StatusUpdate {
  id: string;
  complaint_id: string;
  status: string;
  message: string | null;
  signed_video_path: string | null;
  created_at: string;
}

export interface CreateComplaintRequest {
  phone: string;
  name: string;
  language: 'en' | 'yo' | 'ha' | 'ig' | 'fr';
  issue_type: string;
  description: string;
  video_base64?: string;
  confidence_score?: number;
}

export interface ComplaintResponse extends Complaint {
  user: User;
  updates: StatusUpdate[];
}
