const puppeteer = require('puppeteer');
const { createWorker } = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

(async () => {
  const rootDir = __dirname;
  const downloadPath = path.resolve(rootDir, 'downloads');
  const debugPath = path.resolve(rootDir, 'debug');

  if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });
  if (!fs.existsSync(debugPath)) fs.mkdirSync(debugPath, { recursive: true });

  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID_SPEEDAF;
  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN_SPEEDAF;
  const username = process.env.SPEEDAF_USER;
  const password = process.env.SPEEDAF_PASS;

  if (!username || !password) {
    throw new Error('SPEEDAF_USER أو SPEEDAF_PASS مش موجودين في ENV');
  }

  if (!TELEGRAM_CHAT_ID || !TELEGRAM_TOKEN) {
    console.warn('⚠️ بيانات تيليجرام غير مكتملة، السكربت هيكمل بدون إرسال تيليجرام');
  }

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1366, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--lang=ar-EG,ar',
      '--window-size=1366,900'
    ]
  });

  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ar-EG,ar;q=0.9,en;q=0.8'
  });

  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath
  });

  async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function sendPhotoToTelegram(filePath, caption) {
    if (!TELEGRAM_CHAT_ID || !TELEGRAM_TOKEN) return;

    try {
      const fileBuffer = fs.readFileSync(filePath);
      const fileBlob = new Blob([fileBuffer], { type: 'image/png' });
      const form = new FormData();
      form.append('chat_id', TELEGRAM_CHAT_ID);
      form.append('photo', fileBlob, path.basename(filePath));
      form.append('caption', caption);

      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, {
        method: 'POST',
        body: form
      });

      const result = await response.json();
      if (!result.ok) {
        console.error('❌ Telegram sendPhoto error:', result.description);
      } else {
        console.log(`✅ تم إرسال صورة: ${caption}`);
      }
    } catch (err) {
      console.error('❌ فشل إرسال الصورة إلى تيليجرام:', err.message);
    }
  }

  async function sendDocumentToTelegram(filePath, caption = '') {
    if (!TELEGRAM_CHAT_ID || !TELEGRAM_TOKEN) return;

    try {
      const fileBuffer = fs.readFileSync(filePath);
      const fileBlob = new Blob([fileBuffer], { type: 'application/octet-stream' });
      const form = new FormData();
      form.append('chat_id', TELEGRAM_CHAT_ID);
      form.append('document', fileBlob, path.basename(filePath));
      if (caption) form.append('caption', caption);

      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, {
        method: 'POST',
        body: form
      });

      const result = await response.json();
      if (!result.ok) {
        console.error('❌ Telegram sendDocument error:', result.description);
      } else {
        console.log(`✅ تم إرسال الملف: ${path.basename(filePath)}`);
      }
    } catch (err) {
      console.error('❌ فشل إرسال الملف إلى تيليجرام:', err.message);
    }
  }

  async function capturePage(name, caption) {
    const filePath = path.join(debugPath, name);
    await page.screenshot({ path: filePath, fullPage: true });
    await sendPhotoToTelegram(filePath, caption);
    return filePath;
  }

  async function clearAndType(selector, text) {
    await page.waitForSelector(selector, { visible: true, timeout: 15000 });
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(selector, text, { delay: 40 });
  }

  async function clickLoginButton() {
    const clicked = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll('button, .el-button, span')];
      const target = candidates.find(el => {
        const txt = (el.innerText || el.textContent || '').trim();
        return txt.includes('تسجيل الدخول') || txt.includes('Login') || txt.includes('Sign in');
      });

      if (target) {
        target.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      throw new Error('لم أجد زر تسجيل الدخول');
    }
  }

  async function clickIfTextExists(texts, selector = '*') {
    return await page.evaluate((texts, selector) => {
      const nodes = [...document.querySelectorAll(selector)];
      const node = nodes.find(el => {
        const txt = (el.innerText || el.textContent || '').trim();
        return texts.some(t => txt.includes(t));
      });
      if (node) {
        node.click();
        return true;
      }
      return false;
    }, texts, selector);
  }

  async function refreshCaptchaIfPossible() {
    return await page.evaluate(() => {
      const candidates = [
        ...document.querySelectorAll('img, span, i, button, a, div')
      ];

      const target = candidates.find(el => {
        const txt = (el.innerText || el.textContent || '').trim();
        const cls = el.className ? String(el.className) : '';
        return (
          txt.includes('刷新') ||
          txt.includes('Refresh') ||
          txt.includes('تحديث') ||
          txt.includes('إعادة') ||
          cls.toLowerCase().includes('captcha')
        );
      });

      if (target) {
        target.click();
        return true;
      }
      return false;
    });
  }

  async function preprocessCaptcha(inputPath, outputPath) {
    await sharp(inputPath)
      .resize({ width: 260, withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen()
      .threshold(150)
      .extend({
        top: 20,
        bottom: 20,
        left: 20,
        right: 20,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .toFile(outputPath);
  }

  async function readCaptchaWithOCR(imagePath) {
    const worker = await createWorker('eng');
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: '7',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      });

      const { data } = await worker.recognize(imagePath);
      const raw = (data.text || '').trim();
      const cleaned = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

      return {
        raw,
        cleaned,
        confidence: data.confidence || 0
      };
    } finally {
      await worker.terminate();
    }
  }

  async function solveCaptcha(captchaElement) {
    const originalPath = path.join(debugPath, `captcha-original-${Date.now()}.png`);
    const processedPath = path.join(debugPath, `captcha-processed-${Date.now()}.png`);

    await captchaElement.screenshot({ path: originalPath });
    await preprocessCaptcha(originalPath, processedPath);

    const result = await readCaptchaWithOCR(processedPath);
    console.log('🔎 OCR RAW:', result.raw);
    console.log('🔎 OCR CLEAN:', result.cleaned, '| confidence:', result.confidence);

    return {
      ...result,
      originalPath,
      processedPath
    };
  }

  async function waitForLoginResult() {
    const successSelectors = [
      '.el-dropdown-link',
      '.layout-navbar',
      '.menu-wrapper',
      '.el-menu',
      '.user-info'
    ];

    const errorKeywords = [
      'captcha',
      'verification',
      'wrong',
      'invalid',
      'خطأ',
      'كابتشا',
      'رمز',
      'غير صحيح',
      'incorrect'
    ];

    const start = Date.now();
    const timeoutMs = 20000;

    while (Date.now() - start < timeoutMs) {
      for (const selector of successSelectors) {
        const ok = await page.$(selector);
        if (ok) {
          return { ok: true, reason: `success selector appeared: ${selector}` };
        }
      }

      const bodyText = await page.evaluate(() => document.body.innerText || '');
      const lowered = bodyText.toLowerCase();

      if (errorKeywords.some(k => lowered.includes(k.toLowerCase()))) {
        return { ok: false, reason: 'ظهرت رسالة خطأ غالبًا خاصة بالكابتشا أو تسجيل الدخول' };
      }

      await sleep(1000);
    }

    return { ok: false, reason: 'انتهت مهلة انتظار نتيجة تسجيل الدخول بدون نجاح واضح' };
  }

  async function doLogin(maxAttempts = 5) {
    const usernameSelector = 'input[tabindex="1"], input[type="text"], input[placeholder*="user"], input[placeholder*="اسم"]';
    const passwordSelector = 'input[tabindex="2"], input[type="password"]';
    const captchaInputSelector = 'input[tabindex="3"], input[placeholder*="captcha"], input[placeholder*="verification"], input[placeholder*="رمز"]';
    const captchaImageSelector = 'img[src^="data:image"], img.captcha, .captcha img';

    await page.waitForSelector(usernameSelector, { visible: true, timeout: 20000 });
    await clearAndType(usernameSelector, username);
    await clearAndType(passwordSelector, password);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`\n🟡 محاولة تسجيل الدخول رقم ${attempt}/${maxAttempts}`);

      await page.waitForSelector(captchaImageSelector, { visible: true, timeout: 15000 });
      const captchaElement = await page.$(captchaImageSelector);
      if (!captchaElement) throw new Error('لم أجد صورة الكابتشا');

      const solved = await solveCaptcha(captchaElement);
      await sendPhotoToTelegram(solved.originalPath, `🧩 كابتشا أصلية - محاولة ${attempt}`);
      await sendPhotoToTelegram(solved.processedPath, `🧩 كابتشا بعد التحسين - محاولة ${attempt}`);

      if (!solved.cleaned || solved.cleaned.length < 4) {
        console.log('❌ OCR رجّع قيمة ضعيفة، هعمل refresh للكابتشا وأعيد المحاولة');
        await refreshCaptchaIfPossible();
        await sleep(2500);
        continue;
      }

      await clearAndType(captchaInputSelector, solved.cleaned);
      await capturePage(`before-login-attempt-${attempt}.png`, `📸 قبل الضغط على تسجيل الدخول - محاولة ${attempt}`);

      await clickLoginButton();

      const result = await waitForLoginResult();
      console.log('📌 نتيجة المحاولة:', result);

      if (result.ok) {
        await capturePage(`login-success-${attempt}.png`, `✅ تم تسجيل الدخول - محاولة ${attempt}`);
        return true;
      }

      await capturePage(`login-failed-${attempt}.png`, `❌ فشل تسجيل الدخول - محاولة ${attempt} - ${result.reason}`);

      const stillOnLogin = await page.$(captchaInputSelector);
      if (stillOnLogin) {
        await clearAndType(usernameSelector, username).catch(() => {});
        await clearAndType(passwordSelector, password).catch(() => {});
        await clearAndType(captchaInputSelector, '').catch(() => {});
      }

      await refreshCaptchaIfPossible();
      await sleep(2500);
    }

    return false;
  }

  async function switchArabicIfPossible() {
    console.log('🌐 جاري محاولة تحويل اللغة للعربية...');
    await clickIfTextExists(['中文', 'English', 'AR', '语言', 'Language'], '.el-dropdown-link, .lang, span, div').catch(() => {});
    await sleep(1200);
    await clickIfTextExists(['اللغة العربية', 'Arabic', 'AR'], 'li, span, div');
    await sleep(4000);
  }

  async function goToOrderSearch() {
    console.log('📂 جاري فتح إدارة الطلبات...');
    const openedMgmt = await clickIfTextExists(['إدارة الطلبات', 'Order Management'], 'span, div, li, a');
    if (!openedMgmt) console.log('⚠️ لم أجد إدارة الطلبات بالنص المتوقع');

    await sleep(2500);

    console.log('🔍 جاري اختيار البحث عن الطلب...');
    const openedSearch = await clickIfTextExists(['البحث عن الطلب', 'Search for Order'], 'li, span, div, a');
    if (!openedSearch) console.log('⚠️ لم أجد البحث عن الطلب بالنص المتوقع');

    await sleep(10000);
    await capturePage('orders-page.png', '📸 صفحة إدارة الطلبات / البحث عن الطلب');
  }

  async function exportAndWaitDownload(timeoutSeconds = 120) {
    console.log('⬇️ جاري الضغط على Export / إصدار...');
    const clicked = await clickIfTextExists(['إصدار', 'Export'], 'button, span, div');
    if (!clicked) {
      throw new Error('لم أجد زر Export / إصدار');
    }

    await capturePage('after-export-click.png', '📸 بعد الضغط على زر Export');
    console.log(`⏳ انتظار الملف حتى ${timeoutSeconds} ثانية...`);

    for (let i = 0; i < timeoutSeconds; i++) {
      await sleep(1000);
      const files = fs.readdirSync(downloadPath).filter(f => !f.endsWith('.crdownload') && !f.startsWith('.'));
      if (files.length > 0) {
        files.sort((a, b) => {
          const aTime = fs.statSync(path.join(downloadPath, a)).mtimeMs;
          const bTime = fs.statSync(path.join(downloadPath, b)).mtimeMs;
          return bTime - aTime;
        });

        const latestFile = path.join(downloadPath, files[0]);
        return latestFile;
      }
    }

    return null;
  }

  try {
    console.log('🚀 جاري فتح الموقع...');
    await page.goto('https://csp.speedaf.com/', { waitUntil: 'networkidle2', timeout: 60000 });
    await capturePage('opened-login-page.png', '📸 تم فتح صفحة اللوجين');

    const loggedIn = await doLogin(5);
    if (!loggedIn) {
      throw new Error('فشل تسجيل الدخول بعد كل المحاولات. الأغلب الكابتشا لم تُقرأ بشكل صحيح أو الموقع رفض الأتمتة');
    }

    await switchArabicIfPossible();
    await goToOrderSearch();

    const downloadedFilePath = await exportAndWaitDownload(120);

    if (downloadedFilePath) {
      console.log(`✅ تم العثور على الملف: ${downloadedFilePath}`);
      await sendDocumentToTelegram(downloadedFilePath, '✅ تم تحميل وإرسال ملف Speedaf');
    } else {
      console.log('❌ لم يتم العثور على الملف بعد انتهاء المهلة');
      await capturePage('download-timeout.png', '❌ فشل تحميل الملف بعد انتهاء المهلة');
    }
  } catch (error) {
    console.error('❌ حدث خطأ أثناء التنفيذ:', error.message);
    await capturePage('fatal-error.png', `⚠️ خطأ أثناء التنفيذ: ${error.message}`);
  } finally {
    await browser.close();
  }
})();
