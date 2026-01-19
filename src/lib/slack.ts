import { WebClient } from '@slack/web-api';
import crypto from 'crypto';

const slackBotToken = process.env.SLACK_BOT_TOKEN!;
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET!;

export const slack = new WebClient(slackBotToken);

// Verify Slack request signature
export function verifySlackRequest(
    signature: string,
    timestamp: string,
    body: string
  ): boolean {
    // Check timestamp to prevent replay attacks (5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
          return false;
    }

  const sigBasestring = `v0:${timestamp}:${body}`;
    const mySignature = 'v0=' + crypto
      .createHmac('sha256', slackSigningSecret)
      .update(sigBasestring)
      .digest('hex');

  return crypto.timingSafeEqual(
        Buffer.from(mySignature),
        Buffer.from(signature)
      );
}

// Send a DM to a user
export async function sendDM(userId: string, text: string, blocks?: unknown[]) {
    try {
          // Open a conversation with the user
      const conversation = await slack.conversations.open({ users: userId });
          if (!conversation.channel?.id) {
                  throw new Error('Could not open DM channel');
          }

      // Send the message
      await slack.chat.postMessage({
              channel: conversation.channel.id,
              text,
              blocks: blocks as never[],
      });
    } catch (error) {
          console.error('Error sending DM:', error);
          throw error;
    }
}

// Get user info
export async function getUserInfo(userId: string) {
    try {
          const result = await slack.users.info({ user: userId });
          return result.user;
    } catch (error) {
          console.error('Error getting user info:', error);
          return null;
    }
}

// Get channel info
export async function getChannelInfo(channelId: string) {
    try {
          const result = await slack.conversations.info({ channel: channelId });
          return result.channel;
    } catch (error) {
          console.error('Error getting channel info:', error);
          return null;
    }
}
