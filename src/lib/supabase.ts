import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Create untyped client - we'll handle types manually
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Types for our tables
export interface FocusSession {
    id: string;
    user_id: string;
    started_at: string;
    ends_at: string;
    is_active: boolean;
    created_at: string;
}

export interface HeldItem {
    id: string;
    session_id: string;
    channel_id: string;
    channel_name: string;
    sender_id: string;
    sender_name: string;
    message_text: string;
    message_ts: string;
    urgency: 'low' | 'medium' | 'high' | 'urgent';
    classification_reason: string;
    received_at: string;
}

export interface NotificationLog {
    id: string;
    user_id: string;
    channel_id: string;
    sender_id: string;
    message_preview: string;
    urgency: string;
    was_held: boolean;
    created_at: string;
}
