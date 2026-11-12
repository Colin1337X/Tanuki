import fs from 'node:fs';
fs.copyFileSync(new URL('../public/assets/Jua-Regular.ttf',import.meta.url),new URL('web/Jua-Regular.ttf',import.meta.url));
fs.copyFileSync(new URL('../public/assets/Jua-OFL.txt',import.meta.url),new URL('web/Jua-OFL.txt',import.meta.url));
