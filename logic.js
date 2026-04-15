module.exports = {
    getNextLevelExp: (lv) => Math.pow(lv, 2) * 50 + lv * 100,
    calculateBossMultiplier: (rank) => 1 + (rank - 1) * 0.1,

    // ターン順序算出
    getTurnOrder: (players, boss) => {
        const entities = players.map(p => ({ id: p._id, name: p.name, spd: p.stats.spd, isPlayer: true }));
        entities.push({ id: 'BOSS', name: boss.name, spd: boss.spd, isPlayer: false });
        return entities.sort((a, b) => b.spd - a.spd);
    },

    // 攻撃対象選定（ヘイトシステム）
    selectTarget: (participants) => {
        const total = participants.reduce((s, p) => s + (p.stats.hate_init || 10), 0);
        let r = Math.random() * total;
        for (const p of participants) {
            if (r < (p.stats.hate_init || 10)) return p._id;
            r -= (p.stats.hate_init || 10);
        }
        return participants[0]._id;
    },

    // 全員のMP回復とフィールドトラップの更新
    processEndOfAction: (session) => {
        let logs = [];
        // MP回復
        session.participants.forEach(p => {
            const recovery = (p.job === "魔術師") ? 10 : 5;
            p.mp = Math.min(p.stats.max_mp || 40, (p.mp || 0) + recovery);
        });
        session.boss.mp = (session.boss.mp || 0) + 20;

        // トラップ（オーバーブレス）の更新
        if (session.field && session.field.traps) {
            session.field.traps = session.field.traps.filter(t => {
                t.timer--;
                if (t.timer <= 0) {
                    const dmg = 80; // 崩壊ダメージ
                    session.participants.forEach(p => p.hp -= dmg);
                    logs.push(`💥 理想崩壊！全員が **${dmg}** の爆発ダメージを受けた！`);
                    return false;
                }
                return true;
            });
        }
        return logs;
    },

    // ダメージ計算
    calculateDamage: (attacker, receiver) => {
        const atk = attacker.stats ? attacker.stats.atk : attacker.atk;
        const def = receiver.stats ? receiver.stats.def : receiver.def;
        let dmg = Math.max(10, atk - (def * 0.5));
        return { dmg: Math.floor(dmg) };
    }
};
