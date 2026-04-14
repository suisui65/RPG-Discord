module.exports = {
    // 報酬+8% ランク補正
    calculateBossMultiplier: (rank) => 1 + (rank - 1) * 0.1,
    
    // 経験値テーブル
    getNextLevelExp: (level) => (Math.pow(level, 2) * 50) + (level * 100),

    // ダメージ計算
    calculateDamage: (attacker, receiver) => {
        let dmg = Math.max(10, attacker.atk - (receiver.def * 0.5));
        
        // クリティカル(LUK)
        const critRate = Math.min(0.20, attacker.luk / 100);
        if (Math.random() < critRate) dmg *= 1.7;

        // 回避(SPD)
        let dodgeRate = (receiver.spd - attacker.spd) / 100;
        dodgeRate = Math.max(0.05, Math.min(0.25, dodgeRate));
        const isDodge = Math.random() < dodgeRate;

        return { 
            dmg: isDodge ? 0 : Math.floor(dmg), 
            isCrit: !isDodge && (dmg > attacker.atk), 
            isDodge 
        };
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
