/**
 * SSE 클라이언트 매니저
 * SSE 클라이언트 연결 관리
 */

import { Response } from 'express';
import { ActiveProcessing } from './sseJobTracker';

export class SSEClientManager {
  /**
   * 처리에 클라이언트 추가
   */
  addClient(processing: ActiveProcessing, client: Response): void {
    processing.clients.add(client);
    console.log(
      `[SSEClientManager] Added client, total clients: ${processing.clients.size}`
    );
  }

  /**
   * 처리에서 클라이언트 제거
   */
  removeClient(processing: ActiveProcessing, client: Response): boolean {
    const deleted = processing.clients.delete(client);
    if (deleted) {
      console.log(
        `[SSEClientManager] Removed client, remaining clients: ${processing.clients.size}`
      );
    }
    return deleted;
  }

  /**
   * 연결된 모든 클라이언트 닫기
   * @returns 닫힌 클라이언트 수
   */
  closeAllClients(processing: ActiveProcessing): number {
    const count = processing.clients.size;
    for (const client of processing.clients) {
      if (!client.writableEnded) {
        client.end();
      }
    }
    processing.clients.clear();
    return count;
  }

  /**
   * 클라이언트 수 가져오기
   */
  getClientCount(processing: ActiveProcessing): number {
    return processing.clients.size;
  }

  /**
   * 연결된 클라이언트가 있는지 확인
   */
  hasClients(processing: ActiveProcessing): boolean {
    return processing.clients.size > 0;
  }
}
