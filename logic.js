module.exports = {
    // 【必要経験値】レベルアップしにくくする設定（累乗）
    getNextLevelExp: (level) => {
        return (Math.pow(level, 2) * 50) + (level * 100);
    },

    // 【ダメージ計算】回避・クリティカル・最低保証込み
    calculateDamage: (attacker, receiver, minDmg = 10) => {
        let dmg = Math.max(minDmg, attacker.atk - (receiver.def * 0.5));
        
        // クリティカル判定 (最大20%)
        const critRate = Math.min(0.20, attacker.luk / 100);
        if (Math.random() < critRate) dmg *= 1.7;

        // 回避判定 (SPD差分：5%〜25%)
        let dodgeRate = (receiver.spd - attacker.spd) / 100;
        dodgeRate = Math.max(0.05, Math.min(0.25, dodgeRate));
        const isDodge = Math.random() < dodgeRate;

        return { dmg: isDodge ? 0 : Math.floor(dmg), isDodge };
    },

    // 【報酬配分】貢献度±10% ＋ ランク補正+8%
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

    // 【ヘイト抽選】
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
