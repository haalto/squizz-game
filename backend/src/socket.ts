import { FastifyBaseLogger } from "fastify";
import { WebSocket } from "ws";

/**
 * This is a simple controller that keeps track of all connected clients.
 */
export class SocketController {
  clients: Map<WebSocket, SocketInfo>;
  logger: FastifyBaseLogger;
  constructor(logger: FastifyBaseLogger) {
    this.clients = new Map();
    this.logger = logger;
  }

  getId = (client: WebSocket) => {
    return this.clients.get(client);
  };

  getClientIds = () => {
    return Array.from(this.clients.values());
  };

  addClient(client: WebSocket, roomId: RoomId) {
    this.logger.info("Client connected");
    const id = Math.round(Math.random() * 100_000).toString();
    this.clients.set(client, { id, roomId });
  }

  removeClient(client: WebSocket) {
    this.logger.info("Client disconnected");
    this.clients.delete(client);
  }

  roomBroadcast(roomId: RoomId, message: string) {
    this.clients.forEach((_, client) => {
      if (client.readyState === WebSocket.OPEN) {
        const socketInfo = this.clients.get(client);
        if (socketInfo && socketInfo.roomId === roomId) {
          client.send(message);
        }
      }
    });
  }

  sendToClient(id: SocketId, message: string) {
    this.clients.forEach((_, client) => {
      if (client.readyState === WebSocket.OPEN) {
        const socketInfo = this.clients.get(client);
        if (socketInfo && socketInfo.id === id) {
          client.send(message);
        }
      }
    });
  }

  broadcast(message: string) {
    this.clients.forEach((_, client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}

export type SocketInfo = {
  id: SocketId;
  roomId: RoomId;
};

export type SocketId = string;
export type RoomId = string;
