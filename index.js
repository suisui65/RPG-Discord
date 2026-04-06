const { Client, GatewayIntentBits } = require("discord.js");

console.log("ENV TOKEN:", process.env.TOKEN);

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log("Bot起動成功");
});

client.login(process.env.TOKEN);
