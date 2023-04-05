import { config } from "dotenv";
import { Codec, Either, optional, Right, string } from "purify-ts";

export interface Config {
  port: number;
  host: string;
}

const envCodec = Codec.interface({
  PORT: optional(string),
  HOST: optional(string),
});

export const getConfig = (): Either<Error, Config> => {
  config();
  return envCodec
    .decode(process.env)
    .mapLeft((error) => new Error(error))
    .map((env) =>
      Right({
        port: env.PORT ? parseInt(env.PORT, 10) : 9000,
        host: env.HOST || "0.0.0.0",
      })
    )
    .join();
};
