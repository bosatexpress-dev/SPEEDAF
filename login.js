const puppeteer = require('puppeteer');
const Tesseract = require('tesseract.js');

(async () => {
  const browser = await puppeteer.launch({ 
      headless: true, 
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ar'] 
  });
  
  const page = await browser.newPage();
  
  console.log("جاري فتح الموقع...");
  await page.goto('https://csp.speedaf.com/', { waitUntil: 'networkidle2' });

  // استخدمنا tabindex لأنها ثابتة ولا تتأثر بلغة الموقع
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

    console.log("جاري قراءة الكابتشا...");
    const { data: { text } } = await Tesseract.recognize('captcha.png', 'eng');
    
    const captchaText = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    console.log(`تم قراءة الكابتشا: ${captchaText}`);

    if(captchaText) {
       await page.type(captchaInputSelector, captchaText);
    } else {
        console.log("لم يتم التعرف على أي نص في الكابتشا!");
    }

    console.log("جاري الضغط على زر تسجيل الدخول...");
    await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (let btn of buttons) {
            // هيدور على زرار الدخول بأي لغة
            if (btn.innerText.includes('تسجيل الدخول') || btn.innerText.includes('Login') || btn.innerText.includes('Sign in') || btn.innerText.includes('登录')) {
                btn.click();
                return;
            }
        }
    });

    console.log("في انتظار الاستجابة من الموقع...");
    await new Promise(resolve => setTimeout(resolve, 5000)); 
    
    console.log("السكربت أنهى عمله بنجاح!");
    
  } catch (error) {
    console.error("حدث خطأ أثناء التنفيذ:", error.message);
  } finally {
    await browser.close();
  }
})();
