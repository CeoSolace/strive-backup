const mongoose = require("mongoose");

// Represents a news post shown in the dashboard news page.
const NewsPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    authorId: { type: String, required: true },
  },
  { timestamps: true, collection: "news_posts" }
);

module.exports =
  mongoose.models.NewsPost || mongoose.model("NewsPost", NewsPostSchema);
