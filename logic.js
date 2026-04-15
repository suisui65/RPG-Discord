/**
 * RPGシステム計算ロジック
 * * 主な機能:
 * 1. ダメージ計算 (SPDによる回避 / LUKによるクリティカル)
 * 2. 経験値計算 (レベルごとの累乗設定)
 * 3. ボス強化倍率 (ランクによるステータス上昇)
 * 4. ヘイトシステム (狙われやすさの抽選)
 */
module.exports = {
    getNextLevelExp: (lv) => Math.pow(lv, 2) * 50 + lv * 100,
    
    calculateBossMultiplier: (rank) => 1 + (rank - 1) * 0.1,

    getTurnOrder: (players, boss) => {
        const entities = players.map(p => ({ id: p._id, name: p.name, spd: p.stats.spd, isPlayer: true }));
        entities.push({ id: 'BOSS', name: boss.name, spd: boss.spd, isPlayer: false });
        return entities.sort((a, b) => b.spd - a.spd);
    },

    calculateDamage: (attacker, receiver) => {
        const atk = attacker.stats ? attacker.stats.atk : attacker.atk;
        const def = receiver.stats ? receiver.stats.def : receiver.def;
        const spd_a = attacker.stats ? attacker.stats.spd : attacker.spd;
        const spd_r = receiver.stats ? receiver.stats.spd : receiver.spd;

        // 回避
        if (Math.random() < Math.max(0.05, (spd_r - spd_a) / 100)) return { dmg: 0, miss: true };

        let dmg = Math.max(10, atk - (def * 0.5));
        return { dmg: Math.floor(dmg) };
    },

    selectTarget: (participants) => {
        const total = participants.reduce((s, p) => s + (p.stats.hate_init || 10), 0);
        let r = Math.random() * total;
        for (const p of participants) {
            if (r < (p.stats.hate_init || 10)) return p._id;
            r -= (p.stats.hate_init || 10);
        }
        return participants[0]._id;
    }
};
