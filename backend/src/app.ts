import Fastify, { FastifyRequest, FastifyServerOptions } from "fastify";
import { Config } from "./config";
import fastifyWebsocket from "@fastify/websocket";
import { RoomId, SocketController, SocketId, SocketInfo } from "./socket";
import {
  Codec,
  enumeration,
  exactly,
  Maybe,
  maybe,
  oneOf,
  optional,
  string,
} from "purify-ts";
import { RawData } from "ws";
import { FastifyBaseLogger } from "fastify";
import { parseJSON } from "./utils";
import { GameManager } from "./game";
import { createQuestionService } from "./questions";

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

  const questionService = createQuestionService(logger);
  const gameManager = new GameManager(
    logger,
    updatePlayersWithGameState,
    questionService
  );

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

const answerPayloadCodec = Codec.interface({
  type: exactly(MessageType.SEND_ANSWER),
  questionId: string,
  answerId: string,
});

const startGamePayloadCodec = Codec.interface({
  type: exactly(MessageType.START_GAME),
});

const joinGamePayloadCodec = Codec.interface({
  type: exactly(MessageType.JOIN_GAME),
  name: string,
});

const leaveGamePayloadCodec = Codec.interface({
  type: exactly(MessageType.LEAVE_GAME),
});

const messageCodec = oneOf([
  answerPayloadCodec,
  startGamePayloadCodec,
  joinGamePayloadCodec,
  leaveGamePayloadCodec,
]);

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
            socketController.roomBroadcast(playerInfo.roomId, "Joined game");
            break;
          case MessageType.LEAVE_GAME:
            logger.info("LEAVE_GAME");
            socketController.roomBroadcast(playerInfo.roomId, "Left game");
            break;
          case MessageType.SEND_ANSWER:
            logger.info("SEND_ANSWER");
            gameManager.addAnswerToGame(playerInfo.roomId, playerInfo.id, {
              playerId: playerInfo.id,
              questionId: message.questionId,
              answerId: message.answerId,
            });
            socketController.roomBroadcast(playerInfo.roomId, "Answer sent");
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
