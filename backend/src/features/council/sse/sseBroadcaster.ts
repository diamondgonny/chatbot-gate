/**
 * SSE 브로드캐스터
 * 연결된 SSE 클라이언트에 이벤트 브로드캐스트
 */

import type { SSEEvent } from '@shared';
import { ActiveProcessing } from './sseJobTracker';

export class SSEBroadcaster {
  /**
   * 연결된 모든 클라이언트에 이벤트 브로드캐스트
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
