//const http = require('http')
const express = require("express");
const helmet = require("helmet")
const slowDown = require("express-slow-down")
const config = require("./utils/config");
require("express-async-errors");
const app = express();
const cors = require("cors");

const logoRouter = require('./controllers/logo')

const middleware = require("./utils/middleware");
const logger = require("./utils/logger");

const mongoose = require("mongoose");

mongoose.set("strictQuery", false);

logger.info("connecting to", config.MONGODB_URI);

mongoose
  .connect(config.MONGODB_URI)
  .then(() => {
    logger.info("connected to MongoDB");
  })
  .catch((error) => {
    logger.error("error connecting to MongoDB:", error.message);
  });

app.use(helmet())
app.use(cors());
app.use(express.static("dist"));
app.use(express.json());
app.use(middleware.requestLogger);

const speedLimiter = slowDown({
  windowMs: 60 * 1000,
  delayAfter: 60,
  delayMs: (hits) => hits * 500,
})

app.use('/api', speedLimiter, logoRouter)

app.use(middleware.unknownEndpoint);
app.use(middleware.errorHandler);

module.exports = app;