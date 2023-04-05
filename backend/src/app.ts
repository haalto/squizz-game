import Fastify, { FastifyRequest, FastifyServerOptions } from "fastify";
import { Config } from "./config";
import fastifyWebsocket from "@fastify/websocket";
import { RoomId, SocketController, SocketId, SocketInfo } from "./socket";
import { Codec, enumeration, Maybe, maybe, optional, string } from "purify-ts";
import { RawData } from "ws";
import { FastifyBaseLogger } from "fastify";
import { parseJSON } from "./utils";
import { GameManager } from "./game";

export const app = async (config: Config, opts?: FastifyServerOptions) => {
  const app = Fastify(opts);

  await app.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576,
    },
  });
  const logger = app.log;
  const socketController = new SocketController(logger);

  const updatePlayersWithGameState = (gameId: RoomId, message: string) => {
    socketController.roomBroadcast(gameId, message);
  };

  const gameManager = new GameManager(updatePlayersWithGameState);

  app.get(
    "/game/:id",
    { websocket: true },
    async (connection, req: FastifyRequest<{ Params: { id: string } }>) => {
      const gameId = req.params.id;
      const preparedMessageController =
        messageController(logger)(socketController)(gameManager);
      socketController.addClient(connection.socket, gameId);

      const game = gameManager.hasGame(gameId);
      const socketInfo = socketController.getId(connection.socket);
      const gameAndSocketInfoExists = game && socketInfo;

      if (gameAndSocketInfoExists) {
        const player = { id: socketInfo.id, name: socketInfo.id };
        gameManager.addPlayerToGame(gameId, player);
      } else if (socketInfo) {
        const player = { id: socketInfo.id, name: socketInfo.id };
        gameManager.createNewGame(gameId, [player]);
      }

      connection.socket.on("close", () => {
        const id = socketController.getId(connection.socket);
        if (id) {
          gameManager.removePlayerFromGame(id.roomId, id.id);
        }
        socketController.removeClient(connection.socket);
      });

      connection.socket.on("message", (message) =>
        Maybe.fromNullable(socketController.getId(connection.socket)).map(
          (socketInfo) => preparedMessageController(socketInfo)(message)
        )
      );
    }
  );
  return app;
};

enum MessageType {
  JOIN_GAME = "join-game",
  LEAVE_GAME = "leave-game",
  SEND_ANSWER = "send-answer",
  START_GAME = "start-game",
}

const messageCodec = Codec.interface({
  type: enumeration(MessageType),
  payload: maybe(string),
});

const messageController =
  (logger: FastifyBaseLogger) =>
  (socketController: SocketController) =>
  (gameManager: GameManager) =>
  (playerInfo: SocketInfo) =>
  (message: RawData) => {
    parseJSON(message.toString())
      .chain((json) => messageCodec.decode(json))
      .map((message) => {
        switch (message.type) {
          case MessageType.JOIN_GAME:
            logger.info("JOIN_GAME");
            socketController.roomBroadcast(
              playerInfo.roomId,
              message.payload.mapOrDefault((payload) => payload, "No payload")
            );
            break;
          case MessageType.LEAVE_GAME:
            logger.info("LEAVE_GAME");
            socketController.roomBroadcast(
              playerInfo.roomId,
              message.payload.mapOrDefault((payload) => payload, "No payload")
            );
            break;
          case MessageType.SEND_ANSWER:
            logger.info("SEND_ANSWER");
            socketController.roomBroadcast(
              playerInfo.roomId,
              message.payload.mapOrDefault((payload) => payload, "No payload")
            );
            break;
          case MessageType.START_GAME:
            logger.info("START_GAME");
            gameManager.startGame(playerInfo.roomId);
            break;
        }
      })
      .mapLeft((error) => {
        logger.error(error);
        socketController.sendToClient(
          playerInfo.id,
          JSON.stringify({
            type: "error",
            payload: error,
          })
        );
      });
  };
