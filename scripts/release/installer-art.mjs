import fs from 'node:fs';
import { chromium } from 'playwright';

// Artwork only: native installer behavior stays in the upstream templates.
const font = fs.readFileSync('public/assets/Jua-Regular.ttf').toString('base64');
const forest = fs.readFileSync('installer/ui/forest.svg', 'utf8');
const assets = 'src-tauri/installer-assets';
fs.mkdirSync(assets, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const style = `@font-face{font-family:Jua;src:url(data:font/ttf;base64,${font})}*{box-sizing:border-box}body{margin:0;font-family:Jua;color:#fff5dc;background:#234737}h1,h2,p{font-weight:400;margin:0}.logo{color:#f4c7a3}.tag{letter-spacing:1.2px;color:#d1dfc9}svg{display:block;height:auto}`;
  async function render(file, width, height, content, css = '', bmp = false) {
    await page.setViewportSize({ width, height });
    await page.setContent(`<style>${style}${css}</style>${content}`);
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ path: file });
    if (bmp) {
      // Uncompressed 24-bit BMP, including padded rows, for native Windows installers.
      const rgba = await page.evaluate(async data => {
        const img = new Image(); img.src = data; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
        return Array.from(ctx.getImageData(0, 0, img.width, img.height).data);
      }, 'data:image/png;base64,' + png.toString('base64'));
      const stride = Math.ceil(width * 3 / 4) * 4, bitmap = Buffer.alloc(54 + stride * height);
      bitmap.write('BM'); bitmap.writeUInt32LE(bitmap.length, 2); bitmap.writeUInt32LE(54, 10);
      bitmap.writeUInt32LE(40, 14); bitmap.writeInt32LE(width, 18); bitmap.writeInt32LE(height, 22);
      bitmap.writeUInt16LE(1, 26); bitmap.writeUInt16LE(24, 28); bitmap.writeUInt32LE(stride * height, 34);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const source = (y * width + x) * 4, dest = 54 + (height - 1 - y) * stride + x * 3;
        bitmap[dest] = rgba[source + 2]; bitmap[dest + 1] = rgba[source + 1]; bitmap[dest + 2] = rgba[source];
      }
      fs.writeFileSync(file.replace(/\.png$/, '.bmp'), bitmap);
    }
    return png;
  }
  await render('installer/windows/wizard.png', 328, 628,
    `<div class="logo">tanuki.</div><div class="tag">YOUR OWN LITTLE WORLD</div><h1>A home for<br>big imaginations.</h1><p>Your stories. Your classroom.<br>A space that belongs to you.</p>${forest}<footer>ROOTS DOWN. STORIES AHEAD.</footer>`,
    'body{padding:28px;background:radial-gradient(ellipse at bottom,#42694d,transparent 70%),#234737}.logo{font-size:32px}.tag{font-size:10px;margin-top:28px}h1{font-size:37px;line-height:1.14;margin:14px 0}p{font-size:15px;line-height:1.6;color:#d1dfc9}svg{width:304px;margin:16px -16px}footer{position:absolute;bottom:26px;font-size:11px;color:#f4c7a3;letter-spacing:1px}', true);
  await render(assets + '/sidebar.png', 164, 314,
    `<div class="logo">tanuki.</div><h1>A little<br>wonder,<br>installed.</h1>${forest}<footer>STORIES START HERE</footer>`,
    'body{padding:17px;background:radial-gradient(ellipse at bottom,#42694d,transparent 75%),#234737}.logo{font-size:22px}h1{font-size:25px;line-height:1.15;margin-top:22px}svg{width:160px;margin:9px -15px}footer{position:absolute;bottom:14px;font-size:8px;letter-spacing:1px;color:#f4c7a3}', true);
  await render(assets + '/header.png', 150, 57, '<div class="logo">tanuki<span>✦</span></div>',
    'body{background:#fffdf6}.logo{font-size:29px;color:#244638;padding:9px 12px}.logo span{font-size:20px;color:#9b623e;margin-left:10px}', true);
  await render(assets + '/dmg-background.png', 720, 480,
    `<div class="logo">tanuki.</div><h1>Make room for a little wonder.</h1><p>Drag Tanuki Stories into Applications to get started.</p><div class="pad app"></div><div class="arrow">→</div><div class="pad folder"></div><footer>Your classroom is one server address away.</footer>`,
    'body{background:radial-gradient(ellipse at bottom left,#dce8d2,transparent 70%),#fff9ec;color:#244638;padding:34px 44px}.logo{font-size:30px;color:#244638}h1{font-size:30px;margin-top:20px}p{font-size:16px;color:#586b5b;margin-top:10px}.pad{position:absolute;top:215px;width:154px;height:154px;border-radius:32px;background:#edf0e1;border:1px solid #d7dfca;box-shadow:inset 0 3px 0 #fff9,0 5px 0 #dce2d0}.app{left:133px}.folder{left:433px}.arrow{position:absolute;top:246px;left:343px;font-size:40px;color:#98613e}footer{position:absolute;bottom:32px;font-size:14px;color:#586b5b}');
  const png = await render('installer/windows/mark.png', 256, 256, 't',
    'body{background:#234737;color:#f4c7a3;font-size:190px;text-align:center;line-height:256px}', true);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  fs.writeFileSync('installer/windows/tanuki.ico', Buffer.concat([header, png]));
} finally { await browser.close(); }
