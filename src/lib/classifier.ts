import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'urgent';

export interface ClassificationResult {
    urgency: UrgencyLevel;
    reason: string;
    shouldInterrupt: boolean;
}

const CLASSIFICATION_PROMPT = `You are an AI assistant helping to classify the urgency of Slack messages for a knowledge worker in focus mode.

Classify the following message into one of these urgency levels:
- URGENT: Requires immediate attention. Examples: production outages, security incidents, time-sensitive deadlines within the hour, direct emergencies
- HIGH: Important but can wait 30-60 minutes. Examples: blocking issues for teammates, important client requests, meeting reminders
- MEDIUM: Should be addressed within 2-4 hours. Examples: code review requests, non-blocking questions, project updates
- LOW: Can wait until focus session ends. Examples: general announcements, social messages, non-urgent FYIs, newsletters

Consider these factors:
1. Keywords suggesting urgency (urgent, ASAP, emergency, down, broken, deadline)
2. The sender's apparent intent
3. Whether it seems to require immediate action vs. information sharing
4. Time-sensitive language

Message context:
- Channel: {channel_name}
- Sender: {sender_name}
- Message: {message_text}

Respond in this exact JSON format:
{
  "urgency": "low" | "medium" | "high" | "urgent",
    "reason": "Brief explanation of why this urgency level",
      "shouldInterrupt": true | false
      }

      Only shouldInterrupt should be true for URGENT messages. Respond with only the JSON, no other text.`;

export async function classifyMessage(
    messageText: string,
    channelName: string,
    senderName: string
  ): Promise<ClassificationResult> {
    const urgentKeywords = ['urgent', 'emergency', 'asap', 'down', 'outage', 'critical', 'immediately', '911', 'help now'];
    const lowerMessage = messageText.toLowerCase();
    const hasUrgentKeyword = urgentKeywords.some(keyword => lowerMessage.includes(keyword));

  if (!process.env.ANTHROPIC_API_KEY) {
        console.log('No Anthropic API key, using keyword-based classification');
        if (hasUrgentKeyword) {
                return { urgency: 'urgent', reason: 'Contains urgent keywords', shouldInterrupt: true };
        }
        return { urgency: 'low', reason: 'Default classification (no AI key configured)', shouldInterrupt: false };
  }

  try {
        const prompt = CLASSIFICATION_PROMPT
          .replace('{channel_name}', channelName)
          .replace('{sender_name}', senderName)
          .replace('{message_text}', messageText);

      const response = await anthropic.messages.create({
              model: 'claude-3-5-haiku-20241022',
              max_tokens: 256,
              messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
        if (content.type !== 'text') throw new Error('Unexpected response type');
        const result = JSON.parse(content.text) as ClassificationResult;
        result.shouldInterrupt = result.urgency === 'urgent';
        return result;
  } catch (error) {
        console.error('Classification error:', error);
        if (hasUrgentKeyword) {
                return { urgency: 'urgent', reason: 'Contains urgent keywords (AI classification failed)', shouldInterrupt: true };
        }
        return { urgency: 'medium', reason: 'Default classification (AI classification failed)', shouldInterrupt: false };
  }
}
