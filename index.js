const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const db = require('./database');
const logic = require('./logic');
const bosses = require('./bosses');
const skills = require('./skills');
const bossSkills = require('./boss_skills');
require('dotenv').config();

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

const activeBattles = new Map();
const allianceGroups = new Map();

/**
 * メイン制御オブジェクト
 */
const botController = {
    /**
     * バトル開始処理
     */
    async startBattle(msg, user, users) {
        if (activeBattles.has(msg.channel.id)) return msg.reply("⚠️ ボスはすでに戦場にいます！");

        const nextRank = (user.rank_cleared || 0) + 1;
        const bData = bosses[String(nextRank)] || bosses["1"];
        const mult = logic.calculateBossMultiplier(nextRank);

        // 連合・参加者の取得
        const myAlliance = allianceGroups.get(user.party) || (user.party ? [user.party] : null);
        const members = myAlliance ? await users.find({ party: { $in: myAlliance } }).toArray() : [user];
        
        // ターンテーブル生成 (SPD順)
        const entities = logic.getTurnOrder(members, bData);

        const session = {
            boss: { ...bData, hp: Math.floor(bData.hp * mult), max_hp: Math.floor(bData.hp * mult), mp: 0 },
            participants: members.map(m => ({ ...m, hp: m.stats.hp, mp: m.stats.mp || 40 })),
