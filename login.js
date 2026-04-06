const puppeteer = require('puppeteer');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

(async () => {
  const downloadPath = path.resolve(__dirname, 'downloads');
  if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath);

  const browser = await puppeteer.launch({ 
      headless: true, 
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ar', '--window-size=1280,800'] 
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 }); // تكبير الشاشة عشان السكرين شوت تكون واضحة
  
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadPath,
  });

  // دالة مساعدة لتصوير الشاشة وإرسالها لتيليجرام
  async function sendScreenshotToTelegram(filename, caption) {
      const filepath = path.join(__dirname, filename);
      await page.screenshot({ path: filepath, fullPage: true });
      
      const form = new FormData();
      form.append('chat_id', process.env.TELEGRAM_CHAT_ID_SPEEDAF);
      form.append('photo', fs.createReadStream(filepath));
      form.append('caption', caption);

      try {
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN_SPEEDAF}/sendPhoto`, {
              method: 'POST',
              body: form,
              headers: form.getHeaders()
          });
          console.log(`تم إرسال صورة: ${caption}`);
      } catch (err) {
          console.error("فشل إرسال الصورة لتيليجرام:", err.message);
      }
  }

  console.log("جاري فتح الموقع...");
  await page.goto('https://csp.speedaf.com/', { waitUntil: 'networkidle2' });

  const usernameSelector = 'input[tabindex="1"]'; 
  const passwordSelector = 'input[tabindex="2"]';
  const captchaInputSelector = 'input[tabindex="3"]';
  const captchaImageSelector = 'img[src^="data:image"]'; 

  const username = process.env.SPEEDAF_USER;
  const password = process.env.SPEEDAF_PASS;

  try {
    console.log("في انتظار ظهور عناصر تسجيل الدخول...");
    await page.waitForSelector(usernameSelector, { visible: true, timeout: 15000 });

    console.log("جاري كتابة بيانات الحساب...");
    await page.type(usernameSelector, username);
    await page.type(passwordSelector, password);

    console.log("جاري استخراج صورة الكابتشا...");
    await page.waitForSelector(captchaImageSelector, { visible: true });
    const captchaElement = await page.$(captchaImageSelector);
    await captchaElement.screenshot({ path: 'captcha.png' });

    const { data: { text } } = await Tesseract.recognize('captcha.png', 'eng');
    const captchaText = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    console.log(`تم قراءة الكابتشا: ${captchaText}`);

    if(captchaText) await page.type(captchaInputSelector, captchaText);

    console.log("جاري الضغط على زر تسجيل الدخول...");
    await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (let btn of buttons) {
            if (btn.innerText.includes('تسجيل الدخول') || btn.innerText.includes('Login') || btn.innerText.includes('Sign in')) {
                btn.click(); return;
            }
        }
    });

    await new Promise(resolve => setTimeout(resolve, 8000)); 
    
    // سكرين شوت رقم 1
    await sendScreenshotToTelegram('step1.png', '📸 الخطوة 1: بعد تسجيل الدخول مباشرة');

    console.log("جاري التحقق من اللغة وتغييرها للعربية...");
    await page.evaluate(() => {
        const langDropdown = document.querySelector('.el-dropdown-link');
        if (langDropdown) langDropdown.click(); 
    });
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.evaluate(() => {
        const items = document.querySelectorAll('li.el-dropdown-menu__item');
        for (let item of items) {
            if (item.innerText.includes('اللغة العربية') || item.innerText.includes('AR')) {
                item.click(); return;
            }
        }
    });
    await new Promise(resolve => setTimeout(resolve, 5000)); 

    console.log("جاري فتح قائمة إدارة الطلبات...");
    await page.evaluate(() => {
        const spans = document.querySelectorAll('span');
        for (let span of spans) {
            if (span.innerText.trim() === 'إدارة الطلبات' || span.innerText.trim() === 'Order Management') {
                span.click(); return;
            }
        }
    });
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("جاري اختيار 'البحث عن الطلب'...");
    await page.evaluate(() => {
        const lis = document.querySelectorAll('li');
        for (let li of lis) {
            if (li.innerText.includes('البحث عن الطلب') || li.innerText.includes('Search for Order')) {
                li.click(); return;
            }
        }
    });
    
    console.log("في انتظار تحميل البيانات...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    // سكرين شوت رقم 2
    await sendScreenshotToTelegram('step2.png', '📸 الخطوة 2: صفحة إدارة الطلبات (الجدول ظهر ولا لأ؟)');

    console.log("جاري الضغط على زر إصدار (Export)...");
    await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, span');
        for (let btn of buttons) {
            if (btn.innerText && (btn.innerText.trim() === 'إصدار' || btn.innerText.trim() === 'Export')) {
                btn.click(); 
                return;
            }
        }
    });

    // سكرين شوت رقم 3
    await sendScreenshotToTelegram('step3.png', '📸 الخطوة 3: تم الضغط على زر إصدار (هل ظهرت رسالة تأكيد؟)');

    console.log("جاري انتظار نزول الملف (الحد الأقصى للانتظار 120 ثانية)...");
    let downloadedFilePath = null;
    // تم التعديل لـ 120 ثانية
    for (let i = 0; i < 120; i++) { 
        await new Promise(r => setTimeout(r, 1000));
        const files = fs.readdirSync(downloadPath);
        const file = files.find(f => !f.endsWith('.crdownload') && !f.startsWith('.'));
        if (file) {
            downloadedFilePath = path.join(downloadPath, file);
            break;
        }
    }

    if (downloadedFilePath) {
        console.log(`تم العثور على الملف: ${downloadedFilePath} .. جاري الإرسال لتيليجرام...`);
        const form = new FormData();
        form.append('chat_id', process.env.TELEGRAM_CHAT_ID_SPEEDAF);
        form.append('document', fs.createReadStream(downloadedFilePath));

        const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN_SPEEDAF}/sendDocument`, {
            method: 'POST',
            body: form,
            headers: form.getHeaders() 
        });

        const result = await response.json();
        if (result.ok) {
            console.log("✅ تم إرسال الشيت على تيليجرام بنجاح!");
        }
    } else {
        console.log("❌ لم يتم العثور على الملف بعد انتظار دقيقتين.");
        await sendScreenshotToTelegram('step4.png', '❌ الخطوة 4: فشل التحميل بعد دقيقتين.. دي الشاشة النهائية');
    }

  } catch (error) {
    console.error("حدث خطأ أثناء التنفيذ:", error.message);
    await sendScreenshotToTelegram('error.png', `⚠️ حصل خطأ مفاجئ: ${error.message}`);
  } finally {
    await browser.close();
  }
})();
