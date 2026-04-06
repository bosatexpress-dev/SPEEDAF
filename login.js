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
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ar'] 
  });
  
  const page = await browser.newPage();
  
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadPath,
  });

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

    console.log("جاري التحقق من اللغة وتغييرها للعربية...");
    await page.evaluate(() => {
        const langDropdown = document.querySelector('.el-dropdown-link');
        if (langDropdown) {
            langDropdown.click(); 
        }
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

    console.log("جاري الضغط على زر إصدار (Export)...");
    await page.evaluate(() => {
        const spans = document.querySelectorAll('span');
        for (let span of spans) {
            if (span.innerText.trim() === 'إصدار' || span.innerText.trim() === 'Export') {
                span.click(); return;
            }
        }
    });

    console.log("جاري انتظار نزول الملف...");
    let downloadedFilePath = null;
    for (let i = 0; i < 30; i++) { 
        await new Promise(r => setTimeout(r, 1000));
        const files = fs.readdirSync(downloadPath);
        const file = files.find(f => !f.endsWith('.crdownload'));
        if (file) {
            downloadedFilePath = path.join(downloadPath, file);
            break;
        }
    }

    if (downloadedFilePath) {
        console.log(`تم العثور على الملف: ${downloadedFilePath} .. جاري الإرسال لتيليجرام...`);
        const form = new FormData();
        // هنا استخدمنا الأسامي المخصصة للمشروع
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
        } else {
            console.error("❌ فشل الإرسال لتيليجرام:", result);
        }
    } else {
        console.log("❌ لم يتم العثور على الملف. يبدو أن التحميل لم يبدأ.");
    }

  } catch (error) {
    console.error("حدث خطأ أثناء التنفيذ:", error.message);
  } finally {
    await browser.close();
  }
})();
