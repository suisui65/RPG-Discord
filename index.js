require("dotenv").config();

const express = require("express");
const app = express();

const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== Webサーバー（これが必要） =====
app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.listen(3000, () => {
  console.log("Webサーバー起動");
});

// ===== Discord =====
client.once("ready", () => {
  console.log("起動成功！");
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  if (message.content === "ping") {
    message.reply("pong!");
  }
});

client.login(process.env.TOKEN);
