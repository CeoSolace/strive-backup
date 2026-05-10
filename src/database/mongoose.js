const mongoose = require("mongoose");
const { log, success, error } = require("../helpers/Logger");

mongoose.set("strictQuery", true);

module.exports = {
  async initializeMongoose() {
    if (mongoose.connection.readyState === 1) {
      return mongoose.connection;
    }

    log("Connecting to MongoDb...");

    try {
      await mongoose.connect(process.env.MONGO_CONNECTION, {
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
      });
      success("Mongoose: Database connection established");
      return mongoose.connection;
    } catch (err) {
      error("Mongoose: Failed to connect to database", err);
      throw err;
    }
  },

  schemas: {
    Giveaways: require("./schemas/Giveaways"),
    Guild: require("./schemas/Guild"),
    Member: require("./schemas/Member"),
    ReactionRoles: require("./schemas/ReactionRoles").model,
    ModLog: require("./schemas/ModLog").model,
    TranslateLog: require("./schemas/TranslateLog").model,
    User: require("./schemas/User"),
    Suggestions: require("./schemas/Suggestions").model,

    Premium: require("./schemas/premium"),
    Config: require("./schemas/config"),
  },
};
