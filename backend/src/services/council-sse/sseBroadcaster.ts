/**
 * SSE Broadcaster
 * Broadcasts events to connected SSE clients.
 */

import { SSEEvent } from '../../types/council';
import { ActiveProcessing } from './sseJobTracker';

export class SSEBroadcaster {
  /**
   * Broadcast event to all connected clients
   */
  broadcast(processing: ActiveProcessing, event: SSEEvent): void {
    const eventData = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of processing.clients) {
      if (!client.writableEnded) {
        client.write(eventData);
      }
    }
  }
}
