/**
 * @file webhookClient.ts
 * @module infrastructure/webhooks/webhookClient
 *
 * Persists events to the EventQueue table for reliable delivery.
 * Non-blocking — failures are logged but never propagate to the caller.
 */

import logger from '../logging/logger';
import prisma from '../persistence/prismaClient';

export async function dispatchEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await prisma.eventQueue.create({
      data: {
        eventType,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payload: payload as any,
        status: 'pending',
      },
    });
    logger.info({ eventType }, 'Event queued');
  } catch (err) {
    logger.warn({ eventType, error: err instanceof Error ? err.message : err }, 'Event queue insert failed (non-blocking)');
  }
}
