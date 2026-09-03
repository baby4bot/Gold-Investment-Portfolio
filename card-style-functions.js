    // ========== Card Style Functions ==========
    let currentCardStyle = 'border';
    
    function setCardStyle(style) {
        currentCardStyle = style;
        if(db) db.ref('admin_settings/cardStyle').set(style);
        updateCardStyleUI();
        renderData();
        showToggleCard(style === 'border' ? '✅ เปลี่ยนเป็นเวอร์ชั่นกรอบสีแล้ว' : '✅ เปลี่ยนเป็นเวอร์ชั่นสีทึบแล้ว');
    }
    
    function updateCardStyleUI() {
        const borderBtn = document.getElementById('card-style-border');
        const solidBtn = document.getElementById('card-style-solid');
        if(borderBtn && solidBtn) {
            borderBtn.className = `flex-1 py-3 rounded-xl text-xs font-bold transition-all active:scale-95 border-2 ${currentCardStyle === 'border' ? 'card-style-btn-active' : 'card-style-btn-inactive'}`;
            solidBtn.className = `flex-1 py-3 rounded-xl text-xs font-bold transition-all active:scale-95 border-2 ${currentCardStyle === 'solid' ? 'card-style-btn-active' : 'card-style-btn-inactive'}`;
        }
    }
    
    function getCardStyleClass(tx) {
        const isLoss = tx.totalProfit < 0;
        if(currentCardStyle === 'solid') {
            if(isLoss) return 'tx-card-solid-loss';
            return 'tx-card-solid-profit';
        }
        if(isLoss) return 'tx-card-border-loss';
        return 'tx-card-border-profit';
    }