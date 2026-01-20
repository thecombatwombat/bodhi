import { supabase, type FocusSession, type HeldItem } from './supabase';
import { sendDM } from './slack';

export function parseDuration(duration: string): number | null {
    const regex = /^(?:(\d+)h)?(?:(\d+)m)?$/;
    const match = duration.toLowerCase().match(regex);
    if (!match || (!match[1] && !match[2])) return null;
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    return (hours * 60 + minutes) * 60 * 1000;
}

export function formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours > 0 && remainingMinutes > 0) return `${hours}h ${remainingMinutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
}

export async function startFocusSession(userId: string, durationMs: number): Promise<FocusSession | null> {
    const now = new Date();
    const endsAt = new Date(now.getTime() + durationMs);
    await endFocusSession(userId);
    const { data, error } = await supabase.from('focus_sessions').insert({
          user_id: userId, started_at: now.toISOString(), ends_at: endsAt.toISOString(), is_active: true,
    }).select().single();
    if (error) { console.error('Error starting focus session:', error); return null; }
    return data;
}

export async function getActiveFocusSession(userId: string): Promise<FocusSession | null> {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('focus_sessions').select('*')
      .eq('user_id', userId).eq('is_active', true).gt('ends_at', now)
      .order('started_at', { ascending: false }).limit(1).single();
    if (error || !data) return null;
    return data;
}

export async function endFocusSession(userId: string): Promise<HeldItem[]> {
    const session = await getActiveFocusSession(userId);
    if (!session) return [];
    await supabase.from('focus_sessions').update({ is_active: false }).eq('id', session.id);
    const { data: heldItems } = await supabase.from('held_items').select('*')
      .eq('session_id', session.id).order('received_at', { ascending: true });
    return heldItems || [];
}

export async function holdMessage(sessionId: string, channelId: string, channelName: string,
                                    senderId: string, senderName: string, messageText: string, messageTs: string,
                                    urgency: string, reason: string): Promise<void> {
    const { error } = await supabase.from('held_items').insert({
          session_id: sessionId, channel_id: channelId, channel_name: channelName,
          sender_id: senderId, sender_name: senderName, message_text: messageText,
          message_ts: messageTs, urgency, classification_reason: reason,
    });
    if (error) console.error('Error holding message:', error);
}

export async function logNotification(userId: string, channelId: string, senderId: string,
                                        messagePreview: string, urgency: string, wasHeld: boolean): Promise<void> {
    const { error } = await supabase.from('notification_log').insert({
          user_id: userId, channel_id: channelId, sender_id: senderId,
          message_preview: messagePreview.substring(0, 100), urgency, was_held: wasHeld,
    });
    if (error) console.error('Error logging notification:', error);
}

function getUrgencyEmoji(urgency: string): string {
    switch (urgency) {
      case 'urgent': return '🔴'; case 'high': return '🟠';
      case 'medium': return '🟡'; default: return '🟢';
    }
}

export async function sendBatchSummary(userId: string, heldItems: HeldItem[]): Promise<void> {
    if (heldItems.length === 0) {
          await sendDM(userId, "🎉 *Focus session complete!*\n\nNo messages were held during your session.");
          return;
    }
    const byChannel: Record<string, HeldItem[]> = {};
    for (const item of heldItems) {
          const key = item.channel_name || item.channel_id;
          if (!byChannel[key]) byChannel[key] = [];
          byChannel[key].push(item);
    }
    const lines: string[] = [`🎉 *Focus session complete!*`, ``, `📬 *${heldItems.length} message${heldItems.length === 1 ? '' : 's'} held:*`, ``];
    for (const [channel, items] of Object.entries(byChannel)) {
          lines.push(`*#${channel}* (${items.length}):`);
          for (const item of items.slice(0, 5)) {
                  const preview = item.message_text.length > 80 ? item.message_text.substring(0, 80) + '...' : item.message_text;
                  lines.push(`  ${getUrgencyEmoji(item.urgency)} *${item.sender_name}*: ${preview}`);
          }
          if (items.length > 5) lines.push(`  _...and ${items.length - 5} more_`);
          lines.push('');
    }
    await sendDM(userId, lines.join('\n'));
}
