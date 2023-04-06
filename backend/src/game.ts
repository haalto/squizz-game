import { FastifyBaseLogger } from "fastify";
import { QuestionService } from "./questions";

type Player = {
  id: string;
  name: string;
};

enum GameStatus {
  WAITING_TO_START = "WAITING_TO_START",
  PLAYING = "PLAYING",
  WAITING_BETWEEN_ROUNDS = "WAITING_BETWEEN_ROUNDS",
  FINISHED = "FINISHED",
}

type GameState = {
  players: Player[];
  gameStatus: GameStatus;
  currentRound: number;
  totalRounds: number;
  answers: PlayerAnswer[];
  questions: Question[];
  timerDuringRound: number;
  timerBetweenRounds: number;
};

export type Question = {
  id: string;
  question: string;
  answers: Answer[];
  correctAnswer: Answer;
};

type PlayerAnswer = {
  playerId: string;
  questionId: string;
  answerId: string;
};

export type Answer = {
  id: string;
  questionId: string;
  answer: string;
};

type GameId = string;

type PlayerId = string;

export class Game {
  private TIME_BETWEEN_ROUNDS = 5000;
  private TIME_DURING_ROUND = 10000;
  id: string;
  state: GameState;

  constructor(id: string, state: GameState) {
    this.id = id;
    this.state = state;
  }

  static create = (id: string, state: GameState) => {
    return new Game(id, state);
  };

  static fromState = (id: GameId, state: GameState) => {
    return new Game(id, state);
  };

  private static getNewGameState = (players: Player[]): GameState => {
    return {
      players,
      gameStatus: GameStatus.WAITING_TO_START,
      currentRound: 0,
      totalRounds: 3,
      answers: [],
      questions: [],
      timerDuringRound: 0,
      timerBetweenRounds: 0,
    };
  };

  static createGame = (id: GameId, players: Player[]) => {
    const state = this.getNewGameState(players);
    const game = this.fromState(id, state);
    return game;
  };

  private finishGame = () => {
    const { state } = this;
    const updatedState = {
      ...state,
      gameStatus: GameStatus.FINISHED,
    };
    return (this.state = updatedState);
  };

  private checkIfTimerDuringRoundHasFinished = () => {
    const { timerDuringRound } = this.state;
    const timeSinceTimerStarted = Date.now() - timerDuringRound;
    return timeSinceTimerStarted > this.TIME_DURING_ROUND;
  };

  private checkIfTimerBetweenRoundsHasFinished = () => {
    const { timerBetweenRounds } = this.state;
    const timeSinceTimerStarted = Date.now() - timerBetweenRounds;
    return timeSinceTimerStarted > this.TIME_BETWEEN_ROUNDS;
  };

  private checkIfNextRoundShouldStart = () => {
    const { state } = this;
    const { gameStatus } = state;
    const timerHasFinished = this.checkIfTimerBetweenRoundsHasFinished();
    if (gameStatus === GameStatus.WAITING_BETWEEN_ROUNDS && timerHasFinished) {
      this.startNextRound();
    }
    return this.state;
  };

  private checkIfRoundHasFinished = () => {
    const { state } = this;
    const { gameStatus } = state;
    const timerHasFinished = this.checkIfTimerDuringRoundHasFinished();
    if (gameStatus === GameStatus.PLAYING && timerHasFinished) {
      this.finishRound();
    }
    return this.state;
  };

  private finishRound = () => {
    const { state } = this;
    const { currentRound, totalRounds } = state;
    const updatedState = {
      ...state,
      gameStatus: GameStatus.WAITING_BETWEEN_ROUNDS,
    };
    this.state = updatedState;

    if (currentRound === totalRounds) {
      this.finishGame();
    }

    this.state.timerBetweenRounds = Date.now();
    return this.state;
  };

  private startNextRound = () => {
    const { state } = this;
    const { currentRound } = state;
    this.state.timerDuringRound = Date.now();
    const updatedState = {
      ...state,
      currentRound: currentRound + 1,
      gameStatus: GameStatus.PLAYING,
    };
    this.state = updatedState;
    return this.state;
  };

  getState = () => {
    return this.state;
  };

  startGame = (questions: Question[]) => {
    const { state } = this;
    const updatedState = {
      ...state,
      currentRound: 1,
      questions,
      totalRounds: questions.length,
      gameStatus: GameStatus.PLAYING,
    };
    this.state = updatedState;
    return this.state;
  };

  runGameUpdateJob = () => {
    const { state } = this;
    const { gameStatus } = state;

    switch (gameStatus) {
      case GameStatus.WAITING_TO_START:
        return this.state;
      case GameStatus.PLAYING:
        return this.checkIfRoundHasFinished();
      case GameStatus.WAITING_BETWEEN_ROUNDS:
        return this.checkIfNextRoundShouldStart();
      case GameStatus.FINISHED:
        return this.finishGame();

      default:
        return this.state;
    }
  };

  isGameFinished = () => {
    const { state } = this;
    const { gameStatus } = state;
    return gameStatus === GameStatus.FINISHED;
  };

  addPlayer = (player: Player) => {
    const { state } = this;
    const { players } = state;
    const updatedState = {
      ...state,
      players: [...players, player],
    };
    this.state = updatedState;
  };

  removePlayer = (player: Player) => {
    const { state } = this;
    const { players } = state;
    const updatedState = {
      ...state,
      players: players.filter((p) => p.id !== player.id),
    };
    this.state = updatedState;
  };

  removePlayerById = (playerId: PlayerId) => {
    const { state } = this;
    const { players } = state;
    const updatedState = {
      ...state,
      players: players.filter((p) => p.id !== playerId),
    };
    this.state = updatedState;
  };

  numberOfPlayers = () => {
    const { state } = this;
    const { players } = state;
    return players.length;
  };

  addAnswer = (playerId: PlayerId, answer: PlayerAnswer) => {
    const { state } = this;
    const { players } = state;
    const player = players.find((p) => p.id === playerId);

    if (player) {
      const updatedState = {
        ...state,
        answers: state.answers.concat(answer),
      };
      this.state = updatedState;
    }
  };
}

export class GameManager {
  games: Map<string, Game> = new Map();
  callback: (gameId: GameId, message: string) => void;
  questionService: QuestionService;
  logger: FastifyBaseLogger;

  constructor(
    logger: FastifyBaseLogger,
    callback: (gameId: GameId, gameStatePayload: string) => void,
    questionService: QuestionService
  ) {
    this.callback = callback;
    this.updateGamesBasedOntimer();
    this.questionService = questionService;
    this.logger = logger;
  }
  private updateAllGames = () => {
    this.games.forEach((game) => {
      const numberOfPlayers = game.numberOfPlayers();
      if (numberOfPlayers === 0) {
        this.deleteGame(game.id);
      } else {
        const currentState = game.getState();
        const newState = game.runGameUpdateJob();

        if (
          JSON.stringify(currentState.gameStatus) !==
          JSON.stringify(newState.gameStatus)
        ) {
          this.callback(game.id, JSON.stringify(newState));
        }
      }
    });
  };

  private updateGamesBasedOntimer = () => {
    setInterval(() => {
      this.updateAllGames();
    }, 1000);
  };

  private deleteGame = (id: string) => {
    return this.games.delete(id);
  };

  hasGame = (id: string) => {
    return this.games.has(id);
  };

  addPlayerToGame = (id: string, player: Player) => {
    const game = this.games.get(id);
    if (game) {
      game.addPlayer(player);
      this.callback(game.id, JSON.stringify(game.getState()));
    }
  };

  removePlayerFromGame = (gameId: string, playerId: PlayerId) => {
    const game = this.games.get(gameId);
    if (game) {
      game.removePlayerById(playerId);
    }
  };

  createNewGame = (id: GameId, players: Player[]) => {
    const game = Game.createGame(id, players);
    this.games.set(game.id, game);
    this.callback(game.id, JSON.stringify(game.getState()));
    return game;
  };

  startGame = async (id: GameId) => {
    const game = this.games.get(id);
    const questions = await this.questionService.getQuestions().run();
    const canBeStarted =
      (game && game.state.gameStatus === GameStatus.WAITING_TO_START) ||
      (game && game.state.gameStatus === GameStatus.FINISHED);

    if (canBeStarted) {
      questions.mapLeft(this.logger.error).map(game.startGame);
    }
  };

  addAnswerToGame = (
    gameId: GameId,
    playerId: PlayerId,
    answer: PlayerAnswer
  ) => {
    const game = this.games.get(gameId);
    if (game) {
      game.addAnswer(playerId, answer);
    }
  };
}
