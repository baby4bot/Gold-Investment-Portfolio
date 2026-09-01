const functions = require("firebase-functions");
const admin = require("firebase-admin");
const https = require("https");
const http = require("http");

admin.initializeApp();
const db = admin.database();

// Firebase Cloud Function ที่ทำงานทุก 5 นาที ผ่าน Cloud Scheduler
// Deploy ด้วย: firebase deploy --only functions
exports.scheduledGoldSync = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async (context) => {
    console.log("🔄 Starting gold price sync...");
    
    try {
      // 1. ดึงราคาทองจากเว็บ
      const html = await fetchUrl("https://xn--42cah7d0cxcvbbb9x.com/");
      if (!html || !html.includes("<table")) {
        console.log("❌ Failed to fetch gold price website");
        return null;
      }

      // 2. Parse ราคาทอง
      const priceData = parseGoldPrice(html);
      if (!priceData || !priceData.barBuy) {
        console.log("❌ Failed to parse gold price data");
        return null;
      }

      // 3. บันทึกราคาล่าสุดลง Firebase
      await db.ref("latest_gold_price").set({
        barBuy: priceData.barBuy,
        barSell: priceData.barSell,
        ornamentBuy: priceData.ornamentBuy,
        ornamentSell: priceData.ornamentSell,
        changeToday: priceData.changeToday,
        latestChange: priceData.latestChange,
        date: priceData.date,
        time: priceData.time,
        count: priceData.count,
        timestamp: Date.now(),
      });

      // 4. บันทึกประวัติลง Firebase
      await saveHistoryToFirebase(priceData);

      // 5. ตรวจสอบราคาเปลี่ยนแปลง + ส่ง LINE (with dedup)
      const prevSnap = await db.ref("prev_gold_price/barBuy").once("value");
      const prevPrice = prevSnap.val();
      // Save current price as previous for next comparison
      await db.ref("prev_gold_price/barBuy").set(priceData.barBuy);
      if (prevPrice && prevPrice !== priceData.barBuy) {
        // Dedup: check if LINE was already sent for this price change (within 60 seconds)
        const lastNotifySnap = await db.ref("_lastLineNotify").once("value");
        const lastNotify = lastNotifySnap.val();
        const now = Date.now();
        if (!lastNotify || (now - lastNotify) > 60000) {
          // Claim the notification slot
          await db.ref("_lastLineNotify").set(now);
          console.log(`💰 Price changed: ${prevPrice} → ${priceData.barBuy} — sending LINE`);
          await sendLineNotification(priceData, prevPrice);
        } else {
          console.log(`⏭️ Price changed but LINE already sent ${now - lastNotify}ms ago — skipping`);
        }
      }

      console.log("✅ Gold sync completed:", priceData.date, priceData.time, "ครั้งที่", priceData.count);
      return null;
    } catch (error) {
      console.error("❌ Gold sync error:", error.message);
      return null;
    }
  });

// Helper: Fetch URL content
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, { timeout: 15000 }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject)
      .on("timeout", () => reject(new Error("timeout")));
  });
}

// Helper: Parse gold price from HTML
function parseGoldPrice(html) {
  try {
    // ดึงราคาจากตาราง
    const prices = [];
    const priceRegex = /([\d,]+\.\d{2})/g;
    let match;
    const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
    const tableArea = tableMatch ? tableMatch[0] : html;
    while ((match = priceRegex.exec(tableArea)) !== null) {
      prices.push(match[1]);
    }

    const thaiMonths = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
      "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
      "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
    ];

    const dateMatch = html.match(/(\d{1,2})\s+[\u0E00-\u0E7F]+\s+(\d{4})/);
    const timeMatch = html.match(/(\d{1,2}:\d{2})\s*น\./);
    const countMatch = html.match(/ครั้งที่\s*(\d+)/);

    let dateStr = "";
    if (dateMatch) {
      dateStr = dateMatch[1] + " " + thaiMonths[parseInt(dateMatch[0].split(/\s/)[1]) - 1 || 0] + " " + dateMatch[2];
    }
    // Fallback: try Thai date format directly
    if (!dateStr) {
      const thDateMatch = html.match(/(\d{1,2}\s+(?:มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+\d{4})/);
      if (thDateMatch) dateStr = thDateMatch[1];
    }

    // ดึงค่าเปลี่ยนแปลง
    let changeToday = 0;
    let latestChange = 0;
    const textOnly = html.replace(/<[^>]+>/g, " ");
    const todayMatch = textOnly.match(/วันนี้[^\d]*([\-]?\s*[\d,]+)/);
    const latestMatch = textOnly.match(/ล่าสุด[^\d]*([\-]?\s*[\d,]+)/);
    if (todayMatch) changeToday = parseInt(todayMatch[1].replace(/[, ]/g, "")) || 0;
    if (latestMatch) latestChange = parseInt(latestMatch[1].replace(/[, ]/g, "")) || 0;

    return {
      barBuy: parseInt((prices[0] || "0").replace(/,/g, "")),
      barSell: parseInt((prices[1] || "0").replace(/,/g, "")),
      ornamentBuy: parseInt((prices[2] || "0").replace(/,/g, "")),
      ornamentSell: parseInt((prices[3] || "0").replace(/,/g, "")),
      changeToday,
      latestChange,
      date: dateStr,
      time: timeMatch ? timeMatch[1] : "",
      count: countMatch ? parseInt(countMatch[1]) : 0,
    };
  } catch (e) {
    console.error("Parse error:", e.message);
    return null;
  }
}

// Helper: Parse full history table from HTML
function parseHistoryTable(html) {
  try {
    const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
    let biggest = "";
    tables.forEach((t) => {
      if (t.length > biggest.length) biggest = t;
    });

    const trs = biggest.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const thaiMonths = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
      "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
      "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
    ];
    const records = [];

    for (const tr of trs) {
      const tds = tr.match(/<td[\s\S]*?<\/td>/gi) || [];
      if (tds.length < 6) continue;
      const cells = tds.map((c) => c.replace(/<[^>]+>/g, "").trim());
      const dateTime = cells[0] || "";
      const countStr = cells[1] || "0";
      const barBuy = cells[2] || "0";
      const barSell = cells[3] || "0";
      const ornBuy = cells[4] || "0";
      const ornSell = cells[5] || "0";
      const changeVal = cells[8] || "0";

      const parts = dateTime.split(" ");
      const dateParts = (parts[0] || "").split("/");
      const timeStr = parts[1] || "";
      if (dateParts.length !== 3) continue;

      const monthIdx = parseInt(dateParts[1], 10) - 1;
      const yearBE = parseInt(dateParts[2], 10);
      const dateStr =
        parseInt(dateParts[0], 10) + " " + (thaiMonths[monthIdx] || "") + " " + yearBE;
      const barBuyNum = parseInt(barBuy.replace(/,/g, ""), 10);
      if (!barBuyNum) continue;

      records.push({
        barBuy: barBuyNum,
        barSell: parseInt(barSell.replace(/,/g, ""), 10),
        ornamentBuy: parseInt(ornBuy.replace(/,/g, ""), 10),
        ornamentSell: parseInt(ornSell.replace(/,/g, ""), 10),
        changeToday: parseInt(changeVal.replace(/,/g, ""), 10) || 0,
        latestChange: 0,
        date: dateStr,
        time: timeStr,
        count: parseInt(countStr) || 0,
      });
    }
    return records;
  } catch (e) {
    console.error("Parse history error:", e.message);
    return [];
  }
}

// Helper: Save history to Firebase (skip duplicates)
async function saveHistoryToFirebase(priceData) {
  const now = Date.now();
  const safeDate = (priceData.date || "").replace(/[\s\/]/g, "");
  const safeTime = (priceData.time || "").replace(/[\s.:น]/g, "");
  const recordKey = `${safeDate}_${safeTime}_${priceData.barBuy}`;

  // เช็คซ้ำ
  const existing = await db.ref("gold_price_history/" + recordKey).once("value");
  if (existing.exists()) return;

  await db.ref("gold_price_history/" + recordKey).set({
    barBuy: priceData.barBuy,
    barSell: priceData.barSell,
    ornamentBuy: priceData.ornamentBuy,
    ornamentSell: priceData.ornamentSell,
    changeToday: priceData.changeToday,
    latestChange: priceData.latestChange,
    date: priceData.date,
    time: priceData.time,
    count: priceData.count,
    timestamp: now,
  });
}

// Helper: Send LINE notification
async function sendLineNotification(priceData, prevPrice) {
  try {
    const configSnap = await db.ref("admin_settings/lineChannelToken").once("value");
    const lineToken = configSnap.val();
    if (!lineToken) {
      console.log("No LINE token configured");
      return;
    }

    const diff = priceData.barBuy - prevPrice;
    const icon = diff > 0 ? "🟢📈" : "🔴📉";
    const direction = diff > 0 ? "ขึ้น" : "ลง";

    const message = `${icon} ราคาทองคำเปลี่ยนแปลง!
━━━━━━━━━━━━━━━━━
💰 ทองคำแท่งรับซื้อ: ${priceData.barBuy.toLocaleString()} บาท
💰 ทองคำแท่งขายออก: ${priceData.barSell.toLocaleString()} บาท
💎 ทองรูปพรรณรับซื้อ: ${priceData.ornamentBuy.toLocaleString()} บาท
💎 ทองรูปพรรณขายออก: ${priceData.ornamentSell.toLocaleString()} บาท
━━━━━━━━━━━━━━━━━
${diff > 0 ? "▲" : "▼"} เปลี่ยนแปลง ${direction} ${Math.abs(diff).toLocaleString()} บาท
📅 ${priceData.date} เวลา ${priceData.time} น. (ครั้งที่ ${priceData.count})`;

    const postData = JSON.stringify({
      messages: [{ type: "text", text: message }],
    });        return new Promise((resolve, reject) => {
            const req = https.request(
                "https://api.line.me/v2/bot/message/push",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${lineToken}`,
                    },
                },
                (res) => {
                    let body = "";
                    res.on("data", (chunk) => (body += chunk));
                    res.on("end", () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            console.log("LINE notification sent successfully:", res.statusCode);
                            resolve({ status: "success" });
                        } else {
                            console.error("LINE API error:", res.statusCode, body);
                            reject(new Error(`LINE API error ${res.statusCode}: ${body}`));
                        }
                    });
                }
            );
            req.on("error", (err) => {
                console.error("LINE request error:", err.message);
                reject(err);
            });
            req.write(postData);
            req.end();
        });
  } catch (e) {
    console.error("LINE notification error:", e.message);
  }
}

// HTTP Trigger สำหรับ manual sync (ทดสอบได้จากเบราว์เซอร์)
exports.syncGoldManual = functions.https.onRequest(async (req, res) => {
  try {
    const html = await fetchUrl("https://xn--42cah7d0cxcvbbb9x.com/");
    if (!html || !html.includes("<table")) {
      res.json({ status: "error", message: "Cannot fetch website" });
      return;
    }

    const priceData = parseGoldPrice(html);
    const historyRecords = parseHistoryTable(html);

    // Save latest price
    await db.ref("latest_gold_price").set({
      barBuy: priceData.barBuy,
      barSell: priceData.barSell,
      ornamentBuy: priceData.ornamentBuy,
      ornamentSell: priceData.ornamentSell,
      changeToday: priceData.changeToday,
      latestChange: priceData.latestChange,
      date: priceData.date,
      time: priceData.time,
      count: priceData.count,
      timestamp: Date.now(),
    });

    // Save history
    let saved = 0;
    for (const record of historyRecords) {
      const safeDate = record.date.replace(/[\s\/]/g, "");
      const safeTime = record.time.replace(/[\s.:น]/g, "");
      const key = `${safeDate}_${safeTime}_${record.barBuy}`;
      const existing = await db.ref("gold_price_history/" + key).once("value");
      if (!existing.exists()) {
        await db.ref("gold_price_history/" + key).set({
          ...record,
          timestamp: Date.now() - (20 - record.count) * 60000,
        });
        saved++;
      }
    }

    res.json({
      status: "success",
      price: priceData,
      historySaved: saved,
      historyTotal: historyRecords.length,
    });
  } catch (error) {
    res.json({ status: "error", message: error.message });
  }
});
