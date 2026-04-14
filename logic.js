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
     * 式: (Lv^2 * 50) + (Lv * 100)
     */
    getNextLevelExp: (level) => {
        return (Math.pow(level, 2) * 50) + (level * 100);
    },

    /**
     * ボスのランクによるステータス強化倍率
     * ランク1を基準(1.0)とし、1ランク上がるごとに +10%
     */
    calculateBossMultiplier: (rank) => {
        const r = parseInt(rank) || 1;
        return 1 + (r - 1) * 0.1;
    },

    /**
     * ダメージ計算 (対抗型)
     * @param {Object} attacker 攻撃者のステータス
     * @param {Object} receiver 防御者のステータス
     * @returns {Object} dmg: ダメージ量, isCrit: 判定, isDodge: 判定
     */
    calculateDamage: (attacker, receiver) => {
        // 1. 基本ダメージ計算 (ATK - 防御力の半分) ※最低ダメージ10保証
        let dmg = Math.max(10, attacker.atk - (receiver.def * 0.5));

        // 2. SPDによる回避判定 (最大25% / 最低5%)
        // お互いのSPD差を%に換算。相手よりSPDが100高いと25%回避。
        let dodgeRate = (receiver.spd - attacker.spd) / 100;
        dodgeRate = Math.max(0.05, Math.min(0.25, dodgeRate));
        const isDodge = Math.random() < dodgeRate;

        if (isDodge) return { dmg: 0, isCrit: false, isDodge: true };

        // 3. LUKによるクリティカル判定 (最大20%)
        // LUK 100 で 20% の確率でダメージ 1.7倍
        const critRate = Math.min(0.20, attacker.luk / 100);
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
     * ヘイト値が高いプレイヤーほど、ボスに狙われる確率が上がる
     */
    selectTarget: (participants) => {
        if (!participants || participants.length === 0) return null;

        // 全員のヘイト合計を算出
        const totalHate = participants.reduce((sum, p) => sum + (p.hate || 10), 0);
        
        // 合計値の中でランダムな数値を引く
        let random = Math.random() * totalHate;

        // 誰のヘイト範囲に当たったか判定
        for (const p of participants) {
            if (random < (p.hate || 10)) return p.id;
            random -= (p.hate || 10);
        }

        return participants[0].id;
    },

    /**
     * 報酬分配計算
     * ※index.js側でループ処理を行うための基本データ返却
     */
    distributeRewards: (boss) => {
        return {
            exp: boss.exp_reward || 50,
            money: boss.money_reward || 1000
        };
    }
};
