import { Either, Left, Right } from "purify-ts";

export const parseJSON = (str: string): Either<string, unknown> => {
  try {
    return Right(JSON.parse(str));
  } catch (e) {
    return Left("Invalid JSON");
  }
};
