module.exports = {
    // 武器ランク判定
    checkRank: (playerRank, requiredRank) => {
        const ranks = ["見習い", "熟練", "名工", "神話"];
        return ranks.indexOf(playerRank) >= ranks.indexOf(requiredRank);
    },

    // プレイヤー必要経験値 (累乗計算)
    getNextLevelExp: (level) => {
        return (Math.pow(level, 2) * 50) + (level * 100);
    },

    // ボス倍率 (大ボス撃破後の上昇を含む)
    calculateBossMultiplier: (rank) => {
        let multiplier = 1.0;
        for (let i = 1; i < rank; i++) {
            if (i % 10 === 0) multiplier += (i / 10);
            else multiplier += 0.1;
        }
        return multiplier;
    },

    // ダメージ計算
    calculateDamage: (attacker, receiver, minDmg = 10) => {
        let dmg = Math.max(minDmg, attacker.atk - (receiver.def * 0.5));
        const critRate = Math.min(0.20, attacker.luk / 100);
        const isCrit = Math.random() < critRate;
        if (isCrit) dmg *= 1.7;

        let dodgeRate = (receiver.spd - attacker.spd) / 100;
        dodgeRate = Math.max(0.05, Math.min(0.25, dodgeRate));
        const isDodge = Math.random() < dodgeRate;

        return { dmg: isDodge ? 0 : Math.floor(dmg), isCrit, isDodge };
    },

    // 貢献度・報酬分配
    distributeRewards: (baseExp, baseMoney, rank, contributors) => {
        const mult = 1 + (rank - 1) * 0.08; // 報酬+8%
        const totalExp = baseExp * mult;
        const totalMoney = baseMoney * mult;
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
                exp: Math.floor(totalExp * ratio),
                money: Math.floor(totalMoney * ratio)
            };
        });
    },

    // ヘイト抽選
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
