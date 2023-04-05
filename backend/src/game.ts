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
  questions: Question[];
  timerDuringRound: number;
  timerBetweenRounds: number;
};

type Question = {
  question: string;
  answers: Answer[];
  correctAnswer: Answer;
};

type Answer = {
  answer: string;
  isCorrect: boolean;
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

  private static getNewGameState = (players: Player[]) => {
    return {
      players,
      gameStatus: GameStatus.WAITING_TO_START,
      currentRound: 0,
      totalRounds: 3,
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
}

export class GameManager {
  games: Map<string, Game> = new Map();
  callback: (gameId: GameId, message: string) => void;

  constructor(callback: (gameId: GameId, gameStatePayload: string) => void) {
    this.callback = callback;
    this.updateGamesBasedOntimer();
  }
  private updateAllGames = () => {
    this.games.forEach((game) => {
      const numberOfPlayers = game.numberOfPlayers();
      if (numberOfPlayers === 0) {
        this.deleteGame(game.id);
      } else {
        const state = game.runGameUpdateJob();
        this.callback(game.id, JSON.stringify(state));
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
    return game;
  };

  startGame = (id: GameId) => {
    const game = this.games.get(id);
    const questions: Question[] = [];
    const canBeStarted =
      (game && game.state.gameStatus === GameStatus.WAITING_TO_START) ||
      (game && game.state.gameStatus === GameStatus.FINISHED);

    if (canBeStarted) {
      game.startGame(questions);
    }
  };
}
