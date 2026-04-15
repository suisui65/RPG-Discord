/**
 * RPGシステム計算ロジック
 * * 主な機能:
 * 1. ダメージ計算 (SPDによる回避 / LUKによるクリティカル)
 * 2. 経験値計算 (レベルごとの累乗設定)
 * 3. ボス強化倍率 (ランクによるステータス上昇)
 * 4. ヘイトシステム (狙われやすさの抽選)
 */
module.exports = {

    /**
     * 次のレベルまでに必要な経験値を計算
     */
    getNextLevelExp: (level) => {
        return (Math.pow(level, 2) * 50) + (level * 100);
    },

    /**
     * ボスのランクによるステータス強化倍率
     */
    calculateBossMultiplier: (rank) => {
        const r = parseInt(rank) || 1;
        return 1 + (r - 1) * 0.1;
    },

    /**
     * ターン順序の決定 (SPD順にソート)
     * バトル開始時にプレイヤーとボスを素早さ順に並べます。
     */
    getTurnOrder: (players, boss) => {
        // 全エンティティをひとつの配列にまとめる
        let entities = players.map(p => ({
            id: p._id || p.id,
            name: p.name,
            spd: p.stats ? p.stats.spd : p.spd,
            isPlayer: true
        }));

        entities.push({
            id: 'BOSS',
            name: boss.name,
            spd: boss.spd,
            isPlayer: false
        });

        // SPDが高い順にソート (同じ場合はランダム)
        return entities.sort((a, b) => b.spd - a.spd);
    },

    /**
     * ダメージ計算 (対抗型)
     */
    calculateDamage: (attacker, receiver) => {
        // ステータスが stats オブジェクト内にある場合と直下にある場合の両方に対応
        const aAtk = attacker.stats ? attacker.stats.atk : attacker.atk;
        const aLuk = attacker.stats ? attacker.stats.luk : attacker.luk;
        const aSpd = attacker.stats ? attacker.stats.spd : attacker.spd;
        
        const rDef = receiver.stats ? receiver.stats.def : receiver.def;
        const rSpd = receiver.stats ? receiver.stats.spd : receiver.spd;

        // 1. 基本ダメージ計算 (ATK - 防御力の半分) ※最低ダメージ10保証
        let dmg = Math.max(10, aAtk - (rDef * 0.5));

        // 2. SPDによる回避判定 (最大25% / 最低5%)
        let dodgeRate = (rSpd - aSpd) / 100;
        dodgeRate = Math.max(0.05, Math.min(0.25, dodgeRate));
        const isDodge = Math.random() < dodgeRate;

        if (isDodge) return { dmg: 0, isCrit: false, isDodge: true };

        // 3. LUKによるクリティカル判定 (最大20%)
        const critRate = Math.min(0.20, aLuk / 100);
        const isCrit = Math.random() < critRate;
        if (isCrit) dmg *= 1.7;

        return { 
            dmg: Math.floor(dmg), 
            isCrit: isCrit, 
            isDodge: false 
        };
    },

    /**
     * 攻撃対象の抽選 (ヘイトシステム)
     */
    selectTarget: (participants) => {
        if (!participants || participants.length === 0) return null;

        const totalHate = participants.reduce((sum, p) => sum + (p.hate || 10), 0);
        let random = Math.random() * totalHate;

        for (const p of participants) {
            const h = p.hate || 10;
            if (random < h) return p.id;
            random -= h;
        }

        return participants[0].id;
    },

    /**
     * 報酬分配計算
     */
    distributeRewards: (boss) => {
        return {
            exp: boss.exp_reward || 50,
            money: boss.money_reward || 1000
        };
    }
};
