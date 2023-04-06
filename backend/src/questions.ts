import { FastifyBaseLogger } from "fastify";
import { array, Codec, EitherAsync, GetType, number, string } from "purify-ts";
import { Question } from "./game";
import { get } from "./utils";

const questionFromResponseCodec = Codec.interface({
  category: string,
  type: string,
  difficulty: string,
  question: string,
  correct_answer: string,
  incorrect_answers: array(string),
});

const questionResponseCodec = Codec.interface({
  response_code: number,
  results: array(questionFromResponseCodec),
});

type QuestionResponse = GetType<typeof questionResponseCodec>;

const questionResponseToQuestions = (
  response: QuestionResponse
): Question[] => {
  return response.results.map((question) => ({
    id: question.question,
    question: question.question,
    answers: [
      {
        id: question.correct_answer,
        questionId: question.question,
        answer: question.correct_answer,
      },
      ...question.incorrect_answers.map((answer) => ({
        id: answer,
        questionId: question.question,
        answer,
      })),
    ],
    correctAnswer: {
      id: question.correct_answer,
      questionId: question.question,
      answer: question.correct_answer,
    },
  }));
};

export interface QuestionService {
  getQuestions: () => EitherAsync<string, Question[]>;
}

export const createQuestionService = (
  logger: FastifyBaseLogger
): QuestionService => {
  const apiUrl =
    "https://opentdb.com/api.php?amount=10&difficulty=easy&type=multiple";

  const getQuestions = (): EitherAsync<string, Question[]> => {
    logger.info("Getting questions");
    return get(apiUrl)
      .mapLeft(() => {
        logger.info("Something went wrong");
        return "Something went wrong";
      })
      .map((response) => questionResponseCodec.decode(response.data))
      .join()
      .map(questionResponseToQuestions);
  };

  return { getQuestions };
};
