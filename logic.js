module.exports = {
    // レベルアップに必要な経験値 (累乗計算で後半厳しく)
    getNextLevelExp: (level) => {
        return (Math.pow(level, 2) * 50) + (level * 100);
    },

    // 武器ランクの強さチェック
    checkRank: (playerRank, requiredRank) => {
        const ranks = ["見習い", "熟練", "名工", "神話"];
        return ranks.indexOf(playerRank) >= ranks.indexOf(requiredRank);
    },

    // ボスランクによるステータス倍率
    calculateBossMultiplier: (rank) => {
        let multiplier = 1.0;
        for (let i = 1; i < rank; i++) {
            if (i % 10 === 0) multiplier += (i / 10); // 大ボス撃破後は上昇率アップ
            else multiplier += 0.1;
        }
        return multiplier;
    },

    // ダメージ計算 (対抗型)
    calculateDamage: (attacker, receiver, minDmg = 10) => {
        let dmg = Math.max(minDmg, attacker.atk - (receiver.def * 0.5));
        
        // クリティカル判定 (自分のLUK依存：最大20%)
        const critRate = Math.min(0.20, attacker.luk / 100);
        const isCrit = Math.random() < critRate;
        if (isCrit) dmg *= 1.7;

        // 回避判定 (SPDの差分：最大25%、最低5%)
        let dodgeRate = (receiver.spd - attacker.spd) / 100;
        dodgeRate = Math.max(0.05, Math.min(0.25, dodgeRate));
        const isDodge = Math.random() < dodgeRate;

        return { dmg: isDodge ? 0 : Math.floor(dmg), isCrit, isDodge };
    },

    // 貢献度に基づく報酬分配 (報酬+8%ランク補正)
    distributeRewards: (baseExp, baseMoney, rank, contributors) => {
        const mult = 1 + (rank - 1) * 0.08;
        const totalActivity = contributors.reduce((s, c) => s + c.damageDealt + c.damageTaken + c.heal, 0);

        return contributors.map(c => {
            const myScore = c.damageDealt + c.damageTaken + c.heal;
            let ratio = 1.0;
            if (totalActivity > 0) {
                const avg = totalActivity / contributors.length;
                ratio += Math.max(-0.1, Math.min(0.1, (myScore - avg) / avg));
            }
            return {
                id: c.id,
                exp: Math.floor(baseExp * mult * ratio),
                money: Math.floor(baseMoney * mult * ratio)
            };
        });
    },

    // ターゲット抽選 (ヘイトが高いほど狙われやすい)
    selectTarget: (participants) => {
        const totalHate = participants.reduce((s, p) => s + p.hate, 0);
        let random = Math.random() * totalHate;
        for (const p of participants) {
            if (random < p.hate) return p.id;
            random -= p.hate;
        }
        return participants[0].id;
    }
};
