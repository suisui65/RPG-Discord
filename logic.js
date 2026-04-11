module.exports = {
    // 必要経験値 (レベルアップしにくくなる累乗計算)
    getNextLevelExp: (level) => {
        return (Math.pow(level, 2) * 50) + (level * 100);
    },

    // ダメージ計算 (SPD/LUKの対抗型)
    calculateDamage: (attacker, receiver, minDmg = 10) => {
        let dmg = Math.max(minDmg, attacker.atk - (receiver.def * 0.5));
        
        // LUKによるクリティカル (最大20%)
        const critRate = Math.min(0.20, attacker.luk / 100);
        const isCrit = Math.random() < critRate;
        if (isCrit) dmg *= 1.7;

        // SPDによる回避 (最大25%, 最低5%)
        let dodgeRate = (receiver.spd - attacker.spd) / 100;
        dodgeRate = Math.max(0.05, Math.min(0.25, dodgeRate));
        const isDodge = Math.random() < dodgeRate;

        return { dmg: isDodge ? 0 : Math.floor(dmg), isCrit, isDodge };
    },

    // 報酬分配 (報酬+8%補正)
    distributeRewards: (baseExp, baseMoney, rank, contributors) => {
        const mult = 1 + (rank - 1) * 0.08;
        return contributors.map(c => {
            // ここに貢献度(ダメージ量など)の計算が入ります
            return { id: c.id, exp: Math.floor(baseExp * mult), money: Math.floor(baseMoney * mult) };
        });
    },

    // ヘイト抽選
    selectTarget: (participants) => {
        const total = participants.reduce((s, p) => s + p.hate, 0);
        let random = Math.random() * total;
        for (const p of participants) {
            if (random < p.hate) return p.id;
            random -= p.hate;
        }
        return participants[0].id;
    }
};
