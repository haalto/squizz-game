import { app } from "./app";
import { getConfig } from "./config";

const start = () => {
  const config = getConfig();

  if (config.isLeft()) {
    console.error(config.extract());
    process.exit(1);
  }

  config.map(async (config) => {
    const server = await app(config, { logger: true });
    server.listen(
      { port: config.port, host: config.host },
      (error, address) => {
        if (error) {
          server.log.error(error);
          process.exit(1);
        }
      }
    );
  });
};

start();
