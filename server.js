const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: "./config.env" });
const app = require("./app");

mongoose
  .connect(process.env.DATABASE)
  .then((_) => console.log("db connection successful!"));

const server = app.listen(process.env.PORT || 3000, () => {
  console.log("App running on port 3000...");
});

process.on("unhandledRejection", (err) => {
  console.log("undhandled rejection");
  console.log(err.name, err.message);

  server.close((_) => {
    process.exit(1);
  });
});

process.on("uncaughtException", (err) => {
  console.log("uncaught exception");
  console.log(err.name, err.message);

  server.close((_) => {
    process.exit(1);
  });
});
