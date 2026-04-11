module.exports = {
    // ダメージ計算 (対抗型・最低保証)
    calculateDamage: (attacker, receiver, minDmg = 10) => {
        // 1. 基礎ダメージ
        let dmg = Math.max(minDmg, attacker.atk - (receiver.def * 0.5));
        
        // 2. クリティカル判定 (自分のLUK依存)
        // 自分のLUKが20あれば最大20%
        const critRate = Math.min(0.20, attacker.luk / 100);
        const isCrit = Math.random() < critRate;
        if (isCrit) dmg *= 1.7; // クリティカルは1.7倍

        // 3. 回避判定 (SPDの差分を利用)
        // (受け手SPD - 攻め手SPD) が25以上で最大25%。最低5%。
        let dodgeRate = (receiver.spd - attacker.spd) / 100;
        dodgeRate = Math.max(0.05, Math.min(0.25, dodgeRate)); 
        const isDodge = Math.random() < dodgeRate;

        return { 
            dmg: isDodge ? 0 : Math.floor(dmg), 
            isCrit, 
            isDodge 
        };
    },

    // ヘイト抽選ロジック (ヘイトが高いほど当たりやすいが、低くても当たる)
    // 参加者リスト [{id, hate}, ...] から一人選ぶ
    selectTarget: (participants) => {
        const totalHate = participants.reduce((sum, p) => sum + p.hate, 0);
        let random = Math.random() * totalHate;
        for (const p of participants) {
            if (random < p.hate) return p.id;
            random -= p.hate;
        }
        return participants[0].id; // 念のため
    }
};
