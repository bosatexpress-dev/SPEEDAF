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

  // سحب اليوزر والباسورد من خزنة جيت هاب السرية
  const username = process.env.SPEEDAF_USER;
  const password = process.env.SPEEDAF_PASS;

  // كتابة البيانات (تأكد من الـ selectors بعد فحص الموقع)
  await page.type('input[name="username"]', username);
  await page.type('input[name="password"]', password);

  console.log("جاري قراءة الكابتشا...");
  const captchaElement = await page.$('img.captcha-img'); // عدل الكلاس ده لو مختلف في الموقع
  await captchaElement.screenshot({ path: 'captcha.png' });

  const { data: { text } } = await Tesseract.recognize('captcha.png', 'eng');
  
  // تحويل الكابتشا لحروف كبيرة
  const captchaText = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  console.log(`الكابتشا هي: ${captchaText}`);

  await page.type('input[name="captcha"]', captchaText); // عدل اسم الحقل لو مختلف

  console.log("جاري تسجيل الدخول...");
  await page.click('button[type="submit"]'); // عدل زرار الدخول لو مختلف

  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  console.log("تم تسجيل الدخول بنجاح!");
  
  await browser.close();
})();
