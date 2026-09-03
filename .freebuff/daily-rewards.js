// ========== DAILY LOGIN REWARDS SYSTEM ==========
// ระบบรางวัลล็อกอินต่อเนื่อง

const DAILY_REWARDS = {
    // รางวัลตามจำนวนวันล็อกอินต่อเนื่อง
    streaks: {
        1: { coins: 10, title: 'วันแรก', icon: '🌟' },
        2: { coins: 15, title: '2 วันติด', icon: '🔥' },
        3: { coins: 20, title: '3 วันติด', icon: '💪' },
        4: { coins: 25, title: '4 วันติด', icon: '⚡' },
        5: { coins: 30, title: '5 วันติด', icon: '🎯' },
        6: { coins: 40, title: '6 วันติด', icon: '🏆' },
        7: { coins: 100, title: '7 วันติด! สัปดาห์ทอง!', icon: '👑' }
    },
    // รางวัลพิเศษทุก 7 วัน
    weeklyBonus: 50,
    // รางวัลรายเดือน
    monthlyBonus: 200
};

// ========== STREAK FUNCTIONS ==========
let _userCoins = 0;
let _userStreak = 0;
let _lastRewardShown = null;

// โหลดข้อมูลจาก Firebase
async function loadDailyRewards(username) {
    if (!db || !username) return;
    
    try {
        const snap = await db.ref('user_rewards/' + username).once('value');
        const data = snap.val() || {};
        
        _userCoins = data.coins || 0;
        _userStreak = data.streak || 0;
        
        // ตรวจสอบว่าวันนี้ล็อกอินแล้วหรือยัง
        const today = new Date().toDateString();
        if (data.lastLoginDate === today) {
            // ล็อกอินแล้ววันนี้
            return { isNewLogin: false, streak: _userStreak, coins: _userCoins };
        }
        
        // คำนวณ streak
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        let newStreak = 1;
        
        if (data.lastLoginDate === yesterday) {
            // ล็อกอินเมื่อวาน = streak ต่อเนื่อง
            newStreak = (_userStreak || 0) + 1;
        }
        
        // จำกัด streak สูงสุด 7 วัน
        if (newStreak > 7) newStreak = 7;
        
        // คำนวณเหรียญที่ได้รับ
        let coinsEarned = DAILY_REWARDS.streaks[newStreak]?.coins || 10;
        
        // โบนัสพิเศษทุก 7 วัน
        let bonusMessage = '';
        if (newStreak === 7) {
            coinsEarned += DAILY_REWARDS.weeklyBonus;
            bonusMessage = ' + โบนัสพิเศษ!';
        }
        
        // บันทึกลง Firebase
        _userStreak = newStreak;
        _userCoins += coinsEarned;
        
        await db.ref('user_rewards/' + username).set({
            coins: _userCoins,
            streak: _userStreak,
            lastLoginDate: today,
            totalLogins: (data.totalLogins || 0) + 1,
            lastReward: {
                coins: coinsEarned,
                streak: newStreak,
                timestamp: Date.now()
            }
        });
        
        return {
            isNewLogin: true,
            streak: newStreak,
            coins: _userCoins,
            coinsEarned: coinsEarned,
            reward: DAILY_REWARDS.streaks[newStreak],
            bonusMessage: bonusMessage
        };
        
    } catch(e) {
        console.error('Error loading daily rewards:', e);
        return { isNewLogin: false, streak: 0, coins: 0 };
    }
}

// แสดงรางวัลล็อกอิน
function showDailyReward(rewardData) {
    if (!rewardData || !rewardData.isNewLogin) return;
    
    const { streak, coinsEarned, reward, bonusMessage } = rewardData;
    
    // สร้าง modal แสดงรางวัล
    const modal = document.createElement('div');
    modal.id = 'daily-reward-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);backdrop-filter:blur(8px);';
    
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const bgColor = isLight ? '#ffffff' : 'linear-gradient(180deg, #1c1c24 0%, #141418 100%)';
    const textColor = isLight ? '#333' : '#fff';
    const borderColor = isLight ? '#e5e5e5' : 'rgba(212,160,23,0.3)';
    
    modal.innerHTML = `
        <div style="background:${bgColor};border:1px solid ${borderColor};border-radius:24px;padding:32px 24px;max-width:320px;width:90%;text-align:center;animation:rewardPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
            <div style="font-size:64px;margin-bottom:16px;animation:rewardBounce 0.6s ease;">${reward?.icon || '🌟'}</div>
            <h3 style="color:#d4a017;font-size:20px;font-weight:900;margin-bottom:8px;">${reward?.title || 'ล็อกอินสำเร็จ!'}</h3>
            <p style="color:${textColor};font-size:14px;margin-bottom:16px;">ล็อกอินต่อเนื่อง ${streak} วัน</p>
            <div style="background:rgba(212,160,23,0.1);border:1px solid rgba(212,160,23,0.3);border-radius:12px;padding:16px;margin-bottom:16px;">
                <div style="color:#d4a017;font-size:32px;font-weight:900;">+${coinsEarned}</div>
                <div style="color:${textColor};font-size:12px;">เหรียญทอง</div>
            </div>
            ${bonusMessage ? `<p style="color:#22c55e;font-size:12px;font-weight:bold;margin-bottom:12px;">${bonusMessage}</p>` : ''}
            <p style="color:${isLight ? '#888' : '#94a3b8'};font-size:11px;margin-bottom:16px;">เหรียญคงเหลือ: <span style="color:#d4a017;font-weight:bold;">${_userCoins}</span></p>
            <button onclick="closeDailyReward()" style="background:linear-gradient(135deg,#d4a017,#b8941f);color:#0c0e14;border:none;border-radius:12px;padding:12px 32px;font-weight:bold;font-size:14px;cursor:pointer;">รับรางวัล</button>
        </div>
    `;
    
    // เพิ่ม animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes rewardPop { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes rewardBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    `;
    modal.appendChild(style);
    
    document.body.appendChild(modal);
    _lastRewardShown = modal;
}

function closeDailyReward() {
    if (_lastRewardShown) {
        _lastRewardShown.remove();
        _lastRewardShown = null;
    }
}

// ดึงจำนวนเหรียญปัจจุบัน
function getUserCoins() {
    return _userCoins;
}

// ดึง streak ปัจจุบัน
function getUserStreak() {
    return _userStreak;
}

// ใช้เหรียญ
async function spendCoins(amount, reason) {
    if (!db || !currentUser) return false;
    if (_userCoins < amount) return false;
    
    _userCoins -= amount;
    await db.ref('user_rewards/' + currentUser.username + '/coins').set(_userCoins);
    
    // บันทึกประวัติ
    await db.ref('user_rewards/' + currentUser.username + '/history').push({
        type: 'spend',
        amount: amount,
        reason: reason,
        timestamp: Date.now()
    });
    
    return true;
}

// รับเหรียญ (จากกิจกรรมอื่น)
async function earnCoins(amount, reason) {
    if (!db || !currentUser) return false;
    
    _userCoins += amount;
    await db.ref('user_rewards/' + currentUser.username + '/coins').set(_userCoins);
    
    // บันทึกประวัติ
    await db.ref('user_rewards/' + currentUser.username + '/history').push({
        type: 'earn',
        amount: amount,
        reason: reason,
        timestamp: Date.now()
    });
    
    return true;
}

// ========== SHOP ITEMS ==========
const SHOP_ITEMS = [
    { id: 'theme_sakura', name: '🌸 ธีมซากุระ', price: 100, type: 'theme', color: '#ffb7c5' },
    { id: 'theme_ocean', name: '🌊 ธีมมหาสมุทร', price: 150, type: 'theme', color: '#006994' },
    { id: 'theme_forest', name: '🌲 ธีมป่าเขา', price: 150, type: 'theme', color: '#228b22' },
    { id: 'theme_sunset', name: '🌅 ธีมพระอาทิตย์ตก', price: 200, type: 'theme', color: '#ff6b35' },
    { id: 'theme_galaxy', name: '🌌 ธีมกาแล็กซี่', price: 250, type: 'theme', color: '#4b0082' },
    { id: 'badge_pro', name: '⭐ ป้าย Pro', price: 500, type: 'badge', icon: '⭐' },
    { id: 'avatar_frame', name: '🖼️ กรอบรูปโปรไฟล์', price: 300, type: 'frame', icon: '🖼️' }
];

// แสดงร้านค้า
function renderShop() {
    const container = document.getElementById('shop-container');
    if (!container) return;
    
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const cardBg = isLight ? '#ffffff' : 'rgba(255,255,255,0.05)';
    const textColor = isLight ? '#333' : '#fff';
    
    let html = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
            <h3 style="color:#d4a017;font-size:16px;font-weight:900;"><i class="ph ph-store"></i> ร้านค้า</h3>
            <div style="background:rgba(212,160,23,0.1);border:1px solid rgba(212,160,23,0.3);border-radius:20px;padding:6px 12px;display:flex;align-items:center;gap:6px;">
                <span style="font-size:16px;">🪙</span>
                <span style="color:#d4a017;font-weight:bold;font-size:14px;">${_userCoins}</span>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
    `;
    
    SHOP_ITEMS.forEach(item => {
        const canAfford = _userCoins >= item.price;
        const bgStyle = item.color ? `background:${item.color}20;border:1px solid ${item.color}40` : `background:${cardBg};border:1px solid ${isLight ? '#e5e5e5' : 'rgba(255,255,255,0.1)'}`;
        
        html += `
            <div style="${bgStyle};border-radius:12px;padding:12px;text-align:center;${canAfford ? 'cursor:pointer;' : 'opacity:0.5;'}"
                 onclick="${canAfford ? `buyItem('${item.id}')` : ''}">
                <div style="font-size:24px;margin-bottom:8px;">${item.icon || item.name.split(' ')[0]}</div>
                <div style="color:${textColor};font-size:11px;font-weight:bold;margin-bottom:4px;">${item.name}</div>
                <div style="color:#d4a017;font-size:12px;font-weight:bold;">🪙 ${item.price}</div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// ซื้อสินค้า
async function buyItem(itemId) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;
    
    if (_userCoins < item.price) {
        showToggleCard('❌', 'เหรียญไม่พอ', `ต้องการ ${item.price} เหรียญ มีเพียง ${_userCoins} เหรียญ`);
        return;
    }
    
    const success = await spendCoins(item.price, `ซื้อ ${item.name}`);
    if (success) {
        // บันทึกว่าซื้อแล้ว
        if (!db || !currentUser) return;
        await db.ref('user_purchases/' + currentUser.username + '/' + itemId).set({
            purchasedAt: Date.now(),
            price: item.price
        });
        
        showToggleCard('✅', 'ซื้อสำเร็จ!', `${item.name} ถูกเพิ่มในคลังแล้ว`);
        renderShop();
        
        // ถ้าเป็นธีม ให้ใช้งานได้ทันที
        if (item.type === 'theme') {
            showToggleCard('🎨', 'เปิดใช้ธีมใหม่', `${item.name} พร้อมใช้งานแล้ว!`);
        }
    }
}
