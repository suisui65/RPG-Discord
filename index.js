const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log("Bot起動してるよ⭐");
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  if (message.content === "p@生成") {
    message.reply("プレイヤー生成コマンド受け取った");
  }
});

client.login(process.env.TOKEN);
