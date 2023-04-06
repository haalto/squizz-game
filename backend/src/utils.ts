import { Either, Left, Right, EitherAsync } from "purify-ts";

export const parseJSON = (str: string): Either<string, unknown> => {
  try {
    return Right(JSON.parse(str));
  } catch (e) {
    return Left("Invalid JSON");
  }
};

import axios from "axios";

export const get = (url: string) => {
  return EitherAsync(async ({ liftEither, throwE }) => {
    try {
      const response = await axios.get(url, {
        validateStatus: (status) => status === 200 || status === 404,
      });
      return liftEither(Right(response));
    } catch (error) {
      return throwE(error);
    }
  });
};
