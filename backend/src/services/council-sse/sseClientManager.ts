/**
 * SSE Client Manager
 * Manages SSE client connections.
 */

import { Response } from 'express';
import { ActiveProcessing } from './sseJobTracker';

export class SSEClientManager {
  /**
   * Add client to processing
   */
  addClient(processing: ActiveProcessing, client: Response): void {
    processing.clients.add(client);
    console.log(
      `[SSEClientManager] Added client, total clients: ${processing.clients.size}`
    );
  }

  /**
   * Remove client from processing
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
   * Close all connected clients
   */
  closeAllClients(processing: ActiveProcessing): void {
    for (const client of processing.clients) {
      if (!client.writableEnded) {
        client.end();
      }
    }
    processing.clients.clear();
  }

  /**
   * Get client count
   */
  getClientCount(processing: ActiveProcessing): number {
    return processing.clients.size;
  }

  /**
   * Check if there are any connected clients
   */
  hasClients(processing: ActiveProcessing): boolean {
    return processing.clients.size > 0;
  }
}
