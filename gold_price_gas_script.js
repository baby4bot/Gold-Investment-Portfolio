// ============================================================
// GOLD PRICE GAS SCRIPT - OPTIMIZED VERSION
// แก้ไข: syncFullHistory() เรียกเฉพาะตอนราคาเปลี่ยนเท่านั้น
// ประหยัด urlfetch quota จาก ~18,720 เหลือ ~5,000 ครั้ง/วัน
// ============================================================

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  if (action === 'sendLatest') return sendLatestToLine();
  if (action === 'sendAllToday') return sendAllTodayToLine();

  var url = "https://xn--42cah7d0cxcvbbb9x.com/";
  try {
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var html = response.getContentText("UTF-8");
    
    var prices = [];
    var priceRegex = /([\d,]+\.\d{2})/g;
    var match;
    var tableArea = html;
    var tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
    if (tableMatch) tableArea = tableMatch[0];
    while ((match = priceRegex.exec(tableArea)) !== null) {
      prices.push(match[1]);
    }

    var dateStr = matchText(html, /(\d{1,2}\s+[ก-๙]+\s+\d{4})/);
    var timeStr = matchText(html, /(\d{1,2}:\d{2})\s*น\./);
    var countStr = matchText(html, /ครั้งที่\s*(\d+)/);
    
    var todayChange = "0";
    var prevChange = "0";
    var todayRowMatch = tableMatch ? tableMatch[0].match(/วันนี้[\s\S]*?<\/tr>/i) : null;
    if (todayRowMatch) {
      var rowHtml = todayRowMatch[0];
      var rowText = rowHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      var rowNums = rowText.match(/[\-]?[\d,]+/g);
      if (rowNums && rowNums.length >= 2) {
        todayChange = rowNums[0].replace(/,/g, '');
        prevChange = rowNums[1].replace(/,/g, '');
      } else if (rowNums && rowNums.length === 1) {
        todayChange = rowNums[0].replace(/,/g, '');
      }
    }
    if (todayChange === "0" && prevChange === "0") {
      var textOnly = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      var todayPattern = /วันนี้\s*[◆◇●○□■▲▼🟢🔴]*\s*([\-]?\s*[\d,]+)/;
      var todayMatch = textOnly.match(todayPattern);
      if (todayMatch) {
        var val = todayMatch[1].replace(/\s+/g, '').replace(/,/g, '');
        var num = parseInt(val, 10);
        if (!isNaN(num)) todayChange = val;
      }
      var latestPattern = /ล่าสุด\s*[◆◇●○□■▲▼🟢🔴]*\s*([\-]?\s*[\d,]+)/;
      var latestMatch = textOnly.match(latestPattern);
      if (latestMatch) {
        var val2 = latestMatch[1].replace(/\s+/g, '').replace(/,/g, '');
        var num2 = parseInt(val2, 10);
        if (!isNaN(num2) && num2 > 0) prevChange = val2;
      }
    }

    var data = {
      status: "success",
      bar_buy: prices[0] || "-",
      bar_sell: prices[1] || "-",
      ornament_buy: prices[2] || "-",
      ornament_sell: prices[3] || "-",
      date: dateStr || "-",
      time: timeStr || "-",
      count: countStr || "-",
      change: todayChange,
      prev_change: prevChange
    };
    
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function matchText(html, regex) {
  var m = html.match(regex);
  return m ? m[1].trim() : null;
}

// LINE Webhook Handler
function handleLineWebhook(events) {
  var props = PropertiesService.getScriptProperties();
  var LINE_TOKEN = props.getProperty('lineChannelToken') || '';

  events.forEach(function(event) {
    // ===== Postback (Rich Menu) =====
    if (event.type === 'postback') {
      var data = event.postback.data || '';
      var replyToken = event.replyToken;
      var replyText = '';

      if (data === 'action=latest_price' || data === 'latest_price') {
        var priceData = getLatestGoldPrice();
        if (priceData) {
          replyText = '⚜️ สมาคมค้าทองคำ\n';
          replyText += '🔄 อัปเดต(ครั้งที่ ' + priceData.count + ')\n';
          replyText += '📅 ' + priceData.date + '\n';
          replyText += '🕐 ' + priceData.time + ' น.\n';
          replyText += '━━━━━━━━━━━━━\n';
          replyText += '🥇 ทองแท่ง  : \n';
          replyText += 'รับซื้อ    : 🟢 ' + priceData.barBuy.toLocaleString() + '\n';
          replyText += 'ขายออก : 🔴 ' + priceData.barSell.toLocaleString() + '\n';
          replyText += '\n💍 รูปพรรณ : \n';
          replyText += 'รับซื้อ    : 🟢 ' + priceData.ornamentBuy.toLocaleString() + '\n';
          replyText += 'ขายออก : 🔴 ' + priceData.ornamentSell.toLocaleString() + '\n';
          replyText += '━━━━━━━━━━━━━\n';
          var chToday = priceData.changeToday || 0;
          var chIcon = chToday > 0 ? '▲' : chToday < 0 ? '▼' : '▲▼';
          var chPrev = priceData.latestChange || 0;
          var pIcon = chPrev > 0 ? '▲' : chPrev < 0 ? '▼' : '▲▼';
          replyText += '📊 ล่าสุด  ' + pIcon + ' ' + Math.abs(chPrev) + '\n';
          replyText += '📊 วันนี้    ' + chIcon + ' ' + Math.abs(chToday) + '\n';
          replyText += '\n(by นักเลงคีย์บอร์ด)';
        } else {
          replyText = '⏳ ยังไม่มีข้อมูลราคาทอง';
        }
      } else if (data === 'action=today_change' || data === 'today_change') {
        var priceData2 = getLatestGoldPrice();
        if (priceData2) {
          var changeToday = priceData2.changeToday || 0;
          var changeIcon = changeToday > 0 ? '🟢▲' : changeToday < 0 ? '🔴▼' : '-';
          var latestChange = priceData2.latestChange || 0;
          var latestIcon = latestChange > 0 ? '🟢▲' : latestChange < 0 ? '🔴▼' : '-';
          replyText = '📊 การเปลี่ยนแปลงวันนี้\n';
          replyText += '━━━━━━━━━━━━━\n';
          replyText += 'วันนี้: ' + changeIcon + ' ' + Math.abs(changeToday) + ' บาท\n';
          replyText += 'ล่าสุด: ' + latestIcon + ' ' + Math.abs(latestChange) + ' บาท\n';
          replyText += '━━━━━━━━━━━━━\n';
          replyText += '📅 ' + priceData2.date + ' 🕐 ' + priceData2.time + ' น.';
        } else {
          replyText = '⏳ ยังไม่มีข้อมูล';
        }
      } else if (data === 'action=today_history' || data === 'today_history') {
        replyText = '📋 ประวัติวันนี้\nเปิดดูในเว็บไซต์ได้เลย:\nhttps://port-thongkham.web.app';
      }

      if (replyToken && replyText && LINE_TOKEN) {
        var payload = {
          replyToken: replyToken,
          messages: [{ type: 'text', text: replyText }]
        };
        UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
          method: 'post',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_TOKEN },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
      }
      return;
    }

    // ===== Text Message =====
    if (event.type !== 'message' || event.message.type !== 'text') return;

    var userMessage = event.message.text.trim().toLowerCase();
    var replyToken = event.replyToken;
    var replyText = '';

    if (userMessage === 'ราคา' || userMessage === 'price' || userMessage === 'ทอง' || userMessage === 'ทองคำ') {
      var priceData = getLatestGoldPrice();
      if (priceData) {
        var changeToday = priceData.changeToday || 0;
        var changeIcon = changeToday > 0 ? '🟢▲' : changeToday < 0 ? '🔴▼' : '-';
        var latestChange = priceData.latestChange || 0;
        var latestIcon = latestChange > 0 ? '🟢▲' : latestChange < 0 ? '🔴▼' : '-';
        var absToday = Math.abs(changeToday);
        var absLatest = Math.abs(latestChange);

        replyText = '⚜️ สมาคมค้าทองคำ\n';
        replyText += '🔄 อัปเดต(ครั้งที่ ' + priceData.count + ')\n';
        replyText += '📅 ' + priceData.date + '\n';
        replyText += '🕐 ' + priceData.time + ' น.\n';
        replyText += '━━━━━━━━━━━━━\n';
        replyText += '🥇 ทองแท่ง  : \n';
        replyText += 'รับซื้อ    : 🟢 ' + priceData.barBuy.toLocaleString() + '\n';
        replyText += 'ขายออก : 🔴 ' + priceData.barSell.toLocaleString() + '\n';
        replyText += '\n💍 รูปพรรณ : \n';
        replyText += 'รับซื้อ    : 🟢 ' + priceData.ornamentBuy.toLocaleString() + '\n';
        replyText += 'ขายออก : 🔴 ' + priceData.ornamentSell.toLocaleString() + '\n';
        replyText += '━━━━━━━━━━━━━\n';
        replyText += '📊 ล่าสุด  ' + latestIcon + ' ' + absLatest + '\n';
        replyText += '📊 วันนี้    ' + changeIcon + ' ' + absToday + '\n';
        replyText += '\n(by นักเลงคีย์บอร์ด)';
      } else {
        replyText = '⏳ ยังไม่มีข้อมูลราคาทองในขณะนี้\nกรุณารอสักครู่แล้วลองใหม่อีกครั้ง';
      }
    } else if (userMessage === 'hi' || userMessage === 'hello' || userMessage === 'สวัสดี') {
      replyText = 'สวัสดีครับ! 👋\nพิมพ์ "ราคา" เพื่อดูราคาทองคำล่าสุด';
    } else if (userMessage === 'ช่วยเหลือ' || userMessage === 'help') {
      replyText = '📋 คำสั่งที่ใช้ได้:\n\n"ราคา" - ดูราคาทองคำล่าสุด\n"สวัสดี" - ทักทาย\n"ช่วยเหลือ" - ดูคำสั่งทั้งหมด';
    } else {
      replyText = 'พิมพ์ "ราคา" เพื่อดูราคาทองคำล่าสุด 💰';
    }

    if (replyToken && LINE_TOKEN) {
      var quickReply = {
        items: [
          { type: 'action', action: { type: 'message', label: '💰 ดูราคาล่าสุด', text: 'ราคา' } },
          { type: 'action', action: { type: 'message', label: '❓ ช่วยเหลือ', text: 'ช่วยเหลือ' } }
        ]
      };
      var payload = {
        replyToken: replyToken,
        messages: [{ type: 'text', text: replyText, quickReply: quickReply }]
      };
      UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
        method: 'post',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_TOKEN },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
    }
  });

  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' })).setMimeType(ContentService.MimeType.JSON);
}

function getLatestGoldPrice() {
  try {
    var firebaseUrl = 'https://gold-portfolio-db-default-rtdb.asia-southeast1.firebasedatabase.app/latest_gold_price.json';
    var resp = UrlFetchApp.fetch(firebaseUrl, { muteHttpExceptions: true });
    var data = JSON.parse(resp.getContentText());
    if (data && data.barBuy) {
      return {
        barBuy: data.barBuy, barSell: data.barSell,
        ornamentBuy: data.ornamentBuy, ornamentSell: data.ornamentSell,
        changeToday: data.changeToday, latestChange: data.latestChange,
        date: data.date, time: data.time, count: data.count
      };
    }
  } catch(e) { Logger.log('Firebase read error: ' + e.toString()); }
  return null;
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok' })).setMimeType(ContentService.MimeType.JSON);
    }
    var body = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();

    if (body.events && Array.isArray(body.events)) {
      return handleLineWebhook(body.events);
    }

    if (body.action === 'saveNotificationSettings') {
      if (body.autoShareEnabled !== undefined) props.setProperty('autoShareEnabled', String(body.autoShareEnabled));
      if (body.lineChannelToken !== undefined) props.setProperty('lineChannelToken', body.lineChannelToken || '');
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'notification settings saved' })).setMimeType(ContentService.MimeType.JSON);
    }

    if (body.action === 'saveAlert') {
      if (body.buyTarget !== undefined) props.setProperty('alertBuyTarget', body.buyTarget || '');
      if (body.sellTarget !== undefined) props.setProperty('alertSellTarget', body.sellTarget || '');
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'alert saved' })).setMimeType(ContentService.MimeType.JSON);
    }

    if (body.action === 'saveToken') {
      if (body.token) props.setProperty('lineChannelToken', body.token);
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'token saved' })).setMimeType(ContentService.MimeType.JSON);
    }

    var lineToken = body.token;
    var message = body.message;
    var targetUserId = body.targetUserId;
    if (!lineToken || !message) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'missing token or message' })).setMimeType(ContentService.MimeType.JSON);
    }
    var payload = { messages: [{ type: 'text', text: message }] };
    var apiUrl = targetUserId ? 'https://api.line.me/v2/bot/message/push' : 'https://api.line.me/v2/bot/message/broadcast';
    if (targetUserId) { payload.to = targetUserId; }
    var lineResp = UrlFetchApp.fetch(apiUrl, {
      method: 'post',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + lineToken },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var statusCode = lineResp.getResponseCode();
    var lineData;
    try { lineData = JSON.parse(lineResp.getContentText()); } catch(err) { lineData = {}; }
    return ContentService.createTextOutput(JSON.stringify({ status: statusCode === 200 ? 'success' : 'error', statusCode: statusCode, lineResponse: lineData })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// ★★★ ส่วนที่แก้ไข: checkGoldAndNotify ★★★
// syncFullHistory() เรียกเฉพาะตอนราคาเปลี่ยนเท่านั้น
// ============================================================
function checkGoldAndNotify() {
  var props = PropertiesService.getScriptProperties();
  var LINE_TOKEN = props.getProperty('lineChannelToken') || '';
  var autoShareEnabled = props.getProperty('autoShareEnabled') === 'true';
  var url = "https://xn--42cah7d0cxcvbbb9x.com/";
  try {
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var html = response.getContentText("UTF-8");
    var prices = [];
    var priceRegex = /([\d,]+\.\d{2})/g;
    var match;
    var tableArea = html;
    var tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
    if (tableMatch) tableArea = tableMatch[0];
    while ((match = priceRegex.exec(tableArea)) !== null) { prices.push(match[1]); }
    var dateStr = matchText(html, /(\d{1,2}\s+[ก-๙]+\s+\d{4})/);
    var timeStr = matchText(html, /(\d{1,2}:\d{2})\s*น\./);
    var countStr = matchText(html, /ครั้งที่\s*(\d+)/);
    var todayChange = "0"; var prevChange = "0";
    var todayRowMatch = tableMatch ? tableMatch[0].match(/วันนี้[\s\S]*?<\/tr>/i) : null;
    if (todayRowMatch) {
      var rowText = todayRowMatch[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      var rowNums = rowText.match(/[\-]?[\d,]+/g);
      if (rowNums && rowNums.length >= 2) {
        todayChange = rowNums[0].replace(/,/g, '');
        prevChange = rowNums[1].replace(/,/g, '');
      } else if (rowNums && rowNums.length === 1) {
        todayChange = rowNums[0].replace(/,/g, '');
      }
    }
    if (todayChange === '0' && prevChange === '0') {
      var textOnly = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      var todayPattern = /วันนี้\s*[◆◇●○□■▲▼🟢🔴]*\s*([\-]?\s*[\d,]+)/;
      var todayMatch = textOnly.match(todayPattern);
      if (todayMatch) { var val = todayMatch[1].replace(/\s+/g, '').replace(/,/g, ''); if (!isNaN(parseInt(val))) todayChange = val; }
      var latestPattern = /ล่าสุด\s*[◆◇●○□■▲▼🟢🔴]*\s*([\-]?\s*[\d,]+)/;
      var latestMatch = textOnly.match(latestPattern);
      if (latestMatch) { var val2 = latestMatch[1].replace(/\s+/g, '').replace(/,/g, ''); if (!isNaN(parseInt(val2)) && parseInt(val2) > 0) prevChange = val2; }
    }

    var currentBarBuy = prices[0] || "";
    var lastBarBuy = props.getProperty('lastBarBuy') || "";
    props.setProperty('lastBarBuy', currentBarBuy);
    props.setProperty('lastBarSell', prices[1] || "");
    props.setProperty('lastOrnamentBuy', prices[2] || "");
    props.setProperty('lastOrnamentSell', prices[3] || "");
    props.setProperty('lastDate', dateStr || "");
    props.setProperty('lastTime', timeStr || "");
    props.setProperty('lastCount', countStr || "");
    props.setProperty('lastTodayChange', todayChange);
    props.setProperty('lastPrevChange', prevChange);
    props.setProperty('lastCheckTime', String(new Date().getTime()));

    // ★★★ แก้ไข: บันทึกราคาลง Firebase ทุกครั้ง (ไม่รวม syncFullHistory) ★★★
    if (currentBarBuy !== "") {
      saveToFirebase(prices, dateStr, timeStr, countStr, todayChange, prevChange);
      // syncFullHistory() ถูกลบออกจากตรงนี้ → ย้ายไปข้างล่าง
    }

    // ★★★ แก้ไข: syncFullHistory() เรียกเฉพาะตอนราคาเปลี่ยน ★★★
    if (currentBarBuy !== "" && currentBarBuy !== lastBarBuy) {
      Logger.log("Price changed: " + lastBarBuy + " -> " + currentBarBuy + " | autoShare=" + autoShareEnabled + " | token_set=" + (LINE_TOKEN.length > 0));
      
      // ★ syncFullHistory ทำงานเฉพาะตอนราคาเปลี่ยน
      syncFullHistory();

      var shortDate = (dateStr || "-").replace(/(\d+)\s+(\S+)\s+(\d+)/, function(m, d, mon, y) {
        var monShort = {'มกราคม':'ม.ค.','กุมภาพันธ์':'ก.พ.','มีนาคม':'มี.ค.','เมษายน':'เม.ย.','พฤษภาคม':'พ.ค.','มิถุนายน':'มิ.ย.','กรกฎาคม':'ก.ค.','สิงหาคม':'ส.ค.','กันยายน':'ก.ย.','ตุลาคม':'ต.ค.','พฤศจิกายน':'พ.ย.','ธันวาคม':'ธ.ค.'};
        return d + ' ' + (monShort[mon] || mon) + ' ' + y.slice(-2);
      });

      var todayNum = parseInt(todayChange.replace(/,/g, ''), 10);
      var todayIcon = todayNum > 0 ? '▲' : todayNum < 0 ? '▼' : '▲▼';
      var todayAbs = Math.abs(todayNum);

      var prevNum = parseInt(prevChange.replace(/,/g, ''), 10);
      var prevIcon = prevNum > 0 ? '▲' : prevNum < 0 ? '▼' : '▲▼';
      var prevAbs = Math.abs(prevNum);

      var msg = "⚜️ สมาคมค้าทองคำ\n";
      msg += "🔄 อัปเดต(ครั้งที่ " + (countStr || "-") + ")\n";
      msg += "📅 " + shortDate + "\n";
      msg += "🕐 " + (timeStr || "-") + " น.\n";
      msg += "━━━━━━━━━━━━━\n";
      msg += "🥇 ทองแท่ง  : \n";
      msg += "รับซื้อ    : 🟢 " + currentBarBuy + "\n";
      msg += "ขายออก : 🔴 " + (prices[1] || "-") + "\n";
      msg += "\n💍 รูปพรรณ : \n";
      msg += "รับซื้อ    : 🟢 " + (prices[2] || "-") + "\n";
      msg += "ขายออก : 🔴 " + (prices[3] || "-") + "\n";
      msg += "━━━━━━━━━━━━━\n";
      msg += "📊 ล่าสุด  " + prevIcon + " " + prevAbs + "\n";
      msg += "📊 วันนี้    " + todayIcon + " " + todayAbs + "\n";
      msg += "\n(by นักเลงคีย์บอร์ด)";

      if (autoShareEnabled && LINE_TOKEN && LINE_TOKEN.length > 10) {
        try {
          var lineResp = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/broadcast', {
            method: 'post',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_TOKEN },
            payload: JSON.stringify({ messages: [{ type: 'text', text: msg }] }),
            muteHttpExceptions: true
          });
          var lineStatus = lineResp.getResponseCode();
          Logger.log("LINE sent! Status: " + lineStatus + " | " + lastBarBuy + " -> " + currentBarBuy);
        } catch(lineErr) {
          Logger.log("LINE send error: " + lineErr.toString());
        }
      } else {
        Logger.log("LINE not sent: autoShare=" + autoShareEnabled + " token_len=" + (LINE_TOKEN ? LINE_TOKEN.length : 0));
      }
    } else {
      Logger.log("Price unchanged: " + currentBarBuy + " (last: " + lastBarBuy + ")");
    }

    // Price Alert
    try {
      var alertBuyTarget = props.getProperty('alertBuyTarget');
      var alertSellTarget = props.getProperty('alertSellTarget');
      var lastAlertBuy = props.getProperty('lastAlertBuy') || '0';
      var lastAlertSell = props.getProperty('lastAlertSell') || '0';
      var now = new Date().getTime();
      var cooldown = 30 * 60 * 1000;
      var currentPriceNum = parseFloat(currentBarBuy.replace(/,/g, ''));

      if (alertBuyTarget && currentPriceNum > 0) {
        var buyTargetNum = parseFloat(alertBuyTarget);
        if (currentPriceNum <= buyTargetNum && (now - parseInt(lastAlertBuy)) > cooldown) {
          var alertMsg = "🟢 ราคาทองลงมาถึงเป้าหมายซื้อ!\n";
          alertMsg += "ราคาปัจจุบัน: " + currentBarBuy + " บาท\n";
          alertMsg += "เป้าหมายซื้อ: " + alertBuyTarget + " บาท";
          if (autoShareEnabled && LINE_TOKEN && LINE_TOKEN.length > 10) {
            try {
              UrlFetchApp.fetch('https://api.line.me/v2/bot/message/broadcast', {
                method: 'post',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_TOKEN },
                payload: JSON.stringify({ messages: [{ type: 'text', text: alertMsg }] }),
                muteHttpExceptions: true
              });
            } catch(alErr1) { Logger.log('Alert BUY LINE error: ' + alErr1.toString()); }
          }
          props.setProperty('lastAlertBuy', String(now));
          Logger.log("Price Alert BUY triggered: " + currentBarBuy + " <= " + alertBuyTarget);
        }
      }

      if (alertSellTarget && currentPriceNum > 0) {
        var sellTargetNum = parseFloat(alertSellTarget);
        if (currentPriceNum >= sellTargetNum && (now - parseInt(lastAlertSell)) > cooldown) {
          var alertMsg2 = "🔴 ราคาทองขึ้นถึงเป้าหมายขาย!\n";
          alertMsg2 += "ราคาปัจจุบัน: " + currentBarBuy + " บาท\n";
          alertMsg2 += "เป้าหมายขาย: " + alertSellTarget + " บาท";
          if (autoShareEnabled && LINE_TOKEN && LINE_TOKEN.length > 10) {
            try {
              UrlFetchApp.fetch('https://api.line.me/v2/bot/message/broadcast', {
                method: 'post',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_TOKEN },
                payload: JSON.stringify({ messages: [{ type: 'text', text: alertMsg2 }] }),
                muteHttpExceptions: true
              });
            } catch(alErr2) { Logger.log('Alert SELL LINE error: ' + alErr2.toString()); }
          }
          props.setProperty('lastAlertSell', String(now));
          Logger.log("Price Alert SELL triggered: " + currentBarBuy + " >= " + alertSellTarget);
        }
      }
    } catch(alertErr) {
      Logger.log("Price Alert error: " + alertErr.toString());
    }
  } catch(e) { Logger.log("Error: " + e.toString()); }
}

function saveToFirebase(prices, dateStr, timeStr, countStr, todayChange, prevChange) {
  var FIREBASE_URL = 'https://gold-portfolio-db-default-rtdb.asia-southeast1.firebasedatabase.app';
  try {
    var barBuyNum = parseFloat((prices[0] || '0').replace(/,/g, ''));
    var barSellNum = parseFloat((prices[1] || '0').replace(/,/g, ''));
    var ornamentBuyNum = parseFloat((prices[2] || '0').replace(/,/g, ''));
    var ornamentSellNum = parseFloat((prices[3] || '0').replace(/,/g, ''));
    var now = new Date().getTime();
    var safeDate = (dateStr || '').replace(/[\/\s]/g, '-');
    var safeTime = (timeStr || '').replace(/:/g, '-');
    var recordKey = safeDate + '_' + safeTime + '_' + barBuyNum;
    
    var historyData = {
      barBuy: barBuyNum, barSell: barSellNum,
      ornamentBuy: ornamentBuyNum, ornamentSell: ornamentSellNum,
      changeToday: parseFloat(todayChange) || 0, latestChange: parseFloat(prevChange) || 0,
      date: dateStr || '', time: timeStr || '',
      count: parseInt(countStr) || 0, timestamp: now
    };
    UrlFetchApp.fetch(FIREBASE_URL + '/gold_price_history/' + recordKey + '.json', {
      method: 'PUT', payload: JSON.stringify(historyData), muteHttpExceptions: true
    });
    
    var latestData = {
      barBuy: barBuyNum, barSell: barSellNum,
      ornamentBuy: ornamentBuyNum, ornamentSell: ornamentSellNum,
      changeToday: parseFloat(todayChange) || 0, latestChange: parseFloat(prevChange) || 0,
      date: dateStr || '', time: timeStr || '',
      count: parseInt(countStr) || 0, timestamp: now
    };
    UrlFetchApp.fetch(FIREBASE_URL + '/latest_gold_price.json', {
      method: 'PUT', payload: JSON.stringify(latestData), muteHttpExceptions: true
    });
    
  } catch(e) { Logger.log('Firebase save error: ' + e.toString()); }
}

function syncFullHistory() {
  var FIREBASE_URL = 'https://gold-portfolio-db-default-rtdb.asia-southeast1.firebasedatabase.app';
  var url = "https://xn--42cah7d0cxcvbbb9x.com/";
  try {
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var html = response.getContentText("UTF-8");
    var tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
    var biggest = '';
    tables.forEach(function(t) { if(t.length > biggest.length) biggest = t; });
    var trs = biggest.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    var savedCount = 0;
    var now = new Date().getTime();
    
    trs.forEach(function(tr) {
      var tds = tr.match(/<td[\s\S]*?<\/td>/gi) || [];
      if (tds.length >= 6) {
        var cells = tds.map(function(c) { return c.replace(/<[^>]+>/g, '').trim(); });
        var dateTime = cells[0] || '';
        var countStr = cells[1] || '0';
        var barBuy = cells[2] || '0';
        var barSell = cells[3] || '0';
        var ornBuy = cells[4] || '0';
        var ornSell = cells[5] || '0';
        var changeVal = cells[8] || '0';
        var parts = dateTime.split(' ');
        var dateParts = (parts[0] || '').split('/');
        var dateStr = '';
        var timeStr = parts[1] || '';
        if (dateParts.length === 3) {
          var thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
          var monthIdx = parseInt(dateParts[1], 10) - 1;
          var yearBE = parseInt(dateParts[2], 10);
          dateStr = parseInt(dateParts[0], 10) + ' ' + (thaiMonths[monthIdx] || '') + ' ' + yearBE;
        }
        var barBuyNum = parseFloat(barBuy.replace(/,/g, ''));
        var barSellNum = parseFloat(barSell.replace(/,/g, ''));
        var ornBuyNum = parseFloat(ornBuy.replace(/,/g, ''));
        var ornSellNum = parseFloat(ornSell.replace(/,/g, ''));
        var changeNum = parseInt(changeVal.replace(/,/g, ''), 10);
        var safeDate = dateStr.replace(/[\/\s]/g, '-');
        var safeTime = timeStr.replace(/:/g, '-');
        var recordKey = safeDate + '_' + safeTime + '_' + barBuyNum;
        var historyData = {
          barBuy: barBuyNum, barSell: barSellNum,
          ornamentBuy: ornBuyNum, ornamentSell: ornSellNum,
          changeToday: changeNum || 0, latestChange: 0,
          date: dateStr, time: timeStr,
          count: parseInt(countStr) || 0,
          timestamp: now - (18 - parseInt(countStr)) * 60000
        };
        UrlFetchApp.fetch(FIREBASE_URL + '/gold_price_history/' + recordKey + '.json', {
          method: 'PUT', payload: JSON.stringify(historyData), muteHttpExceptions: true
        });
        savedCount++;
      }
    });
    Logger.log('syncFullHistory: saved ' + savedCount + ' records to Firebase');
    return savedCount;
  } catch(e) {
    Logger.log('syncFullHistory error: ' + e.toString());
    return 0;
  }
}

function setupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkGoldAndNotify') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('checkGoldAndNotify').timeBased().everyMinutes(1).create();
  Logger.log("Trigger created: every 1 minute");
}

function removeTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkGoldAndNotify') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  Logger.log("Triggers removed");
}

function sendLatestToLine() {
  var props = PropertiesService.getScriptProperties();
  var LINE_TOKEN = props.getProperty('lineChannelToken') || '';
  if (!LINE_TOKEN || LINE_TOKEN.length < 10) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'LINE Token not configured' })).setMimeType(ContentService.MimeType.JSON);
  }
  var firebaseUrl = props.getProperty('firebaseUrl') || '';
  try {
    // 1. ดึงราคาทองจากเว็บ
    var url = "https://xn--42cah7d0cxcvbbb9x.com/";
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var html = response.getContentText("UTF-8");
    var prices = [];
    var priceRegex = /([\d,]+\.\d{2})/g;
    var match;
    var tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
    var tableArea = tableMatch ? tableMatch[0] : html;
    while ((match = priceRegex.exec(tableArea)) !== null) { prices.push(match[1]); }
    var dateStr = matchText(html, /(\d{1,2}\s+[ก-๙]+\s+\d{4})/);
    var timeStr = matchText(html, /(\d{1,2}:\d{2})\s*น\./);
    var countStr = matchText(html, /ครั้งที่\s*(\d+)/);
    var todayChange = "0"; var prevChange = "0";
    var todayRowMatch = tableMatch ? tableMatch[0].match(/วันนี้[\s\S]*?<\/tr>/i) : null;
    if (todayRowMatch) {
      var rowText = todayRowMatch[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      var rowNums = rowText.match(/[\-]?[\d,]+/g);
      if (rowNums && rowNums.length >= 2) {
        todayChange = rowNums[0].replace(/,/g, '');
        prevChange = rowNums[1].replace(/,/g, '');
      }
    }
    var shortDate = (dateStr || "-").replace(/(\d+)\s+(\S+)\s+(\d+)/, function(m, d, mon, y) {
      var monShort = {'มกราคม':'ม.ค.','กุมภาพันธ์':'ก.พ.','มีนาคม':'มี.ค.','เมษายน':'เม.ย.','พฤษภาคม':'พ.ค.','มิถุนายน':'มิ.ย.','กรกฎาคม':'ก.ค.','สิงหาคม':'ส.ค.','กันยายน':'ก.ย.','ตุลาคม':'ต.ค.','พฤศจิกายน':'พ.ย.','ธันวาคม':'ธ.ค.'};
      return d + ' ' + (monShort[mon] || mon) + ' ' + y.slice(-2);
    });
    var todayNum = parseInt(todayChange.replace(/,/g, ''), 10);
    var todayIcon = todayNum > 0 ? '🟢▲' : todayNum < 0 ? '🔴▼' : '▲▼';
    var todayAbs = Math.abs(todayNum);
    var prevNum = parseInt(prevChange.replace(/,/g, ''), 10);
    var prevIcon = prevNum > 0 ? '🟢▲' : prevNum < 0 ? '🔴▼' : '▲▼';
    var prevAbs = Math.abs(prevNum);
    var msg = "📊 ล่าสุด  " + prevIcon + " " + prevAbs + "\n";
    msg += "━━━━━━━━━━━━━\n";
    msg += "⚜️ สมาคมค้าทองคำ\n";
    msg += "🔄 อัปเดต(ครั้งที่ " + (countStr || "-") + ")\n";
    msg += "📅 " + shortDate + "\n";
    msg += "🕐 " + (timeStr || "-") + " น.\n";
    msg += "━━━━━━━━━━━━━\n";
    msg += "🥇 ทองแท่ง  : \n";
    msg += "รับซื้อ    : 🟢 " + (prices[0] || "-") + "\n";
    msg += "ขายออก : 🔴 " + (prices[1] || "-") + "\n";
    msg += "\n💍 รูปพรรณ : \n";
    msg += "รับซื้อ    : 🟢 " + (prices[2] || "-") + "\n";
    msg += "ขายออก : 🔴 " + (prices[3] || "-") + "\n";
    msg += "━━━━━━━━━━━━━\n";
    msg += "📊 ล่าสุด  " + prevIcon + " " + prevAbs + "\n";
    msg += "📊 วันนี้    " + todayIcon + " " + todayAbs + "\n";
    msg += "\n(by นักเลงคีย์บอร์ด)";
    // ===== Cross-account dedup: check Firebase _lastLineNotify =====
    // window = 300 วินาที (5 นาที) ครอบคลุม triggering cycle ของ 2 บัญชี
    var DEDUP_WINDOW_MS = 300000; // 5 minutes
    if (firebaseUrl) {
      try {
        var checkResp = UrlFetchApp.fetch(firebaseUrl + '/_lastLineNotify.json', { muteHttpExceptions: true });
        var checkData = JSON.parse(checkResp.getContentText());
        if (checkData && (Date.now() - checkData) < DEDUP_WINDOW_MS) {
          var secsAgo = Math.round((Date.now() - checkData) / 1000);
          return ContentService.createTextOutput(JSON.stringify({ status: 'skipped', message: 'LINE already sent ' + secsAgo + 's ago (within ' + (DEDUP_WINDOW_MS/1000) + 's window)' })).setMimeType(ContentService.MimeType.JSON);
        }
      } catch(e) { /* first time = no data = proceed */ }
    }
    // ===== ส่ง LINE Notification =====
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'post',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_TOKEN },
      payload: JSON.stringify({ messages: [{ type: 'text', text: msg }] }),
      muteHttpExceptions: true
    });
    // ===== บันทึกว่าส่งแล้ว ( Firebase _lastLineNotify ) =====
    if (firebaseUrl) {
      try { UrlFetchApp.fetch(firebaseUrl + '/_lastLineNotify.json', { method: 'put', payload: JSON.stringify(Date.now()), muteHttpExceptions: true }); } catch(e) {}
    }
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Latest price sent to LINE' })).setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: e.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function sendAllTodayToLine() {
  var props = PropertiesService.getScriptProperties();
  var LINE_TOKEN = props.getProperty('lineChannelToken') || '';
  if (!LINE_TOKEN || LINE_TOKEN.length < 10) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'LINE Token not configured' })).setMimeType(ContentService.MimeType.JSON);
  }
  try {
    var firebaseUrl = props.getProperty('firebaseUrl') || '';
    if (!firebaseUrl) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Firebase URL not configured' })).setMimeType(ContentService.MimeType.JSON);
    }
    var today = new Date();
    var todayStr = today.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    var historyResp = UrlFetchApp.fetch(firebaseUrl + '/gold_price_history.json?orderBy="date"&equalTo="' + todayStr + '"', { muteHttpExceptions: true });
    var historyData = JSON.parse(historyResp.getContentText());
    if (!historyData) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No data for today' })).setMimeType(ContentService.MimeType.JSON);
    }
    var entries = Object.values(historyData);
    entries.sort(function(a, b) { return (a.time || '').localeCompare(b.time || ''); });
    var count = 0;
    entries.forEach(function(entry) {
      var barBuy = entry.barBuy || '-';
      var barSell = entry.barSell || '-';
      var ornBuy = entry.ornamentBuy || '-';
      var ornSell = entry.ornamentSell || '-';
      var time = entry.time || '-';
      var change = entry.change || 0;
      var changeIcon = change > 0 ? '🟢▲' : change < 0 ? '🔴▼' : '▲▼';
      var msg = "⚜️ สมาคมค้าทองคำ\n";
      msg += "🕐 " + time + " น.\n";
      msg += "━━━━━━━━━━━━━\n";
      msg += "🥇 ทองแท่ง  : \n";
      msg += "รับซื้อ    : 🟢 " + barBuy + "\n";
      msg += "ขายออก : 🔴 " + barSell + "\n";
      msg += "\n💍 รูปพรรณ : \n";
      msg += "รับซื้อ    : 🟢 " + ornBuy + "\n";
      msg += "ขายออก : 🔴 " + ornSell + "\n";
      msg += "━━━━━━━━━━━━━\n";
      msg += "📊 เปลี่ยนแปลง " + changeIcon + " " + Math.abs(change) + "\n";
      UrlFetchApp.fetch('https://api.line.me/v2/bot/message/broadcast', {
        method: 'post',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_TOKEN },
        payload: JSON.stringify({ messages: [{ type: 'text', text: msg }] }),
        muteHttpExceptions: true
      });
      count++;
      Utilities.sleep(500);
    });
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', count: count, message: 'Sent ' + count + ' messages to LINE' })).setMimeType(ContentService.MimeType.JSON);
  } catch(e) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: e.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// ★★★ RICH MENU - ปุ่มเมนูด้านล่างหน้าจอแชท LINE ★★★
// ============================================================

// สร้าง Rich Menu (รันครั้งเดียวผ่าน GAS Editor → Run)
function createRichMenu() {
  var props = PropertiesService.getScriptProperties();
  var LINE_TOKEN = props.getProperty('lineChannelToken') || '';
  if (!LINE_TOKEN) return 'ERROR: lineChannelToken not set';

  var richMenu = {
    size: { width: 2500, height: 843 },
    selected: true,
    name: 'ทองคำ Rich Menu',
    chatBarText: 'กดเพื่อดูราคาทอง',
    areas: [
      {
        bounds: { x: 0, y: 0, width: 833, height: 843 },
        action: { type: 'postback', label: 'ราคาล่าสุด', data: 'action=latest_price', displayText: 'ดูราคาล่าสุด' }
      },
      {
        bounds: { x: 833, y: 0, width: 834, height: 843 },
        action: { type: 'postback', label: 'เปลี่ยนแปลงวันนี้', data: 'action=today_change', displayText: 'ดูการเปลี่ยนแปลงวันนี้' }
      },
      {
        bounds: { x: 1667, y: 0, width: 833, height: 843 },
        action: { type: 'postback', label: 'ประวัติวันนี้', data: 'action=today_history', displayText: 'ดูประวัติวันนี้' }
      }
    ]
  };

  // 1. สร้าง Rich Menu
  var createResp = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'post',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_TOKEN },
    payload: JSON.stringify(richMenu),
    muteHttpExceptions: true
  });
  var createData = JSON.parse(createResp.getContentText());
  if (!createData.richMenuId) return 'ERROR creating: ' + createResp.getContentText();
  var richMenuId = createData.richMenuId;
  Logger.log('Rich Menu created: ' + richMenuId);

  // 2. อัปโหลดรูปก่อน (ถ้ามีใน Drive)
  var files = DriveApp.getFilesByName('rich-menu.png');
  if (files.hasNext()) {
    var file = files.next();
    var blob = file.getBlob();
    var uploadResp = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/' + richMenuId + '/content', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'Authorization': 'Bearer ' + LINE_TOKEN },
      payload: blob.getBytes(),
      muteHttpExceptions: true
    });
    Logger.log('Upload image: ' + uploadResp.getResponseCode());
  } else {
    Logger.log('No rich-menu.png found — skipping image upload');
  }

  // 3. ตั้งเป็น default Rich Menu (ต้องใช้ PUT)
  var setResp = UrlFetchApp.fetch('https://api.line.me/v2/bot/user/all/richmenu/' + richMenuId, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + LINE_TOKEN },
    muteHttpExceptions: true
  });
  Logger.log('Set default: ' + setResp.getResponseCode());

  props.setProperty('richMenuId', richMenuId);
  return 'SUCCESS: Rich Menu ID = ' + richMenuId;
}

// อัปโหลดรูป Rich Menu จาก Google Drive
function uploadRichMenuImage() {
  var props = PropertiesService.getScriptProperties();
  var LINE_TOKEN = props.getProperty('lineChannelToken') || '';
  var richMenuId = props.getProperty('richMenuId') || '';
  
  // Debug: แสดงค่าที่อ่านได้
  Logger.log('=== DEBUG uploadRichMenuImage ===');
  Logger.log('LINE_TOKEN: ' + (LINE_TOKEN ? LINE_TOKEN.substring(0, 20) + '...' : 'EMPTY'));
  Logger.log('richMenuId: ' + (richMenuId || 'EMPTY'));
  
  if (!LINE_TOKEN) return 'ERROR: lineChannelToken ว่างเปล่า — ตั้งค่าใน Script Properties ก่อน';
  if (!richMenuId) return 'ERROR: richMenuId ว่างเปล่า — ต้องรัน createRichMenu() ก่อน';

  var files = DriveApp.getFilesByName('rich-menu.png');
  if (!files.hasNext()) return 'ERROR: ไม่พบไฟล์ rich-menu.png ใน Google Drive — ต้องอัปโหลดก่อน';
  var file = files.next();
  var blob = file.getBlob();
  Logger.log('File found: ' + file.getName() + ' (' + blob.getBytes().length + ' bytes)');

  var uploadResp = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/' + richMenuId + '/content', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', 'Authorization': 'Bearer ' + LINE_TOKEN },
    payload: blob.getBytes(),
    muteHttpExceptions: true
  });
  var statusCode = uploadResp.getResponseCode();
  var responseText = uploadResp.getContentText();
  Logger.log('Upload status: ' + statusCode);
  Logger.log('Upload response: ' + responseText.substring(0, 200));
  
  if (statusCode === 200) {
    // ตั้งเป็น default Rich Menu หลังอัปโหลดสำเร็จ
    var setResp = UrlFetchApp.fetch('https://api.line.me/v2/bot/user/all/richmenu/' + richMenuId, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + LINE_TOKEN },
      muteHttpExceptions: true
    });
    Logger.log('Set default: ' + setResp.getResponseCode());
    return 'SUCCESS: อัปโหลดรูปสำเร็จ + ตั้งเป็น default แล้ว (Status: ' + statusCode + ')';
  } else {
    return 'ERROR: อัปโหลดไม่สำเร็จ (Status: ' + statusCode + ') - ' + responseText.substring(0, 100);
  }
}

// ลบ Rich Menu
function deleteRichMenu() {
  var props = PropertiesService.getScriptProperties();
  var LINE_TOKEN = props.getProperty('lineChannelToken') || '';
  var richMenuId = props.getProperty('richMenuId') || '';
  if (!LINE_TOKEN || !richMenuId) return 'ERROR: missing';
  var resp = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/' + richMenuId, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + LINE_TOKEN },
    muteHttpExceptions: true
  });
  return 'Deleted: ' + resp.getResponseCode();
}

// ============================================================
// DEBUG - ตรวจสอบค่าใน Script Properties
// ============================================================
function debugScriptProperties() {
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();
  Logger.log('=== Script Properties ===');
  for (var key in allProps) {
    var val = allProps[key];
    if (key === 'lineChannelToken') {
      Logger.log(key + ': ' + (val ? val.substring(0, 20) + '... (length=' + val.length + ')' : 'EMPTY'));
    } else {
      Logger.log(key + ': ' + val);
    }
  }
  return JSON.stringify(allProps, null, 2);
}

// ตั้งค่า lineChannelToken ใน Script Properties
function setLineChannelToken(token) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('lineChannelToken', token);
  Logger.log('Token saved: ' + token.substring(0, 20) + '...');
  return 'Token saved successfully';
}

// แสดงรายการ Rich Menu ทั้งหมด
function listRichMenus() {
  var props = PropertiesService.getScriptProperties();
  var LINE_TOKEN = props.getProperty('lineChannelToken') || '';
  if (!LINE_TOKEN) return 'ERROR: lineChannelToken not set';

  var resp = UrlFetchApp.fetch('https://api.line.me/v2/bot/richmenu/list', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + LINE_TOKEN },
    muteHttpExceptions: true
  });
  Logger.log('List Rich Menus: ' + resp.getResponseCode());
  Logger.log('Response: ' + resp.getContentText().substring(0, 500));
  return resp.getContentText();
}
