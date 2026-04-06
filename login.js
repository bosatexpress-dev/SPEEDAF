const puppeteer = require('puppeteer');
const Tesseract = require('tesseract.js');

(async () => {
  const browser = await puppeteer.launch({ 
      headless: true, 
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  const page = await browser.newPage();
  
  console.log("جاري فتح الموقع...");
  await page.goto('https://csp.speedaf.com/', { waitUntil: 'networkidle2' });

  // المعرفات الدقيقة بناءً على الكود المصدري للموقع
  const usernameSelector = 'input[placeholder="ادخل حساب أو اسم البريد الإلكترونية"]'; 
  const passwordSelector = 'input[placeholder="ادخل كلمة المرور"]';
  const captchaInputSelector = 'input[placeholder="ادخل رمز التحقق"]';
  const captchaImageSelector = 'img[src^="data:image/jpg;base64"]';
  const loginButtonSelector = 'button.el-button--primary'; // الغالب هذا هو كلاس زر الدخول في إطار Vue/ElementUI المستخدم

  // سحب البيانات من الخزنة السرية
  const username = process.env.SPEEDAF_USER;
  const password = process.env.SPEEDAF_PASS;

  try {
    console.log("في انتظار ظهور عناصر تسجيل الدخول...");
    // الكود هيستنى لحد ما أول مربع يظهر
    await page.waitForSelector(usernameSelector, { visible: true, timeout: 15000 });

    console.log("جاري كتابة بيانات الحساب...");
    // إدخال اليوزر والباسورد
    await page.type(usernameSelector, username);
    await page.type(passwordSelector, password);

    console.log("جاري استخراج صورة الكابتشا...");
    await page.waitForSelector(captchaImageSelector, { visible: true });
    
    // حفظ صورة الكابتشا (حتى لو كانت Base64)
    const captchaElement = await page.$(captchaImageSelector);
    await captchaElement.screenshot({ path: 'captcha.png' });

    console.log("جاري قراءة الكابتشا...");
    const { data: { text } } = await Tesseract.recognize('captcha.png', 'eng');
    
    // تنظيف الكابتشا وتحويلها لحروف كبيرة
    const captchaText = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    console.log(`تم قراءة الكابتشا: ${captchaText}`);

    // كتابة الكابتشا
    if(captchaText) {
       await page.type(captchaInputSelector, captchaText);
    } else {
        console.log("لم يتم التعرف على أي نص في الكابتشا!");
    }

    console.log("جاري الضغط على زر تسجيل الدخول...");
    // الضغط على زر الدخول (استخدمنا طريقة evaluate لضمان الضغط عليه أياً كان موقعه)
    await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (let btn of buttons) {
            if (btn.innerText.includes('تسجيل الدخول') || btn.innerText.includes('Login')) {
                btn.click();
                return;
            }
        }
    });

    // ننتظر 5 ثواني عشان ندي فرصة للموقع يحمل بعد تسجيل الدخول
    console.log("في انتظار الاستجابة من الموقع...");
    await new Promise(resolve => setTimeout(resolve, 5000)); 
    
    console.log("السكربت أنهى عمله بنجاح!");
    
  } catch (error) {
    console.error("حدث خطأ أثناء التنفيذ:", error.message);
  } finally {
    await browser.close();
  }
})();
