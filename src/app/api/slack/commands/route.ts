import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest } from '@/lib/slack';
import {
    startFocusSession,
    endFocusSession,
    getActiveFocusSession,
    parseDuration,
    formatDuration,
    sendBatchSummary,
} from '@/lib/focus';

export async function POST(request: NextRequest) {
    const body = await request.text();
    const signature = request.headers.get('x-slack-signature') || '';
    const timestamp = request.headers.get('x-slack-request-timestamp') || '';

  // Verify request signature
  if (!verifySlackRequest(signature, timestamp, body)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Parse form data
  const params = new URLSearchParams(body);
    const command = params.get('command');
    const text = params.get('text')?.trim() || '';
    const userId = params.get('user_id') || '';
    const userName = params.get('user_name') || '';

  if (command !== '/focus') {
        return NextResponse.json({ error: 'Unknown command' }, { status: 400 });
  }

  // Parse the subcommand
  const [subcommand, ...args] = text.split(/\s+/);

  try {
        switch (subcommand.toLowerCase()) {
          case 'on':
                    return await handleFocusOn(userId, userName, args[0]);

          case 'off':
                    return await handleFocusOff(userId);

          case 'status':
                    return await handleFocusStatus(userId);

          case '':
          case 'help':
                    return handleHelp();

          default:
                    // Try to parse as duration (e.g., "/focus 2h")
            if (parseDuration(subcommand)) {
                        return await handleFocusOn(userId, userName, subcommand);
            }
                    return handleHelp();
        }
  } catch (error) {
        console.error('Command error:', error);
        return NextResponse.json({
                response_type: 'ephemeral',
                text: '❌ Something went wrong. Please try again.',
        });
  }
}

async function handleFocusOn(userId: string, userName: string, duration?: string) {
    // Check for existing session
  const existingSession = await getActiveFocusSession(userId);
    if (existingSession) {
          const remaining = new Date(existingSession.ends_at).getTime() - Date.now();
          return NextResponse.json({
                  response_type: 'ephemeral',
                  text: `⚠️ You already have an active focus session with ${formatDuration(remaining)} remaining.\n\nUse \`/focus off\` to end it early, or \`/focus status\` to check details.`,
          });
    }

  // Parse duration (default: 2 hours)
  const durationStr = duration || '2h';
    const durationMs = parseDuration(durationStr);

  if (!durationMs) {
        return NextResponse.json({
                response_type: 'ephemeral',
                text: `❌ Invalid duration format: "${durationStr}"\n\nUse formats like: \`2h\`, \`30m\`, \`1h30m\``,
        });
  }

  // Limit to 8 hours
  const maxDuration = 8 * 60 * 60 * 1000;
    if (durationMs > maxDuration) {
          return NextResponse.json({
                  response_type: 'ephemeral',
                  text: `⚠️ Maximum focus duration is 8 hours. Try \`/focus on 8h\` instead.`,
          });
    }

  // Start the session
  const session = await startFocusSession(userId, durationMs);

  if (!session) {
        return NextResponse.json({
                response_type: 'ephemeral',
                text: '❌ Failed to start focus session. Please try again.',
        });
  }

  const endTime = new Date(session.ends_at);
    const endTimeStr = endTime.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
    });

  return NextResponse.json({
        response_type: 'ephemeral',
        text: `🎯 *Focus mode activated!*\n\n⏱️ Duration: ${formatDuration(durationMs)}\n🔔 Ends at: ${endTimeStr}\n\n_Non-urgent messages will be held and delivered as a summary when your session ends. Urgent messages will still reach you immediately._\n\nUse \`/focus off\` to end early or \`/focus status\` to check time remaining.`,
  });
}

async function handleFocusOff(userId: string) {
    const session = await getActiveFocusSession(userId);

  if (!session) {
        return NextResponse.json({
                response_type: 'ephemeral',
                text: `ℹ️ You don't have an active focus session.\n\nUse \`/focus on 2h\` to start one.`,
        });
  }

  // End session and get held items
  const heldItems = await endFocusSession(userId);

  // Send batch summary in DM (async, don't wait)
  sendBatchSummary(userId, heldItems).catch(console.error);

  return NextResponse.json({
        response_type: 'ephemeral',
        text: `✅ *Focus session ended!*\n\n${heldItems.length > 0
                                                   ? `📬 You have ${heldItems.length} held message${heldItems.length === 1 ? '' : 's'}. Check your DMs for a summary!`
                                                   : '🎉 No messages were held during your session.'
                                           }`,
  });
}

async function handleFocusStatus(userId: string) {
    const session = await getActiveFocusSession(userId);

  if (!session) {
        return NextResponse.json({
                response_type: 'ephemeral',
                text: `ℹ️ No active focus session.\n\nUse \`/focus on 2h\` to start one.`,
        });
  }

  const remaining = new Date(session.ends_at).getTime() - Date.now();
    const endTimeStr = new Date(session.ends_at).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
    });

  return NextResponse.json({
        response_type: 'ephemeral',
        text: `🎯 *Focus mode active*\n\n⏱️ Time remaining: ${formatDuration(remaining)}\n🔔 Ends at: ${endTimeStr}\n\nUse \`/focus off\` to end early.`,
  });
}

function handleHelp() {
    return NextResponse.json({
          response_type: 'ephemeral',
          text: `*🎯 Bodhi - Focus Mode Commands*\n
          \`/focus on [duration]\` — Start focus mode (default: 2h)
            Examples: \`/focus on 2h\`, \`/focus on 30m\`, \`/focus on 1h30m\`

            \`/focus off\` — End focus mode and receive held messages

            \`/focus status\` — Check time remaining

            \`/focus help\` — Show this help message

            _During focus mode, non-urgent messages are held and delivered as a summary when your session ends. Urgent messages will still reach you immediately._`,
    });
}
