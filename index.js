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

// Webサーバー（Render対策）
app.get("/", (req, res) => {
  res.send("Bot is running");
});

app.listen(3000, () => {
  console.log("Webサーバー起動");
});

// ログイン
console.log("TOKEN確認:", process.env.TOKEN);

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// テストコマンド
client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  if (message.content === "p@ping") {
    message.reply("pong!");
  }
});

client.login(process.env.TOKEN);
