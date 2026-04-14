const http = require('http'); 
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const dbManager = require('./database');
const logic = require('./logic');
const jobs = require('./jobs');
const bosses = require('./bosses');
require('dotenv').config();

// Render用：ポート開放
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Raid System Online!\n');
}).listen(process.env.PORT || 3000); 

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

let activeBattles = new Map();
let allianceGroups = new Map(); // 連合グループ管理用

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const users = dbManager.getCollection("users");

    // --- 🤝 p/パーティー連合 @相手のリーダー ---
    if (msg.content.startsWith('p/パーティー連合')) {
        const target = msg.mentions.users.first();
        if (!target) return msg.reply("協力したいパーティーのリーダーをメンションしてね！");

        const leaderA = await users.findOne({ _id: msg.author.id });
        const leaderB = await users.findOne({ _id: target.id });

        if (!leaderA?.isLeader || !leaderB?.isLeader) return msg.reply("連合を組めるのはリーダー同士だけだよ！");
        if (leaderA.party === leaderB.party) return msg.reply("同じパーティー同士だよ。");

        let groupA = allianceGroups.get(leaderA.party) || [leaderA.party];
        let groupB = allianceGroups.get(leaderB.party) || [leaderB.party];

        if (groupA.includes(leaderB.party)) return msg.reply("すでに連合を組んでいるよ！");
        if (groupA.length + groupB.length > 4) return msg.reply("連合は最大4パーティーまでだよ！");

        // 連合の合体
        const newGroup = [...new Set([...groupA, ...groupB])];
        newGroup.forEach(pName => allianceGroups.set(pName, newGroup
